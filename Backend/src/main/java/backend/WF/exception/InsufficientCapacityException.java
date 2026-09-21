package backend.WF.exception;

public class InsufficientCapacityException extends BusinessRuleViolationException {

    public InsufficientCapacityException(String message) {
        super(message);
    }
}
