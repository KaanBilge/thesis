"use client";

import { useState } from "react";
import { Check, Copy, FileUp, Terminal } from "lucide-react";
import { BriefInputSchema, MAX_DOCUMENT_BYTES, researchPrompt, type Brief } from "@/lib/briefs";

export function CodexHandoff({ onImported, compact = false }: { onImported: (brief: Brief) => void; compact?: boolean }) {
  const [ticker, setTicker] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [company, setCompany] = useState("");
  const [asOf, setAsOf] = useState("");
  const [kind, setKind] = useState<"stock-brief" | "thesis">("stock-brief");
  async function copy() {
    try { await navigator.clipboard.writeText(researchPrompt(ticker)); setCopied(true); setError(""); }
    catch { setError("Clipboard unavailable. Select and copy the prompt below."); }
  }
  async function upload(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const report = files.find(f => f.name === "report.md");
      const record = files.find(f => f.name === "research-record.md");
      if (!report || !record) throw new Error("Choose both report.md and research-record.md.");
      if (report.size > MAX_DOCUMENT_BYTES || record.size > MAX_DOCUMENT_BYTES) throw new Error("Each document must be under 1 MB.");
      if (!asOf) throw new Error("Enter the research cutoff date and time.");
      const parsed = BriefInputSchema.safeParse({ ticker, companyName: company || ticker, asOf: new Date(asOf).toISOString(), kind, report: await report.text(), researchRecord: await record.text() });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const payload = parsed.data;
      const response = await fetch("/api/briefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The import failed. Try again.");
      onImported(data.brief);
    } catch (e) { setError(e instanceof Error ? e.message : "The files could not be imported."); }
    finally { setBusy(false); }
  }
  return <section className={`handoff ${compact ? "compact" : ""}`} aria-label="Codex handoff">
    <div className="handoff-heading"><Terminal size={21} /><span>Research in Codex</span></div>
    <h2>Research a company</h2>
    <p>Paste the prompt into a Codex task with this project open and Astra selected.</p>
    <label className="field-label" htmlFor="codex-ticker">Stock ticker</label><input id="codex-ticker" className="plain-input" placeholder="AAPL" value={ticker} maxLength={11} onChange={e => { setTicker(e.target.value.toUpperCase()); setCopied(false); }} />
    <div className="prompt-preview">{researchPrompt(ticker)}</div>
    <button className="primary-button" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Prompt copied" : "Copy Codex prompt"}</button>
    {!compact && <ol className="handoff-steps"><li><strong>Open this project in Codex</strong><span>Select Astra and paste the prompt.</span></li><li><strong>Let the research finish</strong><span>The brief and evidence record are saved together.</span></li><li><strong>Return to Thesis</strong><span>Your library updates automatically.</span></li></ol>}
    <p className="handoff-cost">Importing uses no model calls. Research uses your Codex allowance.</p>
    {!compact && <details className="command-details"><summary>The import command</summary><code>npm run brief:import -- --dir reports/AAPL/20260914T120000Z --company &quot;Apple Inc.&quot; --model gpt-6-astra</code><p>Run inside this app. The command also works while the app is closed. Use <code>--check</code> to validate without saving.</p></details>}
    <button className="text-button manual-toggle" onClick={() => setManual(!manual)} aria-expanded={manual}><FileUp size={16} /> Import existing files</button>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {manual && <form className="manual-import" onSubmit={upload}>
      <label>Company name<input className="plain-input" value={company} onChange={e => setCompany(e.target.value)} placeholder="Optional; defaults to ticker" maxLength={200} /></label>
      <label>Research cutoff (your local time)<input className="plain-input" type="datetime-local" required value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
      <label>Document type<select className="plain-input" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="stock-brief">Stock brief</option><option value="thesis">Investment thesis</option></select></label>
      <label>Report and research record<input type="file" accept=".md,text/markdown" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))} /></label><small>Select report.md and research-record.md together.</small>
      <button className="primary-button" disabled={busy || !ticker.trim()}>{busy ? "Importing…" : "Save to library"}</button>
    </form>}
  </section>;
}
