import { sql } from "drizzle-orm/sql";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core/dialect";
import { getTableConfig } from "drizzle-orm/sqlite-core/utils";
import { describe, expect, it } from "vitest";
import {
  daymarkHabitVersions,
  daymarkHabits,
  daymarkRecords,
  daymarkSchema,
} from "../src/schema.ts";

const dialect = new SQLiteSyncDialect();
const checks = (table) =>
  Object.fromEntries(
    getTableConfig(table).checks.map((constraint) => [
      constraint.name,
      dialect.sqlToQuery(constraint.value).sql,
    ]),
  );
const indexColumns = (index) =>
  index.config.columns.map((column) => dialect.sqlToQuery(sql`${column}`).sql);

describe("Daymark schema", () => {
  it("uses three product-prefixed tables", () => {
    expect(Object.values(daymarkSchema).map((table) => getTableConfig(table).name)).toEqual([
      "daymark_habits",
      "daymark_habit_versions",
      "daymark_records",
    ]);
  });

  it("constrains habit identity and kind", () => {
    const config = getTableConfig(daymarkHabits);
    expect(config.columns.map(({ name }) => name)).toEqual([
      "id",
      "name",
      "kind",
      "created_on",
      "created_at",
      "updated_at",
    ]);
    expect(checks(daymarkHabits)).toEqual({
      daymark_habits_name_length_check: 'length("daymark_habits"."name") BETWEEN 1 AND 80',
      daymark_habits_kind_check: "\"daymark_habits\".\"kind\" IN ('check', 'number')",
      daymark_habits_created_on_check: 'length("daymark_habits"."created_on") = 10',
    });
    expect(config.indexes[0].config.name).toBe("daymark_habits_created_on_id_idx");
    expect(indexColumns(config.indexes[0])).toEqual([
      '"daymark_habits"."created_on"',
      '"daymark_habits"."id"',
    ]);
  });

  it("versions configurations by effective date and cascades with a habit", () => {
    const config = getTableConfig(daymarkHabitVersions);
    expect(checks(daymarkHabitVersions)).toHaveProperty("daymark_habit_versions_shape_check");
    expect(config.indexes.map((index) => [index.config.name, index.config.unique])).toEqual([
      ["daymark_habit_versions_habit_effective_uidx", true],
      ["daymark_habit_versions_effective_idx", false],
    ]);
    expect(config.foreignKeys[0].onDelete).toBe("cascade");
    expect(config.foreignKeys[0].reference().foreignTable).toBe(daymarkHabits);
  });

  it("stores explicit check or scaled numeric records without duplicate dates", () => {
    const config = getTableConfig(daymarkRecords);
    expect(checks(daymarkRecords)).toHaveProperty("daymark_records_shape_check");
    expect(config.indexes.map((index) => [index.config.name, index.config.unique])).toEqual([
      ["daymark_records_habit_date_uidx", true],
      ["daymark_records_date_habit_idx", false],
    ]);
    expect(config.foreignKeys[0].onDelete).toBe("cascade");
    expect(config.foreignKeys[0].reference().foreignTable).toBe(daymarkHabits);
  });
});
