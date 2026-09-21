package backend.WF.intelligence;

import backend.WF.common.ApiResponse;
import backend.WF.contract.ContractResponse;
import backend.WF.contract.ContractService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import static backend.WF.intelligence.IntelligenceDtos.*;

/**
 * Contract intake and AI-assisted attribute extraction.
 *
 * <p>The three verbs map to the three stages a contract manager actually works
 * through: upload the document, run extraction over it, then walk the proposed
 * attributes one by one and accept, correct or reject each.
 */
@RestController
@RequestMapping("/api/contract-documents")
@RequiredArgsConstructor
public class ContractIntelligenceController {

    private final ContractExtractionService extractionService;
    private final ContractService contractService;
    private final IntelligenceMapper mapper;

    @PostMapping(consumes = "multipart/form-data")
    @PreAuthorize("hasAuthority('UPLOAD_CONTRACT_DOCUMENT')")
    public ResponseEntity<ApiResponse<DocumentResponse>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) UUID contractId,
            @RequestParam(required = false) UUID companyId) throws IOException {

        ContractDocument document = extractionService.upload(
                file.getOriginalFilename(), file.getContentType(), file.getBytes(),
                contractId, companyId);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Document ingested", mapper.toSummary(document)));
    }

    @PostMapping("/{id}/extract")
    @PreAuthorize("hasAuthority('RUN_CONTRACT_EXTRACTION')")
    public ResponseEntity<ApiResponse<DocumentResponse>> extract(@PathVariable UUID id) {
        ContractDocument document = extractionService.runExtraction(id);
        List<ContractExtraction> rows = extractionService.listExtractions(id);
        return ResponseEntity.ok(ApiResponse.ok(
                "Extracted " + rows.size() + " attribute(s) — every one needs review before it is applied",
                mapper.toDetail(document, rows)));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('VIEW_CONTRACT_DOCUMENTS')")
    public ResponseEntity<ApiResponse<List<DocumentResponse>>> list(
            @RequestParam(required = false) UUID contractId) {
        List<DocumentResponse> documents = extractionService.listDocuments(contractId).stream()
                .map(mapper::toSummary)
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(documents));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('VIEW_CONTRACT_DOCUMENTS')")
    public ResponseEntity<ApiResponse<DocumentResponse>> get(@PathVariable UUID id) {
        ContractDocument document = extractionService.getDocument(id);
        return ResponseEntity.ok(ApiResponse.ok(
                mapper.toDetail(document, extractionService.listExtractions(id))));
    }

    /** The stored text, so the UI can show a citation highlighted in place. */
    @GetMapping("/{id}/text")
    @PreAuthorize("hasAuthority('VIEW_CONTRACT_DOCUMENTS')")
    public ResponseEntity<ApiResponse<DocumentTextResponse>> text(@PathVariable UUID id) {
        ContractDocument d = extractionService.getDocument(id);
        return ResponseEntity.ok(ApiResponse.ok(DocumentTextResponse.builder()
                .id(d.getId())
                .fileName(d.getFileName())
                .pageCount(d.getPageCount())
                .sourceText(d.getSourceText())
                .build()));
    }

    @PutMapping("/extractions/{extractionId}/review")
    @PreAuthorize("hasAuthority('VALIDATE_CONTRACT_EXTRACTION')")
    public ResponseEntity<ApiResponse<ExtractionResponse>> review(
            @PathVariable UUID extractionId,
            @Valid @RequestBody ReviewRequest request) {

        ContractExtraction row = extractionService.review(
                extractionId, request.decision(), request.correctedValue(), request.note());
        return ResponseEntity.ok(ApiResponse.ok(mapper.toResponse(row)));
    }

    @PostMapping("/{id}/apply")
    @PreAuthorize("hasAuthority('APPLY_CONTRACT_EXTRACTION')")
    public ResponseEntity<ApiResponse<ContractResponse>> apply(@PathVariable UUID id) {
        UUID contractId = extractionService.applyToContract(id).getId();
        return ResponseEntity.ok(ApiResponse.ok(
                "Validated attributes applied to the contract",
                contractService.getContract(contractId)));
    }
}
