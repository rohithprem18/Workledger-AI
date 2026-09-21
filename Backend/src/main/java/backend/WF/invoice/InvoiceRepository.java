package backend.WF.invoice;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    List<Invoice> findByContractId(UUID contractId);

    Optional<Invoice> findByContractIdAndPeriodStartAndPeriodEnd(
            UUID contractId, LocalDate periodStart, LocalDate periodEnd);
}
