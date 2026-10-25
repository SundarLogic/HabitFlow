/**
 * Unit tests for src/domain/streaks.js (and the dates.js helpers it relies on).
 * Every rule in docs/STREAK_RULES.md has at least one case here.
 *
 * Reference calendar (ISO weekday, 1 = Monday):
 *   Oct 2026  Mon 05 | Mon 12 | Mon 19  Tue 20  Wed 21  Thu 22  Fri 23  Sat 24  Sun 25
 *             Mon 26  Tue 27  Wed 28 | Sat 31
 *   2026-03-08 Sun (US DST starts)   2026-11-01 Sun (US DST ends)
 *   2024-02-29 Thu (leap day)        2028-02-29 Tue (leap day)
 */
import { addDays, daysBetween, eachDay, todayIn, weekBounds } from '../../src/domain/dates.js';
import { computeStreak, dayStatus, weekProgress, weekTarget } from '../../src/domain/streaks.js';

const daily = (startDate = '2026-01-01') => ({ frequencyType: 'daily', startDate });
const weekdaysHabit = (startDate = '2026-01-01') => ({ frequencyType: 'weekdays', startDate });
const weekly = (targetPerWeek, startDate = '2026-10-05') => ({
  frequencyType: 'weekly_target',
  targetPerWeek,
  startDate,
});
const MON_FRI = [1, 2, 3, 4, 5];
const MON_WED_FRI = [1, 3, 5];

/** computeStreak with sensible defaults. */
function streak(habit, completionDates, today, scheduleDays = []) {
  return computeStreak({ habit, scheduleDays, completionDates, today });
}

describe('daily habits', () => {
  it('empty history: no streak, today pending', () => {
    expect(streak(daily(), [], '2026-10-25')).toEqual({
      current: 0,
      longest: 0,
      unit: 'days',
      status: 'pending',
    });
  });

  it('completed today: today counts', () => {
    const result = streak(daily(), ['2026-10-23', '2026-10-24', '2026-10-25'], '2026-10-25');
    expect(result).toMatchObject({ current: 3, longest: 3, status: 'completed' });
  });

  it('pending today does NOT break the streak', () => {
    const result = streak(daily(), ['2026-10-23', '2026-10-24'], '2026-10-25');
    expect(result).toMatchObject({ current: 2, longest: 2, status: 'pending' });
  });

  it('a gap yesterday breaks the streak (today done)', () => {
    const result = streak(daily(), ['2026-10-22', '2026-10-23', '2026-10-25'], '2026-10-25');
    expect(result).toMatchObject({ current: 1, longest: 2 });
  });

  it('a gap yesterday with today pending means no current streak', () => {
    const result = streak(daily(), ['2026-10-22', '2026-10-23'], '2026-10-25');
    expect(result).toMatchObject({ current: 0, longest: 2, status: 'pending' });
  });

  it('longest streak comes from the full history', () => {
    const early = eachDay('2026-10-01', '2026-10-05'); // 5 days
    const recent = ['2026-10-24', '2026-10-25'];
    expect(streak(daily(), [...early, ...recent], '2026-10-25')).toMatchObject({
      current: 2,
      longest: 5,
    });
  });

  it('ignores completions before startDate', () => {
    const result = streak(
      daily('2026-10-24'),
      ['2026-10-22', '2026-10-23', '2026-10-24'],
      '2026-10-25',
    );
    expect(result).toMatchObject({ current: 1, longest: 1, status: 'pending' });
  });

  it('ignores completions after today (e.g. after a timezone change)', () => {
    const result = streak(daily(), ['2026-10-24', '2026-10-26'], '2026-10-25');
    expect(result).toMatchObject({ current: 1, longest: 1, status: 'pending' });
  });

  it('startDate today: nothing yet, then 1 once completed', () => {
    expect(streak(daily('2026-10-25'), [], '2026-10-25')).toMatchObject({
      current: 0,
      longest: 0,
      status: 'pending',
    });
    expect(streak(daily('2026-10-25'), ['2026-10-25'], '2026-10-25')).toMatchObject({
      current: 1,
      longest: 1,
      status: 'completed',
    });
  });

  it('startDate in the future: not scheduled yet', () => {
    expect(streak(daily('2026-11-01'), [], '2026-10-25')).toMatchObject({
      current: 0,
      longest: 0,
      status: 'not_scheduled',
    });
  });

  it('accepts unsorted and duplicate completion dates', () => {
    const result = streak(
      daily(),
      ['2026-10-25', '2026-10-23', '2026-10-24', '2026-10-24'],
      '2026-10-25',
    );
    expect(result).toMatchObject({ current: 3, longest: 3 });
  });
});

describe('weekdays habits', () => {
  it('weekends are skipped, not breaking a Mon-Fri streak', () => {
    const lastWeek = eachDay('2026-10-19', '2026-10-23'); // Mon-Fri
    const result = streak(weekdaysHabit(), [...lastWeek, '2026-10-26'], '2026-10-26', MON_FRI);
    expect(result).toMatchObject({ current: 6, longest: 6, status: 'completed' });
  });

  it('today unscheduled (Saturday): status not_scheduled, streak still running', () => {
    const result = streak(
      weekdaysHabit(),
      eachDay('2026-10-19', '2026-10-23'),
      '2026-10-24',
      MON_FRI,
    );
    expect(result).toMatchObject({ current: 5, status: 'not_scheduled' });
  });

  it('a missed Friday breaks the streak even when viewed on Sunday', () => {
    const result = streak(
      weekdaysHabit(),
      eachDay('2026-10-19', '2026-10-22'),
      '2026-10-25',
      MON_FRI,
    );
    expect(result).toMatchObject({ current: 0, longest: 4 });
  });

  it('completions on unscheduled days are ignored (neither extend nor break)', () => {
    const dates = ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']; // Thu Fri Sat Sun
    const result = streak(weekdaysHabit(), dates, '2026-10-25', MON_FRI);
    expect(result).toMatchObject({ current: 2, longest: 2 });
  });

  it('Mon/Wed/Fri across a week boundary', () => {
    const dates = ['2026-10-21', '2026-10-23', '2026-10-26']; // Wed Fri Mon
    expect(streak(weekdaysHabit(), dates, '2026-10-26', MON_WED_FRI)).toMatchObject({
      current: 3,
      longest: 3,
      status: 'completed',
    });
  });

  it('Mon/Wed/Fri with today pending (Wednesday)', () => {
    const dates = ['2026-10-21', '2026-10-23', '2026-10-26'];
    expect(streak(weekdaysHabit(), dates, '2026-10-28', MON_WED_FRI)).toMatchObject({
      current: 3,
      status: 'pending',
    });
  });

  it('Mon/Wed/Fri: a missed Monday ends the streak on Tuesday', () => {
    const dates = ['2026-10-21', '2026-10-23']; // Wed Fri, then Mon 26 missed
    expect(streak(weekdaysHabit(), dates, '2026-10-27', MON_WED_FRI)).toMatchObject({
      current: 0,
      longest: 2,
      status: 'not_scheduled',
    });
  });

  it('uses the CURRENT schedule: old Tue/Thu completions no longer count', () => {
    const tueThu = ['2026-10-20', '2026-10-22'];
    expect(streak(weekdaysHabit(), tueThu, '2026-10-23', MON_WED_FRI)).toMatchObject({
      current: 0,
      longest: 0,
      status: 'pending',
    });
  });

  it('day statuses: completed, missed, not_scheduled, pending, upcoming', () => {
    const input = {
      habit: weekdaysHabit(),
      scheduleDays: MON_WED_FRI,
      completionDates: ['2026-10-19'],
      today: '2026-10-23',
    };
    expect(dayStatus({ ...input, date: '2026-10-19' })).toBe('completed');
    expect(dayStatus({ ...input, date: '2026-10-21' })).toBe('missed');
    expect(dayStatus({ ...input, date: '2026-10-22' })).toBe('not_scheduled');
    expect(dayStatus({ ...input, date: '2026-10-23' })).toBe('pending');
    expect(dayStatus({ ...input, date: '2026-10-26' })).toBe('upcoming');
    expect(dayStatus({ ...input, date: '2025-12-31' })).toBe('not_scheduled'); // before start
  });
});

describe('weekly_target habits', () => {
  // Target 3, started Monday 2026-10-05. Weeks: 05, 12, 19, 26 (current when today >= 26).
  const met = (monday) => [monday, addDays(monday, 2), addDays(monday, 4)]; // Mon Wed Fri

  it('counts met weeks; an in-progress unmet week is pending, not a failure', () => {
    const dates = [...met('2026-10-05'), ...met('2026-10-12'), ...met('2026-10-19'), '2026-10-26'];
    expect(streak(weekly(3), dates, '2026-10-28')).toEqual({
      current: 3,
      longest: 3,
      unit: 'weeks',
      status: 'pending',
      weekProgress: { done: 1, target: 3 },
    });
  });

  it('the current week counts as soon as its target is met', () => {
    const dates = [
      ...met('2026-10-05'),
      ...met('2026-10-12'),
      ...met('2026-10-19'),
      ...met('2026-10-26'),
    ];
    expect(streak(weekly(3), dates, '2026-10-30')).toMatchObject({
      current: 4,
      longest: 4,
      status: 'completed',
      weekProgress: { done: 3, target: 3 },
    });
  });

  it('a past week below target breaks the streak', () => {
    const dates = [...met('2026-10-05'), '2026-10-12', '2026-10-13', ...met('2026-10-19')];
    expect(streak(weekly(3), dates, '2026-10-26')).toMatchObject({ current: 1, longest: 1 });
  });

  it('an empty current week does not break the streak', () => {
    const dates = [...met('2026-10-05'), ...met('2026-10-12'), ...met('2026-10-19')];
    expect(streak(weekly(3), dates, '2026-10-26')).toMatchObject({
      current: 3,
      status: 'pending',
      weekProgress: { done: 0, target: 3 },
    });
  });

  it('extra completions above the target are fine', () => {
    const dates = eachDay('2026-10-19', '2026-10-25'); // 7 completions, target 3
    expect(streak(weekly(3, '2026-10-19'), dates, '2026-10-25')).toMatchObject({
      current: 1,
      weekProgress: { done: 7, target: 3 },
    });
  });

  it('empty history', () => {
    expect(streak(weekly(3), [], '2026-10-28')).toMatchObject({
      current: 0,
      longest: 0,
      unit: 'weeks',
      status: 'pending',
    });
  });

  it('day status: completed if done that day OR the week is already met', () => {
    const input = {
      habit: weekly(2),
      scheduleDays: [],
      completionDates: ['2026-10-19', '2026-10-20', '2026-10-26'],
      today: '2026-10-28',
    };
    expect(dayStatus({ ...input, date: '2026-10-20' })).toBe('completed'); // done that day
    expect(dayStatus({ ...input, date: '2026-10-23' })).toBe('completed'); // week met (2/2)
    expect(dayStatus({ ...input, date: '2026-10-27' })).toBe('pending'); // week 26: 1/2, ongoing
    expect(dayStatus({ ...input, date: '2026-10-26' })).toBe('completed'); // done that day
  });

  it('day status: missed only once the week has ended below target', () => {
    const input = {
      habit: weekly(3),
      scheduleDays: [],
      completionDates: ['2026-10-12'],
      today: '2026-10-28',
    };
    expect(dayStatus({ ...input, date: '2026-10-14' })).toBe('missed');
    expect(dayStatus({ ...input, date: '2026-10-28' })).toBe('pending');
  });

  describe('prorated first week (ADR-038)', () => {
    it('weekTarget = min(target, days from startDate to Sunday)', () => {
      expect(weekTarget(weekly(5, '2026-10-23'), '2026-10-19')).toBe(3); // Fri-Sun
      expect(weekTarget(weekly(2, '2026-10-23'), '2026-10-19')).toBe(2); // target already <= 3
      expect(weekTarget(weekly(3, '2026-10-25'), '2026-10-19')).toBe(1); // Sunday only
      expect(weekTarget(weekly(5, '2026-10-19'), '2026-10-19')).toBe(5); // Monday: full week
      expect(weekTarget(weekly(5, '2026-10-23'), '2026-10-26')).toBe(5); // later weeks: full
    });

    it('a mid-week start can still earn its first week', () => {
      const habit = weekly(5, '2026-10-23'); // Friday
      const result = streak(habit, ['2026-10-23', '2026-10-24', '2026-10-25'], '2026-10-26');
      expect(result).toMatchObject({
        current: 1,
        longest: 1,
        status: 'pending',
        weekProgress: { done: 0, target: 5 },
      });
    });

    it('a Sunday start needs a single completion that first week', () => {
      expect(streak(weekly(3, '2026-10-25'), ['2026-10-25'], '2026-10-25')).toMatchObject({
        current: 1,
        status: 'completed',
        weekProgress: { done: 1, target: 1 },
      });
    });

    it('a Monday start is NOT prorated', () => {
      expect(
        streak(weekly(3, '2026-10-19'), ['2026-10-19', '2026-10-20'], '2026-10-26'),
      ).toMatchObject({
        current: 0,
        longest: 0,
      });
    });

    it('startDate today mid-week: prorated target, pending', () => {
      expect(streak(weekly(6, '2026-10-28'), [], '2026-10-28')).toMatchObject({
        current: 0,
        status: 'pending',
        weekProgress: { done: 0, target: 5 }, // Wed-Sun = 5 days
      });
    });

    it('completions before a mid-week startDate do not count', () => {
      expect(
        weekProgress({
          habit: weekly(2, '2026-10-23'),
          scheduleDays: [],
          completionDates: ['2026-10-20', '2026-10-23'],
          today: '2026-10-25',
        }),
      ).toEqual({ done: 1, target: 2 });
    });
  });

  it('startDate in a future week: nothing scheduled, no progress yet', () => {
    expect(streak(weekly(3, '2026-11-02'), [], '2026-10-28')).toMatchObject({
      current: 0,
      longest: 0,
      status: 'not_scheduled',
      weekProgress: null,
    });
  });
});

describe('DST transitions (America/New_York)', () => {
  it('todayIn follows local midnight across the March change (23-hour day)', () => {
    const at = (iso) => todayIn('America/New_York', () => new Date(iso));
    expect(at('2026-03-08T06:30:00Z')).toBe('2026-03-08'); // 01:30 EST
    expect(at('2026-03-09T03:30:00Z')).toBe('2026-03-08'); // 23:30 EDT, still the 8th
    expect(at('2026-03-09T04:30:00Z')).toBe('2026-03-09'); // 00:30 EDT
  });

  it('todayIn handles the repeated hour in November (25-hour day)', () => {
    const at = (iso) => todayIn('America/New_York', () => new Date(iso));
    expect(at('2026-11-01T05:30:00Z')).toBe('2026-11-01'); // 01:30 EDT
    expect(at('2026-11-01T06:30:00Z')).toBe('2026-11-01'); // 01:30 EST (again)
    expect(at('2026-11-02T04:59:00Z')).toBe('2026-11-01'); // 23:59 EST
    expect(at('2026-11-02T05:00:00Z')).toBe('2026-11-02'); // midnight
  });

  it('a daily streak runs straight through both DST days', () => {
    expect(streak(daily(), eachDay('2026-03-07', '2026-03-09'), '2026-03-09').current).toBe(3);
    expect(streak(daily(), eachDay('2026-10-31', '2026-11-02'), '2026-11-02').current).toBe(3);
  });

  it('date arithmetic is unaffected by DST', () => {
    expect(eachDay('2026-03-07', '2026-03-09')).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(weekBounds('2026-03-08')).toEqual({ start: '2026-03-02', end: '2026-03-08' });
  });
});

describe('users in different timezones', () => {
  // The same instant is Monday 26 Oct 09:00 in Auckland but Sunday 25 Oct 13:00 in Los Angeles.
  const now = () => new Date('2026-10-25T20:00:00Z');
  const aucklandToday = todayIn('Pacific/Auckland', now);
  const laToday = todayIn('America/Los_Angeles', now);

  it('"today" differs', () => {
    expect([aucklandToday, laToday]).toEqual(['2026-10-26', '2026-10-25']);
  });

  it('completed through the 25th: done today in LA, pending (not broken) in Auckland', () => {
    const dates = ['2026-10-23', '2026-10-24', '2026-10-25'];
    expect(streak(daily(), dates, laToday)).toMatchObject({ current: 3, status: 'completed' });
    expect(streak(daily(), dates, aucklandToday)).toMatchObject({ current: 3, status: 'pending' });
  });

  it('completed through the 24th: pending in LA, but the 25th is already missed in Auckland', () => {
    const dates = ['2026-10-23', '2026-10-24'];
    expect(streak(daily(), dates, laToday)).toMatchObject({ current: 2, status: 'pending' });
    expect(streak(daily(), dates, aucklandToday)).toMatchObject({ current: 0, status: 'pending' });
  });
});

describe('leap years', () => {
  it('Feb 28 -> Feb 29 -> Mar 1 is a 3-day streak in a leap year', () => {
    expect(streak(daily(), ['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01').current).toBe(
      3,
    );
  });

  it('Feb 28 -> Mar 1 is consecutive in a non-leap year', () => {
    expect(streak(daily(), ['2027-02-28', '2027-03-01'], '2027-03-01').current).toBe(2);
  });

  it('a Thursday habit spans the leap day', () => {
    const thursdays = ['2024-02-22', '2024-02-29', '2024-03-07'];
    expect(streak(weekdaysHabit('2024-01-01'), thursdays, '2024-03-07', [4]).current).toBe(3);
  });

  it('a leap-day week works for weekly targets', () => {
    expect(weekBounds('2024-02-29')).toEqual({ start: '2024-02-26', end: '2024-03-03' });
  });
});

describe('editing history recalculates (derived, never stored)', () => {
  const withGap = [...eachDay('2026-10-10', '2026-10-14'), ...eachDay('2026-10-16', '2026-10-20')];

  it('back-filling a past gap joins two runs into a longer one', () => {
    expect(streak(daily(), withGap, '2026-10-20')).toMatchObject({ current: 5, longest: 5 });
    expect(streak(daily(), [...withGap, '2026-10-15'], '2026-10-20')).toMatchObject({
      current: 11,
      longest: 11,
    });
  });

  it('removing a past completion splits the run', () => {
    const full = eachDay('2026-10-10', '2026-10-20');
    const edited = full.filter((date) => date !== '2026-10-13');
    expect(streak(daily(), edited, '2026-10-20')).toMatchObject({ current: 7, longest: 7 });
  });
});

describe('dates.js week helpers', () => {
  it('weekBounds returns Monday-Sunday, including across a year boundary', () => {
    expect(weekBounds('2026-10-25')).toEqual({ start: '2026-10-19', end: '2026-10-25' }); // Sunday
    expect(weekBounds('2026-10-26')).toEqual({ start: '2026-10-26', end: '2026-11-01' }); // Monday
    expect(weekBounds('2026-12-31')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });

  it('eachDay is inclusive and empty for a reversed range', () => {
    expect(eachDay('2026-10-30', '2026-11-02')).toHaveLength(4);
    expect(eachDay('2026-10-25', '2026-10-25')).toEqual(['2026-10-25']);
    expect(eachDay('2026-10-26', '2026-10-25')).toEqual([]);
  });

  it('addDays and daysBetween are inverse', () => {
    expect(addDays('2026-10-25', -25)).toBe('2026-09-30');
    expect(daysBetween('2026-10-25', '2026-09-30')).toBe(-25);
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});
