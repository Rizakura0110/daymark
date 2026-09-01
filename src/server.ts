import {
  type CreateHabitRequest,
  DAYMARK_PRODUCT,
  DAYMARK_TIME_ZONE,
  type DailyHabitDto,
  type DayResponse,
  type DaySummaryDto,
  type DaymarkConnectionStatus,
  type DaymarkRecordDto,
  type HabitConfigurationDto,
  type HabitDto,
  type HabitResponse,
  type ListHabitsResponse,
  type MonthResponse,
  type PutHabitConfigurationRequest,
  type PutHabitRecordRequest,
  type RenameHabitRequest,
  type WeekResponse,
} from "./contracts.js";

const JST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;
const MILLI_SCALE = 1_000;

export type DaymarkClock = () => Date;
export type DaymarkIdGenerator = () => string;

export type HabitEntity = {
  readonly id: string;
  readonly name: string;
  readonly kind: "check" | "number";
  readonly createdOn: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type HabitVersionEntity = {
  readonly id: string;
  readonly habitId: string;
  readonly effectiveFrom: string;
  readonly kind: "check" | "number";
  readonly status: "active" | "paused" | "archived";
  readonly targetMilli: number | null;
  readonly unit: string | null;
  readonly comparison: "at_least" | "at_most" | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type HabitRecordEntity = {
  readonly id: string;
  readonly habitId: string;
  readonly recordDate: string;
  readonly kind: "check" | "number";
  readonly checked: boolean | null;
  readonly valueMilli: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export interface DaymarkRepository {
  listHabits(): Promise<readonly HabitEntity[]>;
  listVersions(): Promise<readonly HabitVersionEntity[]>;
  listRecords(start: string, end: string): Promise<readonly HabitRecordEntity[]>;
  createHabit(habit: HabitEntity, version: HabitVersionEntity): Promise<void>;
  updateHabitName(id: string, name: string, updatedAt: string): Promise<boolean>;
  upsertVersion(version: HabitVersionEntity): Promise<boolean>;
  upsertRecord(record: HabitRecordEntity): Promise<boolean>;
  deleteRecord(habitId: string, recordDate: string): Promise<boolean>;
}

export type DaymarkErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT";

export class DaymarkError extends Error {
  readonly code: DaymarkErrorCode;

  constructor(code: DaymarkErrorCode, message: string) {
    super(message);
    this.name = "DaymarkError";
    this.code = code;
  }
}

export function getDaymarkConnectionStatus(): DaymarkConnectionStatus {
  return { product: DAYMARK_PRODUCT, status: "ready", timeZone: DAYMARK_TIME_ZONE };
}

export function toMilli(value: number): number {
  return Math.round(value * MILLI_SCALE);
}

export function fromMilli(value: number): number {
  return value / MILLI_SCALE;
}

export function jstDate(clockValue: Date): string {
  if (!Number.isFinite(clockValue.getTime()))
    throw new Error("Daymark clock returned an invalid date.");
  return new Date(clockValue.getTime() + JST_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function datesBetween(start: string, end: string): readonly string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function resolveVersion(
  habit: HabitEntity,
  versions: readonly HabitVersionEntity[],
  date: string,
): HabitVersionEntity | null {
  if (date < habit.createdOn) return null;
  let selected: HabitVersionEntity | null = null;
  for (const version of versions) {
    if (
      version.habitId === habit.id &&
      version.effectiveFrom <= date &&
      (selected === null || version.effectiveFrom > selected.effectiveFrom)
    ) {
      selected = version;
    }
  }
  return selected;
}

function configurationDto(version: HabitVersionEntity): HabitConfigurationDto {
  if (version.kind === "check") {
    return {
      kind: "check",
      status: version.status,
      effectiveFrom: version.effectiveFrom,
    };
  }
  if (version.targetMilli === null || version.unit === null || version.comparison === null) {
    throw new Error("A numeric habit version is missing its target configuration.");
  }
  return {
    kind: "number",
    status: version.status,
    effectiveFrom: version.effectiveFrom,
    target: fromMilli(version.targetMilli),
    unit: version.unit,
    comparison: version.comparison,
  };
}

function recordDto(record: HabitRecordEntity): DaymarkRecordDto {
  if (record.kind === "check") {
    if (record.checked === null) throw new Error("A check record is missing its value.");
    return { kind: "check", checked: record.checked };
  }
  if (record.valueMilli === null) throw new Error("A numeric record is missing its value.");
  return { kind: "number", value: fromMilli(record.valueMilli) };
}

function stateFor(
  configuration: HabitConfigurationDto,
  record: DaymarkRecordDto | null,
): DailyHabitDto["state"] {
  if (configuration.status !== "active") return "excluded";
  if (record === null) return "unentered";
  if (configuration.kind === "check") {
    if (record.kind !== "check") throw new Error("Habit and record kinds do not match.");
    return record.checked ? "complete" : "incomplete";
  }
  if (record.kind !== "number") throw new Error("Habit and record kinds do not match.");
  const complete =
    configuration.comparison === "at_least"
      ? record.value >= configuration.target
      : record.value <= configuration.target;
  return complete ? "complete" : "incomplete";
}

function summarize(date: string, habits: readonly DailyHabitDto[]): DaySummaryDto {
  let complete = 0;
  let incomplete = 0;
  let unentered = 0;
  for (const habit of habits) {
    if (habit.state === "complete") complete += 1;
    if (habit.state === "incomplete") incomplete += 1;
    if (habit.state === "unentered") unentered += 1;
  }
  const due = complete + incomplete + unentered;
  return {
    date,
    complete,
    incomplete,
    unentered,
    due,
    rate: due === 0 ? null : Math.round((complete / due) * 100),
  };
}

function versionFromRequest(
  habit: HabitEntity,
  id: string,
  effectiveFrom: string,
  request: PutHabitConfigurationRequest,
  now: string,
): HabitVersionEntity {
  if (request.kind !== habit.kind) {
    throw new DaymarkError("VALIDATION_ERROR", "習慣の種類は後から変更できません。");
  }
  return request.kind === "check"
    ? {
        id,
        habitId: habit.id,
        effectiveFrom,
        kind: "check",
        status: request.status,
        targetMilli: null,
        unit: null,
        comparison: null,
        createdAt: now,
        updatedAt: now,
      }
    : {
        id,
        habitId: habit.id,
        effectiveFrom,
        kind: "number",
        status: request.status,
        targetMilli: toMilli(request.target),
        unit: request.unit,
        comparison: request.comparison,
        createdAt: now,
        updatedAt: now,
      };
}

export class DaymarkService {
  readonly #repository: DaymarkRepository;
  readonly #clock: DaymarkClock;
  readonly #idGenerator: DaymarkIdGenerator;

  constructor(repository: DaymarkRepository, clock: DaymarkClock, idGenerator: DaymarkIdGenerator) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  async #load() {
    const [habits, versions] = await Promise.all([
      this.#repository.listHabits(),
      this.#repository.listVersions(),
    ]);
    return { habits, versions };
  }

  #today(): string {
    return jstDate(this.#clock());
  }

  async #findHabit(id: string): Promise<HabitEntity> {
    const habit = (await this.#repository.listHabits()).find((candidate) => candidate.id === id);
    if (habit === undefined) throw new DaymarkError("NOT_FOUND", "習慣が見つかりません。");
    return habit;
  }

  async listHabits(): Promise<ListHabitsResponse> {
    const today = this.#today();
    const { habits, versions } = await this.#load();
    return {
      habits: habits.map((habit) => {
        const version = resolveVersion(habit, versions, today);
        if (version === null) throw new Error("A habit is missing its current configuration.");
        return this.#habitDto(habit, version);
      }),
    };
  }

  #habitDto(habit: HabitEntity, version: HabitVersionEntity): HabitDto {
    return {
      id: habit.id,
      name: habit.name,
      createdOn: habit.createdOn,
      configuration: configurationDto(version),
      createdAt: habit.createdAt,
      updatedAt: habit.updatedAt,
    };
  }

  async createHabit(request: CreateHabitRequest): Promise<HabitResponse> {
    const instant = this.#clock();
    const today = jstDate(instant);
    const now = instant.toISOString();
    const habit: HabitEntity = {
      id: this.#idGenerator(),
      name: request.name,
      kind: request.kind,
      createdOn: today,
      createdAt: now,
      updatedAt: now,
    };
    const version = versionFromRequest(
      habit,
      this.#idGenerator(),
      today,
      request.kind === "check"
        ? { kind: "check", status: "active" }
        : {
            kind: "number",
            status: "active",
            target: request.target,
            unit: request.unit,
            comparison: request.comparison,
          },
      now,
    );
    await this.#repository.createHabit(habit, version);
    return { habit: this.#habitDto(habit, version) };
  }

  async renameHabit(id: string, request: RenameHabitRequest): Promise<HabitResponse> {
    const habit = await this.#findHabit(id);
    const now = this.#clock().toISOString();
    if (!(await this.#repository.updateHabitName(id, request.name, now))) {
      throw new DaymarkError("NOT_FOUND", "習慣が見つかりません。");
    }
    const versions = await this.#repository.listVersions();
    const version = resolveVersion(habit, versions, this.#today());
    if (version === null) throw new Error("A habit is missing its current configuration.");
    return { habit: this.#habitDto({ ...habit, name: request.name, updatedAt: now }, version) };
  }

  async putConfiguration(
    id: string,
    effectiveFrom: string,
    request: PutHabitConfigurationRequest,
  ): Promise<HabitResponse> {
    const today = this.#today();
    if (effectiveFrom < today) {
      throw new DaymarkError(
        "VALIDATION_ERROR",
        "目標や状態の変更は今日以降の日付から適用してください。",
      );
    }
    const habit = await this.#findHabit(id);
    const now = this.#clock().toISOString();
    const version = versionFromRequest(habit, this.#idGenerator(), effectiveFrom, request, now);
    if (!(await this.#repository.upsertVersion(version))) {
      throw new DaymarkError("NOT_FOUND", "習慣が見つかりません。");
    }
    return { habit: this.#habitDto({ ...habit, updatedAt: now }, version) };
  }

  async #dailyRows(start: string, end: string): Promise<Map<string, DailyHabitDto[]>> {
    const today = this.#today();
    const [{ habits, versions }, records] = await Promise.all([
      this.#load(),
      this.#repository.listRecords(start, end),
    ]);
    const recordsByKey = new Map(
      records.map((record) => [`${record.habitId}\u0000${record.recordDate}`, record] as const),
    );
    const rows = new Map<string, DailyHabitDto[]>();
    for (const date of datesBetween(start, end)) {
      const daily: DailyHabitDto[] = [];
      for (const habit of habits) {
        const version = resolveVersion(habit, versions, date);
        if (version === null) continue;
        const configuration = configurationDto(version);
        const storedRecord = recordsByKey.get(`${habit.id}\u0000${date}`);
        const record = storedRecord === undefined ? null : recordDto(storedRecord);
        const state = date > today ? "excluded" : stateFor(configuration, record);
        daily.push({
          habitId: habit.id,
          name: habit.name,
          date,
          configuration,
          record,
          state,
        });
      }
      rows.set(date, daily);
    }
    return rows;
  }

  async getDay(date: string): Promise<DayResponse> {
    if (date > this.#today()) {
      throw new DaymarkError("VALIDATION_ERROR", "未来の日付には記録できません。");
    }
    const rows = await this.#dailyRows(date, date);
    const habits = (rows.get(date) as DailyHabitDto[]).filter(
      (habit) => habit.state !== "excluded",
    );
    return { date, habits, summary: summarize(date, habits) };
  }

  async putRecord(
    habitId: string,
    date: string,
    request: PutHabitRecordRequest,
  ): Promise<DayResponse> {
    const today = this.#today();
    if (date > today) throw new DaymarkError("VALIDATION_ERROR", "未来の日付には記録できません。");
    const habit = await this.#findHabit(habitId);
    const versions = await this.#repository.listVersions();
    const version = resolveVersion(habit, versions, date);
    if (version === null || version.status !== "active") {
      throw new DaymarkError("CONFLICT", "この日は記録対象ではありません。");
    }
    if (request.kind !== habit.kind) {
      throw new DaymarkError("VALIDATION_ERROR", "習慣と記録の種類が一致しません。");
    }
    const now = this.#clock().toISOString();
    const record: HabitRecordEntity =
      request.kind === "check"
        ? {
            id: this.#idGenerator(),
            habitId,
            recordDate: date,
            kind: "check",
            checked: request.checked,
            valueMilli: null,
            createdAt: now,
            updatedAt: now,
          }
        : {
            id: this.#idGenerator(),
            habitId,
            recordDate: date,
            kind: "number",
            checked: null,
            valueMilli: toMilli(request.value),
            createdAt: now,
            updatedAt: now,
          };
    if (!(await this.#repository.upsertRecord(record))) {
      throw new DaymarkError("NOT_FOUND", "習慣が見つかりません。");
    }
    return this.getDay(date);
  }

  async deleteRecord(habitId: string, date: string): Promise<void> {
    if (date > this.#today()) {
      throw new DaymarkError("VALIDATION_ERROR", "未来の日付には記録できません。");
    }
    await this.#findHabit(habitId);
    await this.#repository.deleteRecord(habitId, date);
  }

  async getWeek(start: string): Promise<WeekResponse> {
    if (new Date(`${start}T00:00:00.000Z`).getUTCDay() !== 1) {
      throw new DaymarkError("VALIDATION_ERROR", "週の開始日は月曜日を指定してください。");
    }
    if (start > this.#today()) {
      throw new DaymarkError("VALIDATION_ERROR", "未来の週は表示できません。");
    }
    const end = addDays(start, 6);
    const dates = datesBetween(start, end);
    const rows = await this.#dailyRows(start, end);
    const days = dates.map((date) => summarize(date, rows.get(date) as DailyHabitDto[]));
    const allHabits = new Map<string, { readonly name: string; readonly days: DailyHabitDto[] }>();
    for (const date of dates) {
      for (const daily of rows.get(date) as DailyHabitDto[]) {
        const current = allHabits.get(daily.habitId) ?? { name: daily.name, days: [] };
        current.days.push(daily);
        allHabits.set(daily.habitId, current);
      }
    }
    const habits = [...allHabits.entries()]
      .filter(([, value]) => value.days.some(({ state }) => state !== "excluded"))
      .map(([habitId, value]) => {
        const complete = value.days.filter(({ state }) => state === "complete").length;
        const due = value.days.filter(({ state }) => state !== "excluded").length;
        return {
          habitId,
          name: value.name,
          days: value.days,
          summary: { complete, due, rate: Math.round((complete / due) * 100) },
        };
      });
    const complete = days.reduce((sum, day) => sum + day.complete, 0);
    const incomplete = days.reduce((sum, day) => sum + day.incomplete, 0);
    const unentered = days.reduce((sum, day) => sum + day.unentered, 0);
    const due = complete + incomplete + unentered;
    return {
      start,
      end,
      days,
      habits,
      summary: {
        complete,
        incomplete,
        unentered,
        due,
        rate: due === 0 ? null : Math.round((complete / due) * 100),
        perfectDays: days.filter((day) => day.due > 0 && day.complete === day.due).length,
      },
    };
  }

  async getMonth(month: string): Promise<MonthResponse> {
    if (month > this.#today().slice(0, 7)) {
      throw new DaymarkError("VALIDATION_ERROR", "未来の月は表示できません。");
    }
    const start = `${month}-01`;
    const nextMonth = new Date(`${start}T00:00:00.000Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const end = addDays(nextMonth.toISOString().slice(0, 10), -1);
    const rows = await this.#dailyRows(start, end);
    const days = datesBetween(start, end).map((date) =>
      summarize(date, rows.get(date) as DailyHabitDto[]),
    );
    const complete = days.reduce((sum, day) => sum + day.complete, 0);
    const incomplete = days.reduce((sum, day) => sum + day.incomplete, 0);
    const unentered = days.reduce((sum, day) => sum + day.unentered, 0);
    const due = complete + incomplete + unentered;
    return {
      month,
      days,
      summary: {
        complete,
        incomplete,
        unentered,
        due,
        rate: due === 0 ? null : Math.round((complete / due) * 100),
        perfectDays: days.filter((day) => day.due > 0 && day.complete === day.due).length,
      },
    };
  }
}
