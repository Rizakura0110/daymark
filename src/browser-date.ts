const JST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

export function browserJstDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("Daymark received an invalid date.");
  return new Date(value.getTime() + JST_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  return addCalendarDays(date, -((value.getUTCDay() + 6) % 7));
}

export function shiftMonth(month: string, offset: number): string {
  const value = new Date(`${month}-01T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 7);
}

export function datesOfWeek(start: string): readonly string[] {
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
}

export function monthCalendarOffset(month: string): number {
  const day = new Date(`${month}-01T00:00:00.000Z`).getUTCDay();
  return (day + 6) % 7;
}

export function formatJapaneseDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ja-JP", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );
}
