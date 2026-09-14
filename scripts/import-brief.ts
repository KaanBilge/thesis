import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadBriefDirectory } from "../src/lib/brief-files";
import { createBriefStore } from "../src/server/briefs";

try {
  const { values } = parseArgs({ options: {
    dir: { type: "string" }, ticker: { type: "string" }, company: { type: "string" },
    "as-of": { type: "string" }, model: { type: "string" }, kind: { type: "string" },
    check: { type: "boolean" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log('Usage: npm run brief:import -- --dir reports/TICKER/YYYYMMDDTHHMMSSZ [--company "Company"] [--model gpt-6-astra] [--kind thesis] [--as-of ISO] [--ticker TICKER] [--check]\nReads report.md + research-record.md. Works with the app stopped. Repeating the same import returns the same ID. --check validates without writing.');
  } else {
    if (!values.dir) throw new Error("Provide --dir pointing to the completed research folder. Use --help for options.");
    const payload = loadBriefDirectory(values.dir, { ticker: values.ticker, company: values.company, model: values.model, kind: values.kind, asOf: values["as-of"] });
    if (values.check) console.log(JSON.stringify({ valid: true, ticker: payload.ticker, asOf: payload.asOf }));
    else {
      const appRoot = fileURLToPath(new URL("../", import.meta.url));
      const store = createBriefStore(process.env.THESIS_DATABASE_PATH ?? join(appRoot, "data", "thesis.sqlite"), join(appRoot, "drizzle"));
      try {
        const { brief, duplicate } = store.save(payload);
        console.log(JSON.stringify({ status: duplicate ? "already-saved" : "saved", id: brief.id, ticker: brief.ticker, path: `/?brief=${brief.id}`, contentHash: brief.contentHash }));
      } finally { store.close(); }
    }
  }
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "Import failed." }));
  process.exitCode = 1;
}
