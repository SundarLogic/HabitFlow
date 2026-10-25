/**
 * Unit tests for src/domain/analytics.js: scheduled instances, completion rates, the summary
 * blocks and the per-day habit history. Pure functions: no database, no HTTP.
 *
 * Reference calendar (Oct 2026): Mon 12 | Mon 19  Tue 20  Wed 21  Thu 22  Fri 23  Sat 24
 * Sun 25 | Mon 26  Tue 27  Wed 28 ... Sun Nov 1. "Today" is Wed 2026-10-28 unless stated.
 */
import {
  completionRate,
  habitHistory,
  scheduledInstances,
  summarize,
} from '../../src/domain/analytics.js';

const TODAY = '2026-10-28';
const daily = (extra = {}) => ({ frequencyType: 'daily', startDate: '2026-10-01', ...extra });
const mwf = (extra = {}) => ({ frequencyType: 'weekdays', startDate: '2026-10-01', ...extra });
const weekly = (targetPerWeek, extra = {}) => ({
  frequencyType: 'weekly_target',
  targetPerWeek,
  startDate: '2026-10-05',
  ...extra,
});

/** scheduledInstances with defaults; returns [unit, instances]. */
function instances(habit, completionDates, from, to, { today = TODAY, scheduleDays = [] } = {}) {
  const result = scheduledInstances({ habit, scheduleDays, completionDates, from, to, today });
  return [result.unit, result.instances];
}

describe('completionRate', () => {
  it('is null when nothing was due (empty state, never 0%)', () => {
    expect(completionRate(0, 0)).toBeNull();
  });
  it('is a fraction rounded to 4 decimals', () => {
    expect(completionRate(2, 3)).toBe(0.6667);
    expect(completionRate(3, 3)).toBe(1);
    expect(completionRate(0, 5)).toBe(0);
  });
});

describe('scheduledInstances: daily', () => {
  it('one instance per past day in the range', () => {
    const [unit, list] = instances(
      daily(),
      ['2026-10-19', '2026-10-20', '2026-10-22'],
      '2026-10-19',
      '2026-10-25',
    );
    expect(unit).toBe('days');
    expect(list).toHaveLength(7);
    expect(list.filter((i) => i.completed).map((i) => i.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-22',
    ]);
  });

  it('leaves out a pending today, so an unfinished day never lowers the rate', () => {
    const [, list] = instances(daily(), ['2026-10-26'], '2026-10-26', '2026-10-28');
    expect(list.map((i) => i.date)).toEqual(['2026-10-26', '2026-10-27']);
  });

  it('counts today once it is completed', () => {
    const [, list] = instances(daily(), ['2026-10-26', '2026-10-28'], '2026-10-26', '2026-10-28');
    expect(list).toEqual([
      { date: '2026-10-26', completed: true },
      { date: '2026-10-27', completed: false },
      { date: '2026-10-28', completed: true },
    ]);
  });

  it('starts at startDate when the range begins earlier', () => {
    const [, list] = instances(daily({ startDate: '2026-10-24' }), [], '2026-10-19', '2026-10-27');
    expect(list.map((i) => i.date)).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ]);
  });

  it('stops at today when the range goes into the future', () => {
    const [, list] = instances(daily(), [], '2026-10-27', '2026-11-05');
    expect(list.map((i) => i.date)).toEqual(['2026-10-27']);
  });

  it('a range entirely in the future has no instances (rate null)', () => {
    const [, list] = instances(daily(), [], '2026-11-01', '2026-11-30');
    expect(list).toEqual([]);
  });

  it('ignores completions outside the range or after today', () => {
    const [, list] = instances(daily(), ['2026-10-18', '2026-10-29'], '2026-10-19', '2026-10-20');
    expect(list.every((i) => !i.completed)).toBe(true);
  });
});

describe('scheduledInstances: weekdays', () => {
  it('only scheduled weekdays are instances', () => {
    const [, list] = instances(mwf(), ['2026-10-21'], '2026-10-19', '2026-10-25', {
      scheduleDays: [1, 3, 5],
    });
    expect(list).toEqual([
      { date: '2026-10-19', completed: false },
      { date: '2026-10-21', completed: true },
      { date: '2026-10-23', completed: false },
    ]);
  });

  it('a completion on an unscheduled day is not an instance and does not count', () => {
    const [, list] = instances(mwf(), ['2026-10-20'], '2026-10-19', '2026-10-21', {
      scheduleDays: [1, 3, 5],
    });
    expect(list.filter((i) => i.completed)).toEqual([]);
  });
});

describe('scheduledInstances: weekly_target', () => {
  it('one instance per finished week: met or not', () => {
    const dates = ['2026-10-13', '2026-10-14', '2026-10-20']; // week 12: 2/2, week 19: 1/2
    const [unit, list] = instances(weekly(2), dates, '2026-10-12', '2026-10-25');
    expect(unit).toBe('weeks');
    expect(list).toEqual([
      { weekStart: '2026-10-12', completed: true },
      { weekStart: '2026-10-19', completed: false },
    ]);
  });

  it('the current week counts only once its target is met', () => {
    const unmet = instances(weekly(2), ['2026-10-26'], '2026-10-26', '2026-10-28')[1];
    expect(unmet).toEqual([]);
    const met = instances(weekly(2), ['2026-10-26', '2026-10-27'], '2026-10-26', '2026-10-28')[1];
    expect(met).toEqual([{ weekStart: '2026-10-26', completed: true }]);
  });

  it('a week overlapping the range start is evaluated on ALL its completions', () => {
    // Range starts Wednesday 21; the completions on Mon 19 and Tue 20 still count for that week.
    const [, list] = instances(weekly(2), ['2026-10-19', '2026-10-20'], '2026-10-21', '2026-10-25');
    expect(list).toEqual([{ weekStart: '2026-10-19', completed: true }]);
  });

  it('uses the prorated first-week target (ADR-038)', () => {
    // Starts Friday 23 with target 5 -> first week target min(5, 3) = 3.
    const habit = weekly(5, { startDate: '2026-10-23' });
    const [, list] = instances(
      habit,
      ['2026-10-23', '2026-10-24', '2026-10-25'],
      '2026-10-19',
      '2026-10-25',
    );
    expect(list).toEqual([{ weekStart: '2026-10-19', completed: true }]);
  });

  it('weeks before the habit started are not instances', () => {
    const [, list] = instances(
      weekly(1, { startDate: '2026-10-19' }),
      [],
      '2026-10-05',
      '2026-10-25',
    );
    expect(list.map((i) => i.weekStart)).toEqual(['2026-10-19']);
  });
});

describe('archived habits (evaluated up to the archive date)', () => {
  it('days after archiving are not instances; the archive day counts only if done', () => {
    const [, notDone] = instances(
      daily({ status: 'archived' }),
      ['2026-10-19'],
      '2026-10-19',
      '2026-10-28',
      {
        today: '2026-10-21', // asOf = archive date
      },
    );
    expect(notDone.map((i) => i.date)).toEqual(['2026-10-19', '2026-10-20']);

    const [, done] = instances(daily(), ['2026-10-21'], '2026-10-19', '2026-10-28', {
      today: '2026-10-21',
    });
    expect(done.map((i) => i.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
  });
});

describe('summarize', () => {
  const entry = (habit, completionDates, { scheduleDays = [], asOf = TODAY } = {}) => ({
    habit: { status: 'active', category: null, ...habit },
    scheduleDays,
    completionDates,
    asOf,
  });

  it('aggregates overall, daily, weekly and by category; weekly habits stay out of `daily`', () => {
    const result = summarize({
      from: '2026-10-26',
      to: '2026-10-28',
      today: TODAY,
      entries: [
        entry(daily({ id: 'a', name: 'A', category: 'Health' }), ['2026-10-26', '2026-10-28']),
        entry(weekly(1, { id: 'b', name: 'B', category: 'Fitness' }), ['2026-10-27']),
      ],
    });

    // A: 26 done, 27 missed, 28 done -> 2/3. B: current week met (1/1) -> 1/1.
    expect(result.overall).toEqual({ completionRate: 0.75, completed: 3, scheduled: 4 });
    expect(result.daily).toEqual([
      { date: '2026-10-26', scheduled: 1, completed: 1, rate: 1 },
      { date: '2026-10-27', scheduled: 1, completed: 0, rate: 0 },
      { date: '2026-10-28', scheduled: 1, completed: 1, rate: 1 },
    ]);
    expect(result.weekly).toEqual([
      { weekStart: '2026-10-26', scheduled: 4, completed: 3, rate: 0.75 },
    ]);
    expect(result.byCategory).toEqual([
      { category: 'Health', completionRate: 0.6667, completed: 2, scheduled: 3 },
      { category: 'Fitness', completionRate: 1, completed: 1, scheduled: 1 },
    ]);
  });

  it('"today" covers active habits scheduled today only; archived habits are history', () => {
    const result = summarize({
      from: '2026-10-28',
      to: '2026-10-28',
      today: TODAY,
      entries: [
        entry(daily({ id: 'a', name: 'A' }), ['2026-10-28']),
        entry(daily({ id: 'b', name: 'B' }), []),
        entry(mwf({ id: 'c', name: 'Tue only' }), [], { scheduleDays: [2] }),
        entry(daily({ id: 'd', name: 'Old', status: 'archived' }), ['2026-10-20'], {
          asOf: '2026-10-21',
        }),
      ],
    });
    expect(result.today).toEqual({ scheduled: 2, completed: 1, remaining: 1, percent: 50 });
    // The archived habit is still part of the history...
    expect(result.byHabit.map((h) => h.habitId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('zero denominators are null everywhere, and there is no best streak', () => {
    const result = summarize({ from: '2026-10-19', to: '2026-10-25', today: TODAY, entries: [] });
    expect(result.today).toEqual({ scheduled: 0, completed: 0, remaining: 0, percent: null });
    expect(result.overall.completionRate).toBeNull();
    expect(result.daily.every((d) => d.rate === null)).toBe(true);
    expect(result.bestStreak).toBeNull();
  });

  it('bestStreak is the habit with the longest streak', () => {
    const result = summarize({
      from: '2026-10-19',
      to: '2026-10-28',
      today: TODAY,
      entries: [
        entry(daily({ id: 'a', name: 'Short' }), ['2026-10-27', '2026-10-28']),
        entry(daily({ id: 'b', name: 'Long' }), ['2026-10-19', '2026-10-20', '2026-10-21']),
      ],
    });
    expect(result.bestStreak).toEqual({ habitId: 'b', name: 'Long', longest: 3, unit: 'days' });
  });

  it('a habit created today with nothing done has a null rate, not 0%', () => {
    const result = summarize({
      from: '2026-10-19',
      to: TODAY,
      today: TODAY,
      entries: [entry(daily({ id: 'a', name: 'New', startDate: TODAY }), [])],
    });
    expect(result.byHabit[0]).toMatchObject({ completionRate: null, scheduled: 0 });
  });
});

describe('habitHistory', () => {
  it('gives every day a status, including upcoming days', () => {
    const days = habitHistory({
      habit: mwf(),
      scheduleDays: [1, 3, 5],
      completionDates: ['2026-10-26'],
      from: '2026-10-26',
      to: '2026-10-30',
      today: TODAY,
      asOf: TODAY,
    });
    expect(days).toEqual([
      { date: '2026-10-26', status: 'completed', completed: true },
      { date: '2026-10-27', status: 'not_scheduled', completed: false },
      { date: '2026-10-28', status: 'pending', completed: false },
      { date: '2026-10-29', status: 'upcoming', completed: false },
      { date: '2026-10-30', status: 'upcoming', completed: false },
    ]);
  });

  it('an archived habit is not_scheduled after its archive date, never missed', () => {
    const days = habitHistory({
      habit: daily({ status: 'archived' }),
      scheduleDays: [],
      completionDates: ['2026-10-19'],
      from: '2026-10-19',
      to: '2026-10-29',
      today: TODAY,
      asOf: '2026-10-21',
    });
    const status = Object.fromEntries(days.map((d) => [d.date, d.status]));
    expect(status['2026-10-19']).toBe('completed');
    expect(status['2026-10-20']).toBe('missed');
    expect(status['2026-10-21']).toBe('not_scheduled'); // archive day, not done
    expect(status['2026-10-27']).toBe('not_scheduled');
    expect(status['2026-10-29']).toBe('upcoming'); // the real future stays "upcoming"
  });
});
