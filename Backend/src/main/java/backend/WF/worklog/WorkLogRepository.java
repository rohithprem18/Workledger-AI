package backend.WF.worklog;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkLogRepository extends JpaRepository<WorkLog, UUID> {

    List<WorkLog> findByEmployeeId(UUID employeeId);

    List<WorkLog> findByEmployeeIdAndWorkDateBetween(UUID employeeId, LocalDate from, LocalDate to);

    List<WorkLog> findByStatus(WorkLogStatus status);

    List<WorkLog> findByEmployeeIdAndWorkDate(UUID employeeId, LocalDate workDate);

    List<WorkLog> findByAssignmentIdAndStatus(UUID assignmentId, WorkLogStatus status);

    List<WorkLog> findByStatusAndWorkDateBetween(WorkLogStatus status, LocalDate start, LocalDate end);

    Optional<WorkLog> findByAssignmentIdAndWorkDate(UUID assignmentId, LocalDate workDate);

    @Query("SELECT wl FROM WorkLog wl WHERE wl.assignment.requirement.contract.id = :contractId " +
           "AND wl.status = 'APPROVED' " +
           "AND wl.workDate >= :periodStart AND wl.workDate <= :periodEnd")
    List<WorkLog> findApprovedLogsForContract(
            @Param("contractId") UUID contractId,
            @Param("periodStart") LocalDate periodStart,
            @Param("periodEnd") LocalDate periodEnd);

    @Query("SELECT wl FROM WorkLog wl JOIN wl.segments s " +
           "WHERE wl.employee.id = :employeeId AND wl.workDate = :workDate " +
           "AND wl.status != 'REJECTED'")
    List<WorkLog> findActiveLogsForEmployeeOnDate(
            @Param("employeeId") UUID employeeId,
            @Param("workDate") LocalDate workDate);

    /**
     * Work logs in a period that are NOT approved — the invoice auditor needs
     * these to tell "nothing was worked" apart from "work is still in the
     * approval queue", which are very different things to bill against.
     */
    @Query("SELECT wl FROM WorkLog wl WHERE wl.assignment.requirement.contract.id = :contractId " +
           "AND wl.status <> 'APPROVED' " +
           "AND wl.workDate >= :periodStart AND wl.workDate <= :periodEnd")
    List<WorkLog> findUnapprovedLogsForContract(
            @Param("contractId") UUID contractId,
            @Param("periodStart") LocalDate periodStart,
            @Param("periodEnd") LocalDate periodEnd);

    @Query("SELECT DISTINCT wl FROM WorkLog wl LEFT JOIN FETCH wl.segments " +
           "WHERE wl.assignment.requirement.contract.id = :contractId " +
           "AND wl.status = 'APPROVED' " +
           "AND wl.workDate >= :periodStart AND wl.workDate <= :periodEnd")
    List<WorkLog> findApprovedLogsForContractWithSegments(
            @Param("contractId") UUID contractId,
            @Param("periodStart") LocalDate periodStart,
            @Param("periodEnd") LocalDate periodEnd);
}
