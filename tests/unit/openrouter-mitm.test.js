import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function loadCommonJs(relativePath, requireStub = () => ({})) {
  const filename = path.join(ROOT_DIR, relativePath);
  const cjsModule = { exports: {} };
  const context = {
    module: cjsModule,
    exports: cjsModule.exports,
    require: requireStub,
    __dirname: path.dirname(filename),
    process,
    Buffer,
    console,
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return cjsModule.exports;
}

function loadCommonJsWithEnv(relativePath, env, requireStub = () => ({})) {
  const originalEnv = process.env;
  process.env = { ...originalEnv, ...env };
  try {
    return loadCommonJs(relativePath, requireStub);
  } finally {
    process.env = originalEnv;
  }
}

const mitmConfig = loadCommonJs("src/mitm/config.js");
const { TOOL_HOSTS } = loadCommonJs("src/shared/constants/mitmToolHosts.js");
const openrouterHandler = loadCommonJs("src/mitm/handlers/openrouter.js", (id) => {
  if (id === "node:fs") return fs;
  if (id === "node:path") return path;
  if (id === "../logger") return { err: () => {} };
  if (id === "../../shared/constants/brand.cjs") return { BRAND: { displayName: "9RouterX" } };
  if (id === "./base") return { fetchRouter: async () => ({}), pipeSSE: async () => {} };
  throw new Error(`Unexpected require: ${id}`);
});

function loadOpenRouterHandler(env = {}) {
  return loadCommonJsWithEnv("src/mitm/handlers/openrouter.js", env, (id) => {
    if (id === "node:fs") return fs;
    if (id === "node:path") return path;
    if (id === "../logger") return { err: () => {} };
    if (id === "../../shared/constants/brand.cjs") return { BRAND: { displayName: "9RouterX" } };
    throw new Error(`Unexpected require: ${id}`);
  });
}

describe("OpenRouter MITM wiring", () => {
  it("maps openrouter.ai to the openrouter MITM tool", () => {
    expect(mitmConfig.TARGET_HOSTS).toContain("openrouter.ai");
    expect(mitmConfig.getToolForHost("openrouter.ai")).toBe("openrouter");
    expect(mitmConfig.getToolForHost("openrouter.ai:443")).toBe("openrouter");
    expect(TOOL_HOSTS.openrouter).toEqual(["openrouter.ai"]);
  });

  it("recognizes OpenRouter chat and responses endpoints", () => {
    expect(mitmConfig.URL_PATTERNS.openrouter).toContain("/api/v1/chat/completions");
    expect(mitmConfig.URL_PATTERNS.openrouter).toContain("/chat/completions");
    expect(mitmConfig.URL_PATTERNS.openrouter).toContain("/api/v1/responses");
    expect(mitmConfig.URL_PATTERNS.openrouter).toContain("/v1/messages");
    expect(mitmConfig.URL_PATTERNS.openrouter).toContain("/api/v1/models");
    expect(mitmConfig.URL_PATTERNS.openrouter).toContain("/api/v1/key");
    expect(openrouterHandler.resolveRouterPath("/api/v1/chat/completions")).toBe("/v1/chat/completions");
    expect(openrouterHandler.resolveRouterPath("/api/v1/responses")).toBe("/v1/responses");
    expect(openrouterHandler.resolveRouterPath("/api/v1/models?supported_parameters=tools")).toBe("/v1/models?supported_parameters=tools");
    expect(openrouterHandler.resolveRouterPath("/v1/messages")).toBe("/v1/messages");
    expect(openrouterHandler.isModelsRequest("/api/v1/models?supported_parameters=tools")).toBe(true);
  });

  it("rewrites the model only when an alias mapping exists", () => {
    const body = {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    };

    expect(openrouterHandler.rewriteModel(body, "cc/claude-sonnet-4-6")).toEqual({
      model: "cc/claude-sonnet-4-6",
      messages: body.messages,
      stream: true,
    });
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(openrouterHandler.rewriteModel(body, null)).toBe(body);
    expect(openrouterHandler.rewriteModel(body, null, {
      "openai/gpt-4o-mini": "cc/claude-sonnet-4-6",
    })).toEqual({
      model: "cc/claude-sonnet-4-6",
      messages: body.messages,
      stream: true,
    });
  });

  it("preserves the client Authorization header for 9Router API key auth", () => {
    expect(openrouterHandler.collectForwardHeaders({
      host: "openrouter.ai",
      authorization: "Bearer sk-9router",
      "content-length": "123",
      "user-agent": "curl",
    }, true)).toEqual({
      authorization: "Bearer sk-9router",
      "user-agent": "curl",
      "Content-Type": "application/json",
    });
  });

  it("injects the MITM router API key when the client omits Authorization", () => {
    const handler = loadOpenRouterHandler({ ROUTER_API_KEY: "sk_9routerx" });
    expect(handler.collectForwardHeaders({
      host: "openrouter.ai",
      "content-length": "123",
      "user-agent": "curl",
    }, true)).toEqual({
      Authorization: "Bearer sk_9routerx",
      "user-agent": "curl",
      "Content-Type": "application/json",
    });
  });

  it("handles OpenRouter key validation endpoints locally", () => {
    expect(openrouterHandler.isKeyInfoRequest("/api/v1/key")).toBe(true);
    expect(openrouterHandler.isKeyInfoRequest("/api/v1/auth/key")).toBe(true);
    expect(openrouterHandler.isKeyInfoRequest("/api/v1/models")).toBe(false);
  });

  it("injects public alias ids into OpenRouter model metadata", () => {
    const result = openrouterHandler.injectPublicModels({
      data: [
        { id: "openai/gpt-5.4" },
      ],
    }, {
      "openai/gpt-5.4": "cc/gpt-5.4",
      "anthropic/claude-sonnet-4.6": "cc/claude-sonnet-4-6",
    });

    expect(result.data).toEqual([
      { id: "openai/gpt-5.4" },
      expect.objectContaining({
        id: "anthropic/claude-sonnet-4.6",
        canonical_slug: "anthropic/claude-sonnet-4.6",
        provider: "anthropic",
        context_length: 128000,
        architecture: expect.objectContaining({
          input_modalities: ["text"],
          output_modalities: ["text"],
        }),
        pricing: expect.objectContaining({
          prompt: "0",
          completion: "0",
        }),
        supported_parameters: expect.arrayContaining(["max_tokens", "stream"]),
      }),
    ]);
  });
});
