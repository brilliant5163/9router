// All intercepted domains + URL patterns per tool

const TARGET_HOSTS = [
  "daily-cloudcode-pa.googleapis.com",
  "cloudcode-pa.googleapis.com",
  "api.individual.githubcopilot.com",
  "openrouter.ai",
  "q.us-east-1.amazonaws.com",
  "api2.cursor.sh",
];

const URL_PATTERNS = {
  antigravity: [":generateContent", ":streamGenerateContent"],
  copilot: ["/chat/completions", "/v1/messages", "/responses"],
  openrouter: ["/api/v1/chat/completions", "/v1/chat/completions", "/chat/completions", "/api/v1/responses", "/v1/responses", "/responses", "/api/v1/messages", "/v1/messages", "/api/v1/models", "/v1/models", "/api/v1/key", "/api/v1/auth/key"],
  kiro: ["/generateAssistantResponse"],
  cursor: ["/BidiAppend", "/RunSSE", "/RunPoll", "/Run"],
};

// Synonym map: rawModel from request → canonical alias key in mitmAlias DB
const MODEL_SYNONYMS = {
  antigravity: { "gemini-default": "gemini-3-flash" },
};

// URL substrings whose request/response should NOT be dumped to file (telemetry, polling, empty)
const LOG_BLACKLIST_URL_PARTS = [
  "recordCodeAssistMetrics",
  "recordTrajectoryAnalytics",
  "fetchAdminControls",
  "listExperiments",
  "fetchUserInfo",
];

function getToolForHost(host) {
  const h = (host || "").split(":")[0];
  if (h === "api.individual.githubcopilot.com") return "copilot";
  if (h === "openrouter.ai") return "openrouter";
  if (h === "daily-cloudcode-pa.googleapis.com" || h === "cloudcode-pa.googleapis.com") return "antigravity";
  if (h === "q.us-east-1.amazonaws.com") return "kiro";
  if (h === "api2.cursor.sh") return "cursor";
  return null;
}

module.exports = { TARGET_HOSTS, URL_PATTERNS, MODEL_SYNONYMS, LOG_BLACKLIST_URL_PARTS, getToolForHost };
