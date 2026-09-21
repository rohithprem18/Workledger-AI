package backend.WF.milestone;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MilestoneRepository extends JpaRepository<ContractMilestone, UUID> {

    List<ContractMilestone> findByContractIdOrderBySequenceOrderAsc(UUID contractId);

    List<ContractMilestone> findByStatus(MilestoneStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM ContractMilestone m WHERE m.id = :id")
    Optional<ContractMilestone> findByIdForUpdate(@Param("id") UUID id);
}
