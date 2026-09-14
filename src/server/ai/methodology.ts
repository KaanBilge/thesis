import "server-only";
import { MethodologySchema, type ResearchPacket } from "@/lib/schemas";
import { structured, type AIContext } from "./structured";
import { METHODOLOGY_PROMPT } from "./prompts";
export function planMethodology(context: AIContext, packet: ResearchPacket) {
  return structured(context, { name: "Methodology", schema: MethodologySchema, prompt: METHODOLOGY_PROMPT, input: { research: packet } });
}
