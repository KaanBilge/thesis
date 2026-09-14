import { failure, json, localRequest } from "@/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { localRequest(request); return json({ configured: Boolean(process.env.OPENAI_API_KEY?.trim()) }); }
  catch (e) { return failure(e); }
}
