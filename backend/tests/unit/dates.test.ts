import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  eachDay,
  isValidDateKey,
  isValidTimeZone,
  localNow,
  weekday,
} from '../../src/common/utils/dates.js';

describe('date keys', () => {
  it('validates real calendar dates only', () => {
    expect(isValidDateKey('2026-11-18')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true);
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('18-11-2026')).toBe(false);
  });

  it('does day arithmetic across months, years and DST changes', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // Europe DST weekend
    expect(diffDays('2026-11-18', '2026-11-28')).toBe(10);
    expect(diffDays('2026-11-28', '2026-11-18')).toBe(-10);
    expect(weekday('2026-11-18')).toBe(3);
    expect([...eachDay('2026-11-29', '2026-12-02')]).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
  });

  it('finds the local date and hour in a time zone', () => {
    const instant = new Date('2026-11-18T20:00:00Z');
    expect(localNow(instant, 'Asia/Kolkata')).toEqual({ date: '2026-11-19', hour: 1 });
    expect(localNow(instant, 'America/Los_Angeles')).toEqual({ date: '2026-11-18', hour: 12 });
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
