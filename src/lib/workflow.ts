export type Usage = {
  input: number; cached: number; output: number; reasoning: number; total: number;
};
export type WorkflowEvent = {
  id: string; at: string; turnId: string; kind: "input" | "message" | "tool" | "command" | "handoff" | "error";
  title: string; input?: string; output?: string; unavailable?: string; status?: string;
};
export type UsageRequest = Usage & { id: string; at: string; turnId: string; action: string };
export type WorkflowTurn = {
  id: string; startedAt: string; endedAt: string | null; status: string; error: string | null;
  input: string | null; result: string | null;
};
export type WorkflowAgent = {
  id: string; parentId: string | null; path: string; role: string; model: string; effort: string;
  sourceFile: string; sourceHash: string; startedAt: string; endedAt: string;
  usageSource: "response records" | "cumulative snapshots" | "unavailable";
  usage: Usage | null; requests: UsageRequest[]; turns: WorkflowTurn[];
  eventCount: number; toolCounts: Record<string, number>; warnings: string[];
  inputs: string[]; outputs: string[]; restrictions: string[];
};
export type WorkflowArtifact = { path: string; bytes: number; hash: string; readable: boolean };
export type WorkflowSnapshot = {
  version: 1; id: string; ticker: string; company: string; asOf: string; rootThreadId: string;
  capturedAt: string; startedAt: string; endedAt: string; researchEndedAt: string | null;
  researchBoundary: string; agents: WorkflowAgent[]; artifacts: WorkflowArtifact[];
  audit: { score: number; status: string; dimensions: { id: string; name: string; score: number; weight: number }[]; findings: { id: string; severity: string; description: string; remediation: string; status: string }[] } | null;
  result: { conclusion: string; summary: string; marketPrice: number | null; scenarios: { name: string; fairValue: number | null; horizonValue: number | null; totalReturn: number | null; entry: number | null }[] } | null;
  evidence: { claims: number; sources: number; coverage: { area: string; status: string; notes: string }[] } | null;
  notes: string[];
};
export const emptyUsage = (): Usage => ({ input: 0, cached: 0, output: 0, reasoning: 0, total: 0 });
export function sumUsage(values: Usage[]): Usage {
  return values.reduce((a, b) => ({ input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output, reasoning: a.reasoning + b.reasoning, total: a.total + b.total }), emptyUsage());
}
export function scopedUsage(agent: WorkflowAgent, until?: string | null): Usage | null {
  if (agent.usage === null) return null;
  return sumUsage(agent.requests.filter(r => !until || r.at <= until));
}
export const roleLabels: Record<string, string> = { coordinator: "Coordinator", evidence: "Evidence researcher", framework: "Valuation framework", bull: "Bull analyst", bear: "Bear analyst", synthesis: "Synthesis analyst", evaluator: "Independent evaluator" };
