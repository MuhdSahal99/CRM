import { getRequestConfig } from "next-intl/server";

// shortcut: English only (PRD MVP); add locale negotiation when ar.json lands in Phase 2.
export default getRequestConfig(async () => {
  const locale = "en";
  // Business dates are interpreted in Asia/Muscat (SCHEMA.md conventions).
  return { locale, timeZone: "Asia/Muscat", messages: (await import(`../messages/${locale}.json`)).default };
});
