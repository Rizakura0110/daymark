import {
  type ComponentProps,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  CreateHabitRequest,
  DailyHabitDto,
  DayResponse,
  HabitDto,
  ListHabitsResponse,
  MonthResponse,
  PutHabitConfigurationRequest,
  PutHabitRecordRequest,
  WeekResponse,
} from "./contracts.js";
import {
  addCalendarDays,
  browserJstDate,
  datesOfWeek,
  formatJapaneseDate,
  mondayOf,
  monthCalendarOffset,
  shiftMonth,
} from "./browser-date.js";

export type DaymarkClient = {
  readonly listHabits: (signal?: AbortSignal) => Promise<ListHabitsResponse>;
  readonly createHabit: (request: CreateHabitRequest, signal?: AbortSignal) => Promise<HabitDto>;
  readonly renameHabit: (id: string, name: string, signal?: AbortSignal) => Promise<HabitDto>;
  readonly putConfiguration: (
    id: string,
    date: string,
    request: PutHabitConfigurationRequest,
    signal?: AbortSignal,
  ) => Promise<HabitDto>;
  readonly getDay: (date: string, signal?: AbortSignal) => Promise<DayResponse>;
  readonly putRecord: (
    id: string,
    date: string,
    request: PutHabitRecordRequest,
    signal?: AbortSignal,
  ) => Promise<DayResponse>;
  readonly deleteRecord: (id: string, date: string, signal?: AbortSignal) => Promise<void>;
  readonly getWeek: (start: string, signal?: AbortSignal) => Promise<WeekResponse>;
  readonly getMonth: (month: string, signal?: AbortSignal) => Promise<MonthResponse>;
};

type Section = "today" | "history" | "habits";
type HistoryPeriod = "week" | "month";

type DaymarkAppProps = {
  readonly client: DaymarkClient;
  readonly now?: () => Date;
  readonly portalHref?: string;
};

const defaultNow = () => new Date();
const weekdays = ["月", "火", "水", "木", "金", "土", "日"] as const;

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  return error instanceof Error
    ? error.message
    : "通信に失敗しました。時間をおいて再度お試しください。";
}

function formatLongDate(date: string): string {
  return formatJapaneseDate(date, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatShortDate(date: string): string {
  return formatJapaneseDate(date, { month: "numeric", day: "numeric" });
}

function formatMonth(month: string): string {
  return formatJapaneseDate(`${month}-01`, { year: "numeric", month: "long" });
}

function stateLabel(state: DailyHabitDto["state"]): string {
  if (state === "complete") return "達成";
  if (state === "incomplete") return "未達成";
  if (state === "unentered") return "未入力";
  return "対象外";
}

function stateClass(state: DailyHabitDto["state"]): string {
  if (state === "complete") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (state === "incomplete") return "bg-amber-50 text-amber-800 border-amber-200";
  if (state === "unentered") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

function recordLabel(day: DailyHabitDto): string {
  if (day.record === null) return stateLabel(day.state);
  if (day.record.kind === "check") return day.record.checked ? "✓" : "未達";
  return `${day.record.value.toLocaleString("ja-JP")} ${day.configuration.kind === "number" ? day.configuration.unit : ""}`;
}

function completionText(complete: number, due: number, rate: number | null): string {
  if (due === 0) return "対象なし";
  return `${complete} / ${due}（${rate ?? 0}%）`;
}

function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      return;
    }
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }, [open]);

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="modal m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950" id={titleId}>
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600" id={descriptionId}>
              {description}
            </p>
          </div>
          <button
            aria-label={`${title}を閉じる`}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}

function AddHabitDialog({
  open,
  onClose,
  onCreate,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreate: (request: CreateHabitRequest) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"check" | "number">("check");
  const [target, setTarget] = useState("1");
  const [unit, setUnit] = useState("回");
  const [comparison, setComparison] = useState<"at_least" | "at_most">("at_least");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setKind("check");
    setTarget("1");
    setUnit("回");
    setComparison("at_least");
    setError("");
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const request: CreateHabitRequest =
        kind === "check"
          ? { name: name.trim(), kind: "check" }
          : {
              name: name.trim(),
              kind: "number",
              target: Number(target),
              unit: unit.trim(),
              comparison,
            };
      await onCreate(request);
      onClose();
    } catch (submissionError) {
      setError(errorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      description="毎日記録するチェック式または数値式の習慣を作成します。"
      onClose={onClose}
      open={open}
      title="習慣を追加"
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="daymark-add-name">
            習慣名
          </label>
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
            data-autofocus
            id="daymark-add-name"
            maxLength={80}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            value={name}
          />
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">記録方法</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ["check", "チェック"],
                ["number", "数値"],
              ] as const
            ).map(([value, label]) => (
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${kind === value ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300"}`}
                key={value}
              >
                <input
                  checked={kind === value}
                  name="kind"
                  onChange={() => setKind(value)}
                  type="radio"
                  value={value}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === "number" ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="daymark-add-target"
              >
                目標値
              </label>
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
                id="daymark-add-target"
                inputMode="decimal"
                max="1000000000"
                min="0"
                onChange={(event) => setTarget(event.currentTarget.value)}
                required
                step="0.001"
                type="number"
                value={target}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="daymark-add-unit"
              >
                単位
              </label>
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
                id="daymark-add-unit"
                maxLength={20}
                onChange={(event) => setUnit(event.currentTarget.value)}
                required
                value={unit}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="daymark-add-comparison"
              >
                達成条件
              </label>
              <select
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
                id="daymark-add-comparison"
                onChange={(event) =>
                  setComparison(event.currentTarget.value as "at_least" | "at_most")
                }
                value={comparison}
              >
                <option value="at_least">目標値以上</option>
                <option value="at_most">目標値以下</option>
              </select>
            </div>
          </div>
        ) : null}
        {error === "" ? null : <p className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "追加中…" : "追加する"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditHabitDialog({
  habit,
  today,
  onClose,
  onSave,
}: {
  readonly habit: HabitDto | null;
  readonly today: string;
  readonly onClose: () => void;
  readonly onSave: (
    habit: HabitDto,
    name: string,
    configuration: PutHabitConfigurationRequest,
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | "archived">("active");
  const [target, setTarget] = useState("0");
  const [unit, setUnit] = useState("");
  const [comparison, setComparison] = useState<"at_least" | "at_most">("at_least");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (habit === null) return;
    setName(habit.name);
    setStatus(habit.configuration.status);
    if (habit.configuration.kind === "number") {
      setTarget(String(habit.configuration.target));
      setUnit(habit.configuration.unit);
      setComparison(habit.configuration.comparison);
    }
    setError("");
  }, [habit]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (habit === null || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const configuration: PutHabitConfigurationRequest =
        habit.configuration.kind === "check"
          ? { kind: "check", status }
          : {
              kind: "number",
              status,
              target: Number(target),
              unit: unit.trim(),
              comparison,
            };
      await onSave(habit, name.trim(), configuration);
      onClose();
    } catch (submissionError) {
      setError(errorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      description={`変更は${formatLongDate(today)}から適用し、過去の達成判定は変えません。`}
      onClose={onClose}
      open={habit !== null}
      title="習慣を編集"
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="daymark-edit-name">
            習慣名
          </label>
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
            data-autofocus
            id="daymark-edit-name"
            maxLength={80}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            value={name}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="daymark-edit-status">
            状態
          </label>
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
            id="daymark-edit-status"
            onChange={(event) =>
              setStatus(event.currentTarget.value as "active" | "paused" | "archived")
            }
            value={status}
          >
            <option value="active">有効</option>
            <option value="paused">休止</option>
            <option value="archived">アーカイブ</option>
          </select>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            休止・アーカイブ中は日々の記録と達成率の対象外です。あとから有効へ戻せます。
          </p>
        </div>
        {habit?.configuration.kind === "number" ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="daymark-edit-target"
              >
                目標値
              </label>
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
                id="daymark-edit-target"
                inputMode="decimal"
                max="1000000000"
                min="0"
                onChange={(event) => setTarget(event.currentTarget.value)}
                required
                step="0.001"
                type="number"
                value={target}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="daymark-edit-unit"
              >
                単位
              </label>
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
                id="daymark-edit-unit"
                maxLength={20}
                onChange={(event) => setUnit(event.currentTarget.value)}
                required
                value={unit}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="daymark-edit-comparison"
              >
                達成条件
              </label>
              <select
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:text-sm"
                id="daymark-edit-comparison"
                onChange={(event) =>
                  setComparison(event.currentTarget.value as "at_least" | "at_most")
                }
                value={comparison}
              >
                <option value="at_least">目標値以上</option>
                <option value="at_most">目標値以下</option>
              </select>
            </div>
          </div>
        ) : null}
        {error === "" ? null : <p className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "保存中…" : "変更を保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SummaryCards({
  rate,
  complete,
  due,
  incomplete,
  unentered,
  perfectDays,
}: {
  readonly rate: number | null;
  readonly complete: number;
  readonly due: number;
  readonly incomplete: number;
  readonly unentered: number;
  readonly perfectDays?: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">達成率</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
          {rate === null ? "—" : `${rate}%`}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">達成した記録</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
          {complete} / {due}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          未達成{incomplete}件・未入力{unentered}件
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">
          {perfectDays === undefined ? "残り" : "すべて達成した日"}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
          {perfectDays === undefined ? `${Math.max(0, due - complete)}件` : `${perfectDays}日`}
        </p>
      </div>
    </div>
  );
}

function CheckRecordCard({
  habit,
  busy,
  onRecord,
  onClear,
}: {
  readonly habit: DailyHabitDto;
  readonly busy: boolean;
  readonly onRecord: (request: PutHabitRecordRequest) => Promise<void>;
  readonly onClear: () => Promise<void>;
}) {
  const checked = habit.record?.kind === "check" ? habit.record.checked : null;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">{habit.name}</h2>
          <p className="mt-1 text-xs text-slate-500">チェック式</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${stateClass(habit.state)}`}
        >
          {stateLabel(habit.state)}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
        <button
          aria-pressed={checked === true}
          className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${checked === true ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-slate-700 hover:bg-emerald-50"}`}
          disabled={busy}
          onClick={() => void onRecord({ kind: "check", checked: true })}
          type="button"
        >
          ✓ 達成
        </button>
        <button
          aria-pressed={checked === false}
          className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${checked === false ? "border-amber-600 bg-amber-500 text-white" : "border-slate-300 text-slate-700 hover:bg-amber-50"}`}
          disabled={busy}
          onClick={() => void onRecord({ kind: "check", checked: false })}
          type="button"
        >
          未達成
        </button>
        {habit.record === null ? null : (
          <button
            className="col-span-2 min-h-11 rounded-lg px-3 text-sm text-slate-500 underline-offset-4 hover:underline sm:ml-auto"
            disabled={busy}
            onClick={() => void onClear()}
            type="button"
          >
            未入力に戻す
          </button>
        )}
      </div>
    </article>
  );
}

function NumericRecordCard({
  habit,
  busy,
  onRecord,
  onClear,
}: {
  readonly habit: DailyHabitDto;
  readonly busy: boolean;
  readonly onRecord: (request: PutHabitRecordRequest) => Promise<void>;
  readonly onClear: () => Promise<void>;
}) {
  const configuration = habit.configuration.kind === "number" ? habit.configuration : null;
  const storedValue = habit.record?.kind === "number" ? habit.record.value : null;
  const [value, setValue] = useState(storedValue === null ? "" : String(storedValue));

  useEffect(() => setValue(storedValue === null ? "" : String(storedValue)), [storedValue]);
  if (configuration === null) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onRecord({ kind: "number", value: Number(value) });
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">{habit.name}</h2>
          <p className="mt-1 text-xs text-slate-500">
            目標 {configuration.target.toLocaleString("ja-JP")} {configuration.unit}
            {configuration.comparison === "at_least" ? "以上" : "以下"}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${stateClass(habit.state)}`}
        >
          {stateLabel(habit.state)}
        </span>
      </div>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => void submit(event)}
      >
        <div className="flex-1">
          <label className="text-sm font-medium text-slate-700" htmlFor={`record-${habit.habitId}`}>
            記録する数値
          </label>
          <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100">
            <input
              className="min-h-11 min-w-0 flex-1 rounded-lg border-0 px-3 text-base outline-none sm:text-sm"
              id={`record-${habit.habitId}`}
              inputMode="decimal"
              max="1000000000"
              min="0"
              onChange={(event) => setValue(event.currentTarget.value)}
              required
              step="0.001"
              type="number"
              value={value}
            />
            <span className="pr-3 text-sm text-slate-500">{configuration.unit}</span>
          </div>
        </div>
        <button
          className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          disabled={busy}
          type="submit"
        >
          記録する
        </button>
        {habit.record === null ? null : (
          <button
            className="min-h-11 rounded-lg px-3 text-sm text-slate-500 underline-offset-4 hover:underline"
            disabled={busy}
            onClick={() => void onClear()}
            type="button"
          >
            未入力に戻す
          </button>
        )}
      </form>
    </article>
  );
}

function DailyView({
  data,
  date,
  today,
  loading,
  error,
  busyHabitId,
  onMove,
  onToday,
  onRetry,
  onRecord,
  onClear,
  onManage,
}: {
  readonly data: DayResponse | null;
  readonly date: string;
  readonly today: string;
  readonly loading: boolean;
  readonly error: string;
  readonly busyHabitId: string | null;
  readonly onMove: (days: number) => void;
  readonly onToday: () => void;
  readonly onRetry: () => void;
  readonly onRecord: (habit: DailyHabitDto, request: PutHabitRecordRequest) => Promise<void>;
  readonly onClear: (habit: DailyHabitDto) => Promise<void>;
  readonly onManage: () => void;
}) {
  return (
    <section>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {date === today ? "今日を少しずつ積み重ねる" : "これまでの記録を整える"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {date === today ? "今日の記録" : "過去の記録"}
          </h1>
        </div>
        <button
          className="min-h-11 self-start rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={onManage}
          type="button"
        >
          習慣を管理
        </button>
      </header>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          aria-label="前の日"
          className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          onClick={() => onMove(-1)}
          type="button"
        >
          ←
        </button>
        <p className="min-w-0 flex-1 text-center font-medium text-slate-900 sm:min-w-64 sm:flex-none">
          {formatLongDate(date)}
        </p>
        <button
          aria-label="次の日"
          className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={date >= today}
          onClick={() => onMove(1)}
          type="button"
        >
          →
        </button>
        {date === today ? null : (
          <button
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onToday}
            type="button"
          >
            今日へ戻る
          </button>
        )}
      </div>
      {loading ? (
        <div aria-label="今日の記録を読み込み中" className="mt-5 space-y-3" role="status">
          {[0, 1].map((item) => (
            <div
              className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white"
              key={item}
            />
          ))}
        </div>
      ) : error !== "" ? (
        <div
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-red-800"
          role="alert"
        >
          <p>{error}</p>
          <button
            className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white"
            onClick={onRetry}
            type="button"
          >
            再読み込み
          </button>
        </div>
      ) : data === null ? null : (
        <>
          <div className="mt-5">
            <SummaryCards {...data.summary} />
          </div>
          {data.habits.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="font-semibold text-slate-900">記録する習慣がありません</h2>
              <p className="mt-2 text-sm text-slate-600">
                習慣を追加するか、休止中の習慣を有効にしてください。
              </p>
              <button
                className="mt-4 min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white"
                onClick={onManage}
                type="button"
              >
                習慣を管理
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {data.habits.map((habit) =>
                habit.configuration.kind === "check" ? (
                  <CheckRecordCard
                    busy={busyHabitId === habit.habitId}
                    habit={habit}
                    key={habit.habitId}
                    onClear={() => onClear(habit)}
                    onRecord={(request) => onRecord(habit, request)}
                  />
                ) : (
                  <NumericRecordCard
                    busy={busyHabitId === habit.habitId}
                    habit={habit}
                    key={habit.habitId}
                    onClear={() => onClear(habit)}
                    onRecord={(request) => onRecord(habit, request)}
                  />
                ),
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function WeekView({
  data,
  start,
  currentWeek,
  loading,
  error,
  onMove,
  onCurrent,
  onRetry,
}: {
  readonly data: WeekResponse | null;
  readonly start: string;
  readonly currentWeek: string;
  readonly loading: boolean;
  readonly error: string;
  readonly onMove: (days: number) => void;
  readonly onCurrent: () => void;
  readonly onRetry: () => void;
}) {
  const dates = datesOfWeek(start);
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            aria-label="前の週"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 bg-white"
            onClick={() => onMove(-7)}
            type="button"
          >
            ←
          </button>
          <p className="min-w-0 flex-1 text-center font-medium sm:min-w-52">
            {formatShortDate(start)}〜{formatShortDate(addCalendarDays(start, 6))}
          </p>
          <button
            aria-label="次の週"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 bg-white disabled:opacity-40"
            disabled={start >= currentWeek}
            onClick={() => onMove(7)}
            type="button"
          >
            →
          </button>
        </div>
        {start === currentWeek ? null : (
          <button
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm"
            onClick={onCurrent}
            type="button"
          >
            今週へ戻る
          </button>
        )}
      </div>
      {loading ? (
        <div className="mt-5 h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : error !== "" ? (
        <div
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-red-800"
          role="alert"
        >
          <p>{error}</p>
          <button
            className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white"
            onClick={onRetry}
            type="button"
          >
            再読み込み
          </button>
        </div>
      ) : data === null ? null : (
        <>
          <div className="mt-5">
            <SummaryCards {...data.summary} />
          </div>
          <section
            className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            aria-labelledby="daymark-week-table"
          >
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h2 className="font-semibold text-slate-950" id="daymark-week-table">
                習慣ごとの1週間
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                横にスクロールして曜日ごとの記録を確認できます。
              </p>
            </div>
            <div className="overflow-x-auto">
              <table
                aria-label="週ごとの習慣達成状況"
                className="w-full min-w-[48rem] border-collapse text-sm"
              >
                <thead>
                  <tr className="text-slate-500">
                    <th className="px-4 py-3 text-left font-medium">習慣</th>
                    {dates.map((date, index) => (
                      <th className="px-2 py-3 font-medium" key={date}>
                        {weekdays[index]}
                        <br />
                        {date.slice(8)}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium">週間</th>
                  </tr>
                </thead>
                <tbody>
                  {data.habits.map((habit) => (
                    <tr className="border-t border-slate-100" key={habit.habitId}>
                      <th className="px-4 py-3 text-left font-medium text-slate-800">
                        {habit.name}
                      </th>
                      {dates.map((date) => {
                        const daily = habit.days.find((item) => item.date === date);
                        return (
                          <td className="px-2 py-3 text-center" key={date}>
                            {daily === undefined ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span
                                className={`inline-grid min-h-8 min-w-12 place-items-center rounded-lg border px-2 text-xs ${stateClass(daily.state)}`}
                              >
                                <span className="sr-only">{stateLabel(daily.state)}: </span>
                                {recordLabel(daily)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-semibold tabular-nums">
                        {habit.summary.rate === null ? "—" : `${habit.summary.rate}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                    <th className="px-4 py-3 text-left">その日の達成率</th>
                    {data.days.map((day) => (
                      <td className="px-2 py-3 text-center tabular-nums" key={day.date}>
                        {day.rate === null ? "—" : `${day.rate}%`}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center tabular-nums">
                      {data.summary.rate === null ? "—" : `${data.summary.rate}%`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function MonthView({
  data,
  month,
  currentMonth,
  today,
  selectedDate,
  loading,
  error,
  onMove,
  onCurrent,
  onSelect,
  onOpenDay,
  onRetry,
}: {
  readonly data: MonthResponse | null;
  readonly month: string;
  readonly currentMonth: string;
  readonly today: string;
  readonly selectedDate: string;
  readonly loading: boolean;
  readonly error: string;
  readonly onMove: (offset: number) => void;
  readonly onCurrent: () => void;
  readonly onSelect: (date: string) => void;
  readonly onOpenDay: (date: string) => void;
  readonly onRetry: () => void;
}) {
  const selected = data?.days.find(({ date }) => date === selectedDate) ?? null;
  const offset = monthCalendarOffset(month);
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            aria-label="前の月"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 bg-white"
            onClick={() => onMove(-1)}
            type="button"
          >
            ←
          </button>
          <p className="min-w-0 flex-1 text-center font-medium sm:min-w-44">{formatMonth(month)}</p>
          <button
            aria-label="次の月"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 bg-white disabled:opacity-40"
            disabled={month >= currentMonth}
            onClick={() => onMove(1)}
            type="button"
          >
            →
          </button>
        </div>
        {month === currentMonth ? null : (
          <button
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm"
            onClick={onCurrent}
            type="button"
          >
            今月へ戻る
          </button>
        )}
      </div>
      {loading ? (
        <div className="mt-5 h-96 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : error !== "" ? (
        <div
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-red-800"
          role="alert"
        >
          <p>{error}</p>
          <button
            className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white"
            onClick={onRetry}
            type="button"
          >
            再読み込み
          </button>
        </div>
      ) : data === null ? null : (
        <>
          <div className="mt-5">
            <SummaryCards {...data.summary} />
          </div>
          <section
            className="mt-5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5"
            aria-label={`${formatMonth(month)}の達成カレンダー`}
          >
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {weekdays.map((weekday) => (
                <span className="py-2 text-center text-xs font-medium text-slate-500" key={weekday}>
                  {weekday}
                </span>
              ))}
              {weekdays.slice(0, offset).map((weekday) => (
                <span aria-hidden="true" key={`empty-${weekday}`} />
              ))}
              {data.days.map((day) => {
                const future = day.date > today;
                const color =
                  future || day.due === 0
                    ? "border-slate-200 bg-slate-50 text-slate-500"
                    : day.rate === 100
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : day.unentered > 0
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-amber-200 bg-amber-50 text-amber-800";
                return (
                  <button
                    aria-label={`${formatLongDate(day.date)} ${future ? "未来" : completionText(day.complete, day.due, day.rate)}`}
                    aria-pressed={selectedDate === day.date}
                    className={`grid min-h-14 min-w-0 content-between rounded-lg border p-1.5 text-left text-xs sm:min-h-20 sm:p-2 ${color} ${selectedDate === day.date ? "ring-2 ring-blue-600 ring-offset-1" : ""}`}
                    key={day.date}
                    onClick={() => onSelect(day.date)}
                    type="button"
                  >
                    <span className="font-medium tabular-nums">{Number(day.date.slice(8))}</span>
                    <span className="truncate text-center tabular-nums">
                      {future || day.rate === null ? "—" : `${day.rate}%`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          {selected === null ? null : (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">{formatLongDate(selected.date)}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {selected.date > today
                    ? "未来の日付です"
                    : completionText(selected.complete, selected.due, selected.rate)}
                </p>
              </div>
              <button
                className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-40"
                disabled={selected.date > today}
                onClick={() => onOpenDay(selected.date)}
                type="button"
              >
                この日の記録を見る
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function HistoryView(props: {
  readonly period: HistoryPeriod;
  readonly setPeriod: (period: HistoryPeriod) => void;
  readonly week: ComponentProps<typeof WeekView>;
  readonly month: ComponentProps<typeof MonthView>;
}) {
  return (
    <section>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">日々の記録を振り返る</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">履歴</h1>
        </div>
        <fieldset className="inline-grid self-start grid-cols-2 rounded-xl border border-slate-300 bg-white p-1">
          <legend className="sr-only">表示単位</legend>
          {(["week", "month"] as const).map((value) => (
            <button
              aria-pressed={props.period === value}
              className={`min-h-9 rounded-lg px-5 text-sm font-medium ${props.period === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              key={value}
              onClick={() => props.setPeriod(value)}
              type="button"
            >
              {value === "week" ? "週" : "月"}
            </button>
          ))}
        </fieldset>
      </header>
      <div className="mt-6">
        {props.period === "week" ? <WeekView {...props.week} /> : <MonthView {...props.month} />}
      </div>
    </section>
  );
}

function HabitManagementView({
  habits,
  loading,
  error,
  onRetry,
  onAdd,
  onEdit,
}: {
  readonly habits: readonly HabitDto[];
  readonly loading: boolean;
  readonly error: string;
  readonly onRetry: () => void;
  readonly onAdd: () => void;
  readonly onEdit: (habit: HabitDto) => void;
}) {
  const statusLabels = { active: "有効", paused: "休止", archived: "アーカイブ" } as const;
  return (
    <section>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">記録する内容と目標を整える</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">習慣管理</h1>
        </div>
        <button
          className="min-h-11 self-start rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={onAdd}
          type="button"
        >
          ＋ 習慣を追加
        </button>
      </header>
      {loading ? (
        <div className="mt-6 h-56 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : error !== "" ? (
        <div
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-red-800"
          role="alert"
        >
          <p>{error}</p>
          <button
            className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white"
            onClick={onRetry}
            type="button"
          >
            再読み込み
          </button>
        </div>
      ) : habits.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="font-semibold text-slate-900">まだ習慣がありません</h2>
          <p className="mt-2 text-sm text-slate-600">
            最初の習慣を追加して、今日から記録を始めましょう。
          </p>
          <button
            className="mt-4 min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white"
            onClick={onAdd}
            type="button"
          >
            習慣を追加
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {habits.map((habit) => (
            <article
              className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
              key={habit.id}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-950">{habit.name}</h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${habit.configuration.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {statusLabels[habit.configuration.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {habit.configuration.kind === "check"
                    ? "チェック式"
                    : `${habit.configuration.target.toLocaleString("ja-JP")} ${habit.configuration.unit}${habit.configuration.comparison === "at_least" ? "以上" : "以下"}`}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatShortDate(habit.createdOn)}から記録
                </p>
              </div>
              <button
                className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => onEdit(habit)}
                type="button"
              >
                編集
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Navigation({
  section,
  mobile = false,
  onSelect,
}: {
  readonly section: Section;
  readonly mobile?: boolean;
  readonly onSelect: (section: Section) => void;
}) {
  const items = [
    { value: "today", label: "今日", glyph: "✓" },
    { value: "history", label: "履歴", glyph: "▦" },
    { value: "habits", label: "習慣管理", glyph: "☷" },
  ] as const;
  return items.map((item) => (
    <button
      aria-current={section === item.value ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-lg text-sm font-medium transition-colors ${mobile ? "min-w-0 flex-1 flex-col justify-center gap-0.5 px-1 text-xs" : "w-full px-3"} ${section === item.value ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
      key={item.value}
      onClick={() => onSelect(item.value)}
      type="button"
    >
      <span aria-hidden="true" className="text-base leading-none">
        {item.glyph}
      </span>
      <span>{item.label}</span>
    </button>
  ));
}

function Brand() {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-lg bg-blue-600 text-lg font-bold text-white shadow-sm"
      >
        ✓
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-tight text-slate-900">Daymark</span>
        <span className="block text-xs text-slate-500">Every day counts</span>
      </span>
    </div>
  );
}

export function DaymarkApp({ client, now = defaultNow, portalHref = "/" }: DaymarkAppProps) {
  const today = browserJstDate(now());
  const [section, setSection] = useState<Section>("today");
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("week");
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedMonthDate, setSelectedMonthDate] = useState(today);
  const [day, setDay] = useState<DayResponse | null>(null);
  const [week, setWeek] = useState<WeekResponse | null>(null);
  const [monthData, setMonthData] = useState<MonthResponse | null>(null);
  const [habits, setHabits] = useState<readonly HabitDto[]>([]);
  const [loadingDay, setLoadingDay] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingHabits, setLoadingHabits] = useState(false);
  const [dayError, setDayError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [habitsError, setHabitsError] = useState("");
  const [refreshDay, setRefreshDay] = useState(0);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [refreshHabits, setRefreshHabits] = useState(0);
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [addingHabit, setAddingHabit] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitDto | null>(null);

  useEffect(() => {
    if (section !== "today") return;
    const controller = new AbortController();
    void refreshDay;
    setLoadingDay(true);
    setDayError("");
    client
      .getDay(selectedDate, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setDay(response);
      })
      .catch((error: unknown) => {
        const message = errorMessage(error);
        if (message !== "") setDayError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDay(false);
      });
    return () => controller.abort();
  }, [client, refreshDay, section, selectedDate]);

  useEffect(() => {
    if (section !== "history") return;
    const controller = new AbortController();
    void refreshHistory;
    setLoadingHistory(true);
    setHistoryError("");
    const request =
      historyPeriod === "week"
        ? client.getWeek(weekStart, controller.signal)
        : client.getMonth(month, controller.signal);
    request
      .then((response) => {
        if (controller.signal.aborted) return;
        if (historyPeriod === "week") setWeek(response as WeekResponse);
        else {
          const next = response as MonthResponse;
          setMonthData(next);
          const preferred = month === today.slice(0, 7) ? today : `${month}-01`;
          setSelectedMonthDate(preferred);
        }
      })
      .catch((error: unknown) => {
        const message = errorMessage(error);
        if (message !== "") setHistoryError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHistory(false);
      });
    return () => controller.abort();
  }, [client, historyPeriod, month, refreshHistory, section, today, weekStart]);

  useEffect(() => {
    if (section !== "habits") return;
    const controller = new AbortController();
    void refreshHabits;
    setLoadingHabits(true);
    setHabitsError("");
    client
      .listHabits(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setHabits(response.habits);
      })
      .catch((error: unknown) => {
        const message = errorMessage(error);
        if (message !== "") setHabitsError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHabits(false);
      });
    return () => controller.abort();
  }, [client, refreshHabits, section]);

  const selectSection = useCallback(
    (next: Section) => {
      setMutationError("");
      if (next === "today") setSelectedDate(today);
      setSection(next);
    },
    [today],
  );

  async function record(habit: DailyHabitDto, request: PutHabitRecordRequest) {
    setBusyHabitId(habit.habitId);
    setMutationError("");
    try {
      setDay(await client.putRecord(habit.habitId, selectedDate, request));
      setRefreshHistory((value) => value + 1);
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setBusyHabitId(null);
    }
  }

  async function clearRecord(habit: DailyHabitDto) {
    setBusyHabitId(habit.habitId);
    setMutationError("");
    try {
      await client.deleteRecord(habit.habitId, selectedDate);
      setDay(await client.getDay(selectedDate));
      setRefreshHistory((value) => value + 1);
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setBusyHabitId(null);
    }
  }

  async function createHabit(request: CreateHabitRequest) {
    await client.createHabit(request);
    setRefreshDay((value) => value + 1);
    setRefreshHabits((value) => value + 1);
    setRefreshHistory((value) => value + 1);
  }

  async function updateHabit(
    habit: HabitDto,
    name: string,
    configuration: PutHabitConfigurationRequest,
  ) {
    if (name !== habit.name) await client.renameHabit(habit.id, name);
    await client.putConfiguration(habit.id, today, configuration);
    setRefreshDay((value) => value + 1);
    setRefreshHabits((value) => value + 1);
    setRefreshHistory((value) => value + 1);
  }

  const currentWeek = mondayOf(today);
  const currentMonth = today.slice(0, 7);
  return (
    <div className="min-h-dvh bg-[#f5f7fb] text-slate-800 md:pl-56">
      <aside className="hidden border-r border-slate-200 bg-white px-4 py-5 md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-56 md:flex-col md:overflow-y-auto">
        <Brand />
        <nav aria-label="Daymark メインナビゲーション" className="mt-8 flex flex-col gap-1">
          <Navigation onSelect={selectSection} section={section} />
        </nav>
        <div className="mt-auto px-3 pt-6">
          <a
            className="inline-flex min-h-11 items-center text-xs text-blue-700 hover:underline"
            href={portalHref}
          >
            ← rizakura-hontaiへ
          </a>
          <p className="text-xs leading-5 text-slate-400">自分だけの習慣記録</p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-x-3 border-b border-slate-200/90 bg-white/95 px-4 py-2 backdrop-blur md:hidden">
          <Brand />
          <a className="inline-flex min-h-11 items-center text-xs text-blue-700" href={portalHref}>
            ← 入口へ
          </a>
        </header>
        <main className="mx-auto min-w-0 max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-10 lg:px-10">
          {mutationError === "" ? null : (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {mutationError}
            </div>
          )}
          {section === "today" ? (
            <DailyView
              busyHabitId={busyHabitId}
              data={day}
              date={selectedDate}
              error={dayError}
              loading={loadingDay}
              onClear={clearRecord}
              onManage={() => setSection("habits")}
              onMove={(days) => setSelectedDate((value) => addCalendarDays(value, days))}
              onRecord={record}
              onRetry={() => setRefreshDay((value) => value + 1)}
              onToday={() => setSelectedDate(today)}
              today={today}
            />
          ) : null}
          {section === "history" ? (
            <HistoryView
              month={{
                currentMonth,
                data: monthData,
                error: historyError,
                loading: loadingHistory,
                month,
                onCurrent: () => setMonth(currentMonth),
                onMove: (offset) => setMonth((value) => shiftMonth(value, offset)),
                onOpenDay: (date) => {
                  setSelectedDate(date);
                  setSection("today");
                },
                onRetry: () => setRefreshHistory((value) => value + 1),
                onSelect: setSelectedMonthDate,
                selectedDate: selectedMonthDate,
                today,
              }}
              period={historyPeriod}
              setPeriod={setHistoryPeriod}
              week={{
                currentWeek,
                data: week,
                error: historyError,
                loading: loadingHistory,
                onCurrent: () => setWeekStart(currentWeek),
                onMove: (days) => setWeekStart((value) => addCalendarDays(value, days)),
                onRetry: () => setRefreshHistory((value) => value + 1),
                start: weekStart,
              }}
            />
          ) : null}
          {section === "habits" ? (
            <HabitManagementView
              error={habitsError}
              habits={habits}
              loading={loadingHabits}
              onAdd={() => setAddingHabit(true)}
              onEdit={setEditingHabit}
              onRetry={() => setRefreshHabits((value) => value + 1)}
            />
          ) : null}
        </main>
      </div>
      <nav
        aria-label="Daymark モバイルナビゲーション"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 px-2 pt-1.5 backdrop-blur md:hidden"
      >
        <Navigation mobile onSelect={selectSection} section={section} />
      </nav>
      <AddHabitDialog
        onClose={() => setAddingHabit(false)}
        onCreate={createHabit}
        open={addingHabit}
      />
      <EditHabitDialog
        habit={editingHabit}
        onClose={() => setEditingHabit(null)}
        onSave={updateHabit}
        today={today}
      />
    </div>
  );
}
