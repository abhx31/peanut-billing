// Report names for the Excel downloads, shared by the download button (client) and /api/export.

export const REPORTS = ["day", "ledger", "expenses", "receivables", "balances", "gst", "patti"] as const;
export type Report = (typeof REPORTS)[number];

export const REPORT_FILE: Record<Report, string> = {
  day: "day-report",
  ledger: "daily-ledger",
  expenses: "expenses",
  receivables: "receivables",
  balances: "balances",
  gst: "gst-bills",
  patti: "patti-bills",
};
