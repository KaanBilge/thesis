import { readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { BriefInputSchema, MAX_DOCUMENT_BYTES } from "./briefs";

export type FileOptions = { ticker?: string; company?: string; kind?: string; asOf?: string; model?: string };
function readDocument(filename: string) {
  const stat = statSync(filename);
  if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES) throw new Error(`${basename(filename)} must be a file under 1 MB.`);
  const text = readFileSync(filename, "utf8");
  if (Buffer.byteLength(text, "utf8") > MAX_DOCUMENT_BYTES) throw new Error(`${basename(filename)} exceeds 1 MB.`);
  return text;
}
export function loadBriefDirectory(directory: string, options: FileOptions = {}) {
  const folder = resolve(directory);
  const ticker = options.ticker ?? basename(dirname(folder));
  const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(basename(folder));
  const asOf = options.asOf ?? (stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z` : undefined);
  if (!asOf) throw new Error("Supply --as-of with an ISO timestamp, or use reports/TICKER/YYYYMMDDTHHMMSSZ/.");
  return BriefInputSchema.parse({
    ticker, companyName: options.company ?? ticker, asOf, model: options.model,
    kind: options.kind, report: readDocument(join(folder, "report.md")),
    researchRecord: readDocument(join(folder, "research-record.md")),
  });
}
