
import { neon } from "@neondatabase/serverless";

export async function onRequestGet(context) {
  const sql = neon(context.env.DATABASE_URL);
  const result = await sql`SELECT NOW() as time`;
  return Response.json({status:"ok", time: result[0].time});
}
