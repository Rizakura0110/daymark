import { z } from "zod";

export const DAYMARK_PRODUCT = "daymark";
export const DAYMARK_TIME_ZONE = "Asia/Tokyo";
export const DAYMARK_HABIT_KINDS = ["check", "number"] as const;
export const DAYMARK_HABIT_STATUSES = ["active", "paused", "archived"] as const;
export const DAYMARK_COMPARISONS = ["at_least", "at_most"] as const;
export const DAYMARK_RECORD_STATES = ["complete", "incomplete", "unentered", "excluded"] as const;
export const DAYMARK_LIMITS = {
  habitName: 80,
  unit: 20,
  id: 128,
  numericValue: 1_000_000_000,
  decimalPlaces: 3,
} as const;

const scaledInteger = (value: number) => Number.isInteger(value * 1_000);

export const daymarkIdSchema = z.string().trim().min(1).max(DAYMARK_LIMITS.id);
export const daymarkDateSchema = z.iso.date();
export const daymarkMonthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u, "Month must use YYYY-MM");
export const habitNameSchema = z.string().trim().min(1).max(DAYMARK_LIMITS.habitName);
export const habitKindSchema = z.enum(DAYMARK_HABIT_KINDS);
export const habitStatusSchema = z.enum(DAYMARK_HABIT_STATUSES);
export const comparisonSchema = z.enum(DAYMARK_COMPARISONS);
export const daymarkNumericValueSchema = z
  .number()
  .finite()
  .min(0)
  .max(DAYMARK_LIMITS.numericValue)
  .refine(scaledInteger, `Values support up to ${DAYMARK_LIMITS.decimalPlaces} decimal places`);
export const daymarkUnitSchema = z.string().trim().min(1).max(DAYMARK_LIMITS.unit);

const checkConfigurationFields = {
  kind: z.literal("check"),
  status: habitStatusSchema,
} as const;
const numberConfigurationFields = {
  kind: z.literal("number"),
  status: habitStatusSchema,
  target: daymarkNumericValueSchema,
  unit: daymarkUnitSchema,
  comparison: comparisonSchema,
} as const;

export const habitConfigurationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...checkConfigurationFields,
    effectiveFrom: daymarkDateSchema,
  }),
  z.strictObject({
    ...numberConfigurationFields,
    effectiveFrom: daymarkDateSchema,
  }),
]);
export type HabitConfigurationDto = z.output<typeof habitConfigurationSchema>;

export const habitDtoSchema = z.strictObject({
  id: daymarkIdSchema,
  name: habitNameSchema,
  createdOn: daymarkDateSchema,
  configuration: habitConfigurationSchema,
  createdAt: z.iso.datetime({ offset: false, local: false }),
  updatedAt: z.iso.datetime({ offset: false, local: false }),
});
export type HabitDto = z.output<typeof habitDtoSchema>;

export const createHabitRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ name: habitNameSchema, kind: z.literal("check") }),
  z.strictObject({
    name: habitNameSchema,
    kind: z.literal("number"),
    target: daymarkNumericValueSchema,
    unit: daymarkUnitSchema,
    comparison: comparisonSchema,
  }),
]);
export type CreateHabitRequest = z.output<typeof createHabitRequestSchema>;

export const renameHabitRequestSchema = z.strictObject({ name: habitNameSchema });
export type RenameHabitRequest = z.output<typeof renameHabitRequestSchema>;

export const putHabitConfigurationRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject(checkConfigurationFields),
  z.strictObject(numberConfigurationFields),
]);
export type PutHabitConfigurationRequest = z.output<typeof putHabitConfigurationRequestSchema>;

export const putHabitRecordRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("check"), checked: z.boolean() }),
  z.strictObject({ kind: z.literal("number"), value: daymarkNumericValueSchema }),
]);
export type PutHabitRecordRequest = z.output<typeof putHabitRecordRequestSchema>;

export const daymarkRecordDtoSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("check"), checked: z.boolean() }),
  z.strictObject({ kind: z.literal("number"), value: daymarkNumericValueSchema }),
]);
export type DaymarkRecordDto = z.output<typeof daymarkRecordDtoSchema>;

export const dailyHabitDtoSchema = z.strictObject({
  habitId: daymarkIdSchema,
  name: habitNameSchema,
  date: daymarkDateSchema,
  configuration: habitConfigurationSchema,
  record: daymarkRecordDtoSchema.nullable(),
  state: z.enum(DAYMARK_RECORD_STATES),
});
export type DailyHabitDto = z.output<typeof dailyHabitDtoSchema>;

export const daySummarySchema = z.strictObject({
  date: daymarkDateSchema,
  complete: z.number().int().nonnegative(),
  incomplete: z.number().int().nonnegative(),
  unentered: z.number().int().nonnegative(),
  due: z.number().int().nonnegative(),
  rate: z.number().int().min(0).max(100).nullable(),
});
export type DaySummaryDto = z.output<typeof daySummarySchema>;

export const dayResponseSchema = z.strictObject({
  date: daymarkDateSchema,
  habits: z.array(dailyHabitDtoSchema),
  summary: daySummarySchema,
});
export type DayResponse = z.output<typeof dayResponseSchema>;

export const listHabitsResponseSchema = z.strictObject({ habits: z.array(habitDtoSchema) });
export type ListHabitsResponse = z.output<typeof listHabitsResponseSchema>;

export const habitResponseSchema = z.strictObject({ habit: habitDtoSchema });
export type HabitResponse = z.output<typeof habitResponseSchema>;

export const deleteHabitRecordResponseSchema = z.strictObject({ result: z.literal("deleted") });
export type DeleteHabitRecordResponse = z.output<typeof deleteHabitRecordResponseSchema>;

export const weekResponseSchema = z.strictObject({
  start: daymarkDateSchema,
  end: daymarkDateSchema,
  days: z.array(daySummarySchema).length(7),
  habits: z.array(
    z.strictObject({
      habitId: daymarkIdSchema,
      name: habitNameSchema,
      days: z.array(dailyHabitDtoSchema).min(1).max(7),
      summary: z.strictObject({
        complete: z.number().int().nonnegative(),
        due: z.number().int().nonnegative(),
        rate: z.number().int().min(0).max(100).nullable(),
      }),
    }),
  ),
  summary: z.strictObject({
    complete: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
    unentered: z.number().int().nonnegative(),
    due: z.number().int().nonnegative(),
    rate: z.number().int().min(0).max(100).nullable(),
    perfectDays: z.number().int().min(0).max(7),
  }),
});
export type WeekResponse = z.output<typeof weekResponseSchema>;

export const monthResponseSchema = z.strictObject({
  month: daymarkMonthSchema,
  days: z.array(daySummarySchema).min(28).max(31),
  summary: z.strictObject({
    complete: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
    unentered: z.number().int().nonnegative(),
    due: z.number().int().nonnegative(),
    rate: z.number().int().min(0).max(100).nullable(),
    perfectDays: z.number().int().min(0).max(31),
  }),
});
export type MonthResponse = z.output<typeof monthResponseSchema>;

export const daymarkDateQuerySchema = z.strictObject({ date: daymarkDateSchema });
export const daymarkWeekQuerySchema = z.strictObject({ start: daymarkDateSchema });
export const daymarkMonthQuerySchema = z.strictObject({ month: daymarkMonthSchema });
export const daymarkHabitParamsSchema = z.strictObject({ id: daymarkIdSchema });
export const daymarkHabitDateParamsSchema = z.strictObject({
  id: daymarkIdSchema,
  date: daymarkDateSchema,
});

export type DaymarkConnectionStatus = {
  readonly product: typeof DAYMARK_PRODUCT;
  readonly status: "ready";
  readonly timeZone: typeof DAYMARK_TIME_ZONE;
};

export const DAYMARK_BACKUP_PRODUCT = "daymark";
export const DAYMARK_BACKUP_SCHEMA_VERSION = 1;
export const MAX_DAYMARK_BACKUP_FILE_BYTES = 4 * 1_024 * 1_024;
export const MAX_DAYMARK_BACKUP_IMPORT_BYTES = MAX_DAYMARK_BACKUP_FILE_BYTES + 1_024;
export const DAYMARK_BACKUP_LIMITS = {
  habits: 200,
  habitVersions: 2_000,
  records: 20_000,
} as const;

const utcDateTimeSchema = z.iso.datetime({ offset: false, local: false });
const milliValueSchema = z
  .number()
  .int()
  .min(0)
  .max(DAYMARK_LIMITS.numericValue * 1_000);

export const daymarkBackupHabitSchema = z.strictObject({
  id: daymarkIdSchema,
  name: habitNameSchema,
  kind: habitKindSchema,
  createdOn: daymarkDateSchema,
  createdAt: utcDateTimeSchema,
  updatedAt: utcDateTimeSchema,
});
export type DaymarkBackupHabit = z.output<typeof daymarkBackupHabitSchema>;

export const daymarkBackupHabitVersionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: daymarkIdSchema,
    habitId: daymarkIdSchema,
    effectiveFrom: daymarkDateSchema,
    kind: z.literal("check"),
    status: habitStatusSchema,
    targetMilli: z.null(),
    unit: z.null(),
    comparison: z.null(),
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  }),
  z.strictObject({
    id: daymarkIdSchema,
    habitId: daymarkIdSchema,
    effectiveFrom: daymarkDateSchema,
    kind: z.literal("number"),
    status: habitStatusSchema,
    targetMilli: milliValueSchema,
    unit: daymarkUnitSchema,
    comparison: comparisonSchema,
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  }),
]);
export type DaymarkBackupHabitVersion = z.output<typeof daymarkBackupHabitVersionSchema>;

export const daymarkBackupRecordSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: daymarkIdSchema,
    habitId: daymarkIdSchema,
    recordDate: daymarkDateSchema,
    kind: z.literal("check"),
    checked: z.boolean(),
    valueMilli: z.null(),
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  }),
  z.strictObject({
    id: daymarkIdSchema,
    habitId: daymarkIdSchema,
    recordDate: daymarkDateSchema,
    kind: z.literal("number"),
    checked: z.null(),
    valueMilli: milliValueSchema,
    createdAt: utcDateTimeSchema,
    updatedAt: utcDateTimeSchema,
  }),
]);
export type DaymarkBackupRecord = z.output<typeof daymarkBackupRecordSchema>;

function hasDuplicateValues(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export const daymarkBackupSnapshotSchema = z
  .strictObject({
    product: z.literal(DAYMARK_BACKUP_PRODUCT),
    schemaVersion: z.literal(DAYMARK_BACKUP_SCHEMA_VERSION),
    exportedAt: utcDateTimeSchema,
    habits: z.array(daymarkBackupHabitSchema).max(DAYMARK_BACKUP_LIMITS.habits),
    habitVersions: z
      .array(daymarkBackupHabitVersionSchema)
      .max(DAYMARK_BACKUP_LIMITS.habitVersions),
    records: z.array(daymarkBackupRecordSchema).max(DAYMARK_BACKUP_LIMITS.records),
  })
  .superRefine((snapshot, context) => {
    if (hasDuplicateValues(snapshot.habits.map(({ id }) => id))) {
      context.addIssue({ code: "custom", message: "Habit IDs must be unique", path: ["habits"] });
    }
    if (hasDuplicateValues(snapshot.habitVersions.map(({ id }) => id))) {
      context.addIssue({
        code: "custom",
        message: "Habit version IDs must be unique",
        path: ["habitVersions"],
      });
    }
    if (hasDuplicateValues(snapshot.records.map(({ id }) => id))) {
      context.addIssue({ code: "custom", message: "Record IDs must be unique", path: ["records"] });
    }
    if (
      hasDuplicateValues(
        snapshot.habitVersions.map(
          ({ habitId, effectiveFrom }) => `${habitId}\u0000${effectiveFrom}`,
        ),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Habit versions must be unique by habit and effective date",
        path: ["habitVersions"],
      });
    }
    if (
      hasDuplicateValues(
        snapshot.records.map(({ habitId, recordDate }) => `${habitId}\u0000${recordDate}`),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Records must be unique by habit and date",
        path: ["records"],
      });
    }

    const habitsById = new Map(snapshot.habits.map((habit) => [habit.id, habit] as const));
    const initialVersions = new Set<string>();
    for (const version of snapshot.habitVersions) {
      const habit = habitsById.get(version.habitId);
      if (
        habit === undefined ||
        version.kind !== habit.kind ||
        version.effectiveFrom < habit.createdOn
      ) {
        context.addIssue({
          code: "custom",
          message: "Habit versions must reference a compatible exported habit",
          path: ["habitVersions"],
        });
        continue;
      }
      if (version.effectiveFrom === habit.createdOn) initialVersions.add(habit.id);
    }
    for (const habit of snapshot.habits) {
      if (!initialVersions.has(habit.id)) {
        context.addIssue({
          code: "custom",
          message: "Each habit must include its initial configuration",
          path: ["habitVersions"],
        });
      }
    }
    for (const record of snapshot.records) {
      const habit = habitsById.get(record.habitId);
      if (
        habit === undefined ||
        record.kind !== habit.kind ||
        record.recordDate < habit.createdOn
      ) {
        context.addIssue({
          code: "custom",
          message: "Records must reference a compatible exported habit",
          path: ["records"],
        });
      }
    }
  });
export type DaymarkBackupSnapshot = z.output<typeof daymarkBackupSnapshotSchema>;

export const daymarkBackupImportRequestSchema = z.strictObject({
  backup: daymarkBackupSnapshotSchema,
});
export type DaymarkBackupImportRequest = z.output<typeof daymarkBackupImportRequestSchema>;

export const daymarkBackupImportSummarySchema = z.strictObject({
  source: z.strictObject({
    schemaVersion: z.literal(DAYMARK_BACKUP_SCHEMA_VERSION),
    exportedAt: utcDateTimeSchema,
    habits: z.number().int().nonnegative(),
    habitVersions: z.number().int().nonnegative(),
    records: z.number().int().nonnegative(),
  }),
  changes: z.strictObject({
    habitsCreated: z.number().int().nonnegative(),
    habitsMatched: z.number().int().nonnegative(),
    habitIdsRemapped: z.number().int().nonnegative(),
    habitVersionsCreated: z.number().int().nonnegative(),
    habitVersionsMatched: z.number().int().nonnegative(),
    habitVersionsSkipped: z.number().int().nonnegative(),
    habitVersionIdsRemapped: z.number().int().nonnegative(),
    recordsCreated: z.number().int().nonnegative(),
    recordsMatched: z.number().int().nonnegative(),
    recordsSkipped: z.number().int().nonnegative(),
    recordIdsRemapped: z.number().int().nonnegative(),
  }),
  hasChanges: z.boolean(),
});
export type DaymarkBackupImportSummary = z.output<typeof daymarkBackupImportSummarySchema>;

export const daymarkBackupImportPreviewResponseSchema = z.strictObject({
  result: z.literal("preview"),
  summary: daymarkBackupImportSummarySchema,
});
export type DaymarkBackupImportPreviewResponse = z.output<
  typeof daymarkBackupImportPreviewResponseSchema
>;

export const daymarkBackupImportResponseSchema = z.strictObject({
  result: z.literal("imported"),
  summary: daymarkBackupImportSummarySchema,
});
export type DaymarkBackupImportResponse = z.output<typeof daymarkBackupImportResponseSchema>;
