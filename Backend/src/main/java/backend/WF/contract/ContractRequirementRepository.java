package backend.WF.contract;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ContractRequirementRepository extends JpaRepository<ContractRequirement, UUID> {

    List<ContractRequirement> findByContractId(UUID contractId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT cr FROM ContractRequirement cr WHERE cr.id = :id")
    Optional<ContractRequirement> findByIdForUpdate(@Param("id") UUID id);
}
