package backend.WF.availability;

import backend.WF.employee.Employee;
import backend.WF.employee.EmployeeRepository;
import backend.WF.exception.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AvailabilityService {

    private final AvailabilityRepository availabilityRepository;
    private final EmployeeRepository employeeRepository;

    @Transactional
    public AvailabilityResponse setAvailability(UUID employeeId, AvailabilityRequest request) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new EntityNotFoundException("Employee", employeeId));

        EmployeeWeeklyAvailability availability = availabilityRepository
                .findByEmployeeIdAndDayOfWeek(employeeId, request.getDayOfWeek())
                .orElse(EmployeeWeeklyAvailability.builder().employee(employee).build());

        availability.setDayOfWeek(request.getDayOfWeek());
        availability.setStartTime(request.getStartTime());
        availability.setEndTime(request.getEndTime());
        availability.setMaxHoursPerDay(request.getMaxHoursPerDay());

        return toResponse(availabilityRepository.save(availability));
    }

    @Transactional(readOnly = true)
    public List<AvailabilityResponse> getAvailability(UUID employeeId) {
        return availabilityRepository.findByEmployeeId(employeeId).stream()
                .map(this::toResponse)
                .toList();
    }

    private AvailabilityResponse toResponse(EmployeeWeeklyAvailability a) {
        return AvailabilityResponse.builder()
                .id(a.getId())
                .dayOfWeek(a.getDayOfWeek())
                .dayName(DayOfWeek.of(a.getDayOfWeek()).name())
                .startTime(a.getStartTime())
                .endTime(a.getEndTime())
                .maxHoursPerDay(a.getMaxHoursPerDay())
                .build();
    }
}
