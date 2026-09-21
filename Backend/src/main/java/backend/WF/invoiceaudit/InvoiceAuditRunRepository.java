package backend.WF.invoiceaudit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvoiceAuditRunRepository extends JpaRepository<InvoiceAuditRun, UUID> {

    List<InvoiceAuditRun> findByInvoiceIdOrderByCreatedAtDesc(UUID invoiceId);

    Optional<InvoiceAuditRun> findFirstByInvoiceIdOrderByCreatedAtDesc(UUID invoiceId);

    List<InvoiceAuditRun> findByVerdictOrderByCreatedAtDesc(Verdict verdict);
}
