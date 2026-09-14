import "server-only";
import OpenAI from "openai";
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 500) { super(message); }
}
// Never surface raw SDK messages: they may contain response bodies or configuration.
export function safeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)))
    return new AppError("TIMEOUT", "Research took too long. Try again; no incomplete report was saved.", 504);
  if (error instanceof OpenAI.APIConnectionError) return new AppError("CONNECTION", "Cannot connect to OpenAI. Check your internet connection and try again.", 502);
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return new AppError("AUTH", "OpenAI rejected the API key. Check .env.local and restart the server.", 503);
    if (error.status === 429) return new AppError("RATE_LIMIT", "OpenAI rate or account quota limit reached. Check your API billing and limits, then try again later.", 429);
    if ([400, 403, 404].includes(error.status ?? 0)) return new AppError("MODEL_ACCESS", "OpenAI could not use the configured model, web search, or strict output format. Check your account access and OPENAI_MODEL. This app requires Responses, web search, and Structured Outputs.", 502);
    return new AppError("OPENAI", "OpenAI is unavailable right now. Please try again shortly.", 502);
  }
  return new AppError("INTERNAL", "The local server could not complete the request. Check that the data folder is writable and restart the app, then try again.", 500);
}
