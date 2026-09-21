package backend.WF.milestone;

import backend.WF.contract.Contract;
import backend.WF.contract.ContractRepository;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.invoice.InvoiceResponse;
import backend.WF.invoice.InvoiceService;
import backend.WF.security.CurrentUserService;
import backend.WF.security.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MilestoneServiceTest {

    @Mock private MilestoneRepository milestoneRepository;
    @Mock private ContractRepository contractRepository;
    @Mock private InvoiceService invoiceService;
    @Mock private CurrentUserService currentUserService;
    @Mock private MilestoneTaskRepository milestoneTaskRepository;

    @InjectMocks
    private MilestoneService milestoneService;

    private UUID milestoneId;
    private ContractMilestone milestone;
    private Contract contract;

    @BeforeEach
    void setUp() {
        milestoneId = UUID.randomUUID();
        contract = mock(Contract.class);
        when(contract.getId()).thenReturn(UUID.randomUUID());
        when(contract.getTitle()).thenReturn("Contract A");

        milestone = mock(ContractMilestone.class);
        when(milestone.getId()).thenReturn(milestoneId);
        when(milestone.getContract()).thenReturn(contract);
        when(milestone.getLabel()).thenReturn("MVP");
        when(milestone.getSequenceOrder()).thenReturn(1);
        when(milestone.getAmount()).thenReturn(new BigDecimal("10000.00"));

        User user = mock(User.class);
        when(user.getId()).thenReturn(UUID.randomUUID());
        when(currentUserService.getCurrentUser()).thenReturn(user);
    }

    @Test
    void markReached_pendingToReached() {
        when(milestone.getStatus()).thenReturn(MilestoneStatus.PENDING);
        when(milestoneRepository.findByIdForUpdate(milestoneId)).thenReturn(Optional.of(milestone));
        when(milestoneRepository.save(any())).thenReturn(milestone);

        milestoneService.markReached(milestoneId);

        verify(milestone).setStatus(MilestoneStatus.REACHED);
        verify(milestone).setMarkedAt(any());
        verify(milestone).setMarkedByUserId(any());
    }

    @Test
    void markReached_rejectsIfNotPending() {
        when(milestone.getStatus()).thenReturn(MilestoneStatus.REACHED);
        when(milestoneRepository.findByIdForUpdate(milestoneId)).thenReturn(Optional.of(milestone));

        assertThrows(BusinessRuleViolationException.class,
                () -> milestoneService.markReached(milestoneId));
    }

    @Test
    void approveAndInvoice_generatesInvoiceAndTransitions() {
        when(milestone.getStatus()).thenReturn(MilestoneStatus.REACHED);
        when(milestoneRepository.findByIdForUpdate(milestoneId)).thenReturn(Optional.of(milestone));
        when(milestoneRepository.save(any())).thenReturn(milestone);

        InvoiceResponse invoice = mock(InvoiceResponse.class);
        UUID invoiceId = UUID.randomUUID();
        when(invoice.getId()).thenReturn(invoiceId);
        when(invoiceService.generateMilestoneInvoice(milestone)).thenReturn(invoice);

        milestoneService.approveAndInvoice(milestoneId);

        verify(invoiceService).generateMilestoneInvoice(milestone);
        verify(milestone).setStatus(MilestoneStatus.APPROVED_INVOICED);
        verify(milestone).setInvoiceId(invoiceId);
    }

    @Test
    void approveAndInvoice_rejectsIfNotReached() {
        when(milestone.getStatus()).thenReturn(MilestoneStatus.PENDING);
        when(milestoneRepository.findByIdForUpdate(milestoneId)).thenReturn(Optional.of(milestone));

        assertThrows(BusinessRuleViolationException.class,
                () -> milestoneService.approveAndInvoice(milestoneId));

        verify(invoiceService, never()).generateMilestoneInvoice(any());
    }
}
