/** Σ of server-computed OMR totals (decimal strings, 3 places), added in thousandths so no float is involved. */
export function sumOmr(totals: string[]): string {
  const n = totals.reduce((s, v) => s + BigInt(v.replace(".", "")), 0n);
  return `${n / 1000n}.${(n % 1000n).toString().padStart(3, "0")}`;
}
