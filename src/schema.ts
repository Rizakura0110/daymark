import { sql } from "drizzle-orm/sql";
import { check } from "drizzle-orm/sqlite-core/checks";
import { integer } from "drizzle-orm/sqlite-core/columns/integer";
import { text } from "drizzle-orm/sqlite-core/columns/text";
import { index, uniqueIndex } from "drizzle-orm/sqlite-core/indexes";
import { sqliteTable } from "drizzle-orm/sqlite-core/table";
import {
  DAYMARK_COMPARISONS,
  DAYMARK_HABIT_KINDS,
  DAYMARK_HABIT_STATUSES,
  DAYMARK_LIMITS,
} from "./contracts.js";

export const daymarkHabits = sqliteTable(
  "daymark_habits",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: DAYMARK_HABIT_KINDS }).notNull(),
    createdOn: text("created_on").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "daymark_habits_name_length_check",
      sql`length(${table.name}) BETWEEN 1 AND ${sql.raw(String(DAYMARK_LIMITS.habitName))}`,
    ),
    check("daymark_habits_kind_check", sql`${table.kind} IN ('check', 'number')`),
    check("daymark_habits_created_on_check", sql`length(${table.createdOn}) = 10`),
    index("daymark_habits_created_on_id_idx").on(table.createdOn, table.id),
  ],
);

export const daymarkHabitVersions = sqliteTable(
  "daymark_habit_versions",
  {
    id: text("id").primaryKey(),
    habitId: text("habit_id")
      .notNull()
      .references(() => daymarkHabits.id, { onDelete: "cascade" }),
    effectiveFrom: text("effective_from").notNull(),
    kind: text("kind", { enum: DAYMARK_HABIT_KINDS }).notNull(),
    status: text("status", { enum: DAYMARK_HABIT_STATUSES }).notNull(),
    targetMilli: integer("target_milli"),
    unit: text("unit"),
    comparison: text("comparison", { enum: DAYMARK_COMPARISONS }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("daymark_habit_versions_effective_from_check", sql`length(${table.effectiveFrom}) = 10`),
    check("daymark_habit_versions_kind_check", sql`${table.kind} IN ('check', 'number')`),
    check(
      "daymark_habit_versions_status_check",
      sql`${table.status} IN ('active', 'paused', 'archived')`,
    ),
    check(
      "daymark_habit_versions_shape_check",
      sql`((${table.kind} = 'check' AND ${table.targetMilli} IS NULL AND ${table.unit} IS NULL AND ${table.comparison} IS NULL) OR (${table.kind} = 'number' AND ${table.targetMilli} IS NOT NULL AND ${table.targetMilli} BETWEEN 0 AND ${sql.raw(String(DAYMARK_LIMITS.numericValue * 1_000))} AND ${table.unit} IS NOT NULL AND length(${table.unit}) BETWEEN 1 AND ${sql.raw(String(DAYMARK_LIMITS.unit))} AND ${table.comparison} IN ('at_least', 'at_most')))`,
    ),
    uniqueIndex("daymark_habit_versions_habit_effective_uidx").on(
      table.habitId,
      table.effectiveFrom,
    ),
    index("daymark_habit_versions_effective_idx").on(table.effectiveFrom, table.habitId),
  ],
);

export const daymarkRecords = sqliteTable(
  "daymark_records",
  {
    id: text("id").primaryKey(),
    habitId: text("habit_id")
      .notNull()
      .references(() => daymarkHabits.id, { onDelete: "cascade" }),
    recordDate: text("record_date").notNull(),
    kind: text("kind", { enum: DAYMARK_HABIT_KINDS }).notNull(),
    checked: integer("checked", { mode: "boolean" }),
    valueMilli: integer("value_milli"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("daymark_records_date_check", sql`length(${table.recordDate}) = 10`),
    check("daymark_records_kind_check", sql`${table.kind} IN ('check', 'number')`),
    check(
      "daymark_records_shape_check",
      sql`((${table.kind} = 'check' AND ${table.checked} IS NOT NULL AND ${table.checked} IN (0, 1) AND ${table.valueMilli} IS NULL) OR (${table.kind} = 'number' AND ${table.checked} IS NULL AND ${table.valueMilli} IS NOT NULL AND ${table.valueMilli} BETWEEN 0 AND ${sql.raw(String(DAYMARK_LIMITS.numericValue * 1_000))}))`,
    ),
    uniqueIndex("daymark_records_habit_date_uidx").on(table.habitId, table.recordDate),
    index("daymark_records_date_habit_idx").on(table.recordDate, table.habitId),
  ],
);

export type DaymarkHabitRow = typeof daymarkHabits.$inferSelect;
export type DaymarkHabitInsert = typeof daymarkHabits.$inferInsert;
export type DaymarkHabitVersionRow = typeof daymarkHabitVersions.$inferSelect;
export type DaymarkHabitVersionInsert = typeof daymarkHabitVersions.$inferInsert;
export type DaymarkRecordRow = typeof daymarkRecords.$inferSelect;
export type DaymarkRecordInsert = typeof daymarkRecords.$inferInsert;

export const daymarkSchema = {
  daymarkHabits,
  daymarkHabitVersions,
  daymarkRecords,
} as const;
