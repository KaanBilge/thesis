import { after } from "next/server";
import { getStore } from "@/server/db/store";
import { startAnalysis } from "@/server/start-analysis";
import { AppError } from "@/server/errors";
import { failure, json, localRequest, validId } from "@/server/http";
export const runtime = "nodejs";
export const maxDuration = 660;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    localRequest(request);
    const analysis = getStore().read(validId((await context.params).id));
    if (!analysis) throw new AppError("NOT_FOUND", "This saved analysis was not found.", 404);
    const result = startAnalysis(analysis.ticker, true, after);
    return json(result, result.cached ? 200 : 202);
  } catch (e) { return failure(e); }
}
