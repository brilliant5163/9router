const BASE64_BLOCK_SIZE = 4;

function decodeJwtPayload(jwt) {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const missingPadding = (BASE64_BLOCK_SIZE - (base64.length % BASE64_BLOCK_SIZE)) % BASE64_BLOCK_SIZE;
    const padded = base64 + "=".repeat(missingPadding);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function normalizeCodexSessionPayload(sessionPayload) {
  if (typeof sessionPayload === "string") {
    try {
      return JSON.parse(sessionPayload);
    } catch {
      throw new Error("Invalid JSON response");
    }
  }
  if (!sessionPayload || typeof sessionPayload !== "object") {
    throw new Error("Session response must be a JSON object");
  }
  return sessionPayload;
}

function getCodexSessionExpiresAt(sessionPayload, accessTokenPayload) {
  if (sessionPayload.expires) {
    const expiresAt = new Date(sessionPayload.expires);
    if (!Number.isNaN(expiresAt.getTime())) return expiresAt.toISOString();
  }
  if (typeof accessTokenPayload?.exp === "number") {
    return new Date(accessTokenPayload.exp * 1000).toISOString();
  }
  return null;
}

export function mapCodexSessionToConnection(sessionPayload) {
  const session = normalizeCodexSessionPayload(sessionPayload);
  const accessToken = session.accessToken || session.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("ChatGPT session JSON must include accessToken");
  }

  const accessTokenPayload = decodeJwtPayload(accessToken) || {};
  const user = session.user && typeof session.user === "object" ? session.user : {};
  const email = user.email || accessTokenPayload.email || accessTokenPayload.preferred_username || accessTokenPayload.sub;
  const displayName = user.name || user.email || email || "ChatGPT Session";
  const providerSpecificData = {
    authSource: "chatgpt-session",
  };

  if (user.id) providerSpecificData.chatgptUserId = user.id;
  if (user.image || user.picture) providerSpecificData.avatarUrl = user.image || user.picture;

  const connection = {
    provider: "codex",
    authType: "oauth",
    name: email || displayName,
    displayName,
    accessToken,
    tokenType: session.tokenType || session.token_type || "Bearer",
    testStatus: "active",
    providerSpecificData,
  };

  if (email) connection.email = email;
  const expiresAt = getCodexSessionExpiresAt(session, accessTokenPayload);
  if (expiresAt) connection.expiresAt = expiresAt;
  if (session.refreshToken || session.refresh_token) {
    connection.refreshToken = session.refreshToken || session.refresh_token;
  }
  if (session.idToken || session.id_token) {
    connection.idToken = session.idToken || session.id_token;
  }

  return connection;
}
