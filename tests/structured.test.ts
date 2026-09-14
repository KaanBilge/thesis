import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { MethodologySchema } from "../src/lib/schemas";
import { EvidenceError } from "../src/lib/validation";
import { structured, retrievedSourceUrls, type AIContext } from "../src/server/ai/structured";
import { safeError } from "../src/server/errors";
import type { Response as ModelResponse } from "openai/resources/responses/responses";
import { fixture } from "./fixtures";
function setup(values: unknown[]) {
  const create = vi.fn(); values.forEach(value => { create.mockResolvedValueOnce({ status: "completed", output_text: typeof value === "string" ? value : JSON.stringify(value), output: [] }); });
  const context: AIContext = { client: { responses: { create } } as unknown as OpenAI, model: "gpt-5.4", signal: new AbortController().signal };
  const options = { name: "Methodology", schema: MethodologySchema, prompt: "Test only", input: { ticker: "TEST" } };
  return { create, context, options };
}
describe("strict Responses API validation and bounded retry", () => {
  it("sends a strict schema, store=false and no browser configuration", async () => {
    const f = fixture(), test = setup([f.methodology]);
    expect(await structured(test.context, test.options)).toEqual(f.methodology);
    const call = test.create.mock.calls[0][0];
    expect(call.text.format.strict).toBe(true); expect(call.store).toBe(false); expect(call.model).toBe("gpt-5.4");
    expect(call.tools).toBeUndefined(); expect(JSON.stringify(call)).not.toContain("apiKey");
  });
  it("retries malformed JSON exactly once with a schema correction", async () => {
    const test = setup(["not JSON", fixture().methodology]);
    await structured(test.context, test.options);
    expect(test.create).toHaveBeenCalledTimes(2); expect(test.create.mock.calls[1][0].input.at(-1).content).toContain("Schema correction");
  });
  it("retries failed cross-field weight validation", async () => {
    const { methodology } = fixture(); const invalid = structuredClone(methodology); invalid.metrics[0].weight = 1;
    const test = setup([invalid, methodology]); await structured(test.context, test.options);
    expect(test.create).toHaveBeenCalledTimes(2); expect(test.create.mock.calls[1][0].input.at(-1).content).toContain("total exactly 100");
  });
  it("retries failed source linkage once and returns a recoverable error", async () => {
    const test = setup([fixture().methodology, fixture().methodology]);
    await expect(structured(test.context, { ...test.options, validate: () => { throw new EvidenceError("Unknown source reference."); } })).rejects.toMatchObject({ code: "INVALID_OUTPUT", status: 422 });
    expect(test.create).toHaveBeenCalledTimes(2);
  });
  it("rejects two invalid replies without saving partial output", async () => {
    const test = setup([{}, {}]); await expect(structured(test.context, test.options)).rejects.toMatchObject({ code: "INVALID_OUTPUT" }); expect(test.create).toHaveBeenCalledTimes(2);
  });
  it("does not retry refusals or API authentication failures", async () => {
    const test = setup([]); test.create.mockResolvedValueOnce({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "declined" }] }] });
    await expect(structured(test.context, test.options)).rejects.toMatchObject({ code: "REFUSAL" }); expect(test.create).toHaveBeenCalledOnce();
    test.create.mockClear(); test.create.mockRejectedValue(new OpenAI.AuthenticationError(401, {}, "Sensitive provider detail", new Headers()));
    await expect(structured(test.context, test.options)).rejects.toBeInstanceOf(OpenAI.AuthenticationError); expect(test.create).toHaveBeenCalledOnce();
  });
  it("extracts search provenance from typed tool output and annotations", () => {
    const output = [{ type: "web_search_call", status: "completed", action: { type: "search", sources: [{ type: "url", url: "https://example.com/search" }] } }, { type: "message", content: [{ type: "output_text", annotations: [{ type: "url_citation", url: "https://example.com/cited" }] }] }];
    const result = retrievedSourceUrls({ output } as ModelResponse);
    expect(result.completedSearch).toBe(true); expect([...result.urls]).toEqual(["https://example.com/search", "https://example.com/cited"]);
  });
  it("honors an already-aborted job without making a call", async () => {
    const test = setup([]); const controller = new AbortController(); controller.abort(); test.context.signal = controller.signal;
    await expect(structured(test.context, test.options)).rejects.toBeDefined(); expect(test.create).not.toHaveBeenCalled();
  });
  it("sanitizes provider errors and reports actionable categories", () => {
    const error = new OpenAI.AuthenticationError(401, {}, "sk-sensitive-provider-secret", new Headers());
    expect(safeError(error).message).not.toContain("sk-sensitive"); expect(safeError(error).code).toBe("AUTH");
    expect(safeError(new OpenAI.APIConnectionError({ message: "sensitive config" })).code).toBe("CONNECTION");
    expect(safeError(new DOMException("private", "TimeoutError")).code).toBe("TIMEOUT");
  });
});
