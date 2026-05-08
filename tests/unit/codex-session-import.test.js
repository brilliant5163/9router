import { describe, it, expect } from "vitest";

function makeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.`;
}

describe("Codex ChatGPT session import", () => {
  it("maps ChatGPT session JSON into a Codex OAuth connection payload", async () => {
    const { mapCodexSessionToConnection } = await import("../../src/lib/oauth/utils/codexSession.js");
    const accessToken = makeJwt({ sub: "user_123", email: "token@example.com", exp: 1893456000 });

    const result = mapCodexSessionToConnection({
      user: { email: "session@example.com", name: "Session User", id: "user-session" },
      accessToken,
      expires: "2030-01-01T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      provider: "codex",
      authType: "oauth",
      name: "session@example.com",
      displayName: "Session User",
      email: "session@example.com",
      accessToken,
      tokenType: "Bearer",
      expiresAt: "2030-01-01T00:00:00.000Z",
      testStatus: "active",
      providerSpecificData: {
        authSource: "chatgpt-session",
        chatgptUserId: "user-session",
      },
    });
  });

  it("accepts a raw JSON string and derives expiry from token exp", async () => {
    const { mapCodexSessionToConnection } = await import("../../src/lib/oauth/utils/codexSession.js");
    const accessToken = makeJwt({ email: "token@example.com", exp: 1893456000 });

    const result = mapCodexSessionToConnection(JSON.stringify({ accessToken }));

    expect(result.email).toBe("token@example.com");
    expect(result.expiresAt).toBe("2030-01-01T00:00:00.000Z");
  });

  it("rejects invalid session JSON", async () => {
    const { mapCodexSessionToConnection } = await import("../../src/lib/oauth/utils/codexSession.js");

    expect(() => mapCodexSessionToConnection("not json")).toThrow("Invalid JSON");
    expect(() => mapCodexSessionToConnection({ user: { email: "missing-token@example.com" } })).toThrow("accessToken");
  });
});
