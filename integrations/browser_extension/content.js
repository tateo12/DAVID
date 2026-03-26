let lastDraftHash = "";
let lastOutputHash = "";
let lastSubmittedPrompt = "";
let outputDebounceTimer = null;

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

function sendMessage(type, payload) {
  chrome.runtime.sendMessage({ type, payload }, (response) => {
    if (!response || !response.ok) {
      console.debug("Sentinel message failed:", type, response?.error || "unknown");
    }
  });
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
    metadata: { event_type: "draft_input" },
  });
}

function captureSubmittedPrompt(field) {
  const promptText = getPromptTextFromField(field).trim();
  if (!promptText) return;
  lastSubmittedPrompt = promptText;
  sendMessage("sentinel_capture_prompt", {
    prompt_text: promptText,
    target_tool: inferTargetTool(),
    page_url: window.location.href,
    metadata: { event_type: "submitted_prompt" },
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
    conversation_id: window.location.pathname,
    turn_id: `${Date.now()}`,
  });
}

function startAutoCapture() {
  const field = getPromptField();
  if (!field) return;

  field.addEventListener("input", () => captureDraftIfChanged(field));

  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      captureSubmittedPrompt(field);
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target) return;
    const text = (target.innerText || "").toLowerCase();
    if (text.includes("send")) {
      captureSubmittedPrompt(field);
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

if (["chat.openai.com", "claude.ai", "gemini.google.com"].includes(window.location.host.toLowerCase())) {
  startAutoCapture();
}
