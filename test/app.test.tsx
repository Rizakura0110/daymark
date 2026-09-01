// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DaymarkClient, DaymarkApp } from "../src/app";
import type { DayResponse, HabitDto, MonthResponse, WeekResponse } from "../src/contracts";

const timestamp = "2026-09-01T00:00:00.000Z";
const checkHabit: HabitDto = {
  id: "water",
  name: "水を飲む",
  createdOn: "2026-09-01",
  configuration: { kind: "check", status: "active", effectiveFrom: "2026-09-01" },
  createdAt: timestamp,
  updatedAt: timestamp,
};
const numberHabit: HabitDto = {
  id: "walk",
  name: "歩く",
  createdOn: "2026-09-01",
  configuration: {
    kind: "number",
    status: "active",
    effectiveFrom: "2026-09-01",
    target: 8000,
    unit: "歩",
    comparison: "at_least",
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};
const summary = {
  date: "2026-09-01",
  complete: 0,
  incomplete: 0,
  unentered: 2,
  due: 2,
  rate: 0,
} as const;
const day: DayResponse = {
  date: "2026-09-01",
  habits: [
    {
      habitId: checkHabit.id,
      name: checkHabit.name,
      date: "2026-09-01",
      configuration: checkHabit.configuration,
      record: null,
      state: "unentered",
    },
    {
      habitId: numberHabit.id,
      name: numberHabit.name,
      date: "2026-09-01",
      configuration: numberHabit.configuration,
      record: null,
      state: "unentered",
    },
  ],
  summary,
};
const weekDates = [
  "2026-08-31",
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
  "2026-09-05",
  "2026-09-06",
] as const;
const week: WeekResponse = {
  start: weekDates[0],
  end: weekDates[6],
  days: weekDates.map((date) => ({ ...summary, date })),
  habits: [],
  summary: { ...summary, perfectDays: 0 },
};
const month: MonthResponse = {
  month: "2026-09",
  days: Array.from({ length: 30 }, (_, index) => ({
    ...summary,
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
  })),
  summary: { ...summary, perfectDays: 0 },
};

function client(): DaymarkClient {
  const backup = {
    product: "daymark" as const,
    schemaVersion: 1 as const,
    exportedAt: timestamp,
    habits: [],
    habitVersions: [],
    records: [],
  };
  const backupSummary = {
    source: {
      schemaVersion: 1 as const,
      exportedAt: timestamp,
      habits: 0,
      habitVersions: 0,
      records: 0,
    },
    changes: {
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
    },
    hasChanges: false,
  };
  return {
    exportBackup: vi.fn(async () => backup),
    previewBackup: vi.fn(async () => ({ result: "preview", summary: backupSummary })),
    importBackup: vi.fn(async () => ({ result: "imported", summary: backupSummary })),
    listHabits: vi.fn(async () => ({ habits: [checkHabit, numberHabit] })),
    createHabit: vi.fn(async () => checkHabit),
    renameHabit: vi.fn(async () => checkHabit),
    putConfiguration: vi.fn(async () => checkHabit),
    getDay: vi.fn(async () => day),
    putRecord: vi.fn(async () => day),
    deleteRecord: vi.fn(async () => undefined),
    getWeek: vi.fn(async () => week),
    getMonth: vi.fn(async () => month),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Daymark application", () => {
  it("records daily check and numeric habits", async () => {
    const api = client();
    render(<DaymarkApp client={api} now={() => new Date("2026-08-31T15:00:00.000Z")} />);

    expect(await screen.findByRole("heading", { name: "水を飲む" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "✓ 達成" }));
    await waitFor(() =>
      expect(api.putRecord).toHaveBeenCalledWith("water", "2026-09-01", {
        kind: "check",
        checked: true,
      }),
    );

    fireEvent.change(screen.getByLabelText("記録する数値"), { target: { value: "9000" } });
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    await waitFor(() =>
      expect(api.putRecord).toHaveBeenCalledWith("walk", "2026-09-01", {
        kind: "number",
        value: 9000,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "前の日" }));
    await waitFor(() => expect(api.getDay).toHaveBeenCalledWith("2026-08-31", expect.anything()));
    expect(screen.getByRole("heading", { name: "過去の記録" })).toBeTruthy();
  });

  it("opens week, month, and habit-management views and creates a habit", async () => {
    const api = client();
    render(<DaymarkApp client={api} now={() => new Date("2026-08-31T15:00:00.000Z")} />);
    await screen.findByRole("heading", { name: "水を飲む" });

    fireEvent.click(screen.getAllByRole("button", { name: "履歴" })[0]);
    expect(await screen.findByRole("heading", { name: "履歴" })).toBeTruthy();
    await waitFor(() => expect(api.getWeek).toHaveBeenCalledWith("2026-08-31", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    await waitFor(() => expect(api.getMonth).toHaveBeenCalledWith("2026-09", expect.anything()));
    expect(await screen.findByLabelText("2026年9月の達成カレンダー")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "習慣管理" })[0]);
    expect(await screen.findByRole("heading", { name: "習慣管理" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "＋ 習慣を追加" }));
    fireEvent.change(screen.getByLabelText("習慣名", { selector: "#daymark-add-name" }), {
      target: { value: "ストレッチ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "追加する" }));
    await waitFor(() =>
      expect(api.createHabit).toHaveBeenCalledWith({ name: "ストレッチ", kind: "check" }),
    );
  });

  it("downloads, previews, and restores a Daymark-only JSON backup", async () => {
    const api = client();
    const backup = await api.exportBackup();
    const createObjectUrl = vi.fn(() => "blob:daymark-backup");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<DaymarkApp client={api} now={() => new Date("2026-08-31T15:00:00.000Z")} />);
    await screen.findByRole("heading", { name: "水を飲む" });

    fireEvent.click(screen.getAllByRole("button", { name: "設定" })[0]);
    expect(await screen.findByRole("heading", { name: "設定" })).toBeTruthy();
    expect(await screen.findByText("JSONバックアップ")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "JSONを書き出す" }));
    expect(createObjectUrl).toHaveBeenCalledOnce();

    const file = new File([JSON.stringify(backup)], "daymark.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: async () => JSON.stringify(backup),
    });
    fireEvent.change(screen.getByLabelText("Daymarkバックアップファイル（4MB以下）"), {
      target: { files: [file] },
    });
    expect(await screen.findByText("選択済み: daymark.json")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "復元内容を確認" }));
    expect(await screen.findByText("復元プレビュー")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "安全に復元する" }));
    expect(
      await screen.findByText("すべて既存データと一致していたため、変更はありませんでした。"),
    ).toBeTruthy();
    expect(api.previewBackup).toHaveBeenCalledWith(backup);
    expect(api.importBackup).toHaveBeenCalledWith(backup);
  });
});
