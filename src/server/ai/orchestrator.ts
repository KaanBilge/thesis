import "server-only";
import { OrchestratorSchema, type ResearchPacket, type Methodology, type BullCase, type BearCase } from "@/lib/schemas";
import { validateOrchestrator } from "@/lib/validation";
import { structured, type AIContext } from "./structured";
import { ORCHESTRATOR_PROMPT } from "./prompts";
export function adjudicate(context: AIContext, packet: ResearchPacket, methodology: Methodology, bullCase: BullCase, bearCase: BearCase) {
  return structured(context, { name: "FinalDecision", schema: OrchestratorSchema, prompt: ORCHESTRATOR_PROMPT, input: { research: packet, methodology, bullCase, bearCase }, validate: value => validateOrchestrator(value, packet, methodology) });
}
