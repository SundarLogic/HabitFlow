/**
 * Unit tests for src/domain/schedule.js (isScheduledOn) and the date helpers it relies on.
 * Pure functions: no database, no HTTP.
 *
 * Reference weekdays used below (ISO, 1 = Monday):
 *   2026-10-19 Mon  2026-10-21 Wed  2026-10-25 Sun
 *   2024-02-29 Thu (leap day)   2028-02-29 Tue (leap day)
 */
import { addToDate, isValidIsoDate, isoWeekday, todayIn } from '../../src/domain/dates.js';
import { isScheduledOn } from '../../src/domain/schedule.js';

const habit = (frequencyType, startDate = '2026-01-01') => ({ frequencyType, startDate });

describe('isScheduledOn', () => {
  describe('daily', () => {
    it('is scheduled every day from the start date', () => {
      for (const date of ['2026-01-01', '2026-06-15', '2026-10-25', '2030-12-31']) {
        expect(isScheduledOn(habit('daily'), [], date)).toBe(true);
      }
    });
  });

  describe('weekdays', () => {
    const monWedFri = [1, 3, 5];

    it('is scheduled only on the listed ISO weekdays', () => {
      expect(isScheduledOn(habit('weekdays'), monWedFri, '2026-10-19')).toBe(true); // Mon
      expect(isScheduledOn(habit('weekdays'), monWedFri, '2026-10-20')).toBe(false); // Tue
      expect(isScheduledOn(habit('weekdays'), monWedFri, '2026-10-21')).toBe(true); // Wed
      expect(isScheduledOn(habit('weekdays'), monWedFri, '2026-10-25')).toBe(false); // Sun
    });

    it('treats Sunday as 7, not 0', () => {
      expect(isScheduledOn(habit('weekdays'), [7], '2026-10-25')).toBe(true);
      expect(isScheduledOn(habit('weekdays'), [0], '2026-10-25')).toBe(false);
    });

    it('accepts HabitScheduleDay rows as well as numbers', () => {
      const rows = [{ weekday: 1 }, { weekday: 3 }];
      expect(isScheduledOn(habit('weekdays'), rows, '2026-10-21')).toBe(true);
      expect(isScheduledOn(habit('weekdays'), rows, '2026-10-22')).toBe(false);
    });

    it('is never scheduled with no weekdays', () => {
      expect(isScheduledOn(habit('weekdays'), [], '2026-10-19')).toBe(false);
    });
  });

  describe('weekly_target', () => {
    it('counts every day of the week', () => {
      for (const date of ['2026-10-19', '2026-10-22', '2026-10-25']) {
        expect(isScheduledOn(habit('weekly_target'), [], date)).toBe(true);
      }
    });
  });

  describe('start date boundaries', () => {
    it.each(['daily', 'weekly_target'])(
      '%s: false the day before, true on the start date',
      (type) => {
        const h = habit(type, '2026-10-21');
        expect(isScheduledOn(h, [], '2026-10-20')).toBe(false);
        expect(isScheduledOn(h, [], '2026-10-21')).toBe(true);
      },
    );

    it('weekdays: false before the start even on a scheduled weekday', () => {
      const h = habit('weekdays', '2026-10-21'); // a Wednesday
      expect(isScheduledOn(h, [1, 3], '2026-10-19')).toBe(false); // Monday before start
      expect(isScheduledOn(h, [1, 3], '2026-10-21')).toBe(true);
      expect(isScheduledOn(h, [1, 3], '2026-10-26')).toBe(true); // next Monday
    });

    it('handles year and month boundaries', () => {
      const h = habit('daily', '2027-01-01');
      expect(isScheduledOn(h, [], '2026-12-31')).toBe(false);
      expect(isScheduledOn(h, [], '2027-01-01')).toBe(true);
    });
  });

  describe('leap years', () => {
    it('knows the weekday of Feb 29 in leap years', () => {
      expect(isScheduledOn(habit('weekdays', '2020-01-01'), [4], '2024-02-29')).toBe(true); // Thursday
      expect(isScheduledOn(habit('weekdays', '2020-01-01'), [2], '2028-02-29')).toBe(true); // Tuesday
    });

    it('steps from Feb 28 to Feb 29 to Mar 1 correctly', () => {
      const h = habit('daily', '2024-02-29');
      expect(isScheduledOn(h, [], '2024-02-28')).toBe(false);
      expect(isScheduledOn(h, [], '2024-02-29')).toBe(true);
      expect(isScheduledOn(h, [], '2024-03-01')).toBe(true);
    });

    it('rejects Feb 29 in non-leap years (including the 1900/2100 century rule)', () => {
      for (const date of ['2023-02-29', '2100-02-29', '1900-02-29']) {
        expect(() => isScheduledOn(habit('daily'), [], date)).toThrow(RangeError);
      }
      // 2000 IS a leap year (divisible by 400).
      expect(isScheduledOn(habit('daily', '1999-01-01'), [], '2000-02-29')).toBe(true);
    });
  });

  it('throws on malformed dates and unknown frequency types', () => {
    expect(() => isScheduledOn(habit('daily'), [], '2026-13-01')).toThrow(RangeError);
    expect(() => isScheduledOn(habit('daily'), [], '26-10-01')).toThrow(RangeError);
    expect(() => isScheduledOn(habit('monthly'), [], '2026-10-01')).toThrow(
      /Unknown frequencyType/,
    );
  });
});

describe('date helpers', () => {
  it('isValidIsoDate accepts only real YYYY-MM-DD dates', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2023-02-29')).toBe(false);
    expect(isValidIsoDate('2026-1-5')).toBe(false);
    expect(isValidIsoDate('2026-10-25T00:00:00Z')).toBe(false);
    expect(isValidIsoDate(20261025)).toBe(false);
  });

  it('isoWeekday returns 1 for Monday and 7 for Sunday', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-25')).toBe(7);
  });

  it("todayIn uses the user's timezone, not UTC", () => {
    // 2026-10-25 03:30 UTC is still the 24th in New York (UTC-4) but the 25th in Tokyo.
    const now = () => new Date('2026-10-25T03:30:00Z');
    expect(todayIn('America/New_York', now)).toBe('2026-10-24');
    expect(todayIn('Asia/Tokyo', now)).toBe('2026-10-25');
    expect(todayIn('UTC', now)).toBe('2026-10-25');
  });

  it('addToDate clamps Feb 29 + 1 year to Feb 28', () => {
    expect(addToDate('2024-02-29', { years: 1 })).toBe('2025-02-28');
    expect(addToDate('2026-10-25', { years: 1 })).toBe('2027-10-25');
  });
});
