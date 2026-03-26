chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    !message?.type ||
    !["sentinel_capture_prompt", "sentinel_capture_turn", "sentinel_capture_screenshot"].includes(message.type)
  ) {
    return false;
  }

  const handler =
    message.type === "sentinel_capture_turn"
      ? handleCaptureTurn
      : message.type === "sentinel_capture_screenshot"
        ? handleCaptureScreenshot
        : handleCapture;
  handler(message.payload, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});

const SUPPORTED_HOSTS = new Set(["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"]);

function isSupportedAiUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return SUPPORTED_HOSTS.has(parsed.host.toLowerCase());
  } catch (_error) {
    return false;
  }
}

async function injectPageHook(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["page_hook.js"],
      world: "MAIN",
    });
  } catch (error) {
    console.debug("Sentinel page hook injection failed:", String(error));
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!isSupportedAiUrl(tab?.url)) return;
  injectPageHook(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isSupportedAiUrl(tab?.url)) return;
    injectPageHook(tabId);
  } catch (_error) {
    // Ignore tab read races.
  }
});

async function handleCapture(payload, sender) {
  const state = await chrome.storage.local.get(["apiBaseUrl", "accessToken", "user"]);
  const apiBaseUrl = (state.apiBaseUrl || "https://david-production-f999.up.railway.app").replace(/\/$/, "");
  const token = state.accessToken;
  const user = state.user;

  if (!token || !user) {
    throw new Error("Not logged in. Open extension popup and login.");
  }

  const enrichedPayload = {
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
  };

  if (user.role === "manager" && payload.employee_id) {
    enrichedPayload.employee_id = payload.employee_id;
  }

  const response = await fetch(`${apiBaseUrl}/api/extension/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(enrichedPayload),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.detail || "Capture failed");
  }
  return body;
}

async function handleCaptureTurn(payload, sender) {
  const state = await chrome.storage.local.get(["apiBaseUrl", "accessToken", "user"]);
  const apiBaseUrl = (state.apiBaseUrl || "https://david-production-f999.up.railway.app").replace(/\/$/, "");
  const token = state.accessToken;
  const user = state.user;

  if (!token || !user) {
    throw new Error("Not logged in. Open extension popup and login.");
  }

  const enrichedPayload = {
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
  };

  if (user.role === "manager" && payload.employee_id) {
    enrichedPayload.employee_id = payload.employee_id;
  }

  const response = await fetch(`${apiBaseUrl}/api/extension/capture-turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(enrichedPayload),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.detail || "Turn capture failed");
  }
  return body;
}

function captureVisibleTabPng(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId || null, { format: "png", quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!dataUrl) {
        reject(new Error("Empty screenshot data."));
        return;
      }
      resolve(dataUrl);
    });
  });
}

async function handleCaptureScreenshot(payload, sender) {
  const windowId = sender?.tab?.windowId || null;
  const dataUrl = await captureVisibleTabPng(windowId);
  const nowIso = new Date().toISOString();
  await chrome.storage.local.set({
    latestScreenshotDataUrl: dataUrl,
    latestScreenshotCapturedAt: nowIso,
    latestScreenshotPageUrl: payload?.page_url || sender?.tab?.url || null,
  });
  return {
    data_url: dataUrl,
    captured_at: nowIso,
    page_url: payload?.page_url || sender?.tab?.url || null,
  };
}
