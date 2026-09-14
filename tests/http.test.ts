import { describe, expect, it } from "vitest";
import { jsonBody, localRequest, failure } from "../src/server/http";
describe("local API boundaries", () => {
  it("accepts loopback same-origin requests and local CLI requests", () => {
    expect(() => localRequest(new Request("http://127.0.0.1:3001/api/analysis", { headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" } }))).not.toThrow();
    expect(() => localRequest(new Request("http://localhost:3000/api/history"))).not.toThrow();
  });
  it("rejects foreign origins and DNS rebinding hosts", () => {
    expect(() => localRequest(new Request("http://localhost/api/analysis", { headers: { origin: "https://untrusted.example" } }))).toThrow();
    expect(() => localRequest(new Request("http://untrusted.example/api/history"))).toThrow();
  });
  it("rejects malformed, oversized and non-JSON request bodies", async () => {
    const req = (body: string, type = "application/json") => new Request("http://localhost/api/analysis", { method: "POST", headers: { "content-type": type }, body });
    await expect(jsonBody(req("invalid"))).rejects.toMatchObject({ status: 400 });
    await expect(jsonBody(req("x".repeat(1025)))).rejects.toMatchObject({ status: 413 });
    await expect(jsonBody(req("{}", "text/plain"))).rejects.toMatchObject({ status: 415 });
    await expect(jsonBody(req('{"ticker":"AAPL"}'))).resolves.toEqual({ ticker: "AAPL" });
  });
  it("never returns unexpected exception details", async () => { const response = failure(new Error("OPENAI_API_KEY=not-for-browser")); expect(await response.text()).not.toContain("not-for-browser"); });
});
