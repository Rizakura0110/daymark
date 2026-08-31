// Connectivity metadata only. Habit contracts require the owner's Phase 21 design.
export const DAYMARK_PRODUCT = "daymark";
export type DaymarkConnectionStatus = {
  readonly product: typeof DAYMARK_PRODUCT;
  readonly status: "not_configured";
};
