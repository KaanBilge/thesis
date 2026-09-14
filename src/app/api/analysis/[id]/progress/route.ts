import { getStore } from "@/server/db/store";
import { AppError } from "@/server/errors";
import { failure, json, localRequest, validId } from "@/server/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    localRequest(request);
    const job = getStore().progress(validId((await context.params).id));
    if (!job) throw new AppError("NOT_FOUND", "This research job was not found. Start the ticker again.", 404);
    return json(job);
  } catch (e) { return failure(e); }
}
