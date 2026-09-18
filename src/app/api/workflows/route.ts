import { workflows, workflow, workflowEvents, workflowArtifact } from "@/server/workflows";
import { failure, json, localRequest } from "@/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    localRequest(request);
    const params = new URL(request.url).searchParams; const id = params.get("run");
    if (!id) return json({ items: await workflows() });
    if (params.has("agent")) return json({ events: await workflowEvents(id, params.get("agent")!) });
    if (params.has("artifact")) return json(await workflowArtifact(id, params.get("artifact")!));
    return json(await workflow(id));
  } catch (error) { return failure(error); }
}
