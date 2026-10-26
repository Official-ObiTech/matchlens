import { requireUser } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ id: u.id, email: u.email, role: u.role });
});
