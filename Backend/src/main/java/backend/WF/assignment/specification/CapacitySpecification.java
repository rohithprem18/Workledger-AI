package backend.WF.assignment.specification;

import backend.WF.availability.AvailabilityResolver;
import backend.WF.availability.EmployeeWeeklyAvailability;
import backend.WF.common.DateRange;
import backend.WF.common.TimeWindow;
import backend.WF.exception.InsufficientCapacityException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class CapacitySpecification implements AssignmentSpecification {

    private final AvailabilityResolver availabilityResolver;

    @Override
    public void assertSatisfiedBy(UUID employeeId, UUID requirementId,
                                   DateRange dateRange, List<TimeWindow> plannedWindows) {
        // Empty windows = eligibility preview; capacity/time-fit is enforced only at assign time
        if (plannedWindows.isEmpty()) return;

        long totalPlannedMinutes = plannedWindows.stream()
                .mapToLong(TimeWindow::durationMinutes)
                .sum();

        LocalDate current = dateRange.startDate();
        while (!current.isAfter(dateRange.endDate())) {
            Optional<EmployeeWeeklyAvailability> availability =
                    availabilityResolver.getEffectiveAvailability(employeeId, current);

            if (availability.isEmpty()) {
                throw new InsufficientCapacityException(
                        "Employee " + employeeId + " has no availability set for day "
                        + current.getDayOfWeek() + " (" + current + ")");
            }

            EmployeeWeeklyAvailability avail = availability.get();
            long maxMinutes = avail.getMaxHoursPerDay()
                    .multiply(BigDecimal.valueOf(60))
                    .longValue();

            if (totalPlannedMinutes > maxMinutes) {
                throw new InsufficientCapacityException(
                        "Planned " + totalPlannedMinutes + " min exceeds employee's max capacity of "
                        + maxMinutes + " min/day on " + current);
            }

            // Verify planned windows fall within the availability window
            TimeWindow availWindow = new TimeWindow(avail.getStartTime(), avail.getEndTime());
            for (TimeWindow planned : plannedWindows) {
                if (!windowFitsInside(planned, availWindow)) {
                    throw new InsufficientCapacityException(
                            "Planned window " + planned.startTime() + "–" + planned.endTime()
                            + " falls outside availability " + avail.getStartTime() + "–"
                            + avail.getEndTime() + " on " + current);
                }
            }

            current = current.plusDays(1);
        }
    }

    private boolean windowFitsInside(TimeWindow inner, TimeWindow outer) {
        int innerStart = inner.startMinutes();
        int innerEnd = inner.isOvernight() ? 1440 : inner.endMinutes();
        int outerStart = outer.startMinutes();
        int outerEnd = outer.isOvernight() ? 1440 : outer.endMinutes();
        return innerStart >= outerStart && innerEnd <= outerEnd;
    }
}
