package backend.WF.intelligence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ContractDocumentRepository extends JpaRepository<ContractDocument, UUID> {

    List<ContractDocument> findByContractIdOrderByCreatedAtDesc(UUID contractId);

    Optional<ContractDocument> findByChecksumSha256(String checksumSha256);

    @Query("SELECT d FROM ContractDocument d LEFT JOIN FETCH d.extractions WHERE d.id = :id")
    Optional<ContractDocument> findByIdWithExtractions(@Param("id") UUID id);

    List<ContractDocument> findAllByOrderByCreatedAtDesc();
}
