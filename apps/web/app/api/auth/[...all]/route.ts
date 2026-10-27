import { getAuth } from "@crm/core";

// Better Auth's endpoints (sign-in, sign-out, session, organization, admin). No other sign-in path exists.
const handler = (request: Request) => getAuth().handler(request);

export { handler as GET, handler as POST };
