package backend.WF.milestone;

import backend.WF.audit.Auditable;
import backend.WF.contract.Contract;
import backend.WF.contract.ContractRepository;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.invoice.InvoiceResponse;
import backend.WF.invoice.InvoiceService;
import backend.WF.security.CurrentUserService;
import backend.WF.security.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MilestoneService {

    private final MilestoneRepository milestoneRepository;
    private final MilestoneTaskRepository milestoneTaskRepository;
    private final ContractRepository contractRepository;
    private final InvoiceService invoiceService;
    private final CurrentUserService currentUserService;

    @Transactional
    @Auditable(action = "CREATE_MILESTONE", entityType = "ContractMilestone")
    public MilestoneResponse create(UUID contractId, MilestoneCreateRequest request) {
        Contract contract = contractRepository.findById(contractId)
                .orElseThrow(() -> new EntityNotFoundException("Contract", contractId));

        ContractMilestone milestone = ContractMilestone.builder()
                .contract(contract)
                .sequenceOrder(request.getSequenceOrder())
                .label(request.getLabel())
                .thresholdPercent(request.getThresholdPercent())
                .amount(request.getAmount())
                .status(MilestoneStatus.PENDING)
                .build();
        return toResponse(milestoneRepository.save(milestone));
    }

    @Transactional
    @Auditable(action = "MARK_MILESTONE", entityType = "ContractMilestone")
    public MilestoneResponse markReached(UUID milestoneId) {
        ContractMilestone milestone = milestoneRepository.findByIdForUpdate(milestoneId)
                .orElseThrow(() -> new EntityNotFoundException("ContractMilestone", milestoneId));

        if (milestone.getStatus() != MilestoneStatus.PENDING) {
            throw new BusinessRuleViolationException(
                    "Only PENDING milestones can be marked reached. Current status: " + milestone.getStatus());
        }

        long totalTasks = milestoneTaskRepository.countByMilestoneId(milestoneId);
        if (totalTasks > 0) {
            long incomplete = milestoneTaskRepository.countByMilestoneIdAndStatusNot(milestoneId, TaskStatus.DONE);
            if (incomplete > 0) {
                throw new BusinessRuleViolationException(
                        "Milestone has " + incomplete + " incomplete task(s). Complete all tasks first.");
            }
        }

        User currentUser = currentUserService.getCurrentUser();
        milestone.setStatus(MilestoneStatus.REACHED);
        milestone.setMarkedByUserId(currentUser.getId());
        milestone.setMarkedAt(LocalDateTime.now());
        return toResponse(milestoneRepository.save(milestone));
    }

    @Transactional
    @Auditable(action = "APPROVE_MILESTONE", entityType = "ContractMilestone")
    public MilestoneResponse approveAndInvoice(UUID milestoneId) {
        ContractMilestone milestone = milestoneRepository.findByIdForUpdate(milestoneId)
                .orElseThrow(() -> new EntityNotFoundException("ContractMilestone", milestoneId));

        if (milestone.getStatus() != MilestoneStatus.REACHED) {
            throw new BusinessRuleViolationException(
                    "Only REACHED milestones can be approved. Current status: " + milestone.getStatus());
        }

        InvoiceResponse invoice = invoiceService.generateMilestoneInvoice(milestone);

        User currentUser = currentUserService.getCurrentUser();
        milestone.setStatus(MilestoneStatus.APPROVED_INVOICED);
        milestone.setApprovedByUserId(currentUser.getId());
        milestone.setApprovedAt(LocalDateTime.now());
        milestone.setInvoiceId(invoice.getId());
        return toResponse(milestoneRepository.save(milestone));
    }

    @Transactional(readOnly = true)
    public List<MilestoneResponse> listByContract(UUID contractId) {
        return milestoneRepository.findByContractIdOrderBySequenceOrderAsc(contractId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MilestoneResponse> listByStatus(MilestoneStatus status) {
        return milestoneRepository.findByStatus(status).stream()
                .map(this::toResponse)
                .toList();
    }

    private MilestoneResponse toResponse(ContractMilestone m) {
        List<MilestoneTask> tasks = m.getTasks();
        int completedTasks = (int) tasks.stream().filter(t -> t.getStatus() == TaskStatus.DONE).count();
        return MilestoneResponse.builder()
                .id(m.getId())
                .contractId(m.getContract().getId())
                .contractTitle(m.getContract().getTitle())
                .sequenceOrder(m.getSequenceOrder())
                .label(m.getLabel())
                .thresholdPercent(m.getThresholdPercent())
                .amount(m.getAmount())
                .status(m.getStatus())
                .markedByUserId(m.getMarkedByUserId())
                .markedAt(m.getMarkedAt())
                .approvedByUserId(m.getApprovedByUserId())
                .approvedAt(m.getApprovedAt())
                .invoiceId(m.getInvoiceId())
                .totalTasks(tasks.size())
                .completedTasks(completedTasks)
                .build();
    }
}
