console.log("Sentinel: background service worker started");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Sentinel: received message", message?.type);
  if (!message?.type || !["sentinel_capture_prompt", "sentinel_capture_turn"].includes(message.type)) {
    return false;
  }

  const handler = message.type === "sentinel_capture_turn" ? handleCaptureTurn : handleCapture;
  handler(message.payload, sender)
    .then((result) => {
      console.log("Sentinel: capture success");
      sendResponse({ ok: true, result });
    })
    .catch((error) => {
      console.error("Sentinel: capture error", String(error));
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
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
