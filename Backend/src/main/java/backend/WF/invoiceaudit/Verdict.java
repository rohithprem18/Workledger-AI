package backend.WF.invoiceaudit;

/** The outcome of one reconciliation run over one invoice. */
public enum Verdict {
    /** Reconciled against all three sources with nothing to report. */
    CLEAN,
    /** Findings exist, but none block approval. */
    ADVISORY,
    /** At least one BLOCKER. Approval is refused without a recorded override. */
    BLOCKED
}
