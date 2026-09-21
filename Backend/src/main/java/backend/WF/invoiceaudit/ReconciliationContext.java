package backend.WF.invoiceaudit;

import backend.WF.contract.Contract;
import backend.WF.contract.ContractRequirement;
import backend.WF.invoice.Invoice;
import backend.WF.milestone.ContractMilestone;
import backend.WF.worklog.WorkLog;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The three authoritative sources, materialized once and handed to every rule.
 *
 * <ol>
 *   <li><b>Contract</b> — the requirements, their authorised rates, and the
 *       period the contract actually covers.</li>
 *   <li><b>Approved work</b> — approved work logs in the invoice period, and the
 *       milestone behind a milestone invoice. Submitted-but-unapproved work is
 *       loaded separately, because billing it is itself a finding.</li>
 *   <li><b>Invoice</b> — the line items exactly as presented for payment.</li>
 * </ol>
 *
 * <p>Loading once matters: if rules each queried independently they could
 * disagree about what the data said, and a reconciliation that contradicts
 * itself is worse than none.
 *
 * @param approvedLogs   approved work logs falling inside the invoice period
 * @param unapprovedLogs draft/submitted/rejected logs in the same period
 * @param milestone      the milestone behind a milestone invoice, if any
 */
public record ReconciliationContext(
        Invoice invoice,
        Contract contract,
        List<ContractRequirement> requirements,
        List<WorkLog> approvedLogs,
        List<WorkLog> unapprovedLogs,
        Optional<ContractMilestone> milestone,
        List<backend.WF.invoice.Invoice> otherInvoices
) {

    /** Authorised hourly rate per requirement id. */
    public Map<UUID, BigDecimal> ratesByRequirement() {
        return requirements.stream().collect(Collectors.toMap(
                ContractRequirement::getId, ContractRequirement::getHourlyRate, (a, b) -> a));
    }

    /** Every authorised rate on the contract, for "is this rate from anywhere?" checks. */
    public List<BigDecimal> authorisedRates() {
        return requirements.stream()
                .map(ContractRequirement::getHourlyRate)
                .distinct()
                .toList();
    }

    /** Approved hours grouped by the requirement they were worked against. */
    public Map<UUID, BigDecimal> approvedHoursByRequirement() {
        return approvedLogs.stream().collect(Collectors.groupingBy(
                wl -> wl.getAssignment().getRequirement().getId(),
                Collectors.reducing(BigDecimal.ZERO,
                        wl -> minutesToHours(wl.getTotalActualMinutes()),
                        BigDecimal::add)));
    }

    /** Source 2 valued at contracted rates: what approved work is actually worth. */
    public BigDecimal approvedWorkValue() {
        Map<UUID, BigDecimal> rates = ratesByRequirement();
        return approvedHoursByRequirement().entrySet().stream()
                .map(e -> e.getValue().multiply(rates.getOrDefault(e.getKey(), BigDecimal.ZERO)))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    /** Total approved hours across the period. */
    public BigDecimal totalApprovedHours() {
        return minutesToHours(approvedLogs.stream().mapToInt(WorkLog::getTotalActualMinutes).sum());
    }

    /** Source 3: the invoice total as presented. */
    public BigDecimal invoicedTotal() {
        return invoice.getTotalAmount() == null
                ? BigDecimal.ZERO
                : invoice.getTotalAmount().setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Source 1: what the contract authorises for this invoice. For a milestone
     * invoice that is the milestone amount; for an hourly invoice the contract
     * caps nothing directly, so approved work at contracted rates is the bound.
     */
    public BigDecimal contractAuthorisedTotal() {
        return milestone.map(ContractMilestone::getAmount)
                .map(a -> a.setScale(2, RoundingMode.HALF_UP))
                .orElseGet(this::approvedWorkValue);
    }

    public boolean isMilestoneInvoice() {
        return invoice.getMilestoneId() != null;
    }

    public static BigDecimal minutesToHours(int minutes) {
        return BigDecimal.valueOf(minutes).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
    }

    /** Groups a list by a key, preserving encounter order. */
    public static <T, K> Map<K, List<T>> groupBy(List<T> items, Function<T, K> key) {
        return items.stream().collect(Collectors.groupingBy(key, java.util.LinkedHashMap::new, Collectors.toList()));
    }
}
