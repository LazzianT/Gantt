import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql");

const EXPECTED_ORDER = [
  "001_schema_and_app_users.sql",
  "002_calendars.sql",
  "003_projects.sql",
  "004_project_resources.sql",
  "005_project_tasks.sql",
  "006_task_dependencies.sql",
  "007_task_resources.sql",
  "008_milestones.sql",
  "009_baselines.sql",
  "010_progress.sql",
  "011_activity_logs.sql",
  "012_indexes.sql",
  "013_seed_default_calendar.sql",
  "014_project_task_pic.sql",
] as const;

function migrationFiles(): string[] {
  return fs
    .readdirSync(sqlDir)
    .filter((file) => file.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

describe("sql migrations", () => {
  it("has exactly the 14 documented migrations", () => {
    expect(migrationFiles()).toEqual([...EXPECTED_ORDER]);
  });

  it("has unique, ordered filenames", () => {
    const files = migrationFiles();
    expect(new Set(files).size).toBe(files.length);
    expect(files).toEqual([...files].sort((a, b) => a.localeCompare(b, "en")));
    files.forEach((file, index) => {
      expect(file.startsWith(String(index + 1).padStart(3, "0"))).toBe(true);
    });
  });

  it.each(EXPECTED_ORDER)("%s is non-empty and defines or seeds objects", (file) => {
    const content = fs.readFileSync(path.join(sqlDir, file), "utf8");
    expect(content.trim().length).toBeGreaterThan(0);
    expect(content).toMatch(/CREATE|INSERT|ALTER/i);
  });

  it("reserves seed for the default calendar only", () => {
    const seeds = EXPECTED_ORDER.filter((file) =>
      /INSERT\s+INTO\s+pm\.work_calendars/i.test(fs.readFileSync(path.join(sqlDir, file), "utf8")),
    );
    expect(seeds).toEqual(["013_seed_default_calendar.sql"]);
  });
});
