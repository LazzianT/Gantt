import { describe, expect, it } from "vitest";
import type { WorkingCalendar } from "../scheduling/calendar.js";
import {
  OVERALLOCATED_THRESHOLD,
  UNDERALLOCATED_THRESHOLD,
  aggregateCrossProject,
  computeWorkload,
  type WorkloadAssignment,
} from "./workload.service.js";

const calendar: WorkingCalendar = {
  id: 1,
  workingWeekdays: [1, 2, 3, 4, 5],
  hoursPerDay: 8,
  exceptions: [],
};

function assignment(overrides: Partial<WorkloadAssignment> = {}): WorkloadAssignment {
  return {
    employee_nip: "12345",
    resource_id: 1,
    allocation_percent: 100,
    start_date: "2026-01-05",
    finish_date: "2026-01-05",
    ...overrides,
  };
}

describe("computeWorkload", () => {
  it("classifies a single full-day allocation as Balanced", () => {
    const result = computeWorkload({ assignments: [assignment()], calendar, from: "2026-01-05", to: "2026-01-05" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      date: "2026-01-05",
      hours: 8,
      capacity: 8,
      utilization: 1,
      classification: "Balanced",
    });
    expect(result.summary[0]).toMatchObject({
      employee_nip: "12345",
      days: 1,
      hours: 8,
      capacity: 8,
      classification: "Balanced",
      balancedDays: 1,
      underallocatedDays: 0,
      overallocatedDays: 0,
    });
  });

  it("classifies two overlapping 100% tasks as Overallocated", () => {
    const result = computeWorkload({
      assignments: [assignment(), assignment({ resource_id: 2 })],
      calendar,
      from: "2026-01-05",
      to: "2026-01-05",
    });
    expect(result.rows[0]).toMatchObject({ hours: 16, capacity: 8, utilization: 2, classification: "Overallocated" });
    expect(result.summary[0].overallocatedDays).toBe(1);
  });

  it("classifies a 50% allocation as Underallocated", () => {
    const result = computeWorkload({
      assignments: [assignment({ allocation_percent: 50 })],
      calendar,
      from: "2026-01-05",
      to: "2026-01-05",
    });
    expect(result.rows[0]).toMatchObject({ hours: 4, utilization: 0.5, classification: "Underallocated" });
  });

  it("treats utilization exactly at the 0.8 boundary as Balanced", () => {
    const result = computeWorkload({
      assignments: [assignment({ allocation_percent: 80 })],
      calendar,
      from: "2026-01-05",
      to: "2026-01-05",
    });
    expect(result.rows[0].utilization).toBeCloseTo(0.8);
    expect(result.rows[0].classification).toBe("Balanced");
    expect(UNDERALLOCATED_THRESHOLD).toBe(0.8);
    expect(OVERALLOCATED_THRESHOLD).toBe(1.0);
  });

  it("skips weekend days", () => {
    const result = computeWorkload({
      assignments: [assignment({ finish_date: "2026-01-12" })],
      calendar,
      from: "2026-01-09",
      to: "2026-01-12",
    });
    expect(result.rows.map((r) => r.date)).toEqual(["2026-01-09", "2026-01-12"]);
  });

  it("applies capacityByResource max_units to the daily capacity", () => {
    const result = computeWorkload({
      assignments: [assignment()],
      calendar,
      from: "2026-01-05",
      to: "2026-01-05",
      capacityByResource: { "12345": 2 },
    });
    expect(result.rows[0]).toMatchObject({ capacity: 16, utilization: 0.5, classification: "Underallocated" });
  });
});

describe("aggregateCrossProject", () => {
  it("sums hours and keeps peak capacity per employee per day", () => {
    const projectA = computeWorkload({
      assignments: [assignment({ project_id: 1 })],
      calendar,
      from: "2026-01-05",
      to: "2026-01-05",
    });
    const projectB = computeWorkload({
      assignments: [assignment({ resource_id: 2, project_id: 2 })],
      calendar,
      from: "2026-01-05",
      to: "2026-01-05",
    });

    const merged = aggregateCrossProject([...projectA.rows, ...projectB.rows]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      employee_nip: "12345",
      date: "2026-01-05",
      hours: 16,
      capacity: 8,
      utilization: 2,
      classification: "Overallocated",
    });
  });
});
