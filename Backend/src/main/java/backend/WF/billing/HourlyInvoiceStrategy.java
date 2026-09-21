package backend.WF.billing;

import backend.WF.contract.Contract;
import backend.WF.contract.ContractRequirement;
import backend.WF.invoice.InvoiceLineItem;
import backend.WF.worklog.WorkLog;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class HourlyInvoiceStrategy implements InvoiceCalculationStrategy {

    @Override
    public String supportedCode() {
        return "HOURLY";
    }

    @Override
    public List<InvoiceLineItem> calculate(Contract contract, List<WorkLog> approvedLogs,
                                           LocalDate periodStart, LocalDate periodEnd) {
        // Group approved logs by requirement
        Map<UUID, List<WorkLog>> byRequirement = approvedLogs.stream()
                .collect(Collectors.groupingBy(wl -> wl.getAssignment().getRequirement().getId()));

        List<InvoiceLineItem> lineItems = new ArrayList<>();

        for (Map.Entry<UUID, List<WorkLog>> entry : byRequirement.entrySet()) {
            List<WorkLog> logs = entry.getValue();
            if (logs.isEmpty()) continue;

            ContractRequirement requirement = logs.get(0).getAssignment().getRequirement();
            int totalMinutes = logs.stream().mapToInt(WorkLog::getTotalActualMinutes).sum();
            BigDecimal totalHours = BigDecimal.valueOf(totalMinutes)
                    .divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);

            BigDecimal rate = requirement.getHourlyRate();
            BigDecimal amount = totalHours.multiply(rate).setScale(2, RoundingMode.HALF_UP);

            String description = String.format("Contracted Work [%s] — %.2f hrs @ ₹%.2f",
                    requirement.getSkill().getName(),
                    totalHours.doubleValue(),
                    rate.doubleValue());

            lineItems.add(InvoiceLineItem.builder()
                    .description(description)
                    .quantity(totalHours)
                    .unitRate(rate)
                    .amount(amount)
                    .build());
        }

        return lineItems;
    }
}
