package backend.WF.intelligence;

/** Lifecycle of an uploaded contract document. */
public enum DocumentStatus {
    UPLOADED,
    EXTRACTING,
    PENDING_REVIEW,
    VALIDATED,
    APPLIED,
    FAILED
}
