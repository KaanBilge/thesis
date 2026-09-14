import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { Response as ModelResponse } from "openai/resources/responses/responses";
import { AppError } from "../errors";
import { EvidenceError } from "@/lib/validation";
import { REQUEST_TIMEOUT_MS, requireApiKey } from "../config";

export type AIContext = { client: OpenAI; model: string; signal: AbortSignal };
export function createAIContext(model: string, signal: AbortSignal): AIContext {
  return { client: new OpenAI({ apiKey: requireApiKey(), maxRetries: 0, timeout: REQUEST_TIMEOUT_MS, logLevel: "off" }), model, signal };
}
export function retrievedSourceUrls(response: ModelResponse) {
  const urls = new Set<string>();
  let completedSearch = false;
  for (const output of response.output) {
    if (output.type === "web_search_call" && output.status === "completed") {
      completedSearch = true;
      if (output.action.type === "search") output.action.sources?.forEach(source => urls.add(source.url));
      else if (output.action.url) urls.add(output.action.url);
    }
    if (output.type === "message") for (const part of output.content) {
      if (part.type === "output_text") for (const annotation of part.annotations) {
        if (annotation.type === "url_citation") urls.add(annotation.url);
      }
    }
  }
  return { urls, completedSearch };
}
export async function structured<T>(context: AIContext, options: {
  name: string; schema: z.ZodType<T>; prompt: string; input: unknown; webSearch?: boolean;
  validate?: (value: T, response: ModelResponse) => void;
}): Promise<T> {
  let correction = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    context.signal.throwIfAborted();
    let response: ModelResponse;
    try {
      response = await context.client.responses.create({
        model: context.model, store: false, max_output_tokens: 14000,
        ...((context.model.startsWith("gpt-5") || context.model.startsWith("gpt-6")) ? { reasoning: { effort: "low" as const } } : {}),
        input: [{ role: "system", content: options.prompt }, { role: "user", content: JSON.stringify(options.input) },
          ...(correction ? [{ role: "user" as const, content: correction }] : [])],
        text: { format: zodTextFormat(options.schema, options.name) },
        ...(options.webSearch ? { tools: [{ type: "web_search" as const, search_context_size: "high" as const }], tool_choice: "required" as const, include: ["web_search_call.action.sources" as const] } : {}),
      }, { signal: context.signal, timeout: REQUEST_TIMEOUT_MS });
    } catch (error) {
      if (context.signal.aborted) throw new AppError("TIMEOUT", "The research time limit was reached. Please try again.", 504);
      throw error;
    }
    if (response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal")))
      throw new AppError("REFUSAL", "The model could not complete this research request. Check the ticker or try another company.", 422);
    try {
      if (response.status !== "completed" || !response.output_text) throw new EvidenceError("The response was incomplete. Produce a concise complete object matching the schema.");
      const value = options.schema.parse(JSON.parse(response.output_text));
      options.validate?.(value, response);
      return value;
    } catch (error) {
      if (!(error instanceof z.ZodError) && !(error instanceof SyntaxError) && !(error instanceof EvidenceError)) throw error;
      if (attempt === 1) throw new AppError("INVALID_OUTPUT", `The ${options.name} stage could not produce a valid, source-linked response after one correction. No incomplete report was saved. Try again.`, 422);
      const detail = error instanceof z.ZodError ? error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).slice(0, 12).join("; ") : error instanceof EvidenceError ? error.message : "Return valid JSON matching the supplied strict schema.";
      correction = `Schema correction (one retry): the previous response was rejected. Regenerate the complete response using the original input and strict schema. Correct these validation issues: ${detail}. Do not invent evidence to make validation pass; explicitly mark uncertainties.`;
    }
  }
  throw new AppError("INVALID_OUTPUT", "The model response could not be validated.", 422);
}
