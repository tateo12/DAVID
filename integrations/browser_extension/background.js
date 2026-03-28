console.log("Sentinel: background service worker started");

// ═══════════════════════════════════════════════════════════
//  AI SITE DETECTION — domains for dynamic injection
// ═══════════════════════════════════════════════════════════

const KNOWN_AI_DOMAINS = new Set([
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "gemini.google.com",
  "aistudio.google.com",
  "copilot.microsoft.com",
  "www.bing.com",
  "www.perplexity.ai",
  "perplexity.ai",
  "chat.mistral.ai",
  "poe.com",
  "huggingface.co",
  "chat.deepseek.com",
  "you.com",
  "pi.ai",
  "coral.cohere.com",
  "character.ai",
  "beta.character.ai",
  "old.character.ai",
  "meta.ai",
  "www.meta.ai",
  "grok.com",
  "chat.lmsys.org",
  "lmarena.ai",
  "arena.lmsys.org",
  "labs.google",
  "chat.qwenlm.ai",
  "console.groq.com",
  "openrouter.ai",
  "chat.01.ai",
  "notdiamond.ai",
  "chat.notdiamond.ai",
  "abacus.ai",
  "app.fireworks.ai",
  "deepinfra.com",
  "together.ai",
  "app.together.ai",
  "replicate.com",
  "chat.reka.ai",
  "chat.coze.com",
  "www.jasper.ai",
  "app.writesonic.com",
  "chat.forefront.ai",
  "open-assistant.io",
  "chat.nbox.ai",
]);

const AI_PATH_HINTS = ["/chat", "/c/", "/conversation", "/playground", "/ask", "/prompt"];

function isAiSite(url) {
  try {
    const parsed = new URL(url);
    if (KNOWN_AI_DOMAINS.has(parsed.hostname)) return true;
    if (parsed.hostname === "x.com" && parsed.pathname.startsWith("/i/grok")) return true;
    if (parsed.hostname === "www.bing.com" && parsed.pathname.startsWith("/chat")) return true;
    if (parsed.hostname === "huggingface.co" && parsed.pathname.startsWith("/chat")) return true;
    const path = parsed.pathname.toLowerCase();
    for (const hint of AI_PATH_HINTS) {
      if (path.includes(hint)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
//  DYNAMIC CONTENT SCRIPT INJECTION
// ═══════════════════════════════════════════════════════════

const injectedTabs = new Set();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    injectedTabs.delete(tabId);
  }
  if (changeInfo.status !== "complete" || !tab.url) return;
  if (injectedTabs.has(tabId)) return;
  if (!isAiSite(tab.url)) return;

  injectedTabs.add(tabId);
  chrome.scripting
    .executeScript({ target: { tabId }, files: ["content.js"] })
    .then(() => {
      chrome.scripting.insertCSS({ target: { tabId }, files: ["styles.css"] }).catch(() => {});
      console.log("Sentinel: dynamically injected on", tab.url);
    })
    .catch((err) => {
      console.debug("Sentinel: injection failed for tab", tabId, err);
      injectedTabs.delete(tabId);
    });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

// ═══════════════════════════════════════════════════════════
//  MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return false;

  const handlers = {
    sentinel_capture_prompt: handleCapture,
    sentinel_capture_turn: handleCaptureTurn,
    sentinel_pre_check: handlePreCheck,
  };

  const handler = handlers[message.type];
  if (!handler) return false;

  handler(message.payload, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      console.error("Sentinel: handler error", message.type, String(error));
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
});

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

async function getAuthState() {
  const state = await chrome.storage.local.get(["apiBaseUrl", "accessToken", "user", "expiresAt"]);
  const apiBaseUrl = (state.apiBaseUrl || "https://david-production-f999.up.railway.app").replace(/\/$/, "");
  if (state.expiresAt && new Date(state.expiresAt) <= new Date()) {
    await chrome.storage.local.remove(["accessToken", "user", "expiresAt"]);
    throw new Error("Session expired. Open extension popup and login.");
  }
  const token = state.accessToken;
  const user = state.user;
  if (!token || !user) throw new Error("Not logged in. Open extension popup and login.");
  return { apiBaseUrl, token, user };
}

function buildCapturePayload(payload, sender, user) {
  return {
    prompt_text: payload.prompt_text,
    target_tool: payload.target_tool,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    warning_confirmed: Boolean(payload.warning_confirmed),
    warning_context_id: payload.warning_context_id || null,
    metadata: {
      source: "browser_extension",
      page_url: payload.page_url,
      tab_id: sender?.tab?.id || null,
      captured_at: new Date().toISOString(),
      ...(payload.metadata || {}),
    },
    ...(user.role === "manager" && payload.employee_id ? { employee_id: payload.employee_id } : {}),
  };
}

// ═══════════════════════════════════════════════════════════
//  CAPTURE HANDLER
// ═══════════════════════════════════════════════════════════

async function handleCapture(payload, sender) {
  const { apiBaseUrl, token, user } = await getAuthState();
  const body = buildCapturePayload(payload, sender, user);

  const response = await fetch(`${apiBaseUrl}/api/extension/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Capture failed");
  return data;
}

// ═══════════════════════════════════════════════════════════
//  PRE-CHECK HANDLER — synchronous check before submission
// ═══════════════════════════════════════════════════════════

async function handlePreCheck(payload, sender) {
  const { apiBaseUrl, token, user } = await getAuthState();

  const body = {
    prompt_text: payload.prompt_text,
    target_tool: payload.target_tool,
    attachments: [],
    warning_confirmed: false,
    warning_context_id: null,
    preview_only: true,
    metadata: {
      source: "browser_extension",
      page_url: payload.page_url,
      tab_id: sender?.tab?.id || null,
      captured_at: new Date().toISOString(),
      event_type: "pre_check",
    },
    ...(user.role === "manager" && payload.employee_id ? { employee_id: payload.employee_id } : {}),
  };

  const response = await fetch(`${apiBaseUrl}/api/extension/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Pre-check failed");
  return data;
}

// ═══════════════════════════════════════════════════════════
//  TURN CAPTURE HANDLER
// ═══════════════════════════════════════════════════════════

async function handleCaptureTurn(payload, sender) {
  const { apiBaseUrl, token, user } = await getAuthState();

  const body = {
    prompt_text: payload.prompt_text,
    ai_output_text: payload.ai_output_text,
    target_tool: payload.target_tool,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    conversation_id: payload.conversation_id,
    turn_id: payload.turn_id,
    metadata: {
      source: "browser_extension",
      page_url: payload.page_url,
      tab_id: sender?.tab?.id || null,
      captured_at: new Date().toISOString(),
    },
    ...(user.role === "manager" && payload.employee_id ? { employee_id: payload.employee_id } : {}),
  };

  const response = await fetch(`${apiBaseUrl}/api/extension/capture-turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Turn capture failed");
  return data;
}
