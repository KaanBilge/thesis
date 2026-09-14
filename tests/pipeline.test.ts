import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import * as ai from "../src/server/ai/structured";
import { runPipeline } from "../src/server/pipeline";
import { createStore, type Store } from "../src/server/db/store";
import { fixture } from "./fixtures";
const stores: Store[] = [];
afterEach(() => { vi.restoreAllMocks(); stores.splice(0).forEach(s => s.close()); });
describe("complete local pipeline with a mocked OpenAI transport", () => {
  it("freezes research, precommits methodology, runs both analysts concurrently, adjudicates and saves", async () => {
    const store = createStore(":memory:"); stores.push(store);
    const job = store.reserve("TEST").job; const calls: string[] = [];
    const analystInputs: unknown[] = []; let bullPending = false, concurrent = false;
    const create = vi.fn(async (request: { text: { format: { name: string } }; input: { content: string }[] }) => {
      const name = request.text.format.name; calls.push(name);
      const input = JSON.parse(request.input[1].content); const f = fixture(input.asOf ?? new Date().toISOString());
      let value: unknown;
      if (name === "ResearchPacket") value = f.research;
      else if (name === "Methodology") value = f.methodology;
      else if (name === "BullCase") { analystInputs.push(input); bullPending = true; await new Promise(resolve => setTimeout(resolve, 15)); bullPending = false; value = f.bullCase; }
      else if (name === "BearCase") { concurrent = bullPending; analystInputs.push(input); value = f.bearCase; }
      else value = f.assessment;
      return { status: "completed", output_text: JSON.stringify(value), output: name === "ResearchPacket" ? [{ type: "web_search_call", status: "completed", action: { type: "search", sources: [{ type: "url", url: f.research.sources[0].url }] } }] : [] };
    });
    vi.spyOn(ai, "createAIContext").mockImplementation((model, signal) => ({ model, signal, client: { responses: { create } } as unknown as OpenAI }));
    await runPipeline(job, { model: "gpt-5.4", cacheHours: 24 }, store);
    expect(calls).toEqual(["ResearchPacket", "Methodology", "BullCase", "BearCase", "FinalDecision"]);
    expect(concurrent).toBe(true); expect(analystInputs[0]).toEqual(analystInputs[1]);
    const progress = store.progress(job.id)!; expect(progress.status).toBe("complete"); expect(Object.values(progress.stages)).toEqual(Array(6).fill("complete"));
    const saved = store.read(progress.analysisId!)!;
    expect(saved.decision.overallScore).toBe(75); expect(saved.verdict).toBe("Bullish"); expect(saved.researchHash).toHaveLength(64); expect(store.list()).toHaveLength(1);
  });
  it("records a recoverable failure and releases the ticker after invalid research", async () => {
    const store = createStore(":memory:"); stores.push(store); const job = store.reserve("TEST").job;
    const create = vi.fn().mockResolvedValue({ status: "completed", output: [], output_text: "{}" });
    vi.spyOn(ai, "createAIContext").mockImplementation((model, signal) => ({ model, signal, client: { responses: { create } } as unknown as OpenAI }));
    await runPipeline(job, { model: "gpt-5.4", cacheHours: 24 }, store);
    expect(create).toHaveBeenCalledTimes(2); expect(store.list()).toHaveLength(0); expect(store.progress(job.id)?.error).toContain("one correction"); expect(store.reserve("TEST").duplicate).toBe(false);
  });
});
