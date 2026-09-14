"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronRight, FileText, FolderOpen, History, Library, LoaderCircle, Menu, Plus, RefreshCw, Scale, Search, Terminal, Trash2, X } from "lucide-react";
import { TickerSchema, STAGES, type HistoryItem, type Job, type SavedAnalysis, type StartResponse } from "@/lib/schemas";
import type { Brief, BriefSummary } from "@/lib/briefs";
import ResultView from "./result-view";
import { BriefView } from "./brief-view";
import { CodexHandoff } from "./codex-handoff";

const stageLabels = { research: "Researching company", methodology: "Designing methodology", bull: "Building bull case", bear: "Building bear case", orchestrator: "Reviewing the evidence", saving: "Saving analysis" };
type View = "library" | "analysis" | "codex";
type Entry = { id: string; ticker: string; companyName: string; kind: "brief" | "analysis"; label: string; date: string; verdict?: string; score?: number };
export function relativeTime(date: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(date)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The local server could not complete this request. Try again.");
  return data;
}
export default function Workspace() {
  const [view, setView] = useState<View>("library");
  const [ticker, setTicker] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<SavedAnalysis | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [cached, setCached] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [mobileHistory, setMobileHistory] = useState(false);
  const [now, setNow] = useState(0);
  const selection = useRef(0);
  const loadLibrary = useCallback(async () => {
    const [saved, imported] = await Promise.all([api<{ items: HistoryItem[] }>("/api/history"), api<{ items: BriefSummary[] }>("/api/briefs")]);
    setHistory(saved.items); setBriefs(imported.items); setNow(Date.now());
  }, []);
  useEffect(() => {
    let mounted = true;
    Promise.all([api<{ items: HistoryItem[] }>("/api/history"), api<{ items: BriefSummary[] }>("/api/briefs"), api<{ configured: boolean }>("/api/status")])
      .then(([saved, imported, status]) => { if (mounted) { setHistory(saved.items); setBriefs(imported.items); setNow(Date.now()); setConfigured(status.configured); } })
      .catch(e => { if (mounted) setError(e.message); }).finally(() => { if (mounted) setLoading(false); });
    const refresh = () => { if (!document.hidden) void loadLibrary().catch(() => {}); };
    const clock = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => { mounted = false; clearInterval(clock); window.removeEventListener("focus", refresh); };
  }, [loadLibrary]);
  useEffect(() => {
    let mounted = true;
    function openUrl() {
      const id = new URLSearchParams(window.location.search).get("brief");
      const current = ++selection.current;
      if (!id) { setBrief(null); return; }
      api<Brief>(`/api/briefs/${encodeURIComponent(id)}`).then(data => { if (mounted && selection.current === current) { setBrief(data); setAnalysis(null); } }).catch(e => { if (mounted && selection.current === current) setError(e.message); });
    }
    openUrl(); window.addEventListener("popstate", openUrl);
    return () => { mounted = false; window.removeEventListener("popstate", openUrl); };
  }, []);
  useEffect(() => {
    if (!job || job.status !== "running") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function poll() {
      try {
        const updated = await api<Job>(`/api/analysis/${job!.id}/progress`);
        if (cancelled) return;
        setJob(updated);
        if (updated.status === "complete" && updated.analysisId) {
          const saved = await api<SavedAnalysis>(`/api/history/${updated.analysisId}`);
          if (cancelled) return;
          setAnalysis(saved); setCached(false); setBusy(false); setJob(null); setError(""); await loadLibrary();
        } else if (updated.status === "failed") { setBusy(false); setError(updated.error || "Analysis failed. You can try again."); }
        else { failures = 0; timer = setTimeout(poll, 1200); }
      } catch (e) {
        if (cancelled) return;
        if (++failures < 5) timer = setTimeout(poll, 2500);
        else { setBusy(false); setJob(null); setError(`${e instanceof Error ? e.message : "Connection lost."} Submit the ticker again to reconnect.`); }
      }
    }
    timer = setTimeout(poll, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  // Poll by job identity, not every stage update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, loadLibrary]);
  function navigate(next: View) {
    if (busy) return;
    selection.current++; setView(next); setBrief(null); setAnalysis(null); setJob(null); setError(""); setMobileHistory(false);
    window.history.pushState(null, "", window.location.pathname);
  }
  async function analyze(refresh = false) {
    if (busy) return;
    const parsed = TickerSchema.safeParse(refresh && analysis ? analysis.ticker : ticker);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    selection.current++; setTicker(parsed.data); setBusy(true); setError(""); setJob(null);
    try {
      const data = await api<StartResponse>(refresh && analysis ? `/api/history/${analysis.id}/refresh` : "/api/analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: parsed.data }) });
      if (data.cached) { setAnalysis(data.analysis); setCached(true); setBusy(false); await loadLibrary(); }
      else { setAnalysis(null); setCached(false); setJob(data.job); }
    } catch (e) { setBusy(false); setError(e instanceof Error ? e.message : "Analysis could not start."); }
  }
  function showBrief(data: Brief) {
    selection.current++; setBrief(data); setAnalysis(null); setMobileHistory(false); setError("");
    window.history.pushState(null, "", `?brief=${data.id}`);
    void loadLibrary().catch(e => setError(e.message));
  }
  async function openItem(item: Entry) {
    if (busy) return;
    const current = ++selection.current; setError(""); setMobileHistory(false);
    try {
      if (item.kind === "brief") {
        const data = await api<Brief>(`/api/briefs/${item.id}`);
        if (current === selection.current) showBrief(data);
      } else {
        const data = await api<SavedAnalysis>(`/api/history/${item.id}`);
        if (current !== selection.current) return;
        setAnalysis(data); setBrief(null); setTicker(data.ticker); setCached(false); setJob(null);
        window.history.pushState(null, "", window.location.pathname);
      }
    } catch (e) { if (current === selection.current) setError(e instanceof Error ? e.message : "Could not open research."); }
  }
  async function deleteItem(item: Entry) {
    try {
      await api(`/api/${item.kind === "brief" ? "briefs" : "history"}/${item.id}`, { method: "DELETE" });
      if (analysis?.id === item.id || brief?.id === item.id) navigate("library");
      setDeleting(null); await loadLibrary();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete research."); }
  }
  const entries: Entry[] = [
    ...briefs.map(b => ({ id: b.id, ticker: b.ticker, companyName: b.companyName, kind: "brief" as const, label: b.kind === "thesis" ? "Investment thesis" : "Stock brief", date: b.asOf })),
    ...history.map(h => ({ id: h.id, ticker: h.ticker, companyName: h.companyName, kind: "analysis" as const, label: "Scored analysis", date: h.createdAt, verdict: h.verdict, score: h.overallScore })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const filtered = entries.filter(e => `${e.ticker} ${e.companyName}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || e.kind === filter));
  const nav = (target: View) => view === target && !brief && !analysis;
  return <div className="desk">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className={`desk-sidebar ${mobileHistory ? "is-open" : ""}`} aria-label="Workspace navigation">
      <button className="brand" onClick={() => navigate("library")} disabled={busy} aria-label="Thesis home"><span className="brand-mark">t<span>.</span></span><span>thesis<span className="brand-period">.</span></span></button>
      <p className="brand-context">Investment research</p>
      <nav className="desk-nav" aria-label="Main navigation"><button className={nav("library") ? "selected" : ""} disabled={busy} onClick={() => navigate("library")}><Library size={18} /> Research library <span>{entries.length}</span></button><button className={nav("analysis") ? "selected" : ""} disabled={busy} onClick={() => navigate("analysis")}><Plus size={18} /> New analysis</button><button className={nav("codex") ? "selected" : ""} disabled={busy} onClick={() => navigate("codex")}><Terminal size={18} /> Codex handoff</button></nav>
      <div className="recent-title">Recently saved</div>
      <nav className="recent-list" aria-label="Recent research">{entries.slice(0, 6).map(item => <button key={item.id} onClick={() => openItem(item)} disabled={busy} className={brief?.id === item.id || analysis?.id === item.id ? "active" : ""}><span className="recent-symbol">{item.ticker}</span><span><strong>{item.companyName}</strong><small>{item.label}</small></span><ChevronRight size={13} /></button>)}{!entries.length && <p>Your saved briefs and analyses will appear here.</p>}</nav>
      <div className="sidebar-bottom"><FolderOpen size={18} /><div><strong>Local workspace</strong><span>Saved on this computer</span></div></div>
    </aside>
    {mobileHistory && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setMobileHistory(false)} />}
    <div className="desk-main"><header className="desk-topbar"><div><button className="mobile-toggle icon-button" aria-label="Toggle navigation" onClick={() => setMobileHistory(!mobileHistory)}><Menu size={20} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{brief?.ticker ?? analysis?.ticker ?? (view === "library" ? "Research library" : view === "codex" ? "Codex handoff" : "New analysis")}</strong></div><span className="saved-indicator"><span /> Local storage</span></header>
      <main id="main-content" className="desk-content">
        {error && <div className="desk-error" role="alert"><div><strong>Request could not be completed</strong><p>{error}</p></div><button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={18} /></button></div>}
        {brief ? <BriefView key={brief.id} brief={brief} onBack={() => navigate("library")} /> : analysis ? <><button className="text-button back-link" disabled={busy} onClick={() => navigate("library")}><ArrowLeft size={16} /> Research library</button><ResultView analysis={analysis} cached={cached} refreshing={busy} now={now} onRefresh={() => analyze(true)} /></> : view === "library" ? <>
          <header className="library-heading"><div><h1>Research library</h1><p>Company briefs, competing cases, and the evidence behind them.</p></div><button className="secondary-button" onClick={() => void loadLibrary().catch(e => setError(e.message))} aria-label="Refresh library"><RefreshCw size={16} /></button></header>
          <div className="library-layout"><section className="library-panel" aria-label="Saved research"><div className="library-controls"><label className="library-search"><Search size={18} /><input aria-label="Search research" placeholder="Search ticker or company" value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="icon-button" aria-label="Clear search" onClick={() => setSearch("")}><X size={14} /></button>}</label><select aria-label="Filter research type" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All research</option><option value="brief">Imported briefs</option><option value="analysis">Scored analyses</option></select></div>
            {loading ? <div className="library-empty" role="status"><LoaderCircle className="spin" size={25} /><h2>Opening your library</h2></div> : !filtered.length ? <div className="library-empty"><div className="empty-document"><BookOpen size={35} strokeWidth={1.25} /></div><h2>{entries.length ? "No matching research" : "Your next idea starts here"}</h2><p>{entries.length ? "Try another company or change the filter." : "Save a company brief from Codex, then return to its evidence whenever your thesis changes."}</p><button className="text-button" onClick={() => entries.length ? (setSearch(""), setFilter("all")) : navigate("codex")}>{entries.length ? "Clear filters" : "Set up your first brief"}<ArrowUpRight size={16} /></button></div> : <div className="library-table-wrap"><table className="library-table"><caption className="sr-only">Saved briefs and stock analyses</caption><thead><tr><th scope="col">Company</th><th scope="col">Research</th><th scope="col">As of</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><button className="company-link" onClick={() => openItem(item)}><strong>{item.ticker}</strong><span>{item.companyName}</span></button></td><td><span className="entry-type">{item.kind === "brief" ? <FileText size={14} /> : <Scale size={14} />}{item.label}</span>{item.verdict && <small className={`entry-verdict ${item.verdict.toLowerCase()}`}>{item.verdict} / {item.score}</small>}</td><td><time dateTime={item.date}>{new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></td><td><button className="icon-button delete-entry" onClick={() => setDeleting(item)} aria-label={`Delete ${item.ticker} ${item.label.toLowerCase()}`}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>}
            <div className="library-foot"><span>{filtered.length} {filtered.length === 1 ? "document" : "documents"}</span><span>Original research preserved</span></div>
            <div className="library-about"><History size={19} /><p><strong>A record of your reasoning.</strong> Each import keeps the report and research record together. New research creates a new entry; an identical import keeps the original.</p></div>
          </section><CodexHandoff compact onImported={showBrief} /></div>
        </> : view === "codex" ? <div className="handoff-page"><div className="handoff-intro"><h1>From Codex<br />to your library.</h1><p>Research once. Keep the brief, the sources, and the working record in Thesis.</p><div className="handoff-route"><span><Terminal size={20} /> Codex / Astra</span><ChevronRight size={20} /><span><Library size={20} /> Thesis</span></div><h3>A small, repeatable handoff</h3><p>The project instructions tell Codex how to import the two files. There is no second model pass to reformat the research, and no API key is needed for importing.</p><p>The saved files remain the source of truth. Imported briefs do not receive an invented score or confidence estimate.</p></div><CodexHandoff onImported={showBrief} /></div> : <section className="analysis-start"><div className="analysis-heading"><Scale size={25} /><h1>New analysis</h1><p>Build a weighted scorecard from current evidence, with independent bull and bear cases.</p></div><form className="analysis-form" onSubmit={e => { e.preventDefault(); void analyze(); }}><label htmlFor="ticker">Stock ticker</label><div><Search size={22} /><input id="ticker" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={11} placeholder="e.g. AAPL" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} disabled={busy} /><button className="primary-button" disabled={busy || !ticker.trim()}>{busy && <LoaderCircle className="spin" size={16} />}{busy ? "Analyzing" : "Analyze stock"}</button></div><p>Runs the existing research pipeline using your OpenAI API account.</p></form>{configured === false && <div className="setup-note"><p><strong>API setup required for scored analysis.</strong> Add your OpenAI API key to this app’s <code>.env.local</code> and restart. You can already import research completed in Codex.</p><button className="text-button" onClick={() => navigate("codex")}>Research with Codex <ArrowUpRight size={15} /></button></div>}{job && <section className="pipeline" aria-live="polite" aria-label="Analysis progress"><div className="section-line"><h2>{job.status === "failed" ? "Research interrupted" : `Researching ${job.ticker}`}</h2><span>{STAGES.filter(s => job.stages[s] === "complete").length} / 6</span></div><div className="stage-list">{STAGES.map((stage, index) => <div className={`stage ${job.stages[stage]}`} key={stage}><span className="stage-icon">{job.stages[stage] === "complete" ? <Check size={16} /> : job.stages[stage] === "running" ? <LoaderCircle className="spin" size={16} /> : job.stages[stage] === "failed" ? <X size={16} /> : index + 1}</span><span>{stageLabels[stage]}</span><span className="stage-state">{job.stages[stage]}</span></div>)}</div></section>}</section>}
        {deleting && <div className="delete-notice" role="alert"><span>Delete the saved {deleting.ticker} {deleting.label.toLowerCase()}? Original files are kept.</span><button className="danger-button" onClick={() => void deleteItem(deleting)}>Delete</button><button className="secondary-button" onClick={() => setDeleting(null)}>Cancel</button></div>}
        <footer className="desk-disclaimer"><Scale size={15} /><p><strong>Not financial advice.</strong> Thesis is a research tool. AI can make mistakes. Verify the evidence and use your own judgment before making investment decisions.</p></footer>
      </main>
    </div>
  </div>;
}
