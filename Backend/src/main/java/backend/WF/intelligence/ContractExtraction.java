package backend.WF.intelligence;

import backend.WF.common.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One extracted attribute, its provenance, and its review decision.
 *
 * <p>The invariant that makes this table trustworthy is {@code citationVerified}:
 * it is set by {@link CitationVerifier}, which only returns true when
 * {@code citationQuote} is a verbatim span of the parent document's
 * {@code sourceText} located at {@code [citationStart, citationEnd)}. A quote a
 * model invented cannot be marked verified, so a reviewer can always tell an
 * extraction grounded in the document from one that is not.
 */
@Entity
@Table(name = "contract_extractions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContractExtraction extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", nullable = false)
    private ContractDocument document;

    @Enumerated(EnumType.STRING)
    @Column(name = "attribute_type", nullable = false, length = 20)
    private AttributeType attributeType;

    /** Stable machine key, e.g. {@code hourly_rate}, {@code payment_terms_days}. */
    @Column(name = "field_key", nullable = false, length = 100)
    private String fieldKey;

    @Column(name = "field_label", nullable = false)
    private String fieldLabel;

    /** The value as it appears in the document, e.g. "INR 1,250 per hour". */
    @Column(name = "raw_value", columnDefinition = "TEXT")
    private String rawValue;

    /** Canonical form: a plain decimal, an ISO-8601 date, or trimmed text. */
    @Column(name = "normalized_value", columnDefinition = "TEXT")
    private String normalizedValue;

    @Enumerated(EnumType.STRING)
    @Column(name = "value_kind", nullable = false, length = 20)
    private ValueKind valueKind;

    @Column(length = 3)
    private String currency;

    @Column(nullable = false, precision = 4, scale = 3)
    @Builder.Default
    private BigDecimal confidence = BigDecimal.ZERO;

    @Column(name = "citation_quote", columnDefinition = "TEXT")
    private String citationQuote;

    @Column(name = "citation_page")
    private Integer citationPage;

    @Column(name = "citation_start")
    private Integer citationStart;

    @Column(name = "citation_end")
    private Integer citationEnd;

    @Column(name = "citation_verified", nullable = false)
    @Builder.Default
    private boolean citationVerified = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false, length = 20)
    @Builder.Default
    private ReviewStatus reviewStatus = ReviewStatus.PENDING;

    /** Set when a reviewer corrects the value. Takes precedence when applying. */
    @Column(name = "reviewed_value", columnDefinition = "TEXT")
    private String reviewedValue;

    @Column(name = "review_note", columnDefinition = "TEXT")
    private String reviewNote;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

    /** The value downstream code should use: the reviewer's correction if any. */
    public String effectiveValue() {
        return reviewedValue != null && !reviewedValue.isBlank() ? reviewedValue : normalizedValue;
    }
}
