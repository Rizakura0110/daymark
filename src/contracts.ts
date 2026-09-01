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
