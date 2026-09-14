import { after } from "next/server";
import { z } from "zod";
import { TickerSchema } from "@/lib/schemas";
import { startAnalysis } from "@/server/start-analysis";
import { failure, json, jsonBody, localRequest } from "@/server/http";
export const runtime = "nodejs";
export const maxDuration = 660;
export async function POST(request: Request) {
  try {
    localRequest(request);
    const body = z.strictObject({ ticker: TickerSchema, refresh: z.boolean().optional() }).parse(await jsonBody(request));
    const result = startAnalysis(body.ticker, body.refresh ?? false, after);
    return json(result, result.cached ? 200 : 202);
  } catch (e) { return failure(e); }
}
