import { describe, expect, it } from "vitest";
import { parseRollout, redact } from "../src/analyst/telemetry";
import { scopedUsage, sumUsage } from "../src/lib/workflow";

const at = "2026-09-16T21:43:00.000Z";
const row = (type: string, payload: unknown, timestamp = at) => ({ type, timestamp, payload });
const meta = row("session_meta", { id: "root", session_id: "root" });
const usage = (input: number, cached: number, output: number) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: 2, total_tokens: input + output });
const record = (id: string, value = usage(100, 80, 10), timestamp = at, thread = "root") => row("token_usage_record", { response_id: id, thread_id: thread, turn_id: "turn", usage: value }, timestamp);
const log = (...rows: unknown[]) => rows.map(r => JSON.stringify(r)).join("\n");

describe("local workflow token accounting", () => {
  it("sums unique responses, excludes other agents, and does not add cached or reasoning subsets again", () => {
    const parsed = parseRollout(log(meta, record("one"), record("one"), record("child", usage(900,800,50), at, "child"), record("two"), row("event_msg", { type: "token_count", info: { total_token_usage: usage(200,160,20) } })), "test.jsonl");
    expect(parsed.agent.usage).toEqual({ input: 200, cached: 160, output: 20, reasoning: 4, total: 220 });
    expect(parsed.agent.requests).toHaveLength(2);
    expect(parsed.agent.warnings).toEqual([]);
  });
  it("separates research and follow-ups using the recorded boundary", () => {
    const parsed = parseRollout(log(meta, record("one"), record("two", usage(100,80,10), "2026-09-17T10:00:00Z")), "test.jsonl");
    expect(scopedUsage(parsed.agent, "2026-09-17T09:00:00Z")?.total).toBe(110);
    expect(scopedUsage(parsed.agent)?.total).toBe(220);
    expect(sumUsage([scopedUsage(parsed.agent)!]).total).toBe(220);
  });
  it("keeps missing telemetry unknown and reports malformed log lines", () => {
    const { agent } = parseRollout(log(meta) + "\n{truncated", "test.jsonl");
    expect(agent.usage).toBeNull(); expect(agent.usageSource).toBe("unavailable"); expect(agent.warnings[0]).toContain("malformed");
  });
  it("handles repeated cumulative counters and resumed segments without double counting", () => {
    const counter = (value: ReturnType<typeof usage>) => row("event_msg", { type: "token_count", info: { total_token_usage: value } });
    const { agent } = parseRollout(log(meta, counter(usage(100,80,10)), counter(usage(100,80,10)), counter(usage(200,160,20)), counter(usage(50,40,5))), "test.jsonl");
    expect(agent.usage?.total).toBe(275); expect(agent.usageSource).toBe("cumulative snapshots"); expect(agent.warnings).toContain("Cumulative usage counter reset; segment totals were added.");
  });
  it("flags incomplete response telemetry when it disagrees with the final counter", () => {
    const { agent } = parseRollout(log(meta, record("one"), row("event_msg", { type: "token_count", info: { total_token_usage: usage(200,160,20) } })), "test.jsonl");
    expect(agent.usage?.total).toBe(110); expect(agent.warnings.join()).toContain("differs");
  });
});

describe("visible workflow export boundaries", () => {
  it("preserves public inputs, command outputs and errors, excluding private reasoning and system text", () => {
    const { events, agent } = parseRollout(log(meta,
      row("event_msg", { type: "task_started", turn_id: "turn" }),
      row("response_item", { type: "message", role: "system", content: [{ type: "input_text", text: "SYSTEM_NOT_EXPORTED" }] }),
      row("response_item", { type: "reasoning", text: "PRIVATE_NOT_EXPORTED" }),
      row("event_msg", { type: "item_completed", turn_id: "turn", item: { type: "Reasoning", text: "PRIVATE_ITEM_NOT_EXPORTED" } }),
      row("event_msg", { type: "item_completed", turn_id: "turn", item: { type: "UserMessage", id: "user", content: [{ type: "text", text: "Research AVGO" }] } }),
      row("response_item", { type: "function_call", name: "calculate", call_id: "call", arguments: "{\"price\":100}" }),
      row("response_item", { type: "function_call_output", call_id: "call", output: "result: 120" }),
      row("event_msg", { type: "item_completed", turn_id: "turn", item: { type: "CommandExecution", id: "cmd", command: ["shell", "calculate"], aggregated_output: "120", exit_code: 0, status: "completed" } }),
      row("event_msg", { type: "item_completed", turn_id: "turn", item: { type: "AgentMessage", id: "public", phase: "final_answer", content: [{ type: "Text", text: "Completed calculation" }] } }),
      row("event_msg", { type: "task_complete", turn_id: "turn", error: { message: "Limit reached", codex_error_info: "usage_limit_exceeded" } }),
    ), "test.jsonl");
    expect(JSON.stringify({events,agent})).not.toMatch(/NOT_EXPORTED/);
    expect(events.find(e => e.id === "call")?.output).toBe("result: 120");
    expect(events.find(e => e.id === "public")?.output).toBe("Completed calculation");
    expect(agent.turns[0].input).toBe("Research AVGO"); expect(agent.turns[0].status).toBe("interrupted");
  });
  it("marks encrypted handoffs unavailable and redacts obvious credentials", () => {
    const { events } = parseRollout(log(meta, row("response_item", { type: "agent_message", id: "handoff", author: "/root", recipient: "/root/bull", content: [{ type: "input_text", text: "New task" }, { type: "encrypted_content", encrypted_content: "DO_NOT_COPY" }] })), "test.jsonl");
    expect(events[0].unavailable).toContain("encrypted"); expect(JSON.stringify(events)).not.toContain("DO_NOT_COPY");
    expect(redact("key sk-12345678901234567890 Bearer abcdefghijklmnopqrstuvwxyz")).not.toContain("1234567890");
    expect(redact("gAAAAA" + "a".repeat(80))).toContain("Encrypted message unavailable");
  });
});
