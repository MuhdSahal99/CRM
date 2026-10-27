// Runs once per server instance, before it serves requests: bad config or an unsafe DB role stops the start (T1.07).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // the edge runtime has no database access
  const { bootCheck } = await import("@crm/core");
  await bootCheck();
}
