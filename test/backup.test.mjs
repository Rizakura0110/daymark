import { describe, expect, it, vi } from "vitest";
import { buildDaymarkBackupImportPlan, DaymarkBackupService, DaymarkError } from "../src/server.ts";

const timestamp = "2026-09-01T00:00:00.000Z";

const habit = (overrides = {}) => ({
  id: "habit-check",
  name: "水を飲む",
  kind: "check",
  createdOn: "2026-09-01",
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const version = (overrides = {}) => ({
  id: "version-check",
  habitId: "habit-check",
  effectiveFrom: "2026-09-01",
  kind: "check",
  status: "active",
  targetMilli: null,
  unit: null,
  comparison: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const record = (overrides = {}) => ({
  id: "record-check",
  habitId: "habit-check",
  recordDate: "2026-09-01",
  kind: "check",
  checked: true,
  valueMilli: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const backup = (overrides = {}) => ({
  product: "daymark",
  schemaVersion: 1,
  exportedAt: timestamp,
  habits: [habit()],
  habitVersions: [version()],
  records: [record()],
  ...overrides,
});

const emptySnapshot = () => ({ habits: [], habitVersions: [], records: [] });

describe("Daymark backup merge plan", () => {
  it("imports a new snapshot and becomes an idempotent no-op", () => {
    const imported = buildDaymarkBackupImportPlan(emptySnapshot(), backup(), () => "unused");
    expect(imported.habits).toEqual([habit()]);
    expect(imported.habitVersions).toEqual([version()]);
    expect(imported.records).toEqual([record()]);
    expect(imported.summary).toEqual({
      source: {
        schemaVersion: 1,
        exportedAt: timestamp,
        habits: 1,
        habitVersions: 1,
        records: 1,
      },
      changes: {
        habitsCreated: 1,
        habitsMatched: 0,
        habitIdsRemapped: 0,
        habitVersionsCreated: 1,
        habitVersionsMatched: 0,
        habitVersionsSkipped: 0,
        habitVersionIdsRemapped: 0,
        recordsCreated: 1,
        recordsMatched: 0,
        recordsSkipped: 0,
        recordIdsRemapped: 0,
      },
      hasChanges: true,
    });

    const current = {
      habits: imported.habits,
      habitVersions: imported.habitVersions,
      records: imported.records,
    };
    const repeated = buildDaymarkBackupImportPlan(current, backup(), () => "unused");
    expect(repeated.habits).toEqual([]);
    expect(repeated.habitVersions).toEqual([]);
    expect(repeated.records).toEqual([]);
    expect(repeated.summary.changes).toMatchObject({
      habitsMatched: 1,
      habitVersionsMatched: 1,
      recordsMatched: 1,
    });
    expect(repeated.summary.hasChanges).toBe(false);
  });

  it("remaps occupied IDs and recognizes the remapped habit by its stable fingerprint", () => {
    const current = {
      habits: [
        habit({
          name: "衝突する別習慣",
          kind: "number",
          createdOn: "2026-08-01",
        }),
        habit({ id: "habit-imported" }),
      ],
      habitVersions: [
        version({ id: "version-check", habitId: "habit-imported", status: "paused" }),
        version({
          id: "version-next",
          habitId: "habit-check",
          effectiveFrom: "2026-08-01",
          kind: "number",
          targetMilli: 1_000,
          unit: "回",
          comparison: "at_least",
        }),
      ],
      records: [
        record({ id: "record-check", habitId: "habit-imported", checked: false }),
        record({
          id: "record-next",
          habitId: "habit-check",
          recordDate: "2026-08-01",
          kind: "number",
          checked: null,
          valueMilli: 1_000,
        }),
      ],
    };
    const source = backup({
      habitVersions: [
        version(),
        version({ id: "version-next", effectiveFrom: "2026-09-02", status: "paused" }),
      ],
      records: [record(), record({ id: "record-next", recordDate: "2026-09-02", checked: false })],
    });
    const generated = ["version-check", "version-remapped", "record-check", "record-remapped"];
    const plan = buildDaymarkBackupImportPlan(current, source, () => generated.shift() ?? "unused");

    expect(plan.habits).toEqual([]);
    expect(plan.habitVersions).toEqual([
      expect.objectContaining({ id: "version-remapped", habitId: "habit-imported" }),
    ]);
    expect(plan.records).toEqual([
      expect.objectContaining({ id: "record-remapped", habitId: "habit-imported" }),
    ]);
    expect(plan.summary.changes).toMatchObject({
      habitsMatched: 1,
      habitVersionsSkipped: 1,
      habitVersionsCreated: 1,
      habitVersionIdsRemapped: 1,
      recordsSkipped: 1,
      recordsCreated: 1,
      recordIdsRemapped: 1,
    });
  });

  it("remaps a genuinely colliding habit ID", () => {
    const current = {
      habits: [habit({ name: "別物", kind: "number", createdOn: "2026-08-01" })],
      habitVersions: [],
      records: [],
    };
    const generated = ["habit-check", "habit-remapped"];
    const plan = buildDaymarkBackupImportPlan(current, backup(), () => generated.shift() ?? "id");
    expect(plan.habits[0]).toMatchObject({ id: "habit-remapped", name: "水を飲む" });
    expect(plan.habitVersions[0]).toMatchObject({ habitId: "habit-remapped" });
    expect(plan.records[0]).toMatchObject({ habitId: "habit-remapped" });
    expect(plan.summary.changes.habitIdsRemapped).toBe(1);

    const ordered = buildDaymarkBackupImportPlan(
      emptySnapshot(),
      backup({
        habits: [habit({ id: "habit-z" }), habit({ id: "habit-a", name: "散歩" })],
        habitVersions: [],
        records: [],
      }),
      () => "unused",
    );
    expect(ordered.habits.map(({ id }) => id)).toEqual(["habit-a", "habit-z"]);
  });

  it("does not collapse two imported habits into one fingerprint match", () => {
    const currentHabit = habit({ id: "habit-z" });
    const source = backup({
      habits: [habit({ id: "habit-a" }), habit({ id: "habit-z" })],
      habitVersions: [
        version({ id: "version-a", habitId: "habit-a" }),
        version({ id: "version-z", habitId: "habit-z" }),
      ],
      records: [],
    });
    const plan = buildDaymarkBackupImportPlan(
      { habits: [currentHabit], habitVersions: [], records: [] },
      source,
      () => "unused",
    );

    expect(plan.habits).toEqual([habit({ id: "habit-a" })]);
    expect(plan.habitVersions.map(({ habitId }) => habitId)).toEqual(["habit-a", "habit-z"]);
    expect(plan.summary.changes).toMatchObject({ habitsCreated: 1, habitsMatched: 1 });
  });

  it("rejects impossible validated references and exhausted ID generation", () => {
    expect(() =>
      buildDaymarkBackupImportPlan(
        emptySnapshot(),
        backup({ habits: [], records: [] }),
        () => "unused",
      ),
    ).toThrow("version references a missing habit");
    expect(() =>
      buildDaymarkBackupImportPlan(
        emptySnapshot(),
        backup({ habits: [], habitVersions: [] }),
        () => "unused",
      ),
    ).toThrow("record references a missing habit");

    const current = {
      habits: [habit({ name: "別物", kind: "number", createdOn: "2026-08-01" })],
      habitVersions: [],
      records: [],
    };
    expect(() => buildDaymarkBackupImportPlan(current, backup(), () => "habit-check")).toThrow(
      "Could not allocate",
    );
  });
});

describe("DaymarkBackupService", () => {
  it("exports, previews, and atomically delegates an import plan", async () => {
    const repository = {
      loadSnapshot: vi
        .fn()
        .mockResolvedValueOnce({
          habits: [habit()],
          habitVersions: [version()],
          records: [record()],
        })
        .mockResolvedValueOnce(emptySnapshot())
        .mockResolvedValueOnce(emptySnapshot()),
      apply: vi.fn(async () => undefined),
    };
    const service = new DaymarkBackupService(
      repository,
      () => new Date(timestamp),
      () => "generated",
    );

    await expect(service.exportAll()).resolves.toEqual(backup());
    await expect(service.preview({ backup: backup() })).resolves.toMatchObject({
      result: "preview",
      summary: { hasChanges: true },
    });
    await expect(service.apply({ backup: backup() })).resolves.toMatchObject({
      result: "imported",
      summary: { hasChanges: true },
    });
    expect(repository.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        habits: [habit()],
        habitVersions: [version()],
        records: [record()],
      }),
    );
  });

  it("stops exports that are structurally invalid or larger than the importable file limit", async () => {
    const invalid = new DaymarkBackupService(
      {
        loadSnapshot: async () => ({ habits: [habit()], habitVersions: [], records: [] }),
        apply() {},
      },
      () => new Date(timestamp),
      () => "unused",
    );
    await expect(invalid.exportAll()).rejects.toBeInstanceOf(DaymarkError);

    const records = Array.from({ length: 20_000 }, (_, index) =>
      record({
        id: `record-${String(index).padStart(119, "0")}`,
        recordDate: new Date(Date.UTC(2000, 0, 1 + index)).toISOString().slice(0, 10),
      }),
    );
    const oversized = new DaymarkBackupService(
      {
        loadSnapshot: async () => ({
          habits: [habit({ createdOn: "2000-01-01" })],
          habitVersions: [version({ effectiveFrom: "2000-01-01" })],
          records,
        }),
        apply() {},
      },
      () => new Date(timestamp),
      () => "unused",
    );
    await expect(oversized.exportAll()).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("4MB"),
    });
  });
});
