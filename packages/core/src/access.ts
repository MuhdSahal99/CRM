import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc } from "better-auth/plugins/organization/access";

// ADR-0005 permission matrix: what a role may do at all (403 otherwise). Which rows it sees is RLS's job.
// The organization statements keep Better Auth's own member/invitation endpoints Admin-only.
const statement = {
  ...defaultStatements,
  record: ["create", "read", "update", "delete"], // visible rows of every CRM module
  user: ["manage"], // users, roles, transfer
  settings: ["read", "update"], // products, VAT rates, currencies, exchange rates, org settings
  forecast_target: ["read", "update"], // update: Admin any, Manager own team (scoped in the service)
  import: ["run"], // Zoho import
} as const;

export const ac = createAccessControl(statement);

const crmUser = { record: ["create", "read", "update", "delete"], settings: ["read"] } as const;

export const roles = {
  admin: ac.newRole({
    ...adminAc.statements,
    record: ["create", "read", "update", "delete"],
    user: ["manage"],
    settings: ["read", "update"],
    forecast_target: ["read", "update"],
    import: ["run"],
  }),
  manager: ac.newRole({ ...memberAc.statements, ...crmUser, forecast_target: ["read", "update"] }),
  rep: ac.newRole({ ...memberAc.statements, ...crmUser, forecast_target: ["read"] }),
};

export type Permission = Parameters<(typeof roles)["admin"]["authorize"]>[0];
