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
  try {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.debug("Sentinel: runtime error:", chrome.runtime.lastError.message);
        return;
      }
      if (!response || !response.ok) {
        console.debug("Sentinel: message failed:", type, response?.error || "unknown");
      } else {
        console.debug("Sentinel: captured successfully:", type);
      }
    });
  } catch (err) {
    console.debug("Sentinel: sendMessage exception:", err);
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

let capturedMessageHashes = new Set();

function scrapeExistingMessages() {
  // Claude user messages
  const userSelectors = [
    "[data-testid='user-message']",
    "[data-message-author-role='user']",
    ".user-message",
    "[class*='human']",
    "[class*='Human']",
  ];

  let userMessages = [];
  for (const selector of userSelectors) {
    const nodes = document.querySelectorAll(selector);
    if (nodes.length > 0) {
      nodes.forEach((node) => {
        const text = (node.innerText || "").trim();
        if (text) userMessages.push(text);
      });
      break;
    }
  }

  // Fallback: look for alternating message pattern in main content
  if (userMessages.length === 0) {
    const allMessages = document.querySelectorAll("[data-test-render-count], .contents, [class*='message']");
    allMessages.forEach((node) => {
      const text = (node.innerText || "").trim();
      if (text && text.length > 5) userMessages.push(text);
    });
  }

  let captured = 0;
  for (const text of userMessages) {
    const h = hashText(text);
    if (capturedMessageHashes.has(h)) continue;
    capturedMessageHashes.add(h);
    console.log("Sentinel: scraping existing message:", text.slice(0, 60) + "...");
    sendMessage("sentinel_capture_prompt", {
      prompt_text: text,
      target_tool: inferTargetTool(),
      page_url: window.location.href,
      metadata: { event_type: "scraped_history" },
    });
    captured++;
  }
  if (captured > 0) {
    console.log(`Sentinel: scraped ${captured} existing messages`);
  }
}

function startAutoCapture() {
  console.log("Sentinel: content script active on", window.location.host);

  const field = getPromptField();
  if (!field) {
    console.debug("Sentinel: no prompt field found, retrying in 2s...");
    setTimeout(startAutoCapture, 2000);
    return;
  }
  console.log("Sentinel: found prompt field, listening for input");

  // Capture on Enter key (listen on document to catch it regardless of focus)
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      const text = getPromptTextFromField(field).trim();
      if (text) {
        console.log("Sentinel: Enter pressed, capturing prompt");
        captureSubmittedPrompt(field);
      }
    }
  }, true);

  // Capture on send button click
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target) return;
    const btn = target.closest("button, [role='button'], [data-testid*='send']");
    if (!btn) return;
    const text = `${btn.innerText || ""} ${btn.getAttribute?.("aria-label") || ""} ${btn.getAttribute?.("data-testid") || ""}`.toLowerCase();
    if (text.includes("send") || text.includes("submit")) {
      console.log("Sentinel: send button clicked, capturing prompt");
      captureSubmittedPrompt(field);
    }
  }, true);

  // Watch for AI output changes
  const observer = new MutationObserver(() => {
    if (outputDebounceTimer) clearTimeout(outputDebounceTimer);
    outputDebounceTimer = setTimeout(captureOutputIfChanged, 1500);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Initial scrape of existing conversation
  setTimeout(scrapeExistingMessages, 2000);
}

if (["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"].includes(window.location.host.toLowerCase())) {
  startAutoCapture();
}
