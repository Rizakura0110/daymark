import { describe, expect, it } from "vitest";
import { daymarkPlaceholder } from "../src/browser.ts";
import { DAYMARK_PRODUCT } from "../src/contracts.ts";
import { daymarkSchema } from "../src/schema.ts";
import { getDaymarkConnectionStatus } from "../src/server.ts";

describe("Daymark integration metadata", () => {
  it("keeps the browser placeholder until the Phase 22 screen is integrated", () => {
    expect(daymarkPlaceholder).toEqual({ name: "Daymark", label: "準備中" });
  });
  it("reports the Phase 21 API model and fixed day boundary without secrets", () => {
    expect(getDaymarkConnectionStatus()).toEqual({
      product: DAYMARK_PRODUCT,
      status: "ready",
      timeZone: "Asia/Tokyo",
    });
    expect(DAYMARK_PRODUCT).toBe("daymark");
  });
  it("does not share mutable request state", () => {
    const first = getDaymarkConnectionStatus();
    first.status = "changed";
    expect(getDaymarkConnectionStatus().status).toBe("ready");
  });
  it("defines only the three prefixed business tables", () => {
    expect(Object.keys(daymarkSchema)).toEqual([
      "daymarkHabits",
      "daymarkHabitVersions",
      "daymarkRecords",
    ]);
  });
});
