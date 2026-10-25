/**
 * Unit tests for the optimistic /today update (optimistic.js) and the schedule texts.
 */
import { scheduleSummary, streakLabel } from '../habits/schedule.js';
import { applyToggle } from './optimistic.js';

const item = (id, overrides = {}) => ({
  habit: { id, name: id, frequencyType: 'daily' },
  completed: false,
  completion: null,
  status: 'pending',
  isDue: true,
  streak: { current: 0, longest: 0, unit: 'days' },
  ...overrides,
});

const day = (habits, date = '2026-10-28', today = '2026-10-28') => ({
  date,
  today,
  habits,
  summary: { scheduled: habits.length, completed: 0, remaining: habits.length, percent: 0 },
});

describe('applyToggle', () => {
  it('ticking marks the habit completed and recomputes the summary', () => {
    const next = applyToggle(day([item('a'), item('b')]), { habitId: 'a', done: true });
    expect(next.habits[0]).toMatchObject({ completed: true, status: 'completed', isDue: false });
    expect(next.summary).toEqual({ scheduled: 2, completed: 1, remaining: 1, percent: 50 });
  });

  it('unticking today makes it pending again; on a past day it is missed', () => {
    const done = item('a', { completed: true, status: 'completed' });
    expect(applyToggle(day([done]), { habitId: 'a', done: false }).habits[0].status).toBe(
      'pending',
    );
    const past = day([done], '2026-10-20');
    expect(applyToggle(past, { habitId: 'a', done: false }).habits[0].status).toBe('missed');
  });

  it('weekly targets update the week progress and use the week rules', () => {
    const weekly = item('w', {
      habit: { id: 'w', frequencyType: 'weekly_target', targetPerWeek: 2 },
      weekProgress: { done: 1, target: 2 },
    });
    const ticked = applyToggle(day([weekly]), { habitId: 'w', done: true });
    expect(ticked.habits[0]).toMatchObject({ status: 'completed', weekProgress: { done: 2 } });

    // Unticking in a running week: back to pending (never "missed" while the week is open).
    const unticked = applyToggle(ticked, { habitId: 'w', done: false });
    expect(unticked.habits[0]).toMatchObject({ status: 'pending', weekProgress: { done: 1 } });
  });

  it('leaves other habits, and the original object, untouched', () => {
    const original = day([item('a'), item('b')]);
    const next = applyToggle(original, { habitId: 'a', done: true });
    expect(next.habits[1]).toBe(original.habits[1]);
    expect(original.habits[0].completed).toBe(false);
  });

  it('applying the inverse restores the previous state (used for rollback)', () => {
    const original = day([item('a')]);
    const back = applyToggle(applyToggle(original, { habitId: 'a', done: true }), {
      habitId: 'a',
      done: false,
    });
    expect(back.habits[0]).toMatchObject({ completed: false, status: 'pending' });
    expect(back.summary).toMatchObject({ completed: 0, remaining: 1 });
  });
});

describe('schedule texts', () => {
  it.each([
    [{ frequencyType: 'daily' }, null, 'Every day'],
    [{ frequencyType: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, null, 'Weekdays'],
    [{ frequencyType: 'weekdays', weekdays: [7, 6] }, null, 'Weekends'],
    [{ frequencyType: 'weekdays', weekdays: [5, 1, 3] }, null, 'Mon, Wed, Fri'],
    [{ frequencyType: 'weekly_target', targetPerWeek: 3 }, null, '3× per week'],
    [
      { frequencyType: 'weekly_target', targetPerWeek: 3 },
      { done: 2, target: 3 },
      '3× per week · 2/3 this week',
    ],
  ])('%o -> %s', (habit, progress, expected) => {
    expect(scheduleSummary(habit, progress)).toBe(expected);
  });

  it('streak labels', () => {
    expect(streakLabel({ current: 0, unit: 'days' })).toBeNull();
    expect(streakLabel({ current: 1, unit: 'days' })).toBe('1 day');
    expect(streakLabel({ current: 7, unit: 'days' })).toBe('7 days');
    expect(streakLabel({ current: 3, unit: 'weeks' })).toBe('3 weeks');
  });
});
