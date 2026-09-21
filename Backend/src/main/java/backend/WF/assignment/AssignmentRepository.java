package backend.WF.assignment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface AssignmentRepository extends JpaRepository<Assignment, UUID> {

    List<Assignment> findByEmployeeIdAndStatus(UUID employeeId, AssignmentStatus status);

    List<Assignment> findByRequirementId(UUID requirementId);

    @Query("SELECT a FROM Assignment a WHERE a.employee.id = :employeeId " +
           "AND a.status = 'ACTIVE' " +
           "AND a.startDate <= :endDate AND a.endDate >= :startDate")
    List<Assignment> findActiveAssignmentsForEmployee(
            @Param("employeeId") UUID employeeId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("SELECT COUNT(a) > 0 FROM Assignment a WHERE a.employee.id = :employeeId " +
           "AND a.status = 'ACTIVE' " +
           "AND a.startDate <= :endDate AND a.endDate >= :startDate")
    boolean hasActiveAssignmentsInRange(
            @Param("employeeId") UUID employeeId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("SELECT a FROM Assignment a WHERE a.requirement.contract.id = :contractId")
    List<Assignment> findByContractId(@Param("contractId") UUID contractId);
}
