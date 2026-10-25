/**
 * Cross-check of src/domain/streaks.js against a deliberately NAIVE reference implementation.
 *
 * The hand-written cases in streaks.test.js could share blind spots with the real code. Here a
 * second, independent implementation follows the written rules literally (build the full list of
 * scheduled days / weeks from startDate to today, then scan it), and both must agree on
 * hundreds of random histories. Random but REPRODUCIBLE: a seeded generator, so a failure always
 * shows the same case again.
 */
import { addDays, eachDay, weekBounds } from '../../src/domain/dates.js';
import { isScheduledOn } from '../../src/domain/schedule.js';
import { computeStreak } from '../../src/domain/streaks.js';

/** Small seeded pseudo-random generator (mulberry32): same seed -> same sequence. */
function random(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Length of the longest run of `true` values. */
function longestRun(flags) {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** The rules from docs/STREAK_RULES.md, implemented the slow and obvious way. */
function referenceStreak({ habit, scheduleDays, completionDates, today }) {
  const done = new Set(completionDates);
  if (today < habit.startDate) return { current: 0, longest: 0 };

  if (habit.frequencyType !== 'weekly_target') {
    const scheduled = eachDay(habit.startDate, today).filter((d) =>
      isScheduledOn(habit, scheduleDays, d),
    );
    // A scheduled, unfinished today is pending: leave it out of the "current" scan.
    const pendingToday = scheduled.at(-1) === today && !done.has(today);
    const considered = pendingToday ? scheduled.slice(0, -1) : scheduled;
    let current = 0;
    for (let i = considered.length - 1; i >= 0 && done.has(considered[i]); i -= 1) current += 1;
    return { current, longest: longestRun(scheduled.map((d) => done.has(d))) };
  }

  // weekly_target: list every week from the start week to the current week.
  const weeks = [];
  for (
    let monday = weekBounds(habit.startDate).start;
    monday <= today;
    monday = addDays(monday, 7)
  ) {
    const days = eachDay(monday, addDays(monday, 6)).filter((d) => d >= habit.startDate);
    const count = days.filter((d) => d <= today && done.has(d)).length;
    const target = Math.min(habit.targetPerWeek, days.length); // prorated first week
    weeks.push(count >= target);
  }
  const currentMet = weeks.at(-1);
  const past = weeks.slice(0, -1);
  let current = currentMet ? 1 : 0;
  for (let i = past.length - 1; i >= 0 && past[i]; i -= 1) current += 1;
  return { current, longest: longestRun(weeks) };
}

/** Generates one random habit + history. */
function randomCase(next) {
  const types = ['daily', 'weekdays', 'weekly_target'];
  const frequencyType = types[Math.floor(next() * 3)];
  const startDate = addDays('2024-01-01', Math.floor(next() * 120)); // spans the 2024 leap day
  const today = addDays(startDate, Math.floor(next() * 90) - 3); // sometimes before start
  const scheduleDays = [1, 2, 3, 4, 5, 6, 7].filter(() => next() < 0.5);
  if (frequencyType === 'weekdays' && scheduleDays.length === 0) scheduleDays.push(3);
  const rate = next(); // how diligent this user is
  const completionDates = eachDay(addDays(startDate, -5), addDays(today, 3)).filter(
    () => next() < rate, // includes some days before start / after today / unscheduled
  );
  return {
    habit: { frequencyType, startDate, targetPerWeek: 1 + Math.floor(next() * 7) },
    scheduleDays,
    completionDates,
    today,
  };
}

it('agrees with the reference implementation on 600 random histories', () => {
  const next = random(20261025);
  for (let i = 0; i < 600; i += 1) {
    const input = randomCase(next);
    const { current, longest } = computeStreak(input);
    const expected = referenceStreak(input);
    // On mismatch, show the whole case so it can be turned into a named unit test.
    if (current !== expected.current || longest !== expected.longest) {
      throw new Error(
        `case ${i} differs: got ${JSON.stringify({ current, longest })}, ` +
          `expected ${JSON.stringify(expected)} for ${JSON.stringify(input)}`,
      );
    }
  }
});
