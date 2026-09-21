package backend.WF.milestone;

import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.security.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MilestoneTaskService {

    private final MilestoneTaskRepository taskRepository;
    private final MilestoneRepository milestoneRepository;
    private final MilestoneService milestoneService;
    private final CurrentUserService currentUserService;

    @Transactional
    public TaskResponse createRootTask(UUID milestoneId, TaskCreateRequest request) {
        ContractMilestone milestone = milestoneRepository.findById(milestoneId)
                .orElseThrow(() -> new EntityNotFoundException("ContractMilestone", milestoneId));

        if (milestone.getStatus() != MilestoneStatus.PENDING) {
            throw new BusinessRuleViolationException(
                    "Tasks can only be added to PENDING milestones. Current status: " + milestone.getStatus());
        }

        MilestoneTask task = MilestoneTask.builder()
                .milestone(milestone)
                .name(request.getName())
                .description(request.getDescription())
                .assignedToUserId(request.getAssignedToUserId())
                .status(TaskStatus.PENDING)
                .build();
        return toResponse(taskRepository.save(task));
    }

    @Transactional
    public TaskResponse createSubtask(UUID parentTaskId, TaskCreateRequest request) {
        MilestoneTask parent = taskRepository.findById(parentTaskId)
                .orElseThrow(() -> new EntityNotFoundException("MilestoneTask", parentTaskId));

        if (parent.getStatus() == TaskStatus.DONE) {
            throw new BusinessRuleViolationException("Cannot add subtask to a completed task.");
        }

        MilestoneTask task = MilestoneTask.builder()
                .milestone(parent.getMilestone())
                .parent(parent)
                .name(request.getName())
                .description(request.getDescription())
                .assignedToUserId(request.getAssignedToUserId())
                .status(TaskStatus.PENDING)
                .build();
        return toResponse(taskRepository.save(task));
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> getMyTasks() {
        UUID userId = currentUserService.getCurrentUser().getId();
        return taskRepository.findByAssignedToUserId(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> listByMilestone(UUID milestoneId) {
        return taskRepository.findByMilestoneId(milestoneId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public TaskResponse updateStatus(UUID taskId, TaskStatus newStatus) {
        MilestoneTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new EntityNotFoundException("MilestoneTask", taskId));

        if (task.getStatus() == TaskStatus.DONE) {
            throw new BusinessRuleViolationException("Task is already DONE and cannot be changed.");
        }

        task.setStatus(newStatus);
        MilestoneTask saved = taskRepository.save(task);

        if (newStatus == TaskStatus.DONE) {
            checkAndAutoReach(task.getMilestone().getId());
        }

        return toResponse(saved);
    }

    @Transactional
    public void deleteTask(UUID taskId) {
        MilestoneTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new EntityNotFoundException("MilestoneTask", taskId));

        if (task.getStatus() != TaskStatus.PENDING) {
            throw new BusinessRuleViolationException(
                    "Only PENDING tasks can be deleted. Current status: " + task.getStatus());
        }
        taskRepository.delete(task);
    }

    private void checkAndAutoReach(UUID milestoneId) {
        long total = taskRepository.countByMilestoneId(milestoneId);
        if (total == 0) return;

        long incomplete = taskRepository.countByMilestoneIdAndStatusNot(milestoneId, TaskStatus.DONE);
        if (incomplete == 0) {
            milestoneService.markReached(milestoneId);
        }
    }

    private TaskResponse toResponse(MilestoneTask t) {
        return TaskResponse.builder()
                .id(t.getId())
                .milestoneId(t.getMilestone().getId())
                .parentId(t.getParent() != null ? t.getParent().getId() : null)
                .name(t.getName())
                .description(t.getDescription())
                .assignedToUserId(t.getAssignedToUserId())
                .status(t.getStatus())
                .childCount(t.getChildren().size())
                .build();
    }
}
