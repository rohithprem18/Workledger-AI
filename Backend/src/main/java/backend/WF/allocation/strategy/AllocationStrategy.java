package backend.WF.allocation.strategy;

import backend.WF.common.DateRange;

import java.util.List;
import java.util.UUID;

public interface AllocationStrategy {

    /**
     * Selects up to {@code count} candidate employee IDs for the given requirement.
     * Implementations differ in how they rank or filter candidates.
     * Writing to the assignments table is NOT this method's responsibility —
     * callers must hand each selected ID to AssignmentService.createAssignment().
     */
    List<UUID> selectCandidates(UUID requirementId, int count, DateRange dateRange);
}
