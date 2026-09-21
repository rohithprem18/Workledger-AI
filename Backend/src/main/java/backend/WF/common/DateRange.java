package backend.WF.common;

import java.time.LocalDate;

public record DateRange(LocalDate startDate, LocalDate endDate) {

    public boolean overlaps(DateRange other) {
        return !this.startDate.isAfter(other.endDate) && !this.endDate.isBefore(other.startDate);
    }

    public boolean contains(LocalDate date) {
        return !date.isBefore(startDate) && !date.isAfter(endDate);
    }

    public long daysBetween() {
        return startDate.datesUntil(endDate.plusDays(1)).count();
    }
}
