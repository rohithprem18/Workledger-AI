package backend.WF.employee;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EmployeeRepository extends JpaRepository<Employee, UUID> {

    Optional<Employee> findByUserId(UUID userId);

    List<Employee> findByActiveTrue();

    @Query("SELECT e FROM Employee e WHERE e.active = true AND e.id NOT IN " +
           "(SELECT a.employee.id FROM Assignment a WHERE a.status = 'ACTIVE')")
    List<Employee> findAvailableEmployees();
}
