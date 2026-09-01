import { describe, expect, it } from "vitest";
import {
  createHabitRequestSchema,
  daymarkBackupImportRequestSchema,
  daymarkBackupSnapshotSchema,
  daymarkDateQuerySchema,
  daymarkMonthQuerySchema,
  daymarkNumericValueSchema,
  habitConfigurationSchema,
  putHabitRecordRequestSchema,
  weekResponseSchema,
} from "../src/contracts.ts";

const backupTimestamp = "2026-09-01T00:00:00.000Z";

const backupFixture = () => ({
  product: "daymark",
  schemaVersion: 1,
  exportedAt: backupTimestamp,
  habits: [
    {
      id: "habit-check",
      name: "水を飲む",
      kind: "check",
      createdOn: "2026-09-01",
      createdAt: backupTimestamp,
      updatedAt: backupTimestamp,
    },
    {
      id: "habit-number",
      name: "歩く",
      kind: "number",
      createdOn: "2026-09-01",
      createdAt: backupTimestamp,
      updatedAt: backupTimestamp,
    },
  ],
  habitVersions: [
    {
      id: "version-check",
      habitId: "habit-check",
      effectiveFrom: "2026-09-01",
      kind: "check",
      status: "active",
      targetMilli: null,
      unit: null,
      comparison: null,
      createdAt: backupTimestamp,
      updatedAt: backupTimestamp,
    },
    {
      id: "version-number",
      habitId: "habit-number",
      effectiveFrom: "2026-09-01",
      kind: "number",
      status: "active",
      targetMilli: 8_000_000,
      unit: "歩",
      comparison: "at_least",
      createdAt: backupTimestamp,
      updatedAt: backupTimestamp,
    },
  ],
  records: [
    {
      id: "record-check",
      habitId: "habit-check",
      recordDate: "2026-09-01",
      kind: "check",
      checked: true,
      valueMilli: null,
      createdAt: backupTimestamp,
      updatedAt: backupTimestamp,
    },
    {
      id: "record-number",
      habitId: "habit-number",
      recordDate: "2026-09-01",
      kind: "number",
      checked: null,
      valueMilli: 9_000_000,
      createdAt: backupTimestamp,
      updatedAt: backupTimestamp,
    },
  ],
});

describe("Daymark contracts", () => {
  it("normalizes check and numeric habit requests", () => {
    expect(createHabitRequestSchema.parse({ name: "  朝のストレッチ  ", kind: "check" })).toEqual({
      name: "朝のストレッチ",
      kind: "check",
    });
    expect(
      createHabitRequestSchema.parse({
        name: "  歩く  ",
        kind: "number",
        target: 8_000,
        unit: " 歩 ",
        comparison: "at_least",
      }),
    ).toEqual({
      name: "歩く",
      kind: "number",
      target: 8_000,
      unit: "歩",
      comparison: "at_least",
    });
  });

  it.each([-1, 1_000_000_001, Number.POSITIVE_INFINITY, 1.2345])(
    "rejects an unsupported numeric value %s",
    (value) => {
      expect(daymarkNumericValueSchema.safeParse(value).success).toBe(false);
    },
  );

  it("accepts exact thousandths and both record kinds", () => {
    expect(daymarkNumericValueSchema.parse(1.234)).toBe(1.234);
    expect(putHabitRecordRequestSchema.parse({ kind: "check", checked: false })).toEqual({
      kind: "check",
      checked: false,
    });
    expect(putHabitRecordRequestSchema.parse({ kind: "number", value: 0 })).toEqual({
      kind: "number",
      value: 0,
    });
  });

  it("requires real ISO dates, months, and strict fields", () => {
    expect(daymarkDateQuerySchema.parse({ date: "2026-09-01" })).toEqual({
      date: "2026-09-01",
    });
    expect(daymarkDateQuerySchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
    expect(daymarkMonthQuerySchema.parse({ month: "2026-09" })).toEqual({ month: "2026-09" });
    expect(daymarkMonthQuerySchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(
      createHabitRequestSchema.safeParse({ name: "読む", kind: "check", target: 1 }).success,
    ).toBe(false);
  });

  it("keeps effective configurations kind-specific", () => {
    expect(
      habitConfigurationSchema.parse({
        kind: "number",
        status: "paused",
        effectiveFrom: "2026-09-02",
        target: 1,
        unit: "回",
        comparison: "at_most",
      }),
    ).toEqual({
      kind: "number",
      status: "paused",
      effectiveFrom: "2026-09-02",
      target: 1,
      unit: "回",
      comparison: "at_most",
    });
    expect(
      habitConfigurationSchema.safeParse({
        kind: "check",
        status: "active",
        effectiveFrom: "2026-09-01",
        target: 1,
      }).success,
    ).toBe(false);
  });

  it("validates a seven-day aggregation shape", () => {
    const day = {
      date: "2026-08-24",
      complete: 0,
      incomplete: 0,
      unentered: 0,
      due: 0,
      rate: null,
    };
    expect(
      weekResponseSchema.safeParse({
        start: "2026-08-24",
        end: "2026-08-30",
        days: Array.from({ length: 7 }, (_, index) => ({
          ...day,
          date: `2026-08-${24 + index}`,
        })),
        habits: [],
        summary: {
          complete: 0,
          incomplete: 0,
          unentered: 0,
          due: 0,
          rate: null,
          perfectDays: 0,
        },
      }).success,
    ).toBe(true);
    expect(
      weekResponseSchema.safeParse({
        start: "2026-08-24",
        end: "2026-08-30",
        days: [day],
        habits: [],
        summary: {
          complete: 0,
          incomplete: 0,
          unentered: 0,
          due: 0,
          rate: null,
          perfectDays: 0,
        },
      }).success,
    ).toBe(false);
  });

  it("allows a habit row to start partway through a week", () => {
    const dailyHabit = {
      habitId: "habit-new",
      name: "散歩",
      date: "2026-08-28",
      configuration: {
        kind: "check",
        status: "active",
        effectiveFrom: "2026-08-28",
      },
      record: null,
      state: "unentered",
    };
    const days = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-08-${24 + index}`,
      complete: 0,
      incomplete: 0,
      unentered: index >= 4 ? 1 : 0,
      due: index >= 4 ? 1 : 0,
      rate: index >= 4 ? 0 : null,
    }));

    expect(
      weekResponseSchema.safeParse({
        start: "2026-08-24",
        end: "2026-08-30",
        days,
        habits: [
          {
            habitId: "habit-new",
            name: "散歩",
            days: [dailyHabit],
            summary: { complete: 0, due: 1, rate: 0 },
          },
        ],
        summary: {
          complete: 0,
          incomplete: 0,
          unentered: 3,
          due: 3,
          rate: 0,
          perfectDays: 0,
        },
      }).success,
    ).toBe(true);
  });

  it("validates a product-specific Daymark backup with referential integrity", () => {
    const backup = backupFixture();
    expect(daymarkBackupSnapshotSchema.parse(backup)).toEqual(backup);
    expect(daymarkBackupImportRequestSchema.parse({ backup })).toEqual({ backup });
    expect(
      daymarkBackupSnapshotSchema.safeParse({ ...backup, product: "tech-inbox" }).success,
    ).toBe(false);
  });

  it.each([
    ["duplicate habit IDs", (backup) => backup.habits.push({ ...backup.habits[0] })],
    [
      "duplicate version IDs",
      (backup) =>
        backup.habitVersions.push({
          ...backup.habitVersions[0],
          habitId: "habit-number",
          effectiveFrom: "2026-09-02",
          kind: "number",
          targetMilli: 1_000,
          unit: "歩",
          comparison: "at_least",
        }),
    ],
    [
      "duplicate record IDs",
      (backup) =>
        backup.records.push({
          ...backup.records[0],
          habitId: "habit-number",
          recordDate: "2026-09-02",
          kind: "number",
          checked: null,
          valueMilli: 1_000,
        }),
    ],
    [
      "duplicate habit version dates",
      (backup) =>
        backup.habitVersions.push({
          ...backup.habitVersions[0],
          id: "version-duplicate-date",
        }),
    ],
    [
      "duplicate record dates",
      (backup) => backup.records.push({ ...backup.records[0], id: "record-duplicate-date" }),
    ],
    ["missing version habit", (backup) => (backup.habitVersions[0].habitId = "missing")],
    ["mismatched version kind", (backup) => (backup.habitVersions[0].habitId = "habit-number")],
    ["version before habit", (backup) => (backup.habitVersions[0].effectiveFrom = "2026-08-31")],
    ["missing initial version", (backup) => (backup.habitVersions[0].effectiveFrom = "2026-09-02")],
    ["missing record habit", (backup) => (backup.records[0].habitId = "missing")],
    ["mismatched record kind", (backup) => (backup.records[0].habitId = "habit-number")],
    ["record before habit", (backup) => (backup.records[0].recordDate = "2026-08-31")],
  ])("rejects backup integrity failure: %s", (_label, mutate) => {
    const backup = backupFixture();
    mutate(backup);
    expect(daymarkBackupSnapshotSchema.safeParse(backup).success).toBe(false);
  });
});
