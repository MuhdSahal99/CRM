import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc } from "better-auth/plugins/organization/access";

// ADR-0005 roles for Better Auth's own organization endpoints: only an Admin manages members and invitations.
// The CRM permission matrix (records, settings, targets, import) is added to this statement with the API wrapper (T1.13).
export const ac = createAccessControl(defaultStatements);

export const roles = {
  admin: ac.newRole(adminAc.statements),
  manager: ac.newRole(memberAc.statements),
  rep: ac.newRole(memberAc.statements),
};
