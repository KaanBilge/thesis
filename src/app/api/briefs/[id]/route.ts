import { getBriefStore } from "@/server/briefs";
import { failure, json, localRequest, validId } from "@/server/http";
import { AppError } from "@/server/errors";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    localRequest(request);
    const brief = getBriefStore().read(validId((await context.params).id));
    if (!brief) throw new AppError("NOT_FOUND", "This brief was not found. It may have been deleted.", 404);
    return json(brief);
  } catch (e) { return failure(e); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    localRequest(request);
    if (!getBriefStore().delete(validId((await context.params).id))) throw new AppError("NOT_FOUND", "This brief has already been deleted.", 404);
    return json({ deleted: true });
  } catch (e) { return failure(e); }
}
