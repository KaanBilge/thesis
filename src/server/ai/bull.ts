import "server-only";
import { BullCaseSchema, type ResearchPacket, type Methodology } from "@/lib/schemas";
import { validateCase } from "@/lib/validation";
import { structured, type AIContext } from "./structured";
import { BULL_PROMPT } from "./prompts";
export function buildBullCase(context: AIContext, packet: ResearchPacket, methodology: Methodology) {
  return structured(context, { name: "BullCase", schema: BullCaseSchema, prompt: BULL_PROMPT, input: { research: packet, methodology }, validate: value => validateCase(value, packet, methodology) });
}
