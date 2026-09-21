package backend.WF.availability;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AvailabilityRepository extends JpaRepository<EmployeeWeeklyAvailability, UUID> {

    List<EmployeeWeeklyAvailability> findByEmployeeId(UUID employeeId);

    Optional<EmployeeWeeklyAvailability> findByEmployeeIdAndDayOfWeek(UUID employeeId, int dayOfWeek);
}
