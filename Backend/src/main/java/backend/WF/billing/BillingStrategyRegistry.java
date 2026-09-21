package backend.WF.billing;

import backend.WF.exception.BusinessRuleViolationException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class BillingStrategyRegistry {

    private final Map<String, InvoiceCalculationStrategy> byCode;

    public BillingStrategyRegistry(List<InvoiceCalculationStrategy> strategies) {
        this.byCode = strategies.stream()
                .collect(Collectors.toMap(InvoiceCalculationStrategy::supportedCode, Function.identity()));
    }

    public InvoiceCalculationStrategy resolve(String code) {
        InvoiceCalculationStrategy s = byCode.get(code);
        if (s == null) {
            throw new BusinessRuleViolationException(
                    "Unsupported billing type: " + code + ". No strategy registered.");
        }
        return s;
    }
}
