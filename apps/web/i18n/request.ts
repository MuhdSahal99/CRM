import { getRequestConfig } from "next-intl/server";

// shortcut: English only (PRD MVP); add locale negotiation when ar.json lands in Phase 2.
export default getRequestConfig(async () => {
  const locale = "en";
  // Business dates are interpreted in Asia/Muscat (SCHEMA.md conventions).
  // Named formats: components say `format.dateTime(d, "when")`, so no style strings sit in JSX.
  const formats = { dateTime: { when: { dateStyle: "medium", timeStyle: "short" }, day: { dateStyle: "medium", timeZone: "UTC" } } } as const;
  return { locale, timeZone: "Asia/Muscat", formats, messages: (await import(`../messages/${locale}.json`)).default };
});
