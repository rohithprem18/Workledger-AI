package backend.WF.invoiceaudit;

import backend.WF.ai.LlmGateway;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Turns computed findings into prose a finance reviewer can act on.
 *
 * <p>This is the only place a language model touches the audit, and it runs
 * strictly after every number is final. The model receives findings that are
 * already complete and is asked to explain them — never to find, judge, score
 * or recompute anything. If it is switched off, fails, or returns nonsense, the
 * audit is unaffected: the templated narrative below says the same thing in
 * fewer words, and each finding's own {@code detail} already states the
 * discrepancy in full.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FindingNarrator {

    private final LlmGateway llm;
    private final ObjectMapper objectMapper;

    private static final String SYSTEM_PROMPT = """
            You write short explanations of invoice audit findings for a finance
            reviewer who is deciding whether to approve an invoice.

            You will be given findings that have ALREADY been computed from the
            contract, the approved work records and the invoice. Every number in
            them is correct and final.

            Return ONLY this JSON object, no prose and no markdown fences:

            {"summary":"2-3 sentences on what to do about this invoice overall",
             "explanations":[{"index":0,"explanation":"1-2 sentences"}]}

            Rules you must follow:
            - NEVER state a number that is not already in the finding you were
              given. Do not add, subtract, convert, total or re-derive anything.
            - Explain what the discrepancy means in business terms and what the
              reviewer should do about it. Do not restate the finding verbatim.
            - Do not invent causes. If the finding does not say why something
              happened, say what should be checked, not what probably happened.
            - Plain professional English. No bullet points, no headings.
            """;

    /** What the narrator produced: a summary plus per-finding explanations. */
    public record Narration(String summary, List<String> explanations, String engine) {}

    /**
     * @param findings findings in display order; explanations come back aligned to it
     */
    public Narration narrate(List<InvoiceAuditFinding> findings, ReconciliationContext context,
                             Verdict verdict) {
        String fallbackSummary = templatedSummary(findings, context, verdict);

        if (!llm.isEnabled() || findings.isEmpty()) {
            return new Narration(fallbackSummary, List.of(), "deterministic");
        }

        return llm.completeJson(SYSTEM_PROMPT, buildPrompt(findings, context, verdict))
                .flatMap(json -> parse(json, findings.size()))
                .map(n -> new Narration(
                        n.summary() == null || n.summary().isBlank() ? fallbackSummary : n.summary(),
                        n.explanations(),
                        llm.engineLabel()))
                .orElseGet(() -> new Narration(fallbackSummary, List.of(), "deterministic"));
    }

    private String buildPrompt(List<InvoiceAuditFinding> findings, ReconciliationContext context,
                               Verdict verdict) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("verdict", verdict.name());
        root.put("contract", context.contract().getTitle());
        root.put("billing_type", context.isMilestoneInvoice() ? "MILESTONE" : "HOURLY");
        root.put("period", context.invoice().getPeriodStart() + " to " + context.invoice().getPeriodEnd());
        root.put("contract_authorised_total", context.contractAuthorisedTotal().toPlainString());
        root.put("approved_work_total", context.approvedWorkValue().toPlainString());
        root.put("invoiced_total", context.invoicedTotal().toPlainString());

        ArrayNode array = root.putArray("findings");
        for (int i = 0; i < findings.size(); i++) {
            InvoiceAuditFinding f = findings.get(i);
            ObjectNode node = array.addObject();
            node.put("index", i);
            node.put("severity", f.getSeverity().name());
            node.put("rule", f.getRuleCode());
            node.put("title", f.getTitle());
            node.put("detail", f.getDetail());
            if (f.getExpectedValue() != null) {
                node.put("expected", f.getExpectedValue());
            }
            if (f.getActualValue() != null) {
                node.put("actual", f.getActualValue());
            }
        }
        return root.toString();
    }

    private Optional<Narration> parse(String json, int expectedCount) {
        try {
            JsonNode root = objectMapper.readTree(json);
            String summary = root.path("summary").asText(null);

            String[] slots = new String[expectedCount];
            for (JsonNode node : root.path("explanations")) {
                int index = node.path("index").asInt(-1);
                String text = node.path("explanation").asText("").trim();
                if (index >= 0 && index < expectedCount && !text.isEmpty()) {
                    slots[index] = text;
                }
            }
            return Optional.of(new Narration(summary, java.util.Arrays.asList(slots), null));
        } catch (Exception e) {
            log.warn("Could not parse narration output: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * The summary used whenever the model is off or unavailable. Deliberately
     * complete on its own — the platform is expected to run this way.
     */
    static String templatedSummary(List<InvoiceAuditFinding> findings,
                                   ReconciliationContext context, Verdict verdict) {
        String period = context.invoice().getPeriodStart() + " to " + context.invoice().getPeriodEnd();
        String head = "Reconciled invoice for \"" + context.contract().getTitle() + "\" covering "
                + period + ". Contract authorises " + context.contractAuthorisedTotal()
                + ", approved work is worth " + context.approvedWorkValue()
                + ", and the invoice presents " + context.invoicedTotal() + ".";

        if (findings.isEmpty()) {
            return head + " All three sources agree; nothing was flagged.";
        }

        long blockers = findings.stream().filter(f -> f.getSeverity() == Severity.BLOCKER).count();
        long warnings = findings.stream().filter(f -> f.getSeverity() == Severity.WARNING).count();

        String tail = switch (verdict) {
            case BLOCKED -> " " + blockers + " blocking discrepancy(ies) must be resolved before "
                    + "this invoice can be approved.";
            case ADVISORY -> " " + warnings + " item(s) are worth reviewing, but none block approval.";
            case CLEAN -> " Nothing was flagged.";
        };
        return head + tail;
    }
}
