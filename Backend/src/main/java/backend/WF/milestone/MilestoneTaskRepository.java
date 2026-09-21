package backend.WF.milestone;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MilestoneTaskRepository extends JpaRepository<MilestoneTask, UUID> {

    List<MilestoneTask> findByMilestoneId(UUID milestoneId);

    long countByMilestoneId(UUID milestoneId);

    long countByMilestoneIdAndStatusNot(UUID milestoneId, TaskStatus status);

    List<MilestoneTask> findByAssignedToUserId(UUID userId);
}
