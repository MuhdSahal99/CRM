import { InviteUsersInput, inviteUsers, ListUsersInput, listUsers, parseConfig } from "@crm/core";
import { apiRoute } from "@/lib/api";

export const GET = apiRoute({ input: ListUsersInput }, ({ tx, input }) => listUsers(tx, input));

export const POST = apiRoute({ input: InviteUsersInput, permission: { user: ["manage"] }, status: 201, idempotent: true }, async ({ tx, ctx, input }) => ({
  data: await inviteUsers(tx, ctx, input, parseConfig(process.env).BETTER_AUTH_URL),
}));
