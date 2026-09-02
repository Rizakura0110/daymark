import { describe, expect, it } from "vitest";
import { mergeDaymarkBackupImportSummaries, splitDaymarkBackupImport } from "../src/backup.ts";
import {
  DAYMARK_BACKUP_IMPORT_RECORD_BATCH_SIZE,
  daymarkBackupImportRequestSchema,
} from "../src/contracts.ts";

const timestamp = "2026-09-01T00:00:00.000Z";

const backup = (recordCount = DAYMARK_BACKUP_IMPORT_RECORD_BATCH_SIZE + 1) => ({
  product: "daymark",
  schemaVersion: 1,
  exportedAt: timestamp,
  habits: [
    {
      id: "habit-check",
      name: "水を飲む",
      kind: "check",
      createdOn: "2026-09-01",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "habit-unused",
      name: "運動",
      kind: "check",
      createdOn: "2026-09-01",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  habitVersions: [
    {
      id: "version-check-initial",
      habitId: "habit-check",
      effectiveFrom: "2026-09-01",
      kind: "check",
      status: "active",
      targetMilli: null,
      unit: null,
      comparison: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "version-check-later",
      habitId: "habit-check",
      effectiveFrom: "2026-09-02",
      kind: "check",
      status: "paused",
      targetMilli: null,
      unit: null,
      comparison: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "version-unused-initial",
      habitId: "habit-unused",
      effectiveFrom: "2026-09-01",
      kind: "check",
      status: "active",
      targetMilli: null,
      unit: null,
      comparison: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  records: Array.from({ length: recordCount }, (_, index) => ({
    id: `record-${index}`,
    habitId: "habit-check",
    recordDate: new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10),
    kind: "check",
    checked: true,
    valueMilli: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })),
});

const changes = (overrides = {}) => ({
  habitsCreated: 0,
  habitsMatched: 0,
  habitIdsRemapped: 0,
  habitVersionsCreated: 0,
  habitVersionsMatched: 0,
  habitVersionsSkipped: 0,
  habitVersionIdsRemapped: 0,
  recordsCreated: 0,
  recordsMatched: 0,
  recordsSkipped: 0,
  recordIdsRemapped: 0,
  ...overrides,
});

const summary = (overrides, hasChanges = true) => ({
  source: { schemaVersion: 1, exportedAt: timestamp, habits: 1, habitVersions: 1, records: 0 },
  changes: changes(overrides),
  hasChanges,
});

describe("Daymark backup request batches", () => {
  it("keeps metadata together and emits independently valid bounded record batches", () => {
    const source = backup();
    const batches = splitDaymarkBackupImport(source);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toEqual({ ...source, records: [] });
    expect(batches[1]?.records).toHaveLength(DAYMARK_BACKUP_IMPORT_RECORD_BATCH_SIZE);
    expect(batches[2]?.records).toHaveLength(1);
    expect(batches[1]?.habits.map(({ id }) => id)).toEqual(["habit-check"]);
    expect(batches[1]?.habitVersions.map(({ id }) => id)).toEqual(["version-check-initial"]);
    expect(
      batches.every(
        (batch) => daymarkBackupImportRequestSchema.safeParse({ backup: batch }).success,
      ),
    ).toBe(true);
  });

  it("uses one metadata batch when the backup has no records", () => {
    const source = backup(0);
    expect(splitDaymarkBackupImport(source)).toEqual([source]);
  });

  it("merges metadata once and record outcomes from every record batch", () => {
    const source = backup();
    const merged = mergeDaymarkBackupImportSummaries(source, [
      summary({ habitsCreated: 2, habitVersionsCreated: 3 }),
      summary({ habitsCreated: 1, recordsCreated: 399, recordsSkipped: 1 }),
      summary({ habitsMatched: 1, recordsMatched: 1, recordIdsRemapped: 1 }, false),
    ]);

    expect(merged).toEqual({
      source: {
        schemaVersion: 1,
        exportedAt: timestamp,
        habits: 2,
        habitVersions: 3,
        records: DAYMARK_BACKUP_IMPORT_RECORD_BATCH_SIZE + 1,
      },
      changes: changes({
        habitsCreated: 2,
        habitVersionsCreated: 3,
        recordsCreated: 399,
        recordsMatched: 1,
        recordsSkipped: 1,
        recordIdsRemapped: 1,
      }),
      hasChanges: true,
    });
  });

  it("requires a metadata result before summaries can be merged", () => {
    expect(() => mergeDaymarkBackupImportSummaries(backup(0), [])).toThrow("metadata batch");
  });
});
