import { getStore } from "@/server/db/store";
import { failure, json, localRequest } from "@/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { localRequest(request); return json({ items: getStore().list() }); }
  catch (e) { return failure(e); }
}
