import { z } from "zod";

export const MAX_DOCUMENT_BYTES = 1_000_000;
const documentSchema = z.string().min(1).max(MAX_DOCUMENT_BYTES)
  .refine(value => value.trim().length > 0, "The document is empty.")
  .refine(value => new TextEncoder().encode(value).byteLength <= MAX_DOCUMENT_BYTES, "Each document must be under 1 MB.");
export const BriefInputSchema = z.strictObject({
  version: z.literal(1).default(1),
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,10}$/, "Enter a valid ticker."),
  companyName: z.string().trim().min(1).max(200),
  kind: z.enum(["stock-brief", "thesis"]).default("stock-brief"),
  asOf: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()),
  model: z.string().trim().min(1).max(100).default("Not recorded"),
  report: documentSchema,
  researchRecord: documentSchema,
});
export type BriefInput = z.infer<typeof BriefInputSchema>;
export type Brief = BriefInput & { id: string; contentHash: string; importedAt: string };
export type BriefSummary = Omit<Brief, "report" | "researchRecord" | "version">;

export function researchPrompt(ticker: string) {
  return `Use $us-stock-brief to research ${ticker || "AAPL"}, then save the completed brief and research record to Thesis using the project's Codex handoff instructions. Return the saved report link.`;
}
