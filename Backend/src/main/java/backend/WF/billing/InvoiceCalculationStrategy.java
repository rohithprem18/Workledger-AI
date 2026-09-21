package backend.WF.billing;

import backend.WF.contract.Contract;
import backend.WF.invoice.InvoiceLineItem;
import backend.WF.milestone.ContractMilestone;
import backend.WF.worklog.WorkLog;

import java.time.LocalDate;
import java.util.List;

public interface InvoiceCalculationStrategy {

    /** Billing type code this strategy supports (e.g. "HOURLY", "MILESTONE"). */
    String supportedCode();

    /**
     * Calculates line items from approved work logs for the given contract and period.
     * Hourly-style strategies implement this; milestone strategies throw.
     */
    default List<InvoiceLineItem> calculate(Contract contract, List<WorkLog> approvedLogs,
                                            LocalDate periodStart, LocalDate periodEnd) {
        throw new UnsupportedOperationException(
                "Strategy " + supportedCode() + " does not support period-based calculation");
    }

    /**
     * Milestone-based calculation. Milestone strategies implement this; hourly strategies throw.
     */
    default List<InvoiceLineItem> calculateForMilestone(Contract contract, ContractMilestone milestone) {
        throw new UnsupportedOperationException(
                "Strategy " + supportedCode() + " does not support milestone calculation");
    }
}
