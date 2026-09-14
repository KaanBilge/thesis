import { getBriefStore } from "@/server/briefs";
import { failure, json, jsonBody, localRequest } from "@/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { localRequest(request); return json({ items: getBriefStore().list() }); }
  catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    localRequest(request);
    const result = getBriefStore().save(await jsonBody(request, 2_100_000));
    return json({ ...result, path: `/?brief=${result.brief.id}` }, result.duplicate ? 200 : 201);
  } catch (e) { return failure(e); }
}
