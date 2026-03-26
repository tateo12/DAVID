let lastDraftHash = "";
let lastOutputHash = "";
let lastSubmittedPrompt = "";
let outputDebounceTimer = null;
let lastAttachmentHash = "";
let latestAttachments = [];
let bypassNextSubmit = false;
let bypassNextSendClick = false;
let submitInFlight = false;
let bridgeInstalled = false;
let pageHookInjected = false;
let lastNetworkPromptHash = "";

const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_PREVIEW_CHARS = 4000;

const TEXT_MIME_PREFIXES = [
  "text/",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
];

function inferTargetTool() {
  return window.location.host.toLowerCase();
}

function hashText(value) {
  const text = value || "";
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `${hash}`;
}

function getPromptField() {
  return document.querySelector("textarea, [contenteditable='true']");
}

function getPromptTextFromField(field) {
  if (!field) return "";
  if (field.tagName.toLowerCase() === "textarea") return field.value || "";
  return field.innerText || "";
}

function injectPageHook() {
  if (pageHookInjected) return;
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page_hook.js");
  script.async = false;
  script.onload = () => {
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
  pageHookInjected = true;
}

function installPageHookBridge() {
  if (bridgeInstalled) return;
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "sentinel_page_hook" || data.type !== "sentinel_network_prompt") {
      return;
    }

    const payload = data.payload || {};
    const promptText = (payload.prompt_text || "").trim();
    if (!promptText) return;

    const networkHash = hashText(`${payload.request_url || ""}:${promptText}`);
    if (networkHash === lastNetworkPromptHash) return;
    lastNetworkPromptHash = networkHash;

    sendMessage("sentinel_capture_prompt", {
      prompt_text: promptText,
      target_tool: inferTargetTool(),
      page_url: window.location.href,
      attachments: latestAttachments,
      metadata: {
        event_type: "network_prompt_capture",
        capture_method: payload.capture_method || "network_hook",
        request_url: payload.request_url || null,
        request_method: payload.request_method || null,
      },
    }).then((result) => {
      if (!result) return;
      if (result.requires_confirmation) {
        // We cannot safely block site network requests here; notify user from content context.
        showSecurityWarningDialog(result);
      }
    });
  });
  bridgeInstalled = true;
}

function sendMessage(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (!response || !response.ok) {
        console.debug("Sentinel message failed:", type, response?.error || "unknown");
        resolve(null);
        return;
      }
      resolve(response.result || null);
    });
  });
}

function attachmentFingerprint(attachments) {
  const serialized = (attachments || [])
    .map((a) => `${a.name}:${a.size_bytes}:${a.mime_type}:${a.last_modified_ms || 0}`)
    .join("|");
  return hashText(serialized);
}

function isTextLikeMime(mimeType) {
  const mime = (mimeType || "").toLowerCase();
  return TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

async function extractAttachmentPreview(file) {
  if (!isTextLikeMime(file.type)) {
    return { extracted_text: "", extraction_status: "not_text_like" };
  }
  try {
    const text = await file.text();
    const trimmed = text.slice(0, MAX_ATTACHMENT_PREVIEW_CHARS);
    return { extracted_text: trimmed, extraction_status: "ok" };
  } catch (_error) {
    return { extracted_text: "", extraction_status: "read_error" };
  }
}

async function buildAttachmentContexts(fileListLike, source) {
  const files = Array.from(fileListLike || []).slice(0, MAX_ATTACHMENT_COUNT);
  const contexts = [];
  for (const file of files) {
    const preview = await extractAttachmentPreview(file);
    contexts.push({
      filename: file.name || "unknown",
      mime_type: file.type || "application/octet-stream",
      size_bytes: Number(file.size || 0),
      extracted_text: preview.extracted_text,
      source,
      extraction_status: preview.extraction_status,
      last_modified_ms: Number(file.lastModified || 0),
    });
  }
  return contexts;
}

async function updateAttachmentsIfChanged(fileListLike, source) {
  const attachments = await buildAttachmentContexts(fileListLike, source);
  latestAttachments = attachments;
  const fingerprint = attachmentFingerprint(attachments);
  if (!attachments.length || fingerprint === lastAttachmentHash) {
    return;
  }
  lastAttachmentHash = fingerprint;
  await sendMessage("sentinel_capture_prompt", {
    prompt_text: getPromptTextFromField(getPromptField()).trim(),
    target_tool: inferTargetTool(),
    page_url: window.location.href,
    attachments,
    metadata: { event_type: "attachment_selected", attachment_source: source },
  });
}

function getSendButtonCandidate(target) {
  if (!target || typeof target.closest !== "function") return null;
  const clickable = target.closest("button, [role='button'], input[type='submit']");
  if (!clickable) return null;

  const text = `${clickable.innerText || ""} ${clickable.getAttribute?.("aria-label") || ""}`.toLowerCase();
  if (text.includes("send") || text.includes("submit")) {
    return clickable;
  }
  return null;
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function showSecurityWarningDialog(result) {
  const reasons = Array.isArray(result?.warning_reasons) ? result.warning_reasons : [];
  const alternatives = Array.isArray(result?.safer_alternatives) ? result.safer_alternatives : [];
  const risk = result?.risk_level || "unknown";
  const reasonsItems = reasons.length ? reasons : ["Sensitive content detected."];
  const alternativesItems = alternatives.length ? alternatives : ["Remove sensitive data before sending."];

  if (!document?.body) {
    const message =
      `Sentinel warning (${risk} risk)\n\n` +
      `Why this was flagged:\n${reasonsItems.map((r) => `- ${r}`).join("\n")}\n\n` +
      `Safer alternatives:\n${alternativesItems.map((a) => `- ${a}`).join("\n")}\n\n` +
      "Press OK to continue sending, or Cancel to stop.";
    return window.confirm(message);
  }

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.45)";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "16px";

    const riskColor = risk === "critical" ? "#b91c1c" : risk === "high" ? "#c2410c" : "#1d4ed8";
    const reasonsHtml = reasonsItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const alternativesHtml = alternativesItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    overlay.innerHTML = `
      <div style="max-width:560px;width:100%;background:#fff;color:#111827;border-radius:12px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,0.25);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
          <strong style="font-size:18px;">Sentinel Security Warning</strong>
          <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${riskColor};">${escapeHtml(risk)} risk</span>
        </div>
        <p style="margin:0 0 10px 0;font-size:13px;color:#374151;">Your message appears to include risky data. Review these signals before continuing.</p>
        <div style="margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Why this was flagged</div>
          <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.45;">${reasonsHtml}</ul>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Safer alternatives</div>
          <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.45;">${alternativesHtml}</ul>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" data-sentinel-cancel="1" style="border:1px solid #d1d5db;background:#fff;color:#111827;border-radius:8px;padding:8px 12px;cursor:pointer;">Cancel</button>
          <button type="button" data-sentinel-confirm="1" style="border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">Send anyway</button>
        </div>
      </div>
    `;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        cleanup(false);
      }
    };

    const cleanup = (value) => {
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      resolve(value);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cleanup(false);
      }
    });

    const cancelButton = overlay.querySelector("[data-sentinel-cancel='1']");
    const confirmButton = overlay.querySelector("[data-sentinel-confirm='1']");
    if (cancelButton) {
      cancelButton.addEventListener("click", () => cleanup(false));
    }
    if (confirmButton) {
      confirmButton.addEventListener("click", () => cleanup(true));
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.body.appendChild(overlay);
  });
}

async function submitWithWarningFlow(field, triggerType) {
  const promptText = getPromptTextFromField(field).trim();
  if (!promptText || submitInFlight) return false;

  submitInFlight = true;
  try {
    const basePayload = {
      prompt_text: promptText,
      target_tool: inferTargetTool(),
      page_url: window.location.href,
      attachments: latestAttachments,
      metadata: {
        event_type: "submitted_prompt",
        submit_trigger: triggerType,
      },
    };
    const result = await sendMessage("sentinel_capture_prompt", basePayload);
    if (!result) return true;

    if (!result.requires_confirmation) {
      lastSubmittedPrompt = promptText;
      return true;
    }

    const confirmed = await showSecurityWarningDialog(result);
    if (!confirmed) {
      return false;
    }

    const confirmationResult = await sendMessage("sentinel_capture_prompt", {
      ...basePayload,
      warning_confirmed: true,
      warning_context_id: result.warning_context_id || null,
      metadata: {
        ...basePayload.metadata,
        event_type: "submitted_prompt_confirmed",
      },
    });
    if (confirmationResult) {
      lastSubmittedPrompt = promptText;
    }
    return Boolean(confirmationResult);
  } finally {
    submitInFlight = false;
  }
}

function captureDraftIfChanged(field) {
  const promptText = getPromptTextFromField(field).trim();
  if (!promptText) return;
  const h = hashText(promptText);
  if (h === lastDraftHash) return;
  lastDraftHash = h;
  sendMessage("sentinel_capture_prompt", {
    prompt_text: promptText,
    target_tool: inferTargetTool(),
    page_url: window.location.href,
    attachments: latestAttachments,
    metadata: { event_type: "draft_input" },
  });
}

function extractAiOutputText() {
  const selectors = [
    "[data-message-author-role='assistant']",
    ".assistant",
    "[data-testid*='assistant']",
    "main article",
  ];
  const chunks = [];
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    nodes.forEach((node) => {
      const text = (node.innerText || "").trim();
      if (text) chunks.push(text);
    });
    if (chunks.length > 0) break;
  }
  return chunks.slice(-2).join("\n\n").trim();
}

function captureOutputIfChanged() {
  if (!lastSubmittedPrompt) return;
  const outputText = extractAiOutputText();
  if (!outputText) return;
  const h = hashText(outputText);
  if (h === lastOutputHash) return;
  lastOutputHash = h;
  sendMessage("sentinel_capture_turn", {
    prompt_text: lastSubmittedPrompt,
    ai_output_text: outputText,
    target_tool: inferTargetTool(),
    page_url: window.location.href,
    attachments: latestAttachments,
    conversation_id: window.location.pathname,
    turn_id: `${Date.now()}`,
  });
}

function startAutoCapture() {
  injectPageHook();
  installPageHookBridge();

  const field = getPromptField();
  if (!field) return;

  field.addEventListener("input", () => captureDraftIfChanged(field));

  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      if (bypassNextSubmit) {
        bypassNextSubmit = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      submitWithWarningFlow(field, "enter_key").then((shouldSend) => {
        if (shouldSend) {
          bypassNextSubmit = true;
          field.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            })
          );
        }
      });
    }
  });

  document.addEventListener(
    "click",
    (event) => {
      const sendControl = getSendButtonCandidate(event.target);
      if (!sendControl) return;
      if (bypassNextSendClick) {
        bypassNextSendClick = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      submitWithWarningFlow(field, "send_click").then((shouldSend) => {
        if (shouldSend) {
          bypassNextSendClick = true;
          sendControl.click();
        }
      });
    },
    true
  );

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || target.tagName?.toLowerCase() !== "input") return;
    if (target.type !== "file") return;
    updateAttachmentsIfChanged(target.files, "file_input");
  });

  document.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files?.length) return;
    updateAttachmentsIfChanged(event.dataTransfer.files, "drag_drop");
  });

  document.addEventListener("paste", (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const fileItems = items.map((item) => item.getAsFile()).filter(Boolean);
    if (fileItems.length) {
      updateAttachmentsIfChanged(fileItems, "paste");
    }
  });

  const observer = new MutationObserver(() => {
    if (outputDebounceTimer) {
      clearTimeout(outputDebounceTimer);
    }
    outputDebounceTimer = setTimeout(captureOutputIfChanged, 1200);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"].includes(window.location.host.toLowerCase())) {
  startAutoCapture();
}
