import { DAYMARK_PRODUCT, type DaymarkConnectionStatus } from "./contracts.js";

// The foundation owns authentication and HTTP transport. This stub needs no bindings.
export function getDaymarkConnectionStatus(): DaymarkConnectionStatus {
  return { product: DAYMARK_PRODUCT, status: "not_configured" };
}
