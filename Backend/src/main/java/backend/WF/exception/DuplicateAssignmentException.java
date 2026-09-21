package backend.WF.exception;

public class DuplicateAssignmentException extends BusinessRuleViolationException {

    public DuplicateAssignmentException(String message) {
        super(message);
    }
}
