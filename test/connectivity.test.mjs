import { describe, expect, it } from "vitest";
import { daymarkPlaceholder } from "../src/browser.ts";
import { DAYMARK_PRODUCT } from "../src/contracts.ts";
import { daymarkSchema } from "../src/schema.ts";
import { getDaymarkConnectionStatus } from "../src/server.ts";

describe("Phase 20 connectivity only", () => {
  it("does not present a usable habit product", () => {
    expect(daymarkPlaceholder).toEqual({ name: "Daymark", label: "準備中" });
  });
  it("returns non-sensitive metadata without accessing DB, identity or network", () => {
    expect(getDaymarkConnectionStatus()).toEqual({
      product: DAYMARK_PRODUCT,
      status: "not_configured",
    });
    expect(DAYMARK_PRODUCT).toBe("daymark");
  });
  it("does not share mutable request state", () => {
    const first = getDaymarkConnectionStatus();
    first.status = "changed";
    expect(getDaymarkConnectionStatus().status).toBe("not_configured");
  });
  it("defines no business tables", () => {
    expect(daymarkSchema).toEqual({});
  });
});
