package backend.WF.allocation.strategy;

import backend.WF.common.DateRange;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Phase 1 strategy: manager has already selected the employee.
 * The "strategy" wraps the pre-selected candidate list so the orchestration
 * path remains uniform with Phase 2's LongestIdleFirstStrategy.
 */
@Component("manualSelectionStrategy")
public class ManualSelectionStrategy implements AllocationStrategy {

    private List<UUID> preSelectedEmployeeIds = List.of();

    public void setPreSelectedEmployeeIds(List<UUID> ids) {
        this.preSelectedEmployeeIds = List.copyOf(ids);
    }

    @Override
    public List<UUID> selectCandidates(UUID requirementId, int count, DateRange dateRange) {
        return preSelectedEmployeeIds.stream().limit(count).toList();
    }
}
