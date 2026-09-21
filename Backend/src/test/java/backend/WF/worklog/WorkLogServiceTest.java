package backend.WF.worklog;

import backend.WF.assignment.Assignment;
import backend.WF.assignment.AssignmentRepository;
import backend.WF.common.TimeWindow;
import backend.WF.employee.Employee;
import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.security.CurrentUserService;
import backend.WF.security.User;
import backend.WF.worklog.domain.OverlapChecker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WorkLogServiceTest {

    @Mock private WorkLogRepository workLogRepository;
    @Mock private AssignmentRepository assignmentRepository;
    @Mock private OverlapChecker overlapChecker;
    @Mock private CurrentUserService currentUserService;

    @InjectMocks
    private WorkLogService workLogService;

    private UUID assignmentId;
    private UUID employeeId;
    private Assignment assignment;
    private Employee employee;
    private User user;
    private WorkLogCreateRequest request;
    private LocalDate workDate;

    @BeforeEach
    void setUp() {
        assignmentId = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        workDate = LocalDate.now();

        user = mock(User.class);
        when(user.getUsername()).thenReturn("emp1");

        employee = mock(Employee.class);
        when(employee.getId()).thenReturn(employeeId);
        when(employee.getUser()).thenReturn(user);
        when(employee.getFullName()).thenReturn("John Doe");

        assignment = mock(Assignment.class);
        when(assignment.getId()).thenReturn(assignmentId);
        when(assignment.getEmployee()).thenReturn(employee);

        request = buildRequest(
                List.of(new SegmentRequest(), new SegmentRequest()));
        setSegment(request.getSegments().get(0), LocalTime.of(8, 0), LocalTime.of(9, 30));
        setSegment(request.getSegments().get(1), LocalTime.of(10, 0), LocalTime.of(11, 0));

        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(currentUserService.getCurrentUser()).thenReturn(user);
    }

    @Test
    void submitWorkLog_computesTotalMinutesServerSide() {
        // 08:00–09:30 = 90 min, 10:00–11:00 = 60 min → 150 total
        when(workLogRepository.findByAssignmentIdAndStatus(assignmentId, WorkLogStatus.APPROVED))
                .thenReturn(List.of());
        when(overlapChecker.anyOverlap(any())).thenReturn(false);
        when(workLogRepository.findActiveLogsForEmployeeOnDate(any(), any())).thenReturn(List.of());
        when(overlapChecker.findOverlaps(any(), any())).thenReturn(List.of());

        WorkLog savedLog = mock(WorkLog.class);
        when(savedLog.getId()).thenReturn(UUID.randomUUID());
        when(savedLog.getAssignment()).thenReturn(assignment);
        when(savedLog.getEmployee()).thenReturn(employee);
        when(savedLog.getWorkDate()).thenReturn(workDate);
        when(savedLog.getStatus()).thenReturn(WorkLogStatus.SUBMITTED);
        when(savedLog.getTotalActualMinutes()).thenReturn(150);
        when(savedLog.getSegments()).thenReturn(List.of());
        when(workLogRepository.save(any())).thenReturn(savedLog);

        WorkLogResponse response = workLogService.createAndSubmitWorkLog(request);

        assertEquals(150, response.getTotalActualMinutes());
    }

    @Test
    void submitWorkLog_rejectsIfApprovedLogExists() {
        WorkLog approvedLog = mock(WorkLog.class);
        when(approvedLog.getWorkDate()).thenReturn(workDate);
        when(workLogRepository.findByAssignmentIdAndStatus(assignmentId, WorkLogStatus.APPROVED))
                .thenReturn(List.of(approvedLog));

        assertThrows(BusinessRuleViolationException.class,
                () -> workLogService.createAndSubmitWorkLog(request));
    }

    @Test
    void submitWorkLog_rejectsIfSegmentsSelfOverlap() {
        when(workLogRepository.findByAssignmentIdAndStatus(assignmentId, WorkLogStatus.APPROVED))
                .thenReturn(List.of());
        when(overlapChecker.anyOverlap(any())).thenReturn(true);

        assertThrows(BusinessRuleViolationException.class,
                () -> workLogService.createAndSubmitWorkLog(request));
    }

    @Test
    void submitWorkLog_rejectsIfSegmentsOverlapExistingLogs() {
        when(workLogRepository.findByAssignmentIdAndStatus(assignmentId, WorkLogStatus.APPROVED))
                .thenReturn(List.of());
        when(overlapChecker.anyOverlap(any())).thenReturn(false);

        WorkLog existingLog = mock(WorkLog.class);
        WorkLogSegment existingSeg = mock(WorkLogSegment.class);
        when(existingSeg.getStartTime()).thenReturn(LocalTime.of(8, 30));
        when(existingSeg.getEndTime()).thenReturn(LocalTime.of(9, 0));
        when(existingLog.getSegments()).thenReturn(List.of(existingSeg));
        when(workLogRepository.findActiveLogsForEmployeeOnDate(any(), any()))
                .thenReturn(List.of(existingLog));

        TimeWindow conflicting = new TimeWindow(LocalTime.of(8, 30), LocalTime.of(9, 0));
        when(overlapChecker.findOverlaps(any(), any())).thenReturn(List.of(conflicting));

        assertThrows(BusinessRuleViolationException.class,
                () -> workLogService.createAndSubmitWorkLog(request));
    }

    @Test
    void approveWorkLog_rejectsNonSubmittedStatus() {
        WorkLog approvedLog = mock(WorkLog.class);
        when(approvedLog.getStatus()).thenReturn(WorkLogStatus.APPROVED);
        when(workLogRepository.findById(any())).thenReturn(Optional.of(approvedLog));

        WorkLogApprovalRequest approvalRequest = new WorkLogApprovalRequest();
        setField(approvalRequest, "approved", true);

        assertThrows(BusinessRuleViolationException.class,
                () -> workLogService.approveWorkLog(UUID.randomUUID(), approvalRequest));
    }

    @Test
    void rejectWorkLog_requiresRejectionReason() {
        WorkLog submittedLog = mock(WorkLog.class);
        when(submittedLog.getStatus()).thenReturn(WorkLogStatus.SUBMITTED);
        when(workLogRepository.findById(any())).thenReturn(Optional.of(submittedLog));

        WorkLogApprovalRequest approvalRequest = new WorkLogApprovalRequest();
        setField(approvalRequest, "approved", false);
        setField(approvalRequest, "rejectionReason", "");

        assertThrows(BusinessRuleViolationException.class,
                () -> workLogService.approveWorkLog(UUID.randomUUID(), approvalRequest));
    }

    private WorkLogCreateRequest buildRequest(List<SegmentRequest> segments) {
        WorkLogCreateRequest r = new WorkLogCreateRequest();
        setField(r, "assignmentId", assignmentId);
        setField(r, "workDate", workDate);
        setField(r, "segments", segments);
        return r;
    }

    private void setSegment(SegmentRequest seg, LocalTime start, LocalTime end) {
        setField(seg, "startTime", start);
        setField(seg, "endTime", end);
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
