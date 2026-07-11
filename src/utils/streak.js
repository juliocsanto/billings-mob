/**
 * streak.js — daily registration streak helpers for the Billings MOB PWA.
 *
 * SEMANTICS of computeStreak(obs, todayStr):
 *   A "streak" is the length of the most recent unbroken run of days that have
 *   an observation entry in `obs`.
 *
 *   The anchor is determined as follows:
 *     - If today (todayStr) is recorded  → the run is counted ending at today.
 *     - If today is NOT recorded but yesterday IS → the run ends at yesterday,
 *       meaning the streak is still "alive" (the aluna hasn't broken it yet;
 *       today is still open for recording).
 *     - If neither today nor yesterday is recorded → the streak is 0 (broken).
 *
 *   Starting from the anchor date the function walks backwards, decrementing
 *   one day at a time, and stops as soon as a day is missing from obs.
 *
 * Clinical constraint: these are neutral behavioral counts — no
 * fertile/infertile/safe/unsafe classification is made or implied anywhere.
 *
 * Dependencies: addDays from ./dates.js (no side effects, no external imports).
 */
import { addDays } from './dates.js';

/**
 * Compute the current daily-registration streak.
 *
 * @param {Object|null} obs   - Observation map keyed by 'YYYY-MM-DD' date string.
 * @param {string}      todayStr - Today's date as 'YYYY-MM-DD'.
 * @returns {number} Number of consecutive days with an observation (>= 0).
 */
export function computeStreak(obs, todayStr) {
  if (!obs) return 0;

  const yesterdayStr = addDays(todayStr, -1);
  const todayRecorded = Boolean(obs[todayStr]);
  const yesterdayRecorded = Boolean(obs[yesterdayStr]);

  // Determine anchor: the most recent day from which to walk backwards.
  let anchor;
  if (todayRecorded) {
    anchor = todayStr;
  } else if (yesterdayRecorded) {
    anchor = yesterdayStr;
  } else {
    // Streak is broken — neither today nor yesterday has a record.
    return 0;
  }

  // Walk backwards from anchor counting consecutive days.
  let count = 0;
  let cursor = anchor;
  while (obs[cursor]) {
    count += 1;
    cursor = addDays(cursor, -1);
  }

  return count;
}

/**
 * Check whether the aluna has already recorded an observation today.
 *
 * @param {Object|null} obs
 * @param {string}      todayStr - Today's date as 'YYYY-MM-DD'.
 * @returns {boolean}
 */
export function hasRecordedToday(obs, todayStr) {
  if (!obs) return false;
  return Boolean(obs[todayStr]);
}

/**
 * Check whether yesterday is missing from obs (i.e. the aluna missed yesterday).
 * Returns true even when today was recorded — it only checks yesterday.
 *
 * @param {Object|null} obs
 * @param {string}      todayStr - Today's date as 'YYYY-MM-DD'.
 * @returns {boolean}
 */
export function missedYesterday(obs, todayStr) {
  if (!obs) return true;
  const yesterdayStr = addDays(todayStr, -1);
  return !obs[yesterdayStr];
}
