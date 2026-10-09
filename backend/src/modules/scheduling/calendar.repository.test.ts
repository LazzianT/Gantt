import { describe, expect, it, vi } from "vitest";
import { loadCalendar, type Exec } from "./calendar.repository.js";

function fakeExec(sqls: string[]): Exec {
  return (async (sql: string) => {
    sqls.push(sql);
    if (sql.includes("work_calendars")) return [{ calendar_id: 3 }];
    if (sql.includes("calendar_working_days")) {
      return [
        { day_of_week: 1, is_working: true, hours_per_day: 8 },
        { day_of_week: 2, is_working: true, hours_per_day: 8 },
        { day_of_week: 0, is_working: false, hours_per_day: 8 },
      ];
    }
    if (sql.includes("calendar_exceptions")) return [{ exception_date: "2026-01-01", is_working: false }];
    return [];
  }) as Exec;
}

describe("calendar.repository.loadCalendar", () => {
  it("falls back to the is_default=1 calendar when calendarId is absent", async () => {
    const sqls: string[] = [];
    const cal = await loadCalendar(fakeExec(sqls), null);

    expect(sqls[0]).toContain("is_default = 1");
    expect(cal.id).toBe(3);
    expect(cal.workingWeekdays).toEqual([1, 2]);
    expect(cal.hoursPerDay).toBe(8);
    expect(cal.exceptions).toEqual([{ date: new Date(Date.UTC(2026, 0, 1)), working: false }]);
  });

  it("resolves an explicit calendarId", async () => {
    const sqls: string[] = [];
    await loadCalendar(fakeExec(sqls), 9);
    expect(sqls[0]).toContain("calendar_id = @calendarId");
  });

  it("throws 404 when no calendar row is found", async () => {
    const exec = (async () => []) as Exec;
    await expect(loadCalendar(exec, 9)).rejects.toMatchObject({ status: 404 });
  });
});
