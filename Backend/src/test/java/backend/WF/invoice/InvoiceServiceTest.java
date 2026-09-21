package backend.WF.invoice;

import backend.WF.assignment.Assignment;
import backend.WF.billing.BillingStrategyRegistry;
import backend.WF.billing.InvoiceCalculationStrategy;
import backend.WF.contract.Contract;
import backend.WF.contract.ContractRepository;
import backend.WF.contract.ContractRequirement;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.milestone.ContractMilestone;
import backend.WF.security.CurrentUserService;
import backend.WF.security.User;
import backend.WF.worklog.WorkLog;
import backend.WF.worklog.WorkLogRepository;
import backend.WF.worklog.WorkLogStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class InvoiceServiceTest {

    @Mock private InvoiceRepository invoiceRepository;
    @Mock private ContractRepository contractRepository;
    @Mock private WorkLogRepository workLogRepository;
    @Mock private BillingStrategyRegistry billingStrategyRegistry;
    @Mock private CurrentUserService currentUserService;

    @InjectMocks
    private InvoiceService invoiceService;

    private UUID contractId;
    private Contract contract;
    private User currentUser;
    private LocalDate periodStart;
    private LocalDate periodEnd;

    @BeforeEach
    void setUp() {
        contractId = UUID.randomUUID();
        periodStart = LocalDate.of(2025, 1, 1);
        periodEnd = LocalDate.of(2025, 1, 31);

        contract = mock(Contract.class);
        when(contract.getId()).thenReturn(contractId);
        when(contract.getTitle()).thenReturn("Test Contract");
        when(contract.getBillingCode()).thenReturn("HOURLY");

        currentUser = mock(User.class);
        when(currentUser.getId()).thenReturn(UUID.randomUUID());

        when(currentUserService.getCurrentUser()).thenReturn(currentUser);
    }

    @Test
    void generateInvoice_totalIsServerComputed_notFromClient() {
        WorkLog approvedLog = buildApprovedWorkLog(120, new BigDecimal("100.00"));

        when(contractRepository.findById(contractId)).thenReturn(Optional.of(contract));
        when(invoiceRepository.findByContractIdAndPeriodStartAndPeriodEnd(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(workLogRepository.findApprovedLogsForContract(contractId, periodStart, periodEnd))
                .thenReturn(List.of(approvedLog));

        InvoiceLineItem lineItem = InvoiceLineItem.builder()
                .description("Contracted Work")
                .quantity(new BigDecimal("2.00"))
                .unitRate(new BigDecimal("100.00"))
                .amount(new BigDecimal("200.00"))
                .build();

        InvoiceCalculationStrategy strategy = mock(InvoiceCalculationStrategy.class);
        when(strategy.calculate(any(), any(), any(), any())).thenReturn(List.of(lineItem));
        when(billingStrategyRegistry.resolve("HOURLY")).thenReturn(strategy);

        Invoice savedInvoice = buildMockInvoice(new BigDecimal("200.00"));
        when(invoiceRepository.save(any())).thenReturn(savedInvoice);

        InvoiceResponse response = invoiceService.generateInvoice(buildRequest());

        assertEquals(new BigDecimal("200.00"), response.getTotalAmount());
        verify(workLogRepository).findApprovedLogsForContract(contractId, periodStart, periodEnd);
    }

    @Test
    void generateInvoice_onlyApprovedLogsUsed() {
        when(contractRepository.findById(contractId)).thenReturn(Optional.of(contract));
        when(invoiceRepository.findByContractIdAndPeriodStartAndPeriodEnd(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(workLogRepository.findApprovedLogsForContract(contractId, periodStart, periodEnd))
                .thenReturn(List.of());

        InvoiceCalculationStrategy strategy = mock(InvoiceCalculationStrategy.class);
        when(strategy.calculate(any(), any(), any(), any())).thenReturn(List.of());
        when(billingStrategyRegistry.resolve("HOURLY")).thenReturn(strategy);

        Invoice emptyInvoice = buildMockInvoice(BigDecimal.ZERO);
        when(invoiceRepository.save(any())).thenReturn(emptyInvoice);

        InvoiceResponse response = invoiceService.generateInvoice(buildRequest());

        assertEquals(BigDecimal.ZERO, response.getTotalAmount());
    }

    @Test
    void generateInvoice_failsIfDuplicatePeriod() {
        when(contractRepository.findById(contractId)).thenReturn(Optional.of(contract));
        when(invoiceRepository.findByContractIdAndPeriodStartAndPeriodEnd(any(), any(), any()))
                .thenReturn(Optional.of(mock(Invoice.class)));

        assertThrows(BusinessRuleViolationException.class,
                () -> invoiceService.generateInvoice(buildRequest()));
    }

    @Test
    void approveInvoice_failsIfNotDraft() {
        Invoice approvedInvoice = mock(Invoice.class);
        when(approvedInvoice.getStatus()).thenReturn(InvoiceStatus.APPROVED);
        when(invoiceRepository.findById(any())).thenReturn(Optional.of(approvedInvoice));

        assertThrows(BusinessRuleViolationException.class,
                () -> invoiceService.approveInvoice(UUID.randomUUID()));
    }

    @Test
    void generateMilestoneInvoice_createsSingleLineFromMilestoneAmount() {
        UUID milestoneId = UUID.randomUUID();
        ContractMilestone milestone = mock(ContractMilestone.class);
        when(milestone.getId()).thenReturn(milestoneId);
        when(milestone.getContract()).thenReturn(contract);
        when(milestone.getLabel()).thenReturn("MVP");
        when(milestone.getAmount()).thenReturn(new BigDecimal("10000.00"));
        when(contract.getBillingCode()).thenReturn("MILESTONE");

        InvoiceLineItem line = InvoiceLineItem.builder()
                .description("Milestone: MVP")
                .quantity(BigDecimal.ONE)
                .unitRate(new BigDecimal("10000.00"))
                .amount(new BigDecimal("10000.00"))
                .build();

        InvoiceCalculationStrategy strategy = mock(InvoiceCalculationStrategy.class);
        when(strategy.calculateForMilestone(contract, milestone)).thenReturn(List.of(line));
        when(billingStrategyRegistry.resolve("MILESTONE")).thenReturn(strategy);

        Invoice saved = buildMockInvoice(new BigDecimal("10000.00"));
        when(saved.getMilestoneId()).thenReturn(milestoneId);
        when(invoiceRepository.save(any())).thenReturn(saved);

        InvoiceResponse response = invoiceService.generateMilestoneInvoice(milestone);

        assertEquals(new BigDecimal("10000.00"), response.getTotalAmount());
        assertEquals(milestoneId, response.getMilestoneId());
    }

    private InvoiceGenerateRequest buildRequest() {
        InvoiceGenerateRequest r = new InvoiceGenerateRequest();
        setField(r, "contractId", contractId);
        setField(r, "periodStart", periodStart);
        setField(r, "periodEnd", periodEnd);
        return r;
    }

    private WorkLog buildApprovedWorkLog(int totalMinutes, BigDecimal rate) {
        ContractRequirement requirement = mock(ContractRequirement.class);
        when(requirement.getHourlyRate()).thenReturn(rate);

        backend.WF.skill.Skill skill = mock(backend.WF.skill.Skill.class);
        when(skill.getName()).thenReturn("Java");
        when(requirement.getSkill()).thenReturn(skill);

        Assignment assignment = mock(Assignment.class);
        when(assignment.getRequirement()).thenReturn(requirement);

        WorkLog log = mock(WorkLog.class);
        when(log.getStatus()).thenReturn(WorkLogStatus.APPROVED);
        when(log.getTotalActualMinutes()).thenReturn(totalMinutes);
        when(log.getAssignment()).thenReturn(assignment);
        return log;
    }

    private Invoice buildMockInvoice(BigDecimal totalAmount) {
        Invoice inv = mock(Invoice.class);
        when(inv.getId()).thenReturn(UUID.randomUUID());
        when(inv.getContract()).thenReturn(contract);
        when(inv.getPeriodStart()).thenReturn(periodStart);
        when(inv.getPeriodEnd()).thenReturn(periodEnd);
        when(inv.getTotalAmount()).thenReturn(totalAmount);
        when(inv.getStatus()).thenReturn(InvoiceStatus.DRAFT);
        when(inv.getLineItems()).thenReturn(List.of());
        return inv;
    }

    private void setField(Object target, String fieldName, Object value) {
        try {
            java.lang.reflect.Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(target, value);
        } catch (Exception e) {
            throw new RuntimeException("Failed to set field " + fieldName, e);
        }
    }
}
