import "server-only";
import { ResearchPacketSchema } from "@/lib/schemas";
import { EvidenceError, validateResearch } from "@/lib/validation";
import { structured, retrievedSourceUrls, type AIContext } from "./structured";
import { RESEARCH_PROMPT } from "./prompts";
export async function research(context: AIContext, ticker: string, asOf: string) {
  return structured(context, { name: "ResearchPacket", schema: ResearchPacketSchema, prompt: RESEARCH_PROMPT,
    input: { ticker, asOf }, webSearch: true,
    validate: (packet, response) => {
      const provenance = retrievedSourceUrls(response);
      if (!provenance.completedSearch || provenance.urls.size === 0) throw new EvidenceError("Current web research is required. A completed search with source URLs is missing.");
      validateResearch(packet, ticker, provenance.urls, asOf);
    },
  });
}
