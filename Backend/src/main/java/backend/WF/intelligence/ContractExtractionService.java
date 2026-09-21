package backend.WF.intelligence;

import backend.WF.audit.Auditable;
import backend.WF.company.ClientCompany;
import backend.WF.company.CompanyRepository;
import backend.WF.contract.Contract;
import backend.WF.contract.ContractRepository;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.security.CurrentUserService;
import backend.WF.security.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The contract-processing pipeline.
 *
 * <pre>
 *   upload ──▶ text extraction ──▶ both engines propose ──▶ merge
 *          ──▶ citation verification ──▶ normalization ──▶ PENDING rows
 *          ──▶ human validation ──▶ apply to contract
 * </pre>
 *
 * <p>Two properties hold at every step and are what make the output usable
 * rather than merely impressive:
 *
 * <ol>
 *   <li><b>Nothing is applied without a human.</b> The pipeline may only write
 *       {@link ReviewStatus#PENDING}. Moving a row out of PENDING requires a
 *       reviewer's identity, and only accepted or edited rows are ever applied
 *       to a contract.</li>
 *   <li><b>Every citation is checked against the source.</b> A quote that is not
 *       a verbatim span of the stored document cannot be marked verified, no
 *       matter which engine produced it.</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ContractExtractionService {

    private final ContractDocumentRepository documentRepository;
    private final ContractExtractionRepository extractionRepository;
    private final ContractRepository contractRepository;
    private final CompanyRepository companyRepository;
    private final DocumentTextExtractor textExtractor;
    private final CitationVerifier citationVerifier;
    private final ValueNormalizer normalizer;
    private final LlmAttributeExtractor llmExtractor;
    private final DeterministicAttributeExtractor deterministicExtractor;
    private final CurrentUserService currentUserService;

    // ------------------------------------------------------------------ upload

    @Transactional
    @Auditable(action = "UPLOAD_CONTRACT_DOCUMENT", entityType = "ContractDocument")
    public ContractDocument upload(String fileName, String contentType, byte[] bytes,
                                   UUID contractId, UUID companyId) {

        DocumentTextExtractor.ParsedDocument parsed =
                textExtractor.parse(fileName, contentType, bytes);

        // The same file uploaded twice is the same document; return the existing
        // one rather than paying for extraction again and splitting the review.
        Optional<ContractDocument> existing =
                documentRepository.findByChecksumSha256(parsed.checksum());
        if (existing.isPresent()) {
            log.info("Document {} already ingested as {}", fileName, existing.get().getId());
            return existing.get();
        }

        User user = currentUserService.getCurrentUser();

        Contract contract = contractId == null ? null
                : contractRepository.findById(contractId)
                        .orElseThrow(() -> new EntityNotFoundException("Contract", contractId));
        ClientCompany company = companyId == null ? null
                : companyRepository.findById(companyId)
                        .orElseThrow(() -> new EntityNotFoundException("ClientCompany", companyId));

        // A document attached to a contract inherits that contract's client, so a
        // reviewer always sees who the document belongs to.
        if (company == null && contract != null) {
            company = contract.getCompany();
        }

        ContractDocument document = ContractDocument.builder()
                .contract(contract)
                .company(company)
                .fileName(fileName)
                .contentType(contentType == null ? "application/octet-stream" : contentType)
                .sizeBytes(bytes.length)
                .checksumSha256(parsed.checksum())
                .sourceText(parsed.text())
                .pageCount(parsed.pageCount())
                .status(DocumentStatus.UPLOADED)
                .uploadedBy(user.getId())
                .build();

        return documentRepository.save(document);
    }

    // -------------------------------------------------------------- extraction

    @Transactional
    @Auditable(action = "RUN_CONTRACT_EXTRACTION", entityType = "ContractDocument")
    public ContractDocument runExtraction(UUID documentId) {
        ContractDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new EntityNotFoundException("ContractDocument", documentId));

        if (document.getStatus() == DocumentStatus.APPLIED) {
            throw new BusinessRuleViolationException(
                    "This document has already been applied to a contract and cannot be re-extracted");
        }

        // Re-running replaces the previous proposal set. Reviewer decisions on the
        // old set are discarded with it, which is why an applied document is frozen.
        extractionRepository.deleteByDocumentId(documentId);
        document.getExtractions().clear();
        document.setStatus(DocumentStatus.EXTRACTING);
        document.setExtractionError(null);

        List<ExtractionCandidate> merged;
        String engine;
        try {
            List<ExtractionCandidate> fromModel = safely(llmExtractor, document.getSourceText());
            List<ExtractionCandidate> fromPatterns = safely(deterministicExtractor, document.getSourceText());
            merged = merge(fromModel, fromPatterns);
            engine = describeEngines(fromModel.isEmpty() ? 0 : 1, fromPatterns.size());
        } catch (Exception e) {
            log.error("Extraction failed for document {}", documentId, e);
            document.setStatus(DocumentStatus.FAILED);
            document.setExtractionError(e.getMessage());
            return documentRepository.save(document);
        }

        List<ContractExtraction> rows = new ArrayList<>();
        for (ExtractionCandidate candidate : merged) {
            rows.add(toExtraction(document, candidate));
        }

        extractionRepository.saveAll(rows);
        document.getExtractions().addAll(rows);
        document.setStatus(DocumentStatus.PENDING_REVIEW);
        document.setExtractionEngine(engine);
        document.setExtractionModel(llmExtractor.isAvailable() ? "llm-assisted" : "patterns-only");
        document.setExtractedAt(LocalDateTime.now());

        log.info("Extracted {} attributes from document {} using {}", rows.size(), documentId, engine);
        return documentRepository.save(document);
    }

    private List<ExtractionCandidate> safely(AttributeExtractor extractor, String sourceText) {
        if (!extractor.isAvailable()) {
            return List.of();
        }
        try {
            return extractor.extract(sourceText);
        } catch (Exception e) {
            log.warn("{} extractor failed: {}", extractor.engineName(), e.getMessage());
            return List.of();
        }
    }

    /**
     * Combines both engines, keyed by attribute type and field key.
     *
     * <p>The model goes in first for recall, then pattern matches fill gaps it
     * missed. Where both found the same field the pattern match wins: its value
     * came from a regex over the document itself, so it cannot be a fabrication,
     * and its citation is the matched text rather than a claim about it.
     */
    static List<ExtractionCandidate> merge(List<ExtractionCandidate> fromModel,
                                           List<ExtractionCandidate> fromPatterns) {
        Map<String, ExtractionCandidate> byField = new LinkedHashMap<>();
        for (ExtractionCandidate c : fromModel) {
            byField.put(c.attributeType() + ":" + c.fieldKey(), c);
        }
        for (ExtractionCandidate c : fromPatterns) {
            byField.put(c.attributeType() + ":" + c.fieldKey(), c);
        }
        return new ArrayList<>(byField.values());
    }

    private static String describeEngines(int modelRan, int patternCount) {
        if (modelRan > 0 && patternCount > 0) {
            return "llm+deterministic";
        }
        return modelRan > 0 ? "llm" : "deterministic";
    }

    /**
     * Materializes a candidate, verifying its citation and normalizing its value.
     * A candidate whose quote cannot be found in the document is still stored —
     * flagged unverified — because a reviewer deciding what to trust is better
     * served by seeing it than by having it silently dropped.
     */
    private ContractExtraction toExtraction(ContractDocument document, ExtractionCandidate candidate) {
        ContractExtraction row = ContractExtraction.builder()
                .document(document)
                .attributeType(candidate.attributeType())
                .fieldKey(candidate.fieldKey())
                .fieldLabel(candidate.fieldLabel())
                .rawValue(candidate.rawValue())
                .valueKind(candidate.valueKind())
                .currency(candidate.currency())
                .confidence(candidate.confidence())
                .reviewStatus(ReviewStatus.PENDING)
                .build();

        normalizer.normalize(candidate.rawValue(), candidate.valueKind())
                .ifPresent(row::setNormalizedValue);

        if (row.getCurrency() == null && candidate.valueKind() == ValueKind.MONEY) {
            normalizer.detectCurrency(candidate.rawValue()).ifPresent(row::setCurrency);
        }

        citationVerifier.locate(document.getSourceText(), candidate.citationQuote())
                .ifPresentOrElse(citation -> {
                    row.setCitationQuote(citation.quote());
                    row.setCitationStart(citation.start());
                    row.setCitationEnd(citation.end());
                    row.setCitationPage(citation.page());
                    row.setCitationVerified(true);
                }, () -> {
                    row.setCitationQuote(candidate.citationQuote());
                    row.setCitationVerified(false);
                });

        return row;
    }

    // -------------------------------------------------------- human validation

    @Transactional
    @Auditable(action = "VALIDATE_CONTRACT_EXTRACTION", entityType = "ContractExtraction")
    public ContractExtraction review(UUID extractionId, ReviewStatus decision,
                                     String correctedValue, String note) {
        if (decision == ReviewStatus.PENDING) {
            throw new BusinessRuleViolationException(
                    "A review decision must be ACCEPTED, EDITED or REJECTED");
        }

        ContractExtraction row = extractionRepository.findById(extractionId)
                .orElseThrow(() -> new EntityNotFoundException("ContractExtraction", extractionId));

        ContractDocument document = row.getDocument();
        if (document.getStatus() == DocumentStatus.APPLIED) {
            throw new BusinessRuleViolationException(
                    "This document has already been applied and its extractions are frozen");
        }

        if (decision == ReviewStatus.EDITED) {
            if (correctedValue == null || correctedValue.isBlank()) {
                throw new BusinessRuleViolationException(
                        "An edited extraction must carry the corrected value");
            }
            String normalized = normalizer.normalize(correctedValue, row.getValueKind())
                    .orElseThrow(() -> new BusinessRuleViolationException(
                            "\"" + correctedValue + "\" is not a valid " + row.getValueKind()
                            + " value for " + row.getFieldLabel()));
            row.setReviewedValue(normalized);
        } else {
            row.setReviewedValue(null);
        }

        User reviewer = currentUserService.getCurrentUser();
        row.setReviewStatus(decision);
        row.setReviewNote(note);
        row.setReviewedBy(reviewer.getId());
        row.setReviewedAt(LocalDateTime.now());
        extractionRepository.save(row);

        // Once no row is still pending, the document as a whole is validated.
        long pending = extractionRepository.countByDocumentIdAndReviewStatus(
                document.getId(), ReviewStatus.PENDING);
        if (pending == 0 && document.getStatus() == DocumentStatus.PENDING_REVIEW) {
            document.setStatus(DocumentStatus.VALIDATED);
            documentRepository.save(document);
        }

        return row;
    }

    // ------------------------------------------------------------------ apply

    /**
     * Writes validated attributes onto the linked contract.
     *
     * <p>Only dates are applied structurally, because they are the only extracted
     * attributes with an unambiguous home on {@link Contract}. Rates and billing
     * terms inform the requirements a manager then creates, and milestones inform
     * the milestone schedule — both are deliberately left as human steps rather
     * than being auto-created from a document.
     */
    @Transactional
    @Auditable(action = "APPLY_CONTRACT_EXTRACTION", entityType = "Contract")
    public Contract applyToContract(UUID documentId) {
        ContractDocument document = documentRepository.findById(documentId)
                .orElseThrow(() -> new EntityNotFoundException("ContractDocument", documentId));

        Contract contract = document.getContract();
        if (contract == null) {
            throw new BusinessRuleViolationException(
                    "Link this document to a contract before applying its extractions");
        }
        if (document.getStatus() == DocumentStatus.APPLIED) {
            throw new BusinessRuleViolationException("These extractions have already been applied");
        }

        List<ContractExtraction> rows =
                extractionRepository.findByDocumentIdOrderByAttributeTypeAscFieldKeyAsc(documentId);

        long unreviewed = rows.stream().filter(r -> r.getReviewStatus() == ReviewStatus.PENDING).count();
        if (unreviewed > 0) {
            throw new BusinessRuleViolationException(
                    unreviewed + " extraction(s) still await review. Every attribute must be "
                    + "accepted, edited or rejected before it can be applied.");
        }

        for (ContractExtraction row : rows) {
            if (row.getReviewStatus() == ReviewStatus.REJECTED
                    || row.getAttributeType() != AttributeType.DATE) {
                continue;
            }
            normalizer.parseDate(row.effectiveValue()).ifPresent(date -> {
                if ("contract_start".equals(row.getFieldKey())) {
                    contract.setStartDate(date);
                } else if ("contract_end".equals(row.getFieldKey())) {
                    contract.setEndDate(date);
                }
            });
        }

        if (contract.getEndDate().isBefore(contract.getStartDate())) {
            throw new BusinessRuleViolationException(
                    "Applying these dates would end the contract (" + contract.getEndDate()
                    + ") before it starts (" + contract.getStartDate() + ")");
        }

        contractRepository.save(contract);
        document.setStatus(DocumentStatus.APPLIED);
        documentRepository.save(document);
        return contract;
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public List<ContractDocument> listDocuments(UUID contractId) {
        return contractId == null
                ? documentRepository.findAllByOrderByCreatedAtDesc()
                : documentRepository.findByContractIdOrderByCreatedAtDesc(contractId);
    }

    @Transactional(readOnly = true)
    public ContractDocument getDocument(UUID documentId) {
        return documentRepository.findById(documentId)
                .orElseThrow(() -> new EntityNotFoundException("ContractDocument", documentId));
    }

    @Transactional(readOnly = true)
    public List<ContractExtraction> listExtractions(UUID documentId) {
        return extractionRepository.findByDocumentIdOrderByAttributeTypeAscFieldKeyAsc(documentId);
    }
}
