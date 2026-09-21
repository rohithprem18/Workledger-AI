package backend.WF.invoiceaudit;

import backend.WF.assignment.Assignment;
import backend.WF.contract.Contract;
import backend.WF.contract.ContractRequirement;
import backend.WF.invoice.Invoice;
import backend.WF.invoice.InvoiceLineItem;
import backend.WF.invoice.InvoiceStatus;
import backend.WF.invoiceaudit.rule.ApprovedWorkCoverageRule;
import backend.WF.invoiceaudit.rule.ContractPeriodRule;
import backend.WF.invoiceaudit.rule.DuplicateBillingRule;
import backend.WF.invoiceaudit.rule.LineItemArithmeticRule;
import backend.WF.invoiceaudit.rule.RateAuthorisationRule;
import backend.WF.worklog.WorkLog;
import backend.WF.worklog.WorkLogStatus;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The reconciliation rules are pure functions over the three sources, which is
 * what lets them be tested exactly like this — build the data, assert the
 * finding. No mocks, no context, no database.
 *
 * <p>Each test states a discrepancy an auditor would actually be asked to catch.
 */
class ReconciliationRuleTest {

    private static final LocalDate PERIOD_START = LocalDate.of(2026, 4, 1);
    private static final LocalDate PERIOD_END = LocalDate.of(2026, 4, 30);
    private static final BigDecimal RATE = new BigDecimal("1000.00");

    // ------------------------------------------------------------- fixtures

    private Contract contract() {
        Contract contract = new Contract();
        contract.setId(UUID.randomUUID());
        contract.setTitle("Platform Engineering");
        contract.setStartDate(LocalDate.of(2026, 1, 1));
        contract.setEndDate(LocalDate.of(2026, 12, 31));
        contract.setActive(true);
        return contract;
    }

    private ContractRequirement requirement(Contract contract, BigDecimal rate) {
        ContractRequirement requirement = new ContractRequirement();
        requirement.setId(UUID.randomUUID());
        requirement.setContract(contract);
        requirement.setHourlyRate(rate);
        requirement.setRequiredEmployeeCount(1);
        requirement.setExpectedHoursPerDay(new BigDecimal("8.00"));
        requirement.setStartDate(contract.getStartDate());
        requirement.setEndDate(contract.getEndDate());
        return requirement;
    }

    private WorkLog approvedLog(ContractRequirement requirement, int minutes) {
        Assignment assignment = new Assignment();
        assignment.setId(UUID.randomUUID());
        assignment.setRequirement(requirement);

        WorkLog log = new WorkLog();
        log.setId(UUID.randomUUID());
        log.setAssignment(assignment);
        log.setWorkDate(PERIOD_START);
        log.setStatus(WorkLogStatus.APPROVED);
        log.setTotalActualMinutes(minutes);
        return log;
    }

    private Invoice invoice(Contract contract, List<InvoiceLineItem> items) {
        BigDecimal total = items.stream()
                .map(InvoiceLineItem::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return invoice(contract, items, total);
    }

    private Invoice invoice(Contract contract, List<InvoiceLineItem> items, BigDecimal total) {
        Invoice invoice = new Invoice();
        invoice.setId(UUID.randomUUID());
        invoice.setContract(contract);
        invoice.setPeriodStart(PERIOD_START);
        invoice.setPeriodEnd(PERIOD_END);
        invoice.setStatus(InvoiceStatus.DRAFT);
        invoice.setGeneratedBy(UUID.randomUUID());
        invoice.setTotalAmount(total);
        invoice.setLineItems(new ArrayList<>(items));
        return invoice;
    }

    private InvoiceLineItem line(String description, String hours, BigDecimal rate, String amount) {
        InvoiceLineItem item = new InvoiceLineItem();
        item.setId(UUID.randomUUID());
        item.setDescription(description);
        item.setQuantity(new BigDecimal(hours));
        item.setUnitRate(rate);
        item.setAmount(new BigDecimal(amount));
        return item;
    }

    private ReconciliationContext context(Contract contract, List<ContractRequirement> requirements,
                                          List<WorkLog> approved, Invoice invoice,
                                          List<Invoice> others) {
        return new ReconciliationContext(invoice, contract, requirements, approved,
                List.of(), Optional.empty(), others);
    }

    // ------------------------------------------------------------ arithmetic

    @Test
    void lineItemThatDoesNotEqualQuantityTimesRateIsBlocked() {
        Contract contract = contract();
        // 40 hours at 1000 is 40,000 — this line claims 45,000.
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "45000.00")));

        List<ReconciliationRule.Finding> findings = new LineItemArithmeticRule()
                .evaluate(context(contract, List.of(), List.of(), invoice, List.of()));

        assertEquals(1, findings.size());
        assertEquals(Severity.BLOCKER, findings.get(0).severity());
        assertEquals(new BigDecimal("5000.00"), findings.get(0).delta());
    }

    @Test
    void invoiceTotalThatDoesNotMatchItsLinesIsBlocked() {
        Contract contract = contract();
        Invoice invoice = invoice(contract,
                List.of(line("Engineering", "40.00", RATE, "40000.00")),
                new BigDecimal("48000.00"));

        List<ReconciliationRule.Finding> findings = new LineItemArithmeticRule()
                .evaluate(context(contract, List.of(), List.of(), invoice, List.of()));

        assertTrue(findings.stream().anyMatch(f -> f.severity() == Severity.BLOCKER
                && f.title().contains("total")));
    }

    @Test
    void aCorrectInvoicePassesArithmetic() {
        Contract contract = contract();
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));

        assertTrue(new LineItemArithmeticRule()
                .evaluate(context(contract, List.of(), List.of(), invoice, List.of()))
                .isEmpty());
    }

    @Test
    void anInvoiceWithNoLineItemsIsBlocked() {
        Contract contract = contract();
        Invoice invoice = invoice(contract, List.of(), new BigDecimal("40000.00"));

        List<ReconciliationRule.Finding> findings = new LineItemArithmeticRule()
                .evaluate(context(contract, List.of(), List.of(), invoice, List.of()));

        assertEquals(1, findings.size());
        assertEquals(Severity.BLOCKER, findings.get(0).severity());
    }

    // ----------------------------------------------------- rate authorisation

    @Test
    void aRateTheContractNeverAuthorisedIsBlocked() {
        Contract contract = contract();
        ContractRequirement requirement = requirement(contract, RATE);
        // Billed at 1,200 against a contract that authorises 1,000.
        Invoice invoice = invoice(contract,
                List.of(line("Engineering", "40.00", new BigDecimal("1200.00"), "48000.00")));

        List<ReconciliationRule.Finding> findings = new RateAuthorisationRule()
                .evaluate(context(contract, List.of(requirement), List.of(), invoice, List.of()));

        assertEquals(1, findings.size());
        assertEquals(Severity.BLOCKER, findings.get(0).severity());
        assertEquals(new BigDecimal("200.00"), findings.get(0).delta());
    }

    @Test
    void anAuthorisedRatePasses() {
        Contract contract = contract();
        ContractRequirement requirement = requirement(contract, RATE);
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));

        assertTrue(new RateAuthorisationRule()
                .evaluate(context(contract, List.of(requirement), List.of(), invoice, List.of()))
                .isEmpty());
    }

    // -------------------------------------------------- approved-work coverage

    @Test
    void billingMoreHoursThanWereApprovedIsBlocked() {
        Contract contract = contract();
        ContractRequirement requirement = requirement(contract, RATE);
        // 20 hours approved, 40 billed.
        List<WorkLog> approved = List.of(approvedLog(requirement, 20 * 60));
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));

        List<ReconciliationRule.Finding> findings = new ApprovedWorkCoverageRule()
                .evaluate(context(contract, List.of(requirement), approved, invoice, List.of()));

        assertTrue(findings.stream().anyMatch(f -> f.severity() == Severity.BLOCKER),
                "Billing unapproved hours must block approval");
    }

    @Test
    void leavingApprovedHoursUnbilledIsAWarningNotABlocker() {
        Contract contract = contract();
        ContractRequirement requirement = requirement(contract, RATE);
        // 40 hours approved, only 20 billed — costs the vendor, not the client.
        List<WorkLog> approved = List.of(approvedLog(requirement, 40 * 60));
        Invoice invoice = invoice(contract, List.of(line("Engineering", "20.00", RATE, "20000.00")));

        List<ReconciliationRule.Finding> findings = new ApprovedWorkCoverageRule()
                .evaluate(context(contract, List.of(requirement), approved, invoice, List.of()));

        assertFalse(findings.isEmpty());
        assertTrue(findings.stream().noneMatch(f -> f.severity() == Severity.BLOCKER),
                "Under-billing should not block approval");
    }

    @Test
    void anInvoiceMatchingApprovedWorkExactlyPasses() {
        Contract contract = contract();
        ContractRequirement requirement = requirement(contract, RATE);
        List<WorkLog> approved = List.of(approvedLog(requirement, 40 * 60));
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));

        assertTrue(new ApprovedWorkCoverageRule()
                .evaluate(context(contract, List.of(requirement), approved, invoice, List.of()))
                .isEmpty());
    }

    // --------------------------------------------------------- period bounds

    @Test
    void billingOutsideTheContractTermIsBlocked() {
        Contract contract = contract();
        contract.setEndDate(LocalDate.of(2026, 4, 15));
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));

        List<ReconciliationRule.Finding> findings = new ContractPeriodRule()
                .evaluate(context(contract, List.of(), List.of(), invoice, List.of()));

        assertTrue(findings.stream().anyMatch(f -> f.severity() == Severity.BLOCKER
                && f.title().contains("past the contract end")));
    }

    @Test
    void aPeriodInsideTheContractTermPasses() {
        Contract contract = contract();
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));

        assertTrue(new ContractPeriodRule()
                .evaluate(context(contract, List.of(), List.of(), invoice, List.of()))
                .isEmpty());
    }

    // ------------------------------------------------------ duplicate billing

    @Test
    void overlappingAnAlreadyApprovedInvoiceIsBlocked() {
        Contract contract = contract();
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));

        Invoice earlier = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));
        earlier.setPeriodStart(LocalDate.of(2026, 4, 15));
        earlier.setPeriodEnd(LocalDate.of(2026, 5, 15));
        earlier.setStatus(InvoiceStatus.APPROVED);

        List<ReconciliationRule.Finding> findings = new DuplicateBillingRule()
                .evaluate(context(contract, List.of(), List.of(), invoice, List.of(invoice, earlier)));

        assertEquals(1, findings.size());
        assertEquals(Severity.BLOCKER, findings.get(0).severity());
        assertEquals(new BigDecimal("16"), findings.get(0).delta(),
                "15 April through 30 April inclusive is 16 overlapping days");
    }

    @Test
    void nonOverlappingPeriodsPass() {
        Contract contract = contract();
        Invoice invoice = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));

        Invoice earlier = invoice(contract, List.of(line("Engineering", "40.00", RATE, "40000.00")));
        earlier.setPeriodStart(LocalDate.of(2026, 3, 1));
        earlier.setPeriodEnd(LocalDate.of(2026, 3, 31));
        earlier.setStatus(InvoiceStatus.APPROVED);

        assertTrue(new DuplicateBillingRule()
                .evaluate(context(contract, List.of(), List.of(), invoice, List.of(invoice, earlier)))
                .isEmpty());
    }
}
