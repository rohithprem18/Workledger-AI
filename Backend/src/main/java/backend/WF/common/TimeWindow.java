package backend.WF.common;

import java.time.LocalTime;

public record TimeWindow(LocalTime startTime, LocalTime endTime) {

    public boolean isOvernight() {
        return endTime.isBefore(startTime) || endTime.equals(startTime);
    }

    public int startMinutes() {
        return startTime.getHour() * 60 + startTime.getMinute();
    }

    public int endMinutes() {
        return endTime.getHour() * 60 + endTime.getMinute();
    }

    public long durationMinutes() {
        if (isOvernight()) {
            return (1440 - startMinutes()) + endMinutes();
        }
        return endMinutes() - startMinutes();
    }
}
