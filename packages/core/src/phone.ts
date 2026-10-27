import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

/** A phone as E.164 (US-06), read in `country` unless it is already international; null when it is not a valid number. */
export function toE164(input: string, country: string | null): string | null {
  const phone = parsePhoneNumberFromString(input, country ? (country.toUpperCase() as CountryCode) : undefined);
  return phone?.isValid() ? phone.number : null;
}
