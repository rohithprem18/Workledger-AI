package backend.WF.intelligence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ContractExtractionRepository extends JpaRepository<ContractExtraction, UUID> {

    List<ContractExtraction> findByDocumentIdOrderByAttributeTypeAscFieldKeyAsc(UUID documentId);

    void deleteByDocumentId(UUID documentId);

    long countByDocumentIdAndReviewStatus(UUID documentId, ReviewStatus reviewStatus);
}
