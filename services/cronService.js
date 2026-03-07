/**
 * services/cronService.js
 * -----------------------
 * Registers a daily cron job that:
 *   1. Fetches all "active" subscriptions from Firestore.
 *   2. Finds those whose nextBillingDate is exactly 3 days from today (UTC).
 *   3. Sends a renewal-reminder email to the subscription owner.
 *   4. Advances nextBillingDate by 1 month or 1 year so the cycle continues.
 *
 * ┌───────────── second (optional)
 * │ ┌─────────── minute
 * │ │ ┌───────── hour (UTC on most hosts)
 * │ │ │ ┌─────── day of month
 * │ │ │ │ ┌───── month
 * │ │ │ │ │ ┌─── day of week
 * │ │ │ │ │ │
 * 0 0 8 * * *   →  every day at 08:00 UTC
 */

import cron from 'node-cron';
import { db } from '../config/firebase.js';
import { sendRenewalReminder } from './mailService.js';

// ─── Date helpers ────────────────────────────────────────────────────────────

/**
 * Returns a Date object set to midnight UTC for a given Date.
 * This strips the time component so we can compare calendar days safely.
 *
 * Example: toUTCMidnight(new Date("2026-03-06T15:30:00Z"))
 *          → Date("2026-03-06T00:00:00.000Z")
 */
function toUTCMidnight(date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

/**
 * Returns true if two Date objects represent the same calendar day in UTC.
 */
function isSameUTCDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth()    === b.getUTCMonth()    &&
    a.getUTCDate()     === b.getUTCDate()
  );
}

/**
 * Advances a Date by exactly 1 calendar month, preserving the day-of-month
 * where possible and clamping to the last day of the month when needed.
 *
 * Why not just add 30 days?  Because "monthly" billing means the charge falls
 * on the *same calendar day* each month (e.g. the 31st → the last day of the
 * next month when there are fewer days).
 *
 * Example: addOneMonth(new Date("2026-01-31")) → 2026-02-28
 *          addOneMonth(new Date("2026-03-15")) → 2026-04-15
 */
function addOneMonth(date) {
  const d = new Date(date);     // clone so we don't mutate the original
  const originalDay = d.getUTCDate();
  const nextMonth   = d.getUTCMonth() + 1; // may equal 12 → wraps to 0 (January next year)
  const nextYear    = d.getUTCFullYear() + (nextMonth === 12 ? 1 : 0);
  const wrappedMonth = nextMonth % 12;

  // Find the last valid day in the target month.
  // Date.UTC(year, month+1, 0) gives the last millisecond of the previous month,
  // whose .getUTCDate() is the total number of days in `month`.
  const daysInTargetMonth = new Date(Date.UTC(nextYear, wrappedMonth + 1, 0)).getUTCDate();

  // Clamp to the last day if originalDay overshoots (e.g. Jan 31 → Feb 28/29)
  const clampedDay = Math.min(originalDay, daysInTargetMonth);

  return new Date(Date.UTC(nextYear, wrappedMonth, clampedDay));
}

/**
 * Advances a Date by exactly 1 calendar year.
 * Handles leap-year edge case: Feb 29 → Feb 28 in non-leap years.
 *
 * Example: addOneYear(new Date("2024-02-29")) → 2025-02-28
 */
function addOneYear(date) {
  const d        = new Date(date);
  const nextYear = d.getUTCFullYear() + 1;
  const month    = d.getUTCMonth();
  const day      = d.getUTCDate();

  const daysInTargetMonth = new Date(Date.UTC(nextYear, month + 1, 0)).getUTCDate();
  const clampedDay        = Math.min(day, daysInTargetMonth);

  return new Date(Date.UTC(nextYear, month, clampedDay));
}

/**
 * Advances a nextBillingDate based on billingCycle.
 *
 * @param {Date}   date         – the current nextBillingDate (JS Date)
 * @param {string} billingCycle – "monthly" | "yearly"
 * @returns {Date}
 */
function calcNextBillingDate(date, billingCycle) {
  return billingCycle === 'yearly' ? addOneYear(date) : addOneMonth(date);
}

// ─── Core job logic ──────────────────────────────────────────────────────────

async function runDailyCheck() {
  console.log(`[cron] Daily check started – ${new Date().toISOString()}`);

  // ── Step 1: determine the target calendar day (today + 3 days, UTC midnight) ──
  const today  = toUTCMidnight(new Date());

  // Add exactly 3 days (in ms). Because we work at midnight UTC there are no
  // DST surprises – UTC has no daylight-saving transitions.
  const THREE_DAYS_MS  = 3 * 24 * 60 * 60 * 1000;
  const targetDay      = new Date(today.getTime() + THREE_DAYS_MS);

  console.log(`[cron] Looking for subscriptions due on ${targetDay.toISOString().split('T')[0]}`);

  // ── Step 2: fetch all active subscriptions ────────────────────────────────
  // The client stores nextBillingDate in IST (UTC+5:30).
  // "March 9 12:00 AM IST" is persisted by Firestore as "March 8 18:30:00 UTC".
  //
  // To catch every document whose *IST calendar day* is the target date we must
  // shift our UTC window backwards by the IST offset (5 h 30 m):
  //
  //   IST day start  →  March 9  00:00:00.000 IST  =  March 8  18:30:00.000 UTC
  //   IST day end    →  March 9  23:59:59.999 IST  =  March 9  18:29:59.999 UTC
  //
  // Date.UTC handles negative hours/minutes by rolling back to the previous day,
  // so passing (hour - 5, minute - 30) works correctly without manual arithmetic.
  const IST_OFFSET_H  = 5;
  const IST_OFFSET_M  = 30;

  const y = targetDay.getUTCFullYear();
  const m = targetDay.getUTCMonth();
  const d = targetDay.getUTCDate();

  // IST 00:00:00.000  →  UTC (0 - 5)h (0 - 30)m  =  UTC prev-day 18:30:00.000
  const startOfDay = new Date(Date.UTC(y, m, d, 0 - IST_OFFSET_H, 0 - IST_OFFSET_M, 0, 0));

  // IST 23:59:59.999  →  UTC (23 - 5)h (59 - 30)m  =  UTC same-day 18:29:59.999
  const endOfDay   = new Date(Date.UTC(y, m, d, 23 - IST_OFFSET_H, 59 - IST_OFFSET_M, 59, 999));

  console.log(`[cron] Query range: ${startOfDay.toISOString()} → ${endOfDay.toISOString()}`);

  let snapshot;
  try {
    snapshot = await db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .where('nextBillingDate', '>=', startOfDay)
      .where('nextBillingDate', '<=', endOfDay)
      .get();
  } catch (err) {
    // Firestore requires a composite index for multi-field queries.
    // If this throws "requires an index", follow the URL in the error message
    // to create it in the Firebase console: status ASC + nextBillingDate ASC.
    console.error('[cron] Firestore query failed:', err.message);
    return;
  }

  if (snapshot.empty) {
    console.log('[cron] No subscriptions due in 3 days. Nothing to do.');
    return;
  }

  console.log(`[cron] Found ${snapshot.size} subscription(s) due in 3 days.`);

  // ── Step 3: process each subscription ────────────────────────────────────
  const results = await Promise.allSettled(
    snapshot.docs.map((doc) => processSubscription(doc))
  );

  // Summary log
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed    = results.filter((r) => r.status === 'rejected').length;
  console.log(`[cron] Done. ✓ ${succeeded} processed, ✗ ${failed} failed.`);
}

/**
 * Handles a single subscription document:
 *   – looks up the owner's email
 *   – sends the reminder
 *   – advances nextBillingDate in Firestore
 */
async function processSubscription(doc) {
  const sub    = doc.data();
  const subId  = doc.id;

  // ── 3a: resolve the billing date ─────────────────────────────────────────
  // Firestore returns Timestamps, not JS Dates. `.toDate()` converts safely.
  // Never compare Timestamp objects directly with > / < / === – they won't
  // behave like primitives. Always call .toDate() first.
  const billingDate =
    sub.nextBillingDate && typeof sub.nextBillingDate.toDate === 'function'
      ? sub.nextBillingDate.toDate()
      : new Date(sub.nextBillingDate); // fallback if stored as millis/ISO string

  // ── 3b: look up the user's email from the 'users' collection ─────────────
  const userDoc = await db.collection('users').doc(sub.userId).get();
  if (!userDoc.exists) {
    console.warn(`[cron] User doc not found for userId=${sub.userId}. Skipping.`);
    return;
  }
  const userEmail = userDoc.data().email;
  if (!userEmail) {
    console.warn(`[cron] No email field on user=${sub.userId}. Skipping.`);
    return;
  }

  // ── 3c: send the reminder email ───────────────────────────────────────────
  try {
    const msgId = await sendRenewalReminder({
      toEmail:      userEmail,
      name:         sub.name,
      amount:       sub.amount,
      billingCycle: sub.billingCycle,
      dueDate:      billingDate,
    });
    console.log(`[cron] Email sent to ${userEmail} for "${sub.name}" (msgId: ${msgId})`);
  } catch (mailErr) {
    // Log but don't abort – we still want to advance the date even if mail fails
    console.error(`[cron] Email failed for sub=${subId}:`, mailErr.message);
  }

  // ── 3d: advance nextBillingDate so the cycle continues autonomously ───────
  // We calculate from the *current* billingDate (not "today + 1 period")
  // so that the schedule never drifts even if the cron job runs slightly late.
  const newBillingDate = calcNextBillingDate(billingDate, sub.billingCycle);

  await db.collection('subscriptions').doc(subId).update({
    nextBillingDate: newBillingDate, // Firestore Admin SDK accepts JS Date objects
    updatedAt:       new Date(),
  });

  console.log(
    `[cron] Subscription "${sub.name}" (${subId}) advanced: ` +
    `${billingDate.toISOString().split('T')[0]} → ${newBillingDate.toISOString().split('T')[0]}`
  );
}

// ─── Cron registration ───────────────────────────────────────────────────────

/**
 * Registers the daily cron job.
 * Called once from index.js on server startup.
 *
 * Schedule: "0 8 * * *"  →  08:00 AM UTC every day
 *
 * node-cron uses the server's local timezone by default.
 * Passing `{ timezone: "UTC" }` ensures the schedule is always UTC regardless
 * of where the server is deployed.
 */
export function initCronJobs() {
  cron.schedule('0 8 * * *', async () => {
    try {
      await runDailyCheck();
    } catch (err) {
      console.error('[cron] Unhandled error in daily check:', err);
    }
  }, { timezone: 'UTC' });

  console.log('[cron] Daily renewal-check job registered (08:00 UTC).');
}
