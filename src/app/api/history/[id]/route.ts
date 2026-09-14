import { getStore } from "@/server/db/store";
import { failure, json, localRequest, validId } from "@/server/http";
import { AppError } from "@/server/errors";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    localRequest(request);
    const saved = getStore().read(validId((await context.params).id));
    if (!saved) throw new AppError("NOT_FOUND", "This analysis was not found. It may have been deleted.", 404);
    return json(saved);
  } catch (e) { return failure(e); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    localRequest(request);
    if (!getStore().delete(validId((await context.params).id))) throw new AppError("NOT_FOUND", "This analysis has already been deleted.", 404);
    return json({ deleted: true });
  } catch (e) { return failure(e); }
}
