package backend.WF.worklog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WorkLogSegmentRepository extends JpaRepository<WorkLogSegment, UUID> {

    List<WorkLogSegment> findByWorkLogId(UUID workLogId);
}
