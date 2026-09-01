import { describe, expect, it } from "vitest";
import { DaymarkError, DaymarkService, fromMilli, jstDate, toMilli } from "../src/server.ts";

const now = new Date("2026-09-01T03:00:00.000Z");
const clock = () => new Date(now);

class MemoryRepository {
  habits = [];
  versions = [];
  records = [];
  failNameUpdate = false;
  failVersionUpsert = false;
  failRecordUpsert = false;

  async listHabits() {
    return this.habits;
  }

  async listVersions() {
    return this.versions;
  }

  async listRecords(start, end) {
    return this.records.filter(({ recordDate }) => recordDate >= start && recordDate <= end);
  }

  async createHabit(habit, version) {
    this.habits.push(habit);
    this.versions.push(version);
  }

  async updateHabitName(id, name, updatedAt) {
    if (this.failNameUpdate) return false;
    const index = this.habits.findIndex((habit) => habit.id === id);
    if (index === -1) return false;
    this.habits[index] = { ...this.habits[index], name, updatedAt };
    return true;
  }

  async upsertVersion(version) {
    if (this.failVersionUpsert || !this.habits.some(({ id }) => id === version.habitId))
      return false;
    const index = this.versions.findIndex(
      (candidate) =>
        candidate.habitId === version.habitId && candidate.effectiveFrom === version.effectiveFrom,
    );
    if (index === -1) this.versions.push(version);
    else this.versions[index] = { ...version, id: this.versions[index].id };
    return true;
  }

  async upsertRecord(record) {
    if (this.failRecordUpsert || !this.habits.some(({ id }) => id === record.habitId)) return false;
    const index = this.records.findIndex(
      (candidate) =>
        candidate.habitId === record.habitId && candidate.recordDate === record.recordDate,
    );
    if (index === -1) this.records.push(record);
    else this.records[index] = { ...record, id: this.records[index].id };
    return true;
  }

  async deleteRecord(habitId, recordDate) {
    const before = this.records.length;
    this.records = this.records.filter(
      (record) => record.habitId !== habitId || record.recordDate !== recordDate,
    );
    return this.records.length !== before;
  }
}

const ids = () => {
  let value = 0;
  return () => {
    value += 1;
    return `id-${value}`;
  };
};

const habit = (overrides = {}) => ({
  id: "habit-check",
  name: "朝のストレッチ",
  kind: "check",
  createdOn: "2026-08-24",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

const checkVersion = (overrides = {}) => ({
  id: "version-check",
  habitId: "habit-check",
  effectiveFrom: "2026-08-24",
  kind: "check",
  status: "active",
  targetMilli: null,
  unit: null,
  comparison: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

const numberHabit = (overrides = {}) =>
  habit({ id: "habit-number", name: "間食を控える", kind: "number", ...overrides });

const numberVersion = (overrides = {}) => ({
  ...checkVersion(),
  id: "version-number",
  habitId: "habit-number",
  kind: "number",
  targetMilli: 1_000,
  unit: "回",
  comparison: "at_most",
  ...overrides,
});

const record = (overrides = {}) => ({
  id: "record-check",
  habitId: "habit-check",
  recordDate: "2026-08-24",
  kind: "check",
  checked: true,
  valueMilli: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

const serviceFixture = (repository = new MemoryRepository(), customClock = clock) => ({
  repository,
  service: new DaymarkService(repository, customClock, ids()),
});

describe("date and numeric primitives", () => {
  it("uses JST midnight and exact thousandths", () => {
    expect(jstDate(new Date("2026-08-31T14:59:59.999Z"))).toBe("2026-08-31");
    expect(jstDate(new Date("2026-08-31T15:00:00.000Z"))).toBe("2026-09-01");
    expect(toMilli(1.234)).toBe(1_234);
    expect(fromMilli(1_234)).toBe(1.234);
  });

  it("rejects an invalid clock", () => {
    expect(() => jstDate(new Date(Number.NaN))).toThrow("invalid date");
  });
});

describe("habit management", () => {
  it("creates, lists, renames, and versions both habit kinds", async () => {
    const { service } = serviceFixture();
    const createdCheck = await service.createHabit({ name: "朝の運動", kind: "check" });
    const createdNumber = await service.createHabit({
      name: "歩く",
      kind: "number",
      target: 8_000,
      unit: "歩",
      comparison: "at_least",
    });
    expect(createdCheck.habit.configuration).toEqual({
      kind: "check",
      status: "active",
      effectiveFrom: "2026-09-01",
    });
    expect(createdNumber.habit.configuration).toEqual({
      kind: "number",
      status: "active",
      effectiveFrom: "2026-09-01",
      target: 8_000,
      unit: "歩",
      comparison: "at_least",
    });
    expect((await service.listHabits()).habits).toHaveLength(2);

    const renamed = await service.renameHabit(createdCheck.habit.id, { name: "朝のストレッチ" });
    expect(renamed.habit.name).toBe("朝のストレッチ");
    const paused = await service.putConfiguration(createdCheck.habit.id, "2026-09-02", {
      kind: "check",
      status: "paused",
    });
    expect(paused.habit.configuration.status).toBe("paused");
    const changed = await service.putConfiguration(createdNumber.habit.id, "2026-09-02", {
      kind: "number",
      status: "active",
      target: 10_000,
      unit: "歩",
      comparison: "at_least",
    });
    expect(changed.habit.configuration.target).toBe(10_000);
  });

  it("rejects missing habits, retroactive configurations, and kind changes", async () => {
    const { service } = serviceFixture();
    await expect(service.renameHabit("missing", { name: "なし" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const created = await service.createHabit({ name: "読む", kind: "check" });
    await expect(
      service.putConfiguration(created.habit.id, "2026-08-31", {
        kind: "check",
        status: "paused",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.putConfiguration(created.habit.id, "2026-09-01", {
        kind: "number",
        status: "active",
        target: 1,
        unit: "回",
        comparison: "at_least",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("handles repository races and corrupted configuration data", async () => {
    const nameRace = serviceFixture();
    const created = await nameRace.service.createHabit({ name: "読む", kind: "check" });
    nameRace.repository.failNameUpdate = true;
    await expect(
      nameRace.service.renameHabit(created.habit.id, { name: "本を読む" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const versionRace = serviceFixture();
    const versionHabit = await versionRace.service.createHabit({ name: "歩く", kind: "check" });
    versionRace.repository.failVersionUpsert = true;
    await expect(
      versionRace.service.putConfiguration(versionHabit.habit.id, "2026-09-01", {
        kind: "check",
        status: "archived",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const broken = new MemoryRepository();
    broken.habits.push(habit({ createdOn: "2026-09-01" }));
    await expect(serviceFixture(broken).service.listHabits()).rejects.toThrow(
      "missing its current",
    );
    await expect(
      serviceFixture(broken).service.renameHabit("habit-check", { name: "変更" }),
    ).rejects.toThrow("missing its current");
    broken.versions.push(
      numberVersion({
        habitId: "habit-check",
        effectiveFrom: "2026-09-01",
        targetMilli: null,
        unit: null,
        comparison: null,
      }),
    );
    await expect(serviceFixture(broken).service.listHabits()).rejects.toThrow(
      "missing its target configuration",
    );
  });
});

describe("daily records and evaluation", () => {
  it("distinguishes unentered, incomplete, and complete check records", async () => {
    const repository = new MemoryRepository();
    repository.habits.push(habit({ createdOn: "2026-09-01" }));
    repository.versions.push(checkVersion({ effectiveFrom: "2026-09-01" }));
    const { service } = serviceFixture(repository);
    expect((await service.getDay("2026-09-01")).summary).toMatchObject({
      complete: 0,
      incomplete: 0,
      unentered: 1,
      due: 1,
      rate: 0,
    });
    expect(
      (await service.putRecord("habit-check", "2026-09-01", { kind: "check", checked: false }))
        .habits[0].state,
    ).toBe("incomplete");
    const completed = await service.putRecord("habit-check", "2026-09-01", {
      kind: "check",
      checked: true,
    });
    expect(completed.habits[0].state).toBe("complete");
    expect(completed.summary.rate).toBe(100);
    await service.deleteRecord("habit-check", "2026-09-01");
    expect((await service.getDay("2026-09-01")).habits[0].state).toBe("unentered");
    await service.deleteRecord("habit-check", "2026-09-01");
  });

  it("evaluates at-least and at-most numeric records with scaled storage", async () => {
    const repository = new MemoryRepository();
    repository.habits.push(
      numberHabit({ id: "gte", name: "読む", createdOn: "2026-09-01" }),
      numberHabit({ id: "lte", createdOn: "2026-09-01" }),
    );
    repository.versions.push(
      numberVersion({
        id: "v-gte",
        habitId: "gte",
        effectiveFrom: "2026-09-01",
        targetMilli: 30_000,
        unit: "分",
        comparison: "at_least",
      }),
      numberVersion({ id: "v-lte", habitId: "lte", effectiveFrom: "2026-09-01" }),
    );
    const { service } = serviceFixture(repository);
    await service.putRecord("gte", "2026-09-01", { kind: "number", value: 29.999 });
    await service.putRecord("lte", "2026-09-01", { kind: "number", value: 2 });
    expect((await service.getDay("2026-09-01")).habits.map(({ state }) => state)).toEqual([
      "incomplete",
      "incomplete",
    ]);
    await service.putRecord("gte", "2026-09-01", { kind: "number", value: 30 });
    await service.putRecord("lte", "2026-09-01", { kind: "number", value: 1 });
    expect((await service.getDay("2026-09-01")).habits.map(({ state }) => state)).toEqual([
      "complete",
      "complete",
    ]);
  });

  it("blocks future, excluded, missing, mismatched, and raced records", async () => {
    const repository = new MemoryRepository();
    repository.habits.push(habit({ createdOn: "2026-09-01" }));
    repository.versions.push(checkVersion({ effectiveFrom: "2026-09-01", status: "paused" }));
    const { service } = serviceFixture(repository);
    await expect(service.getDay("2026-09-02")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.putRecord("habit-check", "2026-09-02", { kind: "check", checked: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.putRecord("missing", "2026-09-01", { kind: "check", checked: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.putRecord("habit-check", "2026-09-01", { kind: "check", checked: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    repository.versions[0] = checkVersion({ effectiveFrom: "2026-09-01" });
    await expect(
      service.putRecord("habit-check", "2026-09-01", { kind: "number", value: 1 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    repository.failRecordUpsert = true;
    await expect(
      service.putRecord("habit-check", "2026-09-01", { kind: "check", checked: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.deleteRecord("missing", "2026-09-01")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.deleteRecord("habit-check", "2026-09-02")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("fails closed for corrupted record shapes and mismatched stored kinds", async () => {
    const repository = new MemoryRepository();
    repository.habits.push(habit({ createdOn: "2026-09-01" }));
    repository.versions.push(checkVersion({ effectiveFrom: "2026-09-01" }));
    repository.records.push(record({ recordDate: "2026-09-01", checked: null }));
    await expect(serviceFixture(repository).service.getDay("2026-09-01")).rejects.toThrow(
      "check record is missing",
    );
    repository.records[0] = record({
      recordDate: "2026-09-01",
      kind: "number",
      checked: null,
      valueMilli: null,
    });
    await expect(serviceFixture(repository).service.getDay("2026-09-01")).rejects.toThrow(
      "numeric record is missing",
    );
    repository.records[0] = record({
      recordDate: "2026-09-01",
      kind: "number",
      checked: null,
      valueMilli: 1_000,
    });
    await expect(serviceFixture(repository).service.getDay("2026-09-01")).rejects.toThrow(
      "kinds do not match",
    );
    repository.habits[0] = numberHabit({ createdOn: "2026-09-01" });
    repository.versions[0] = numberVersion({ effectiveFrom: "2026-09-01" });
    repository.records[0] = record({ habitId: "habit-number", recordDate: "2026-09-01" });
    await expect(serviceFixture(repository).service.getDay("2026-09-01")).rejects.toThrow(
      "kinds do not match",
    );
  });
});

describe("weekly and monthly history", () => {
  const historyRepository = () => {
    const repository = new MemoryRepository();
    repository.habits.push(habit(), numberHabit());
    repository.versions.push(
      checkVersion(),
      checkVersion({
        id: "version-check-pause",
        effectiveFrom: "2026-08-27",
        status: "paused",
      }),
      checkVersion({
        id: "version-check-resume",
        effectiveFrom: "2026-08-29",
        status: "active",
      }),
      numberVersion(),
    );
    repository.records.push(
      record(),
      record({ id: "r2", recordDate: "2026-08-25", checked: false }),
      record({
        id: "n1",
        habitId: "habit-number",
        recordDate: "2026-08-24",
        kind: "number",
        checked: null,
        valueMilli: 1_000,
      }),
      record({
        id: "n2",
        habitId: "habit-number",
        recordDate: "2026-08-25",
        kind: "number",
        checked: null,
        valueMilli: 2_000,
      }),
    );
    return repository;
  };

  it("aggregates Monday-to-Sunday while excluding paused days", async () => {
    const week = await serviceFixture(historyRepository()).service.getWeek("2026-08-24");
    expect(week.end).toBe("2026-08-30");
    expect(week.days).toHaveLength(7);
    expect(week.habits).toHaveLength(2);
    expect(week.habits[0].days.map(({ state }) => state)).toEqual([
      "complete",
      "incomplete",
      "unentered",
      "excluded",
      "excluded",
      "unentered",
      "unentered",
    ]);
    expect(week.summary).toEqual({
      complete: 2,
      incomplete: 2,
      unentered: 8,
      due: 12,
      rate: 17,
      perfectDays: 1,
    });
  });

  it("keeps future days and wholly archived habits out of the denominator", async () => {
    const repository = historyRepository();
    repository.habits.push(habit({ id: "archived", createdOn: "2026-08-31" }));
    repository.versions.push(
      checkVersion({
        id: "archived-version",
        habitId: "archived",
        effectiveFrom: "2026-08-31",
        status: "archived",
      }),
    );
    const week = await serviceFixture(repository).service.getWeek("2026-08-31");
    expect(week.days.slice(2).every(({ due }) => due === 0)).toBe(true);
    expect(week.habits.some(({ habitId }) => habitId === "archived")).toBe(false);
  });

  it("starts a newly created habit from its creation date within the week", async () => {
    const repository = new MemoryRepository();
    repository.habits.push(habit({ createdOn: "2026-08-28" }));
    repository.versions.push(checkVersion({ effectiveFrom: "2026-08-28" }));

    const week = await serviceFixture(repository).service.getWeek("2026-08-24");

    expect(week.habits).toHaveLength(1);
    expect(week.habits[0].days.map(({ date }) => date)).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
    expect(week.habits[0].summary).toEqual({ complete: 0, due: 3, rate: 0 });
  });

  it("rejects non-Monday and future week starts", async () => {
    const { service } = serviceFixture(historyRepository());
    await expect(service.getWeek("2026-08-25")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(service.getWeek("2026-09-07")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("returns a null rate for a week with no due habits", async () => {
    const week = await serviceFixture().service.getWeek("2026-08-24");
    expect(week.habits).toEqual([]);
    expect(week.summary).toEqual({
      complete: 0,
      incomplete: 0,
      unentered: 0,
      due: 0,
      rate: null,
      perfectDays: 0,
    });
  });

  it("builds month summaries including empty history and leap-safe month lengths", async () => {
    const august = await serviceFixture(historyRepository()).service.getMonth("2026-08");
    expect(august.days).toHaveLength(31);
    expect(august.summary.due).toBe(14);
    expect(august.summary.perfectDays).toBe(1);
    const empty = await serviceFixture().service.getMonth("2026-02");
    expect(empty.days).toHaveLength(28);
    expect(empty.summary).toEqual({
      complete: 0,
      incomplete: 0,
      unentered: 0,
      due: 0,
      rate: null,
      perfectDays: 0,
    });
    await expect(serviceFixture().service.getMonth("2026-10")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("Daymark errors", () => {
  it("keeps a stable product error name and code", () => {
    const error = new DaymarkError("CONFLICT", "競合");
    expect(error).toMatchObject({ name: "DaymarkError", code: "CONFLICT", message: "競合" });
  });
});
