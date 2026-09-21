import { BusinessRuleError } from '../core/errors.js';

/**
 * A start/end time pair on a single day, and overlap detection over them.
 *
 * Pure domain logic with no database dependency, which is what lets the same
 * code back both checks the platform needs: that planned assignments never
 * overlap for one contractor, and that logged work segments never overlap on
 * one date. Doing it twice is how those two drift apart.
 *
 * Overnight shifts are the reason this is not a one-line comparison. A window
 * of 22:00–02:00 wraps past midnight, so it is decomposed into [22:00, 24:00)
 * and [00:00, 02:00) before any comparison happens.
 */
export interface TimeWindow {
  startTime: string;
  endTime: string;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function toMinutes(time: string): number {
  const match = TIME.exec(time.trim());
  if (!match) {
    throw new BusinessRuleError(`"${time}" is not a valid time of day (expected HH:mm)`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** True when the window wraps past midnight. An equal start and end is a full day. */
export function isOvernight(w: TimeWindow): boolean {
  return toMinutes(w.endTime) <= toMinutes(w.startTime);
}

/** Minutes covered, counting the wrap for an overnight window. */
export function durationMinutes(w: TimeWindow): number {
  const start = toMinutes(w.startTime);
  const end = toMinutes(w.endTime);
  return isOvernight(w) ? 1440 - start + end : end - start;
}

/** One or two half-open [start, end) minute-of-day intervals. */
function toIntervals(w: TimeWindow): [number, number][] {
  const start = toMinutes(w.startTime);
  const end = toMinutes(w.endTime);
  return isOvernight(w)
    ? [
        [start, 1440],
        [0, end],
      ]
    : [[start, end]];
}

/**
 * True when two windows share any minute.
 *
 * Intervals are half-open, so a window ending at 12:00 and one starting at
 * 12:00 are adjacent, not overlapping — back-to-back shifts are legal.
 */
export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  for (const [aStart, aEnd] of toIntervals(a)) {
    for (const [bStart, bEnd] of toIntervals(b)) {
      if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) {
        return true;
      }
    }
  }
  return false;
}

/** True when any window in the list overlaps any other. */
export function anyOverlap(windows: TimeWindow[]): boolean {
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      if (overlaps(windows[i]!, windows[j]!)) return true;
    }
  }
  return false;
}

/** Every window in `existing` that clashes with `candidate`. */
export function findOverlaps(candidate: TimeWindow, existing: TimeWindow[]): TimeWindow[] {
  return existing.filter((w) => overlaps(candidate, w));
}

/** Inclusive date-range intersection, on ISO `YYYY-MM-DD` strings. */
export function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
