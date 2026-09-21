import { describe, expect, it } from 'vitest';
import {
  anyOverlap,
  durationMinutes,
  findOverlaps,
  isOvernight,
  overlaps,
  toMinutes,
} from './timeWindow.ts';

const w = (startTime: string, endTime: string) => ({ startTime, endTime });

describe('time window arithmetic', () => {
  it('parses times with or without seconds', () => {
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes('09:00:00')).toBe(540);
    expect(toMinutes('23:59')).toBe(1439);
  });

  it('rejects anything that is not a time of day', () => {
    expect(() => toMinutes('25:00')).toThrow();
    expect(() => toMinutes('lunchtime')).toThrow();
  });

  it('measures a same-day window', () => {
    expect(durationMinutes(w('09:00', '17:30'))).toBe(510);
  });

  it('measures an overnight window across midnight', () => {
    expect(isOvernight(w('22:00', '02:00'))).toBe(true);
    expect(durationMinutes(w('22:00', '02:00'))).toBe(240);
  });
});

describe('overlap detection', () => {
  it('detects a plain overlap', () => {
    expect(overlaps(w('09:00', '12:00'), w('11:00', '14:00'))).toBe(true);
  });

  it('treats back-to-back shifts as adjacent, not overlapping', () => {
    // Intervals are half-open, so finishing at 12:00 and starting at 12:00 is legal.
    expect(overlaps(w('09:00', '12:00'), w('12:00', '17:00'))).toBe(false);
  });

  it('detects an overnight shift clashing with an early-morning one', () => {
    // The wrapped portion (00:00-02:00) is what collides here.
    expect(overlaps(w('22:00', '02:00'), w('01:00', '05:00'))).toBe(true);
  });

  it('detects an overnight shift clashing with a late-evening one', () => {
    expect(overlaps(w('22:00', '02:00'), w('20:00', '23:00'))).toBe(true);
  });

  it('lets an overnight shift coexist with a daytime one', () => {
    expect(overlaps(w('22:00', '02:00'), w('09:00', '17:00'))).toBe(false);
  });

  it('detects two overnight shifts clashing', () => {
    expect(overlaps(w('22:00', '02:00'), w('23:00', '03:00'))).toBe(true);
  });

  it('finds clashes within a list', () => {
    expect(anyOverlap([w('09:00', '12:00'), w('13:00', '17:00')])).toBe(false);
    expect(anyOverlap([w('09:00', '12:00'), w('11:30', '17:00')])).toBe(true);
  });

  it('returns every existing window a candidate clashes with', () => {
    const existing = [w('09:00', '11:00'), w('13:00', '15:00'), w('10:30', '12:00')];
    expect(findOverlaps(w('10:00', '14:00'), existing)).toHaveLength(3);
    expect(findOverlaps(w('16:00', '17:00'), existing)).toHaveLength(0);
  });
});
