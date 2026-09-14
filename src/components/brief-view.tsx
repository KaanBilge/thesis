"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Check, Copy, Download, FileText } from "lucide-react";
import type { Brief } from "@/lib/briefs";

export function BriefView({ brief, onBack }: { brief: Brief; onBack: () => void }) {
  const [tab, setTab] = useState<"report" | "researchRecord">("report");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const text = brief[tab];
  const sections = text.split("\n").flatMap((line, index) => /^#{1,3} /.test(line) ? [{ title: line.replace(/^#+ /, "").replaceAll("**", ""), id: `section-${index + 1}` }] : []);
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setCopyError(""); }
    catch { setCopyError("Copy the report address from your browser's address bar."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `${brief.ticker}-${tab === "report" ? "report" : "research-record"}.md`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article className="brief-reader">
    <button className="text-button back-link" onClick={onBack}><ArrowLeft size={16} /> Research library</button>
    <header className="brief-heading"><div><span className="document-type"><FileText size={15} /> {brief.kind === "thesis" ? "Investment thesis" : "Stock brief"}</span><h1>{brief.ticker}<span>{brief.companyName !== brief.ticker ? brief.companyName : "Research brief"}</span></h1><p>Research as of {new Date(brief.asOf).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}</p></div><button className="secondary-button" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Link copied" : "Copy link"}</button></header>
    {copyError && <p role="status">{copyError}</p>}
    <div className="reader-toolbar"><div role="tablist" aria-label="Brief documents"><button id="tab-report" role="tab" aria-selected={tab === "report"} aria-controls="brief-document" tabIndex={tab === "report" ? 0 : -1} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { setTab("researchRecord"); document.getElementById("tab-record")?.focus(); } }} onClick={() => setTab("report")}>Report</button><button id="tab-record" role="tab" aria-selected={tab === "researchRecord"} aria-controls="brief-document" tabIndex={tab === "researchRecord" ? 0 : -1} onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { setTab("report"); document.getElementById("tab-report")?.focus(); } }} onClick={() => setTab("researchRecord")}>Research record</button></div><button className="text-button" onClick={download}><Download size={15} /> Markdown</button></div>
    <div className="reader-layout"><div className="markdown-document" id="brief-document" role="tabpanel" aria-labelledby={tab === "report" ? "tab-report" : "tab-record"} tabIndex={0}>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={url => /^https?:\/\//i.test(url) ? url : ""} components={{
        a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
        img: () => null,
        h1: ({ node, children }) => <h2 id={`section-${node?.position?.start.line}`}>{children}</h2>,
        h2: ({ node, children }) => <h2 id={`section-${node?.position?.start.line}`}>{children}</h2>,
        h3: ({ node, children }) => <h3 id={`section-${node?.position?.start.line}`}>{children}</h3>,
        table: ({ children }) => <div className="markdown-table-scroll" tabIndex={0}><table>{children}</table></div>,
      }}>{text}</Markdown>
    </div><aside className="reader-aside">{sections.length > 0 && <><p className="aside-title">In this document</p><nav aria-label="Document sections">{sections.map(s => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</nav></>}<dl><dt>Created with</dt><dd>{brief.model}</dd><dt>Added to Thesis</dt><dd>{new Date(brief.importedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</dd><dt>Original files</dt><dd>Report + research record</dd></dl><details className="integrity-details"><summary>File integrity</summary><p>SHA-256 of the saved content and metadata</p><code>{brief.contentHash}</code></details><p className="source-note">Imported as written. Source checking belongs to the research; importing does not verify its claims.</p></aside></div>
  </article>;
}
