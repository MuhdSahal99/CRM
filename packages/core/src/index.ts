// Public API of @crm/core; modules are added per task (docs/PLAN.md).
export { parseConfig, type Config } from "./config.ts";
export { getAuth } from "./auth.ts";
export { resolveContext } from "./context.ts";
export { bootCheck } from "./boot-check.ts";
export { withTenant, type Role, type TenantContext, type Tx } from "./tenant.ts";
export { roles, type Permission } from "./access.ts";
export { errorResponse, type Envelope, type Info } from "./http/envelope.ts";
export { ApiError, Conflict, Forbidden, NotFound, PayloadTooLarge, Unauthorized, readJsonBody, validationError } from "./http/errors.ts";
export { idempotent, requestHash } from "./http/idempotency.ts";
export { log } from "./log.ts";
export { recordEvent, type TimelineEvent } from "./timeline.ts";
export { buildRecordSchema, type FieldDef } from "./metadata/record-schema.ts";
export { provisionOrg, SYSTEM_MODULES } from "./metadata/seed-org.ts";
export { seedAll } from "./seed.ts";
export { listFields, listModules, ModuleName } from "./metadata/settings.ts";
export { deactivateUser, getMe, getUser, InviteUsersInput, inviteUsers, ListUsersInput, listUsers, RoleName, UpdateUserInput, updateUser } from "./users.ts";
