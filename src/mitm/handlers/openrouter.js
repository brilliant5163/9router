const { err } = require("../logger");
const { BRAND } = require("../../shared/constants/brand.cjs");

const DEFAULT_LOCAL_ROUTER = "http://localhost:20128";
const ROUTER_BASE = String(process.env.MITM_ROUTER_BASE || DEFAULT_LOCAL_ROUTER)
  .trim()
  .replace(/\/+$/, "") || DEFAULT_LOCAL_ROUTER;

const STRIP_HEADERS = new Set([
  "host", "content-length", "connection", "transfer-encoding",
]);

const URL_MAP = {
  "/api/v1/chat/completions": "/v1/chat/completions",
  "/v1/chat/completions": "/v1/chat/completions",
  "/api/v1/responses": "/v1/responses",
  "/v1/responses": "/v1/responses",
  "/api/v1/models": "/v1/models",
  "/v1/models": "/v1/models",
};

function resolveRouterPath(reqUrl) {
  const [pathname, query = ""] = String(reqUrl || "").split("?");
  for (const [pattern, routerPath] of Object.entries(URL_MAP)) {
    if (pathname === pattern || pathname.endsWith(pattern)) {
      return query ? `${routerPath}?${query}` : routerPath;
    }
  }
  return "/v1/chat/completions";
}

function rewriteModel(body, mappedModel) {
  if (!mappedModel) return body;
  return { ...body, model: mappedModel };
}

function collectForwardHeaders(clientHeaders = {}, hasJsonBody = false) {
  const forwarded = {};
  for (const [k, v] of Object.entries(clientHeaders)) {
    if (!STRIP_HEADERS.has(k.toLowerCase())) forwarded[k] = v;
  }
  if (hasJsonBody) forwarded["Content-Type"] = "application/json";
  return forwarded;
}

async function fetchRouter(req, bodyBuffer, routerPath) {
  const hasBody = bodyBuffer && bodyBuffer.length > 0;
  return fetch(`${ROUTER_BASE}${routerPath}`, {
    method: req.method,
    headers: collectForwardHeaders(req.headers, hasBody),
    body: hasBody ? bodyBuffer : undefined,
  });
}

async function pipeRouterResponse(routerRes, res) {
  const headers = {};
  routerRes.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") headers[key] = value;
  });
  res.writeHead(routerRes.status || 200, headers);

  if (!routerRes.body) {
    res.end(await routerRes.text().catch(() => ""));
    return;
  }

  const reader = routerRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      return;
    }
    res.write(value);
  }
}

function isKeyInfoRequest(reqUrl) {
  const pathname = String(reqUrl || "").split("?")[0];
  return pathname === "/api/v1/key" || pathname === "/api/v1/auth/key";
}

function sendKeyInfo(res) {
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({
    data: {
      label: `${BRAND.displayName} MITM API Key`,
      limit: null,
      usage: 0,
      usage_daily: 0,
      usage_weekly: 0,
      usage_monthly: 0,
      byok_usage: 0,
      byok_usage_daily: 0,
      byok_usage_weekly: 0,
      byok_usage_monthly: 0,
      is_free_tier: false,
      limit_remaining: null,
      limit_reset: null,
      include_byok_in_limit: false,
      is_provisioning_key: false,
      is_management_key: false,
      rate_limit: { interval: "1h", requests: 100000 },
    },
  }));
}

async function intercept(req, res, bodyBuffer, mappedModel, passthrough) {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && isKeyInfoRequest(req.url)) {
      sendKeyInfo(res);
      return;
    }

    const routerPath = resolveRouterPath(req.url);
    let forwardBody = bodyBuffer;

    if (bodyBuffer.length > 0 && req.headers["content-type"]?.includes("application/json")) {
      const body = rewriteModel(JSON.parse(bodyBuffer.toString()), mappedModel);
      forwardBody = Buffer.from(JSON.stringify(body));
    }

    const routerRes = await fetchRouter(req, forwardBody, routerPath);
    await pipeRouterResponse(routerRes, res);
  } catch (error) {
    err(`[openrouter] ${error.message}`);
    if (passthrough && !res.headersSent) {
      return passthrough(req, res, bodyBuffer);
    }
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
  }
}

module.exports = { intercept, resolveRouterPath, rewriteModel, collectForwardHeaders, isKeyInfoRequest };
