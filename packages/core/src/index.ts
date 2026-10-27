// Public API of @crm/core; modules are added per task (docs/PLAN.md).
export { parseConfig, type Config } from "./config";
export { getAuth } from "./auth";
export { bootCheck } from "./boot-check";
export { withTenant, type Role, type TenantContext, type Tx } from "./tenant";
