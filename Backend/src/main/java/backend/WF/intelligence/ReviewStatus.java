package backend.WF.intelligence;

/**
 * Where a single extracted attribute sits in human validation.
 *
 * <p>Nothing extracted by a machine reaches a contract without passing through
 * here: {@link #PENDING} is the only state the pipeline may write, and only a
 * human reviewer can move a row to any of the others.
 */
public enum ReviewStatus {
    /** Written by the pipeline, awaiting a human decision. */
    PENDING,
    /** A reviewer confirmed the extracted value verbatim. */
    ACCEPTED,
    /** A reviewer corrected the value; {@code reviewedValue} holds the truth. */
    EDITED,
    /** A reviewer rejected the extraction outright. It is never applied. */
    REJECTED
}
