package backend.WF.billing;

import backend.WF.contract.Contract;
import backend.WF.invoice.InvoiceLineItem;
import backend.WF.milestone.ContractMilestone;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Component
public class MilestoneInvoiceStrategy implements InvoiceCalculationStrategy {

    @Override
    public String supportedCode() {
        return "MILESTONE";
    }

    @Override
    public List<InvoiceLineItem> calculateForMilestone(Contract contract, ContractMilestone milestone) {
        BigDecimal amount = milestone.getAmount();
        InvoiceLineItem line = InvoiceLineItem.builder()
                .description("Milestone: " + milestone.getLabel())
                .quantity(BigDecimal.ONE)
                .unitRate(amount)
                .amount(amount)
                .build();
        List<InvoiceLineItem> items = new ArrayList<>();
        items.add(line);
        return items;
    }
}
