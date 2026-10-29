// T11.11 (PRD E11 / M6): record detail p95 < 1 s on a 100k-record tenant, with its related lists and timeline as the page loads them.
//
//   BASE_URL=https://staging.example COOKIE='<signed-in session cookie>' k6 run scripts/load/detail.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: { details: { executor: "constant-arrival-rate", rate: 20, timeUnit: "1s", duration: "2m", preAllocatedVUs: 20, maxVUs: 60 } },
  thresholds: {
    "http_req_duration{kind:detail}": ["p(95)<1000"], // the budget
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

const headers = { cookie: __ENV.COOKIE };

/** Ids spread over the whole tenant: pages from the start, the middle and the end of the list. */
export function setup() {
  const ids = [];
  for (const page of [1, 100, 400, 700, 790]) {
    const res = http.get(`${__ENV.BASE_URL}/api/v1/Accounts?per_page=50&page=${page}`, { headers });
    for (const row of res.json("data") || []) ids.push(row.id);
  }
  if (ids.length === 0) throw new Error("No accounts found: seed the tenant first (packages/db/src/seed-perf.ts).");
  return { ids };
}

export default function ({ ids }) {
  const id = ids[Math.floor(Math.random() * ids.length)];
  const record = http.get(`${__ENV.BASE_URL}/api/v1/Accounts/${id}`, { headers, tags: { kind: "detail" } });
  const contacts = http.get(`${__ENV.BASE_URL}/api/v1/Accounts/${id}/Contacts?per_page=50`, { headers, tags: { kind: "detail" } });
  const timeline = http.get(`${__ENV.BASE_URL}/api/v1/Accounts/${id}/timeline?per_page=50`, { headers, tags: { kind: "detail" } });
  check(record, { "record 200": (r) => r.status === 200 });
  check(contacts, { "related 200": (r) => r.status === 200 });
  check(timeline, { "timeline 200": (r) => r.status === 200 });
}
