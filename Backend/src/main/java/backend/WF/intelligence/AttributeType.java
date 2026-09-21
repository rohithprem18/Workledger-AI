package backend.WF.intelligence;

/**
 * The four critical attribute families the contract pipeline extracts.
 * Every extracted row belongs to exactly one of them, which is what lets the
 * review screen group findings the way a contract manager reads a contract.
 */
public enum AttributeType {
    /** Money per unit of work: hourly rates, day rates, overtime multipliers, caps. */
    RATE,
    /** How and when money moves: payment terms, invoicing cadence, currency, penalties. */
    BILLING_TERM,
    /** Deliverable checkpoints with an amount and/or a due date. */
    MILESTONE,
    /** Period boundaries: effective date, expiry, notice windows, renewal dates. */
    DATE
}
