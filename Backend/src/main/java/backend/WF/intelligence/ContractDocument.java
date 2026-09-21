package backend.WF.intelligence;

import backend.WF.common.BaseEntity;
import backend.WF.company.ClientCompany;
import backend.WF.contract.Contract;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * An uploaded contract document plus the plain text the pipeline reads from it.
 *
 * <p>{@code sourceText} is stored rather than re-derived on demand because every
 * citation is an offset into it. If the text were re-extracted later with a
 * different parser, existing citations would silently point at the wrong span.
 */
@Entity
@Table(name = "contract_documents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContractDocument extends BaseEntity {

    /** Null while the document is being reviewed before its contract exists. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contract_id")
    private Contract contract;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private ClientCompany company;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    /** Identifies a re-upload of the same file, so extraction is not paid for twice. */
    @Column(name = "checksum_sha256", nullable = false, length = 64)
    private String checksumSha256;

    @Column(name = "source_text", nullable = false, columnDefinition = "TEXT")
    private String sourceText;

    @Column(name = "page_count", nullable = false)
    @Builder.Default
    private int pageCount = 1;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private DocumentStatus status = DocumentStatus.UPLOADED;

    /** "llm" or "deterministic" — which engine produced the current extraction set. */
    @Column(name = "extraction_engine", length = 50)
    private String extractionEngine;

    @Column(name = "extraction_model", length = 120)
    private String extractionModel;

    @Column(name = "extraction_error", columnDefinition = "TEXT")
    private String extractionError;

    @Column(name = "extracted_at")
    private LocalDateTime extractedAt;

    @Column(name = "uploaded_by", nullable = false)
    private UUID uploadedBy;

    @OneToMany(mappedBy = "document", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ContractExtraction> extractions = new ArrayList<>();
}
