import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  isWorkingDay,
  nextWorkingDay,
  normalizeDate,
  prevWorkingDay,
  workingDayIndex,
  workingDayIndexInverse,
  workingDaysBetween,
  type CalendarException,
  type WorkingCalendar,
} from "./calendar.js";

function d(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cal(exceptions: CalendarException[] = []): WorkingCalendar {
  return { id: 1, workingWeekdays: [1, 2, 3, 4, 5], hoursPerDay: 8, exceptions };
}

// 2024-01-01 is a Monday.
const MON = "2024-01-01";
const FRI = "2024-01-05";
const SAT = "2024-01-06";
const SUN = "2024-01-07";
const MON2 = "2024-01-08";

describe("calendar", () => {
  it("normalizes to date-only UTC midnight", () => {
    const out = normalizeDate(new Date("2024-01-03T17:45:12.500Z"));
    expect(out.toISOString()).toBe("2024-01-03T00:00:00.000Z");
  });

  it("skips the weekend when moving Fri -> Mon and back", () => {
    expect(fmt(nextWorkingDay(cal(), d(FRI)))).toBe(MON2);
    expect(fmt(prevWorkingDay(cal(), d(MON2)))).toBe(FRI);
    expect(isWorkingDay(cal(), d(SAT))).toBe(false);
    expect(isWorkingDay(cal(), d(SUN))).toBe(false);
  });

  it("blocks a weekday with a holiday exception", () => {
    const c = cal([{ date: d("2024-01-03"), working: false }]);
    expect(isWorkingDay(c, d("2024-01-03"))).toBe(false);
    expect(workingDaysBetween(c, d(MON), d(FRI))).toBe(4);
    expect(fmt(addWorkingDays(c, d(MON), 2))).toBe("2024-01-04");
    expect(fmt(nextWorkingDay(c, d("2024-01-02")))).toBe("2024-01-04");
  });

  it("allows an extra-working Saturday exception", () => {
    const c = cal([{ date: d(SAT), working: true }]);
    expect(isWorkingDay(c, d(SAT))).toBe(true);
    expect(fmt(addWorkingDays(c, d(FRI), 1))).toBe(SAT);
    expect(workingDaysBetween(c, d(MON), d(SAT))).toBe(6);
  });

  it("moves backwards with negative n", () => {
    expect(fmt(addWorkingDays(cal(), d(MON2), -1))).toBe(FRI);
    expect(fmt(addWorkingDays(cal(), d(MON2), -5))).toBe(MON);
  });

  it("snaps forward to the next working day when n = 0", () => {
    expect(fmt(addWorkingDays(cal(), d(SAT), 0))).toBe(MON2);
    expect(fmt(addWorkingDays(cal(), d(SUN), 0))).toBe(MON2);
    expect(fmt(addWorkingDays(cal(), d(MON), 0))).toBe(MON);
  });

  it("counts inclusive working days", () => {
    expect(workingDaysBetween(cal(), d(MON), d(MON))).toBe(1);
    expect(workingDaysBetween(cal(), d(SAT), d(SUN))).toBe(0);
    expect(workingDaysBetween(cal(), d(FRI), d(MON))).toBe(-5);
  });

  it("returns negative counts and indexes before the project start", () => {
    const c = cal();
    // Fri -> Mon is the negation of Mon -> Fri (5 working days).
    expect(workingDaysBetween(c, d(FRI), d(MON))).toBe(-workingDaysBetween(c, d(MON), d(FRI)));
    expect(workingDaysBetween(c, d(MON2), d(MON))).toBe(-6);
    expect(workingDayIndex(c, d(MON), d("2023-12-29"))).toBe(-1);
    expect(workingDayIndex(c, d(MON), d("2023-12-28"))).toBe(-2);
    expect(fmt(workingDayIndexInverse(c, d(MON), -1))).toBe("2023-12-29");
  });

  it("round-trips index/inverse on working days", () => {
    const c = cal();
    const start = d(MON);
    expect(fmt(workingDayIndexInverse(c, start, 0))).toBe(MON);
    for (let i = 0; i < 10; i++) {
      const date = workingDayIndexInverse(c, start, i);
      expect(isWorkingDay(c, date)).toBe(true);
      expect(workingDayIndex(c, start, date)).toBe(i);
    }
  });

  it("crosses a month boundary and a weekend", () => {
    const c = cal();
    const jan29 = d("2024-01-29");
    expect(fmt(addWorkingDays(c, jan29, 4))).toBe("2024-02-02");
    expect(fmt(addWorkingDays(c, jan29, 5))).toBe("2024-02-05");
    expect(workingDaysBetween(c, jan29, d("2024-02-02"))).toBe(5);
    expect(workingDayIndex(c, jan29, d("2024-02-02"))).toBe(4);
  });
});
