import { afterAll, describe, expect, it, vi } from "vitest";
import { closeQueues } from "@crm/core";

// The accept-invite action reads the caller's address through next/headers, which only exists inside a Next request.
let currentIp = "unset";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": currentIp }) }));

const { acceptInvite } = await import("../app/accept-invite/[token]/actions");
const shareRoute = await import("../app/s/[token]/route");

const randomIp = () => `10.${Array.from({ length: 3 }, () => Math.floor(Math.random() * 256)).join(".")}`;
const badToken = () => Array.from({ length: 43 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
const open = (token: string, ip: string) => shareRoute.GET(new Request(`http://localhost:3000/s/${token}`, { headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ token }) });

afterAll(() => closeQueues());

describe("rate limits on the public token routes (T9.07)", () => {
  it("AC-02: 100 bad tokens from one IP are 429 past the limit, while another IP is unaffected", async () => {
    const [noisy, quiet] = [randomIp(), randomIp()];
    const statuses: number[] = [];
    for (let i = 0; i < 100; i++) statuses.push((await open(badToken(), noisy)).status);
    expect(statuses[0]).toBe(404);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(85); // blocked after ten bad tokens, whatever the burst limit
    expect(statuses.every((s) => s === 404 || s === 429)).toBe(true);
    const blocked = await open(badToken(), noisy);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked.text()).not.toMatch(/token|expired/i); // says nothing about any token
    expect((await open(badToken(), quiet)).status).toBe(404);
  });

  it("the burst limit caps even requests that are not bad tokens: 30 a minute per IP", async () => {
    const ip = randomIp();
    const statuses: number[] = [];
    // A malformed token is bad too, so use the limiter's own counters: 30 allowed requests, then 429 (the bad-token block may trip first).
    for (let i = 0; i < 35; i++) statuses.push((await open(badToken(), ip)).status);
    expect(statuses.slice(0, 5).every((s) => s === 404)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("carry-over: the accept-invite action uses the same limiter: five bad tokens, then 'limited'; another IP is unaffected", async () => {
    const [noisy, quiet] = [randomIp(), randomIp()];
    const attempt = async (ip: string) => {
      currentIp = ip;
      return acceptInvite(badToken(), { name: "New Hire", password: "a-long-enough-password-1" });
    };
    for (let i = 0; i < 5; i++) expect(await attempt(noisy)).toEqual({ ok: false, reason: "gone" });
    expect(await attempt(noisy)).toEqual({ ok: false, reason: "gone" }); // the sixth bad token trips the block...
    expect(await attempt(noisy)).toEqual({ ok: false, reason: "limited" }); // ...and the next attempt is refused
    expect(await attempt(quiet)).toEqual({ ok: false, reason: "gone" });
  });
});
