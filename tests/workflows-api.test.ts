import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { GET } from "../src/app/api/workflows/route";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "thesis-workflow-test-")); vi.spyOn(process,"cwd").mockReturnValue(dir);
  const storage = join(dir,"data","workflows","AVGO-run"); const run = join(dir,"reports","run"); mkdirSync(storage,{recursive:true}); mkdirSync(run,{recursive:true});
  writeFileSync(join(run,"report.md"),"# Saved report");
  writeFileSync(join(storage,"source.json"),JSON.stringify({runDir:run}));
  writeFileSync(join(storage,"snapshot.json"),JSON.stringify({id:"AVGO-run",ticker:"AVGO",company:"Broadcom",asOf:"2026-09-16",agents:[{id:"agent-1"}],artifacts:[{path:"report.md",bytes:14,readable:true,hash:createHash("sha256").update("# Saved report").digest("hex")}]}));
  writeFileSync(join(storage,"agent-1.json"),JSON.stringify([{id:"call",kind:"command",input:"read",output:"result"}]));
});
afterEach(() => { vi.restoreAllMocks(); rmSync(dir,{recursive:true,force:true}); });
function request(query = "", headers = {}) { return GET(new Request(`http://127.0.0.1:3000/api/workflows${query}`,{headers})); }
describe("workflow API", () => {
  it("lists local runs and loads only a recorded agent",async () => {
    expect((await (await request()).json()).items).toHaveLength(1);
    expect((await (await request("?run=AVGO-run&agent=agent-1")).json()).events[0].output).toBe("result");
    expect((await request("?run=AVGO-run&agent=other-agent")).status).toBe(404);
  });
  it("blocks cross-origin requests and traversal",async () => {
    expect((await request("",{origin:"https://external.example"})).status).toBe(403);
    expect((await request("",{"sec-fetch-site":"cross-site"})).status).toBe(403);
    expect((await request("?run=..%2F..%2Fprivate")).status).toBe(400);
    expect((await request("?run=AVGO-run&artifact=..%2Fsecret.txt")).status).toBe(404);
  });
  it("verifies original artifact hashes and detects edits",async () => {
    const result = await (await request("?run=AVGO-run&artifact=report.md")).json(); expect(result.text).toBe("# Saved report"); expect(result.matchesSnapshot).toBe(true);
    writeFileSync(join(dir,"reports","run","report.md"),"# Changed report");
    expect((await (await request("?run=AVGO-run&artifact=report.md")).json()).matchesSnapshot).toBe(false);
  });
});
