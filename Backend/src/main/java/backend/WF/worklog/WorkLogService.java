package backend.WF.worklog;

import backend.WF.assignment.Assignment;
import backend.WF.assignment.AssignmentRepository;
import backend.WF.audit.Auditable;
import backend.WF.common.TimeWindow;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.security.CurrentUserService;
import backend.WF.security.User;
import backend.WF.worklog.domain.OverlapChecker;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class WorkLogService {

    private final WorkLogRepository workLogRepository;
    private final AssignmentRepository assignmentRepository;
    private final OverlapChecker overlapChecker;
    private final CurrentUserService currentUserService;

    @Transactional
    @Auditable(action = "SUBMIT_WORKLOG", entityType = "WorkLog")
    public WorkLogResponse createAndSubmitWorkLog(WorkLogCreateRequest request) {
        Assignment assignment = assignmentRepository.findById(request.getAssignmentId())
                .orElseThrow(() -> new EntityNotFoundException("Assignment", request.getAssignmentId()));

        // Employee can only submit for their own assignments
        User currentUser = currentUserService.getCurrentUser();
        if (!assignment.getEmployee().getUser().getUsername().equals(currentUser.getUsername())) {
            throw new BusinessRuleViolationException("You can only submit work logs for your own assignments");
        }

        // Approved work logs for this (assignment, date) are immutable
        boolean hasApproved = workLogRepository
                .findByAssignmentIdAndStatus(request.getAssignmentId(), WorkLogStatus.APPROVED)
                .stream()
                .anyMatch(wl -> wl.getWorkDate().equals(request.getWorkDate()));
        if (hasApproved) {
            throw new BusinessRuleViolationException(
                    "An approved work log already exists for this assignment on " + request.getWorkDate()
                    + ". Cannot re-submit an approved work log.");
        }

        // Build segments and check self-overlap
        List<TimeWindow> newWindows = request.getSegments().stream()
                .map(s -> new TimeWindow(s.getStartTime(), s.getEndTime()))
                .collect(Collectors.toList());

        if (overlapChecker.anyOverlap(newWindows)) {
            throw new BusinessRuleViolationException(
                    "Submitted time segments overlap each other");
        }

        // Check against existing segments on same date from OTHER work logs
        List<WorkLog> existingLogs = workLogRepository.findActiveLogsForEmployeeOnDate(
                assignment.getEmployee().getId(), request.getWorkDate());

        List<TimeWindow> existingWindows = existingLogs.stream()
                .flatMap(wl -> wl.getSegments().stream())
                .map(seg -> new TimeWindow(seg.getStartTime(), seg.getEndTime()))
                .collect(Collectors.toList());

        for (TimeWindow newWindow : newWindows) {
            List<TimeWindow> conflicts = overlapChecker.findOverlaps(newWindow, existingWindows);
            if (!conflicts.isEmpty()) {
                throw new BusinessRuleViolationException(
                        "Submitted time segment " + newWindow.startTime() + "–" + newWindow.endTime()
                        + " overlaps with existing logged segments on " + request.getWorkDate());
            }
        }

        // Server-side total computation — never from client
        int totalMinutes = newWindows.stream()
                .mapToInt(w -> (int) w.durationMinutes())
                .sum();

        WorkLog workLog = WorkLog.builder()
                .assignment(assignment)
                .employee(assignment.getEmployee())
                .workDate(request.getWorkDate())
                .status(WorkLogStatus.SUBMITTED)
                .totalActualMinutes(totalMinutes)
                .submittedAt(LocalDateTime.now())
                .build();

        List<WorkLogSegment> segments = new ArrayList<>();
        for (SegmentRequest sr : request.getSegments()) {
            segments.add(WorkLogSegment.builder()
                    .workLog(workLog)
                    .startTime(sr.getStartTime())
                    .endTime(sr.getEndTime())
                    .build());
        }
        workLog.setSegments(segments);
        workLog = workLogRepository.save(workLog);

        return toResponse(workLog);
    }

    @Transactional
    @Auditable(action = "APPROVE_WORKLOG", entityType = "WorkLog")
    public WorkLogResponse approveWorkLog(UUID workLogId, WorkLogApprovalRequest request) {
        WorkLog workLog = workLogRepository.findById(workLogId)
                .orElseThrow(() -> new EntityNotFoundException("WorkLog", workLogId));

        if (workLog.getStatus() != WorkLogStatus.SUBMITTED) {
            throw new BusinessRuleViolationException(
                    "Only SUBMITTED work logs can be approved/rejected. Current status: " + workLog.getStatus());
        }

        if (request.isApproved()) {
            workLog.setStatus(WorkLogStatus.APPROVED);
            workLog.setApprovedAt(LocalDateTime.now());
            workLog.setApprovedBy(currentUserService.getCurrentUser().getId());
        } else {
            if (request.getRejectionReason() == null || request.getRejectionReason().isBlank()) {
                throw new BusinessRuleViolationException("Rejection reason is required when rejecting a work log");
            }
            workLog.setStatus(WorkLogStatus.REJECTED);
            workLog.setRejectionReason(request.getRejectionReason());
        }

        return toResponse(workLogRepository.save(workLog));
    }

    @Transactional(readOnly = true)
    public List<WorkLogResponse> getWorkLogsForApproval(LocalDate from, LocalDate to) {
        return workLogRepository.findByStatusAndWorkDateBetween(WorkLogStatus.SUBMITTED, from, to)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<WorkLogResponse> getMyWorkLogs(UUID employeeId) {
        return workLogRepository.findByEmployeeId(employeeId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<WorkLogResponse> getMyWorkLogsBetween(UUID employeeId, LocalDate from, LocalDate to) {
        return workLogRepository.findByEmployeeIdAndWorkDateBetween(employeeId, from, to).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<WorkLogResponse> getByStatus(WorkLogStatus status) {
        return workLogRepository.findByStatus(status).stream()
                .map(this::toResponse)
                .toList();
    }

    private WorkLogResponse toResponse(WorkLog wl) {
        List<WorkLogResponse.SegmentResponse> segResponses = wl.getSegments().stream()
                .map(s -> WorkLogResponse.SegmentResponse.builder()
                        .id(s.getId())
                        .startTime(s.getStartTime())
                        .endTime(s.getEndTime())
                        .build())
                .toList();

        return WorkLogResponse.builder()
                .id(wl.getId())
                .assignmentId(wl.getAssignment().getId())
                .employeeId(wl.getEmployee().getId())
                .employeeName(wl.getEmployee().getFullName())
                .workDate(wl.getWorkDate())
                .status(wl.getStatus())
                .totalActualMinutes(wl.getTotalActualMinutes())
                .submittedAt(wl.getSubmittedAt())
                .approvedAt(wl.getApprovedAt())
                .rejectionReason(wl.getRejectionReason())
                .segments(segResponses)
                .build();
    }
}
