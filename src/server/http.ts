import "server-only";
import { z } from "zod";
import { AppError, safeError } from "./errors";
export function localRequest(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let hostname: string;
  try { hostname = new URL(`http://${host}`).hostname; } catch { throw new AppError("HOST", "Use the local app address.", 403); }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) throw new AppError("HOST", "Thesis is available only on the local computer.", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`) throw new AppError("ORIGIN", "Open Thesis directly in its local browser tab.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("ORIGIN", "Cross-site requests are not allowed.", 403);
}
export async function jsonBody(request: Request, maxBytes = 1024) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("BODY", "Send a JSON request.", 415);
  // Bound streamed bodies too; Content-Length alone is not trustworthy.
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("BODY", "A JSON request body is required.", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new AppError("BODY", "The request is too large.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new AppError("BODY", "The request must contain valid JSON.", 400); }
}
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export function failure(error: unknown) {
  if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? "Invalid request.", code: "VALIDATION" }, 400);
  const safe = safeError(error);
  return json({ error: safe.message, code: safe.code }, safe.status);
}
export function validId(id: string) { return z.uuid().parse(id); }
