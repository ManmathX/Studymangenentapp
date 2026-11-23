import { addDays, clockTime, countdown, dayName, diffDays, duration, hours, initialOf, minutesToTime, plural, shortDate, timeToMinutes } from '../format';

describe('date formatting', () => {
  it('names days relative to today', () => {
    expect(dayName('2026-11-18', '2026-11-18')).toBe('today');
    expect(dayName('2026-11-19', '2026-11-18')).toBe('tomorrow');
    expect(dayName('2026-11-17', '2026-11-18')).toBe('yesterday');
    expect(dayName('2026-11-21', '2026-11-18')).toBe('Saturday');
    expect(dayName('2026-12-01', '2026-11-18')).toBe('Tue 1 Dec');
  });

  it('does calendar arithmetic without time-zone drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-11-18', '2026-11-28')).toBe(10);
    expect(shortDate('2026-11-18')).toBe('Wed 18 Nov');
  });
});

describe('number formatting', () => {
  it('formats durations, clock times and countdowns', () => {
    expect(duration(45)).toBe('45 min');
    expect(duration(60)).toBe('1 h');
    expect(duration(95)).toBe('1 h 35 min');
    expect(hours(90)).toBe('1.5');
    expect(hours(120)).toBe('2');
    expect(clockTime(16 * 60 + 5)).toBe('16:05');
    expect(countdown(61.2)).toBe('01:02');
    expect(countdown(-5)).toBe('00:00');
  });

  it('round-trips school times and clamps them to the day', () => {
    expect(timeToMinutes('07:45')).toBe(465);
    expect(minutesToTime(465)).toBe('07:45');
    expect(minutesToTime(-30)).toBe('00:00');
    expect(minutesToTime(24 * 60)).toBe('23:45');
  });

  it('pluralises and builds avatar initials', () => {
    expect(plural(1, 'chapter')).toBe('1 chapter');
    expect(plural(3, 'chapter')).toBe('3 chapters');
    expect(initialOf(' asha')).toBe('A');
    expect(initialOf('')).toBe('S');
  });
});
