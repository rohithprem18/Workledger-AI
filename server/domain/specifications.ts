import type { Tx } from '../db/pool.js';
import { BusinessRuleError, NotFoundError } from '../core/errors.js';
import { durationMinutes, isOvernight, overlaps, toMinutes, type TimeWindow } from './timeWindow.js';

/**
 * Assignment eligibility, expressed once as a chain of independent rules.
 *
 * Each specification answers one question and knows nothing about the others,
 * so a new rule is a new function added to `CHAIN` rather than an edit to
 * existing logic. More importantly the chain is reused verbatim by every
 * caller — single assignment, bulk allocation, and the eligibility preview the
 * manager sees before choosing — so those three can never disagree about who
 * is assignable. Validating separately per entry point is exactly how that
 * disagreement happens.
 *
 * Every rule takes a transaction, because the chain has to be re-runnable
 * *inside* the assignment transaction after the employee row is locked. Only
 * checking at preview time would let two managers both pass validation against
 * data that changed underneath them.
 */

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface SpecContext {
  tx: Tx;
  employeeId: string;
  requirementId: string;
  range: DateRange;
  /** Empty for an eligibility preview, where no specific hours are proposed yet. */
  plannedWindows: TimeWindow[];
}

export type Specification = (ctx: SpecContext) => Promise<void>;

/** The contractor exists and has not been deactivated. */
export const activeStatusSpecification: Specification = async ({ tx, employeeId }) => {
  const employee = await tx.queryOne<{ active: boolean; first_name: string; last_name: string }>(
    'SELECT active, first_name, last_name FROM employees WHERE id = $1',
    [employeeId],
  );
  if (!employee) throw new NotFoundError('Employee', employeeId);
  if (!employee.active) {
    throw new BusinessRuleError(
      `${employee.first_name} ${employee.last_name} is deactivated and cannot be assigned`,
    );
  }
};

/** The contractor holds the required skill at or above the required proficiency. */
export const skillMatchSpecification: Specification = async ({ tx, employeeId, requirementId }) => {
  const requirement = await tx.queryOne<{
    skill_id: string;
    min_proficiency: number;
    skill_name: string;
  }>(
    `SELECT r.skill_id, r.min_proficiency, s.name AS skill_name
       FROM contract_requirements r JOIN skills s ON s.id = r.skill_id
      WHERE r.id = $1`,
    [requirementId],
  );
  if (!requirement) throw new NotFoundError('Requirement', requirementId);

  const held = await tx.queryOne<{ proficiency_level: number }>(
    `SELECT proficiency_level FROM employee_skills
      WHERE employee_id = $1 AND skill_id = $2 AND proficiency_level >= $3`,
    [employeeId, requirement.skill_id, requirement.min_proficiency],
  );
  if (!held) {
    throw new BusinessRuleError(
      `Contractor lacks "${requirement.skill_name}" at proficiency ${requirement.min_proficiency} or above`,
    );
  }
};

/** Is `inner` entirely contained within `outer`? Overnight windows never are. */
function fitsInside(inner: TimeWindow, outer: TimeWindow): boolean {
  if (isOvernight(inner) || isOvernight(outer)) {
    // An availability pattern is a same-day window, so an overnight shift
    // cannot sit inside one. Treated as a miss rather than silently allowed.
    return false;
  }
  return (
    toMinutes(inner.startTime) >= toMinutes(outer.startTime) &&
    toMinutes(inner.endTime) <= toMinutes(outer.endTime)
  );
}

function* eachDate(range: DateRange): Generator<string> {
  const end = new Date(`${range.endDate}T00:00:00Z`);
  for (
    let d = new Date(`${range.startDate}T00:00:00Z`);
    d <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    yield d.toISOString().slice(0, 10);
  }
}

/** ISO day of week, 1 = Monday .. 7 = Sunday, matching the schema's convention. */
function isoDayOfWeek(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * The contractor is available on every day of the range, the planned hours fit
 * inside their availability window, and they do not exceed their daily cap.
 *
 * Both constraints have to hold: an hours cap alone would let someone be
 * scheduled for 4 hours at 03:00 when they are only available 09:00–17:00.
 */
export const capacitySpecification: Specification = async ({
  tx,
  employeeId,
  range,
  plannedWindows,
}) => {
  // An eligibility preview proposes no hours yet, so there is nothing to fit.
  if (plannedWindows.length === 0) return;

  const plannedMinutes = plannedWindows.reduce((sum, w) => sum + durationMinutes(w), 0);

  const availability = await tx.query<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    max_hours_per_day: string;
  }>(
    `SELECT day_of_week, start_time, end_time, max_hours_per_day
       FROM employee_weekly_availability WHERE employee_id = $1`,
    [employeeId],
  );
  const byDay = new Map(availability.map((a) => [Number(a.day_of_week), a]));

  // A day the contractor has no availability for is a non-working day, not a
  // conflict: a Mon–Fri contractor can hold a month-long assignment, and the
  // weekends inside it are simply not worked. What must hold is that the range
  // contains working days at all, and that each one fits.
  let workingDays = 0;

  for (const date of eachDate(range)) {
    const day = byDay.get(isoDayOfWeek(date));
    if (!day) continue;
    workingDays++;

    const maxMinutes = Math.round(Number(day.max_hours_per_day) * 60);
    if (plannedMinutes > maxMinutes) {
      throw new BusinessRuleError(
        `Planned ${(plannedMinutes / 60).toFixed(2)}h on ${date} exceeds the contractor's ` +
          `limit of ${Number(day.max_hours_per_day).toFixed(2)}h per day`,
      );
    }

    const window: TimeWindow = { startTime: day.start_time, endTime: day.end_time };
    for (const planned of plannedWindows) {
      if (!fitsInside(planned, window)) {
        throw new BusinessRuleError(
          `Planned ${planned.startTime}–${planned.endTime} on ${date} falls outside the ` +
            `contractor's availability of ${day.start_time}–${day.end_time}`,
        );
      }
    }
  }

  if (workingDays === 0) {
    throw new BusinessRuleError(
      `Contractor is not available on any day between ${range.startDate} and ${range.endDate}`,
    );
  }
};

/**
 * The contractor has no active assignment whose dates and hours both overlap.
 *
 * Dates are narrowed in SQL; hours are compared in memory by the shared
 * overlap checker, so overnight shifts are handled the same way here as they
 * are for work logs.
 */
export const noCollisionSpecification: Specification = async ({
  tx,
  employeeId,
  range,
  plannedWindows,
}) => {
  if (plannedWindows.length === 0) return;

  const existing = await tx.query<{
    id: string;
    planned_start_time: string;
    planned_end_time: string;
    title: string;
  }>(
    `SELECT a.id, a.planned_start_time, a.planned_end_time, c.title
       FROM assignments a
       JOIN contract_requirements r ON r.id = a.requirement_id
       JOIN contracts c ON c.id = r.contract_id
      WHERE a.employee_id = $1 AND a.status = 'ACTIVE'
        AND a.start_date <= $3 AND a.end_date >= $2`,
    [employeeId, range.startDate, range.endDate],
  );

  for (const row of existing) {
    const existingWindow: TimeWindow = {
      startTime: row.planned_start_time,
      endTime: row.planned_end_time,
    };
    for (const planned of plannedWindows) {
      if (overlaps(planned, existingWindow)) {
        throw new BusinessRuleError(
          `Contractor is already assigned to "${row.title}" from ${row.planned_start_time} ` +
            `to ${row.planned_end_time} in this period. They may have just been booked by ` +
            'someone else — reselect a contractor.',
        );
      }
    }
  }
};

/** Order matters only for message quality: cheapest and clearest rules first. */
const CHAIN: Specification[] = [
  activeStatusSpecification,
  skillMatchSpecification,
  capacitySpecification,
  noCollisionSpecification,
];

/** Throws the first rule violation found. */
export async function assertAllSatisfied(ctx: SpecContext): Promise<void> {
  for (const specification of CHAIN) {
    await specification(ctx);
  }
}

/** Same chain, as a predicate — used to filter candidates for the preview. */
export async function isSatisfied(ctx: SpecContext): Promise<boolean> {
  try {
    await assertAllSatisfied(ctx);
    return true;
  } catch (error) {
    if (error instanceof BusinessRuleError || error instanceof NotFoundError) {
      return false;
    }
    throw error;
  }
}
