import {
  DAYMARK_BACKUP_IMPORT_RECORD_BATCH_SIZE,
  type DaymarkBackupImportSummary,
  type DaymarkBackupSnapshot,
} from "./contracts.js";

const recordChangeKeys = [
  "recordsCreated",
  "recordsMatched",
  "recordsSkipped",
  "recordIdsRemapped",
] as const;

export function splitDaymarkBackupImport(
  backup: DaymarkBackupSnapshot,
): readonly DaymarkBackupSnapshot[] {
  const batches: DaymarkBackupSnapshot[] = [{ ...backup, records: [] }];
  const createdOnByHabit = new Map(backup.habits.map(({ id, createdOn }) => [id, createdOn]));

  for (
    let offset = 0;
    offset < backup.records.length;
    offset += DAYMARK_BACKUP_IMPORT_RECORD_BATCH_SIZE
  ) {
    const records = backup.records.slice(offset, offset + DAYMARK_BACKUP_IMPORT_RECORD_BATCH_SIZE);
    const habitIds = new Set(records.map(({ habitId }) => habitId));
    batches.push({
      ...backup,
      habits: backup.habits.filter(({ id }) => habitIds.has(id)),
      habitVersions: backup.habitVersions.filter(
        ({ habitId, effectiveFrom }) =>
          habitIds.has(habitId) && effectiveFrom === createdOnByHabit.get(habitId),
      ),
      records,
    });
  }

  return batches;
}

export function mergeDaymarkBackupImportSummaries(
  backup: DaymarkBackupSnapshot,
  summaries: readonly DaymarkBackupImportSummary[],
): DaymarkBackupImportSummary {
  const metadata = summaries[0];
  if (metadata === undefined) throw new Error("A Daymark restore requires a metadata batch.");

  const changes = { ...metadata.changes };
  for (const key of recordChangeKeys) {
    changes[key] = summaries.slice(1).reduce((total, summary) => total + summary.changes[key], 0);
  }

  return {
    source: {
      schemaVersion: backup.schemaVersion,
      exportedAt: backup.exportedAt,
      habits: backup.habits.length,
      habitVersions: backup.habitVersions.length,
      records: backup.records.length,
    },
    changes,
    hasChanges: summaries.some(({ hasChanges }) => hasChanges),
  };
}
