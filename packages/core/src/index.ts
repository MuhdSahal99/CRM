// Public API of @crm/core; modules are added per task (docs/PLAN.md).
export { parseConfig, type Config } from "./config";
export { getAuth } from "./auth";
export { resolveContext } from "./context";
export { bootCheck } from "./boot-check";
export { withTenant, type Role, type TenantContext, type Tx } from "./tenant";
export { roles, type Permission } from "./access";
export { errorResponse, type Envelope, type Info } from "./http/envelope";
export { ApiError, Conflict, Forbidden, NotFound, PayloadTooLarge, Unauthorized, readJsonBody, validationError } from "./http/errors";
export { log } from "./log";
