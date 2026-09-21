package backend.WF.invoiceaudit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface InvoiceAuditFindingRepository extends JpaRepository<InvoiceAuditFinding, UUID> {

    List<InvoiceAuditFinding> findByRunIdOrderBySeverityAsc(UUID runId);
}
