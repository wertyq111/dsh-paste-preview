import { describe, expect, it } from "vitest"
import { apply } from "../dsh/index.js"

describe("apply", () => {
  it("wires the llm service from the inject scope into the verdict route", async () => {
    const routes: Record<string, any> = {}
    const scope = {
      connection: { requestRejection: () => undefined },
      webServer: { register: (route: any) => { routes[route.path] = route } },
      llm: {
        listProviders: () => [{ id: "p1" }],
        listModels: async () => [{ id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", inputModalities: ["text"] }],
      },
    }
    // Cordis hands the inject callback only the scope; services live on it.
    apply({ inject: (_deps: string[], callback: (scope: any) => void) => callback(scope) })
    const out: any = {}
    await routes["/dsh-paste-preview/verdict"].handler(
      { method: "GET", headers: {}, url: "/dsh-paste-preview/verdict?model=" + encodeURIComponent("deepseek-ai/DeepSeek-V4-Pro") },
      { writeHead: (c: number) => { out.code = c }, end: (b?: string) => { out.body = b } },
    )
    expect(out.code).toBe(200)
    expect(JSON.parse(out.body).takeover).toBe(true)
  })
})
