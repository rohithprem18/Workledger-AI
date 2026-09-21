package backend.WF.billing;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BillingTypeRepository extends JpaRepository<BillingTypeEntity, UUID> {

    Optional<BillingTypeEntity> findByCode(String code);

    List<BillingTypeEntity> findByActiveTrue();
}
