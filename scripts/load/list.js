// T11.11 (PRD E11 / M6): list p95 < 1 s on a 100k-record tenant. k6 exits non-zero when the threshold is missed, so CI and the staging run fail.
//
//   pnpm --filter @crm/db exec node --experimental-transform-types src/seed-perf.ts     (once, against staging)
//   BASE_URL=https://staging.example COOKIE='<signed-in session cookie>' k6 run scripts/load/list.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: { lists: { executor: "constant-arrival-rate", rate: 20, timeUnit: "1s", duration: "2m", preAllocatedVUs: 20, maxVUs: 60 } },
  thresholds: {
    "http_req_duration{kind:list}": ["p(95)<1000"], // the budget
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

const MODULES = ["Accounts", "Contacts", "Leads", "Deals"];

export default function () {
  const module = MODULES[Math.floor(Math.random() * MODULES.length)];
  const page = 1 + Math.floor(Math.random() * 200); // deep pages too, not only the first
  const res = http.get(`${__ENV.BASE_URL}/api/v1/${module}?per_page=50&page=${page}`, { headers: { cookie: __ENV.COOKIE }, tags: { kind: "list" } });
  check(res, { "200": (r) => r.status === 200, "a page of records": (r) => Array.isArray(r.json("data")) });
}
