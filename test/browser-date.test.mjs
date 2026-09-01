import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  browserJstDate,
  datesOfWeek,
  formatJapaneseDate,
  mondayOf,
  monthCalendarOffset,
  shiftMonth,
} from "../src/browser-date.ts";

describe("browser date helpers", () => {
  it("uses the calendar date in Japan", () => {
    expect(browserJstDate(new Date("2026-08-31T15:00:00.000Z"))).toBe("2026-09-01");
    expect(() => browserJstDate(new Date(Number.NaN))).toThrow("invalid date");
  });

  it("moves dates, weeks, and months without using the browser time zone", () => {
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(mondayOf("2026-09-06")).toBe("2026-08-31");
    expect(datesOfWeek("2026-08-31")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("provides Monday-first offsets and Japanese labels", () => {
    expect(monthCalendarOffset("2026-06")).toBe(0);
    expect(monthCalendarOffset("2026-09")).toBe(1);
    expect(formatJapaneseDate("2026-09-01", { year: "numeric", month: "long" })).toBe("2026年9月");
  });
});
