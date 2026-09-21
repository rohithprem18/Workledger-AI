package backend.WF.worklog.domain;

import backend.WF.common.TimeWindow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class OverlapCheckerTest {

    private OverlapChecker checker;

    @BeforeEach
    void setUp() {
        checker = new OverlapChecker();
    }

    @Test
    void noOverlap_whenWindowsAreDistinct() {
        TimeWindow a = new TimeWindow(LocalTime.of(8, 0), LocalTime.of(10, 0));
        TimeWindow b = new TimeWindow(LocalTime.of(11, 0), LocalTime.of(13, 0));
        assertFalse(checker.overlaps(a, b));
    }

    @Test
    void noOverlap_whenWindowsShareExactBoundary() {
        // 08:00–10:00 and 10:00–12:00 share a point but not a duration
        TimeWindow a = new TimeWindow(LocalTime.of(8, 0), LocalTime.of(10, 0));
        TimeWindow b = new TimeWindow(LocalTime.of(10, 0), LocalTime.of(12, 0));
        assertFalse(checker.overlaps(a, b));
    }

    @Test
    void overlap_whenWindowsClearlyOverlap() {
        TimeWindow a = new TimeWindow(LocalTime.of(9, 0), LocalTime.of(11, 0));
        TimeWindow b = new TimeWindow(LocalTime.of(10, 0), LocalTime.of(12, 0));
        assertTrue(checker.overlaps(a, b));
    }

    @Test
    void overlap_whenOneWindowContainsAnother() {
        TimeWindow outer = new TimeWindow(LocalTime.of(8, 0), LocalTime.of(18, 0));
        TimeWindow inner = new TimeWindow(LocalTime.of(10, 0), LocalTime.of(12, 0));
        assertTrue(checker.overlaps(outer, inner));
    }

    @Test
    void overnight_overlapsWithWindowCrossingMidnight() {
        // 22:00–02:00 overlaps with 01:00–03:00
        TimeWindow night = new TimeWindow(LocalTime.of(22, 0), LocalTime.of(2, 0));
        TimeWindow earlyMorning = new TimeWindow(LocalTime.of(1, 0), LocalTime.of(3, 0));
        assertTrue(checker.overlaps(night, earlyMorning));
    }

    @Test
    void overnight_doesNotOverlapWithDaytimeWindow() {
        // 22:00–02:00 does NOT overlap with 14:00–16:00
        TimeWindow night = new TimeWindow(LocalTime.of(22, 0), LocalTime.of(2, 0));
        TimeWindow daytime = new TimeWindow(LocalTime.of(14, 0), LocalTime.of(16, 0));
        assertFalse(checker.overlaps(night, daytime));
    }

    @Test
    void anyOverlap_detectsSelfOverlapInList() {
        List<TimeWindow> windows = List.of(
                new TimeWindow(LocalTime.of(8, 0), LocalTime.of(10, 0)),
                new TimeWindow(LocalTime.of(9, 0), LocalTime.of(11, 0))
        );
        assertTrue(checker.anyOverlap(windows));
    }

    @Test
    void anyOverlap_returnsFalseForNonOverlappingList() {
        List<TimeWindow> windows = List.of(
                new TimeWindow(LocalTime.of(8, 0), LocalTime.of(10, 0)),
                new TimeWindow(LocalTime.of(11, 0), LocalTime.of(13, 0)),
                new TimeWindow(LocalTime.of(14, 0), LocalTime.of(16, 0))
        );
        assertFalse(checker.anyOverlap(windows));
    }

    @Test
    void findOverlaps_returnsConflictingWindows() {
        TimeWindow candidate = new TimeWindow(LocalTime.of(9, 0), LocalTime.of(11, 0));
        List<TimeWindow> existing = List.of(
                new TimeWindow(LocalTime.of(8, 0), LocalTime.of(9, 30)),  // overlaps
                new TimeWindow(LocalTime.of(11, 30), LocalTime.of(13, 0)) // no overlap
        );
        List<TimeWindow> conflicts = checker.findOverlaps(candidate, existing);
        assertEquals(1, conflicts.size());
    }

    @Test
    void durationMinutes_correctForNormalWindow() {
        TimeWindow w = new TimeWindow(LocalTime.of(8, 0), LocalTime.of(9, 30));
        assertEquals(90, w.durationMinutes());
    }

    @Test
    void durationMinutes_correctForOvernightWindow() {
        // 22:00–02:00 = 4 hours = 240 min
        TimeWindow w = new TimeWindow(LocalTime.of(22, 0), LocalTime.of(2, 0));
        assertEquals(240, w.durationMinutes());
    }
}
