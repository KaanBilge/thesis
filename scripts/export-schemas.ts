import { mkdirSync, writeFileSync } from "node:fs";
import { zodTextFormat } from "openai/helpers/zod";
import { ResearchPacketSchema, MethodologySchema, BullCaseSchema, BearCaseSchema, FinalDecisionSchema, SavedAnalysisSchema, OrchestratorSchema } from "../src/lib/schemas";
const schemas = { ResearchPacket: ResearchPacketSchema, Methodology: MethodologySchema, BullCase: BullCaseSchema, BearCase: BearCaseSchema, FinalDecision: FinalDecisionSchema, SavedAnalysis: SavedAnalysisSchema, OrchestratorAssessment: OrchestratorSchema };
mkdirSync("schemas", { recursive: true });
for (const [name, schema] of Object.entries(schemas)) writeFileSync(`schemas/${name}.json`, JSON.stringify(zodTextFormat(schema, name), null, 2) + "\n");
console.log("Exported 7 strict JSON schemas. Cross-field rules are enforced by Zod and application validation.");
