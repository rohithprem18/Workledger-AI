package backend.WF.invoiceaudit;

/**
 * How much a finding matters.
 *
 * <p>Severity is assigned by the rule that produced the finding, never by a
 * language model, because it decides whether an invoice can be approved.
 */
public enum Severity {
    /** Money is wrong or unauthorised. Approval is refused until overridden. */
    BLOCKER,
    /** Worth a human look before approving, but not provably wrong. */
    WARNING,
    /** Context a reviewer should have. Never affects approval. */
    INFO
}
