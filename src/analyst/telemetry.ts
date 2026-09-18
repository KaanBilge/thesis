import { createHash } from "node:crypto";
import type { Usage, WorkflowAgent, WorkflowEvent, UsageRequest, WorkflowTurn } from "../lib/workflow";
import { emptyUsage, sumUsage } from "../lib/workflow";

// Local rollout formats vary by Codex version. Only allowlisted, user-visible
// records enter the export. Reasoning, system/developer text and encrypted
// payloads are never exported. No authentication or database files are read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecordData = Record<string, any>;
export function readRecords(text: string): { rows: RecordData[]; malformed: number } {
  const rows: RecordData[] = []; let malformed = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { malformed++; }
  }
  return { rows, malformed };
}
export function redact(text: string): string {
  return text
    .replace(/gAAAAA[A-Za-z0-9_=-]{60,}/g, "[Encrypted message unavailable in local export]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted API key]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]{16,}/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)["']?\s*[:=]\s*["']?)(?!null\b|undefined\b|missing\b)[A-Za-z0-9._~+/-]{16,}/gi, "$1[redacted]");
}
function contentText(content: RecordData[] | undefined) {
  return (content ?? []).filter(c => ["Text", "text", "input_text", "output_text"].includes(c.type)).map(c => c.text ?? "").join("\n");
}
function usageOf(value: RecordData): Usage {
  return { input: value.input_tokens ?? 0, cached: value.cached_input_tokens ?? 0, output: value.output_tokens ?? 0, reasoning: value.reasoning_output_tokens ?? 0, total: value.total_tokens ?? (value.input_tokens ?? 0) + (value.output_tokens ?? 0) };
}
export function parseRollout(text: string, filename: string): { agent: WorkflowAgent; events: WorkflowEvent[]; sessionId: string } {
  const { rows, malformed } = readRecords(text);
  const meta = rows.find(r => r.type === "session_meta")?.payload;
  if (!meta?.id) throw new Error(`No session metadata in ${filename}`);
  const contexts = rows.filter(r => r.type === "turn_context").map(r => r.payload);
  const requests: UsageRequest[] = []; const events: WorkflowEvent[] = []; const turns = new Map<string, WorkflowTurn>();
  const calls = new Map<string, WorkflowEvent>(); const seen = new Set<string>(); const toolCounts: Record<string, number> = {};
  const warnings: string[] = malformed ? [`Ignored ${malformed} malformed log line(s).`] : [];
  let turnId = "unknown", action = "Model response";
  const exactRecords = rows.some(r => r.type === "token_usage_record" && r.payload.thread_id === meta.id);
  let previous = emptyUsage();
  for (const row of rows) {
    const p = row.payload ?? {}; const at = row.timestamp; const item = p.item;
    if (p.type === "task_started") {
      turnId = p.turn_id;
      turns.set(turnId, { id: turnId, startedAt: at, endedAt: null, status: "unfinished", error: null, input: null, result: null });
    }
    if (row.type === "turn_context" && p.turn_id) turnId = p.turn_id;
    if (p.type === "task_complete") {
      const turn = turns.get(p.turn_id);
      if (turn) { turn.endedAt = at; turn.status = p.error ? "interrupted" : "completed"; turn.error = p.error?.message ? redact(p.error.message) : null; turn.result = p.last_agent_message ? redact(p.last_agent_message) : null; }
      if (p.error) events.push({ id: `error-${p.turn_id}`, at, turnId: p.turn_id, kind: "error", title: p.error.codex_error_info ?? "Run interrupted", output: redact(p.error.message ?? "Unknown error") });
    }
    if (row.type === "response_item" && ["function_call", "custom_tool_call"].includes(p.type)) {
      const name = `${p.namespace ? `${p.namespace}.` : ""}${p.name}`;
      const event: WorkflowEvent = { id: p.call_id, at, turnId, kind: "tool", title: name, input: redact(p.arguments ?? p.input ?? "") };
      action = name; calls.set(p.call_id, event); events.push(event); toolCounts[name] = (toolCounts[name] ?? 0) + 1;
    }
    if (row.type === "response_item" && ["function_call_output", "custom_tool_call_output"].includes(p.type)) {
      const call = calls.get(p.call_id); if (call) call.output = redact(typeof p.output === "string" ? p.output : JSON.stringify(p.output ?? ""));
    }
    if (row.type === "response_item" && p.type === "agent_message") {
      const encrypted = (p.content ?? []).some((c: RecordData) => c.type === "encrypted_content");
      events.push({ id: p.id, at, turnId, kind: "handoff", title: `${p.author} → ${p.recipient}`, input: redact(contentText(p.content)), ...(encrypted ? { unavailable: "The exact handoff text is encrypted in the session log. Recorded input boundaries are available in the agent overview." } : {}) });
    }
    if (p.type === "item_completed" && item) {
      if (item.type === "UserMessage") {
        const input = redact(contentText(item.content)); const turn = turns.get(p.turn_id); if (turn) turn.input = input;
        events.push({ id: item.id, at, turnId: p.turn_id, kind: "input", title: "User instruction", input });
      }
      if (item.type === "AgentMessage" && ["commentary", "final_answer", "final"].includes(item.phase)) {
        events.push({ id: item.id, at, turnId: p.turn_id, kind: "message", title: item.phase === "commentary" ? "Progress update" : "Final response", output: redact(contentText(item.content)) });
        action = item.phase === "commentary" ? "Progress update" : "Final response";
      }
      if (item.type === "CommandExecution") {
        const command = Array.isArray(item.command) ? item.command.at(-1) : item.command;
        events.push({ id: item.id, at, turnId: p.turn_id, kind: "command", title: (command ?? "Shell command").split(/\r?\n/)[0].slice(0,160), input: redact(command ?? ""), output: redact(item.aggregated_output ?? item.formatted_output ?? item.stdout ?? ""), status: `${item.status}; exit ${item.exit_code ?? "unknown"}` });
      }
    }
    if (row.type === "token_usage_record" && p.thread_id === meta.id && !seen.has(p.response_id)) {
      seen.add(p.response_id);
      requests.push({ id: p.response_id, at, turnId: p.turn_id, action, ...usageOf(p.usage) });
    } else if (!exactRecords && p.type === "token_count" && p.info?.total_token_usage) {
      const next = usageOf(p.info.total_token_usage);
      if (next.total !== previous.total) {
        const reset = next.total < previous.total;
        if (reset) warnings.push("Cumulative usage counter reset; segment totals were added.");
        const delta = Object.fromEntries(Object.entries(next).map(([key, value]) => [key, reset ? value : Math.max(0, value - previous[key as keyof Usage])])) as Usage;
        requests.push({ id: `snapshot-${row.ordinal ?? requests.length}`, at, turnId, action, ...delta }); previous = next;
      }
    }
  }
  const finalCounter = rows.filter(r => r.payload?.type === "token_count" && r.payload.info?.total_token_usage).at(-1)?.payload.info.total_token_usage;
  const usage = requests.length ? sumUsage(requests) : null;
  if (exactRecords && finalCounter && usage?.total !== finalCounter.total_tokens) warnings.push("Response sum differs from final cumulative counter; response records are displayed. Inspect log completeness.");
  const agent: WorkflowAgent = {
    id: meta.id, parentId: meta.parent_thread_id ?? null, path: meta.agent_path ?? "/root", role: meta.agent_path?.split("/").at(-1) ?? "coordinator",
    model: [...new Set(contexts.map(c => c.model).filter(Boolean))].join(", ") || "Unknown", effort: [...new Set(contexts.map(c => c.effort).filter(Boolean))].join(", ") || "Unknown",
    sourceFile: filename, sourceHash: createHash("sha256").update(text).digest("hex"), startedAt: rows[0].timestamp, endedAt: rows.at(-1)!.timestamp,
    usageSource: exactRecords ? "response records" : requests.length ? "cumulative snapshots" : "unavailable", usage, requests, turns: [...turns.values()], eventCount: events.length, toolCounts, warnings, inputs: [], outputs: [], restrictions: [],
  };
  return { agent, events, sessionId: meta.session_id ?? meta.id };
}
