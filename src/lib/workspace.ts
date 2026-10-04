import type { Db } from "@/db/client";

/**
 * Phase 1 runs single-user locally: one local user and one workspace are created on first use.
 * The schema is already multi-user/multi-workspace; sign-in is added in a later phase.
 */
export async function getDefaultWorkspaceId(db: Db): Promise<string> {
  const existing = await db.query<{ id: string }>(`select id from workspaces order by created_at limit 1`);
  if (existing[0]) return existing[0].id;
  return db.transaction(async (tx) => {
    const [user] = await tx.query<{ id: string }>(
      `insert into users(display_name, email) values ('مستخدم محلي', null) returning id`,
    );
    const [ws] = await tx.query<{ id: string }>(
      `insert into workspaces(name, owner_id) values ('مساحة العمل', $1) returning id`, [user.id],
    );
    await tx.query(`insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'owner')`, [ws.id, user.id]);
    return ws.id;
  });
}
