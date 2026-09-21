package backend.WF.availability;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

/**
 * Single source of truth for resolving effective availability.
 * Phase 2 adds date-specific override lookup here — callers unchanged.
 */
@Service
@RequiredArgsConstructor
public class AvailabilityResolver {

    private final AvailabilityRepository availabilityRepository;

    @Transactional(readOnly = true)
    public Optional<EmployeeWeeklyAvailability> getEffectiveAvailability(UUID employeeId, LocalDate date) {
        // Phase 2: check EmployeeAvailabilityOverride first; if found, use it.
        // Phase 1: always falls through to weekly pattern.
        int dayOfWeek = date.getDayOfWeek().getValue(); // 1=Monday … 7=Sunday
        return availabilityRepository.findByEmployeeIdAndDayOfWeek(employeeId, dayOfWeek);
    }
}
