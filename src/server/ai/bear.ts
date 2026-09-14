import "server-only";
import { BearCaseSchema, type ResearchPacket, type Methodology } from "@/lib/schemas";
import { validateCase } from "@/lib/validation";
import { structured, type AIContext } from "./structured";
import { BEAR_PROMPT } from "./prompts";
export function buildBearCase(context: AIContext, packet: ResearchPacket, methodology: Methodology) {
  return structured(context, { name: "BearCase", schema: BearCaseSchema, prompt: BEAR_PROMPT, input: { research: packet, methodology }, validate: value => validateCase(value, packet, methodology) });
}
