package backend.WF.worklog.domain;

import backend.WF.common.TimeWindow;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Pure domain service for detecting time window overlaps.
 * Handles overnight shifts (e.g. 22:00–02:00) crossing midnight.
 * No persistence dependency — fully unit-testable in isolation.
 */
@Service
public class OverlapChecker {

    /**
     * Returns true if two time windows overlap.
     * Uses minute-of-day arithmetic; overnight windows are split into two intervals.
     */
    public boolean overlaps(TimeWindow a, TimeWindow b) {
        return !findOverlapIntervals(a, b).isEmpty();
    }

    /**
     * Returns true if any window in the list overlaps with any other.
     */
    public boolean anyOverlap(List<TimeWindow> windows) {
        for (int i = 0; i < windows.size(); i++) {
            for (int j = i + 1; j < windows.size(); j++) {
                if (overlaps(windows.get(i), windows.get(j))) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Returns all windows from {@code existing} that overlap with {@code candidate}.
     */
    public List<TimeWindow> findOverlaps(TimeWindow candidate, List<TimeWindow> existing) {
        List<TimeWindow> result = new ArrayList<>();
        for (TimeWindow w : existing) {
            if (overlaps(candidate, w)) {
                result.add(w);
            }
        }
        return result;
    }

    /**
     * Decomposes a TimeWindow into one or two [start, end) minute-of-day intervals.
     * Overnight window [22:00, 02:00) becomes [1320, 1440) and [0, 120).
     */
    private List<int[]> toIntervals(TimeWindow w) {
        int start = w.startMinutes();
        int end = w.endMinutes();
        if (w.isOvernight()) {
            return List.of(new int[]{start, 1440}, new int[]{0, end});
        }
        return List.of(new int[]{start, end});
    }

    private List<int[]> findOverlapIntervals(TimeWindow a, TimeWindow b) {
        List<int[]> aIntervals = toIntervals(a);
        List<int[]> bIntervals = toIntervals(b);
        List<int[]> overlaps = new ArrayList<>();
        for (int[] ai : aIntervals) {
            for (int[] bi : bIntervals) {
                int overlapStart = Math.max(ai[0], bi[0]);
                int overlapEnd = Math.min(ai[1], bi[1]);
                if (overlapStart < overlapEnd) {
                    overlaps.add(new int[]{overlapStart, overlapEnd});
                }
            }
        }
        return overlaps;
    }
}
