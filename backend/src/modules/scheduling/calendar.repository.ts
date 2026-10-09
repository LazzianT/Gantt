import { NotFoundError } from "../../middleware/error.js";
import { normalizeDate, type CalendarException, type WorkingCalendar } from "./calendar.js";

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface CalendarRow {
  calendar_id: number;
  hours_per_day: number | null;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return normalizeDate(value);
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// One project-level calendar: resolve calendarId, else the is_default=1 row.
export async function loadCalendar(exec: Exec, calendarId?: number | null): Promise<WorkingCalendar> {
  const rows =
    calendarId == null
      ? await exec(`SELECT calendar_id FROM pm.work_calendars WHERE is_default = 1`)
      : await exec(`SELECT calendar_id FROM pm.work_calendars WHERE calendar_id = @calendarId`, { calendarId });
  const id = rows[0]?.calendar_id;
  if (id == null) throw new NotFoundError("Calendar not found");

  const days = await exec(
    `SELECT day_of_week, is_working, hours_per_day FROM pm.calendar_working_days WHERE calendar_id = @id`,
    { id },
  );
  const exceptionRows = await exec(
    `SELECT exception_date, is_working FROM pm.calendar_exceptions WHERE calendar_id = @id`,
    { id },
  );

  const workingWeekdays = days.filter((r) => Boolean(r.is_working)).map((r) => Number(r.day_of_week));
  const hoursPerDay = days.length > 0 ? Number(days[0].hours_per_day ?? 8) : 8;
  const exceptions: CalendarException[] = exceptionRows.map((r) => ({
    date: toDate(r.exception_date),
    working: Boolean(r.is_working),
  }));

  return { id: Number(id), workingWeekdays, hoursPerDay, exceptions };
}
