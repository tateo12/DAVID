(() => {
  if (window.__sentinelActive) return;
  window.__sentinelActive = true;

  // ═══════════════════════════════════════════════════════════
  //  CONFIG
  // ═══════════════════════════════════════════════════════════

  const SEVERITY = { low: 0, medium: 1, high: 2, critical: 3 };
  const BLOCK_THRESHOLD = "high";
  const BACKEND_TIMEOUT_MS = 3000;

  const DLP_PATTERNS = [
    { re: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, type: "ssn", severity: "critical", label: "Social Security Number" },
    { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, type: "email", severity: "medium", label: "Email Address" },
    { re: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, type: "phone", severity: "medium", label: "Phone Number" },
    { re: /\b(?:\d[ -]*?){13,16}\b/g, type: "credit_card", severity: "high", label: "Credit Card Number" },
    { re: /\bAKIA[0-9A-Z]{16}\b/g, type: "aws_key", severity: "critical", label: "AWS Access Key" },
    { re: /\bsk-[A-Za-z0-9]{20,}\b/g, type: "api_key", severity: "critical", label: "API Key (sk-...)" },
    { re: /password\s*[:=]\s*['"]?.{4,}['"]?/gi, type: "password", severity: "high", label: "Password Value" },
    { re: /(token|secret|connection_string|api_key|apikey)\s*[:=]\s*['"]?.{4,}['"]?/gi, type: "secret_value", severity: "high", label: "Secret / Token Value" },
    { re: /(mongodb|postgres|mysql|redis|amqp):\/\/\S+/gi, type: "connection_string", severity: "critical", label: "Database Connection String" },
    { re: /bearer\s+[A-Za-z0-9._\-]{10,}/gi, type: "bearer_token", severity: "high", label: "Bearer Token" },
    { re: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, type: "private_key", severity: "critical", label: "Private Key Block" },
    { re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, type: "github_token", severity: "critical", label: "GitHub Token" },
    { re: /\bxox[bporas]-[A-Za-z0-9-]{10,}/g, type: "slack_token", severity: "critical", label: "Slack Token" },
  ];

  const DLP_KEYWORDS = [
    { kw: "social security", severity: "critical", label: "SSN Reference" },
    { kw: "ssn", severity: "critical", label: "SSN Reference" },
    { kw: "passport number", severity: "critical", label: "Passport Number" },
    { kw: "bank account", severity: "critical", label: "Bank Account Info" },
    { kw: "routing number", severity: "critical", label: "Bank Routing Number" },
    { kw: "credit card number", severity: "high", label: "Credit Card Reference" },
    { kw: "private key", severity: "critical", label: "Private Key Reference" },
    { kw: "api key", severity: "high", label: "API Key Reference" },
    { kw: "secret key", severity: "high", label: "Secret Key Reference" },
    { kw: "access token", severity: "high", label: "Access Token Reference" },
    { kw: "credentials", severity: "high", label: "Credentials Reference" },
    { kw: "connection string", severity: "high", label: "Connection String Reference" },
    { kw: ".env file", severity: "high", label: ".env File Reference" },
    { kw: "ssh key", severity: "critical", label: "SSH Key Reference" },
    { kw: "medical record", severity: "high", label: "Medical Record" },
    { kw: "patient data", severity: "critical", label: "Patient Data" },
    { kw: "health record", severity: "high", label: "Health Record" },
    { kw: "salary", severity: "high", label: "Salary Information" },
    { kw: "employee record", severity: "high", label: "Employee Record" },
    { kw: "customer data", severity: "high", label: "Customer Data" },
    { kw: "date of birth", severity: "high", label: "Date of Birth" },
    { kw: "driver's license", severity: "high", label: "Driver's License" },
    { kw: "drivers license", severity: "high", label: "Driver's License" },
  ];

  const FIELD_SELECTORS = [
    "#prompt-textarea",
    "textarea[data-id='root']",
    "div.ProseMirror[contenteditable='true']",
    "[contenteditable='true'].ProseMirror",
    "rich-textarea textarea",
    ".ql-editor[contenteditable='true']",
    "#searchbox textarea",
    "textarea[name='searchbox']",
    "textarea[placeholder*='message' i]",
    "textarea[placeholder*='ask' i]",
    "textarea[placeholder*='prompt' i]",
    "textarea[placeholder*='type' i]",
    "textarea[placeholder*='chat' i]",
    "textarea[placeholder*='send' i]",
    "textarea[placeholder*='question' i]",
    "textarea[placeholder*='anything' i]",
    "textarea[placeholder*='search' i]",
    "[role='textbox'][contenteditable='true']",
    "[contenteditable='true'][data-placeholder]",
    "[contenteditable='true']",
    "textarea",
  ];

  // ═══════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════

  let bypass = false;
  let scanning = false;
  let pendingText = "";
  let currentField = null;
  let interceptedButton = null;
  let interceptedTrigger = null; // "enter" | "click"
  let lastOutputHash = "";
  let lastSubmittedPrompt = "";
  let capturedMessageHashes = new Set();
  let outputDebounceTimer = null;
  let fieldPollTimer = null;

  // ═══════════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════════

  function hashText(value) {
    const text = value || "";
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return `${hash}`;
  }

  function inferTargetTool() {
    return window.location.host.toLowerCase();
  }

  function sevNum(s) {
    return SEVERITY[s] ?? 0;
  }

  function meetsThreshold(severity) {
    return sevNum(severity) >= sevNum(BLOCK_THRESHOLD);
  }

  function maxSeverity(findings) {
    let max = "low";
    for (const f of findings) {
      if (sevNum(f.severity) > sevNum(max)) max = f.severity;
    }
    return max;
  }

  // ═══════════════════════════════════════════════════════════
  //  LOCAL DLP SCANNER
  // ═══════════════════════════════════════════════════════════

  function scanText(text) {
    const findings = [];
    if (!text || text.length < 3) return { findings, maxSeverity: "low", blocked: false };

    for (const rule of DLP_PATTERNS) {
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(text)) !== null) {
        findings.push({
          type: rule.type,
          severity: rule.severity,
          label: rule.label,
          matchText: match[0].length > 60 ? match[0].slice(0, 57) + "..." : match[0],
        });
      }
    }

    const lowered = text.toLowerCase();
    for (const rule of DLP_KEYWORDS) {
      const idx = lowered.indexOf(rule.kw);
      if (idx >= 0) {
        const kwKey = rule.kw.replace(/\s+/g, "_");
        const alreadyFound = findings.some((f) => f.type === kwKey);
        if (!alreadyFound) {
          findings.push({
            type: kwKey,
            severity: rule.severity,
            label: rule.label,
            matchText: text.slice(Math.max(0, idx - 10), idx + rule.kw.length + 10).trim(),
          });
        }
      }
    }

    const highest = maxSeverity(findings);
    return {
      findings,
      maxSeverity: highest,
      blocked: findings.length > 0 && meetsThreshold(highest),
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  FIELD DETECTION
  // ═══════════════════════════════════════════════════════════

  function findField() {
    for (const sel of FIELD_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function getFieldText(field) {
    if (!field) return "";
    if (field.tagName.toLowerCase() === "textarea" || field.tagName.toLowerCase() === "input") {
      return field.value || "";
    }
    return field.innerText || "";
  }

  function findSendButton() {
    const selectors = [
      "button[data-testid='send-button']",
      "button[data-testid*='send']",
      "button[aria-label='Send message']",
      "button[aria-label*='Send']",
      "button[aria-label*='send']",
      "button[aria-label='Submit']",
      "button[aria-label*='submit']",
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    const allButtons = document.querySelectorAll("button, [role='button']");
    for (const btn of allButtons) {
      const text = `${btn.innerText || ""} ${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("data-testid") || ""}`.toLowerCase();
      if ((text.includes("send") || text.includes("submit")) && btn.offsetParent !== null) {
        return btn;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  //  UI — BANNER
  // ═══════════════════════════════════════════════════════════

  function showBanner() {
    if (document.getElementById("sentinel-banner")) return;

    const banner = document.createElement("div");
    banner.id = "sentinel-banner";
    banner.innerHTML = `
      <div id="sentinel-banner-text">
        <span class="sentinel-status-dot sentinel-status-dot-green"></span>
        <span>Sentinel Prompt Guard — Monitoring active</span>
      </div>
      <button id="sentinel-banner-close" title="Close">&times;</button>
    `;
    document.documentElement.appendChild(banner);

    document.getElementById("sentinel-banner-close").addEventListener("click", () => {
      banner.style.display = "none";
    });

    setTimeout(() => {
      if (banner.parentNode) banner.style.display = "none";
    }, 6000);
  }

  // ═══════════════════════════════════════════════════════════
  //  UI — SCANNING INDICATOR
  // ═══════════════════════════════════════════════════════════

  function showScanning() {
    removeEl("sentinel-scanning-indicator");
    const el = document.createElement("div");
    el.id = "sentinel-scanning-indicator";
    el.innerHTML = `
      <div class="sentinel-spinner"></div>
      <span>Scanning for sensitive data&hellip;</span>
      <div class="sentinel-scanning-bar"></div>
    `;
    document.documentElement.appendChild(el);
  }

  function hideScanning() {
    removeEl("sentinel-scanning-indicator");
  }

  // ═══════════════════════════════════════════════════════════
  //  UI — BLOCK MODAL
  // ═══════════════════════════════════════════════════════════

  function showBlockModal(scanResult, { onEdit, onProceed }) {
    removeEl("sentinel-block-overlay");
    const sev = scanResult.maxSeverity;
    const isCritical = sev === "critical";

    const shieldSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="9" y1="12" x2="15" y2="12" stroke-width="2.5"/></svg>`;
    const warnSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

    const iconClass = isCritical ? "critical" : sev === "high" ? "high" : "medium";
    const title = isCritical ? "Submission Blocked" : "Sensitive Content Detected";
    const subtitle = isCritical
      ? "Your message contains highly sensitive information that cannot be shared with AI tools. Remove the flagged content and try again."
      : "Your message may contain sensitive information. Review the findings below before proceeding.";

    let findingsHtml = "";
    const deduped = dedupeFindings(scanResult.findings);
    for (const f of deduped) {
      const badgeClass = `sentinel-badge-${f.severity}`;
      findingsHtml += `
        <div class="sentinel-finding-item">
          <span class="sentinel-finding-badge ${badgeClass}">${f.severity}</span>
          <div class="sentinel-finding-text">
            ${f.label}
            ${f.matchText ? `<span class="sentinel-finding-match">${escapeHtml(f.matchText)}</span>` : ""}
          </div>
        </div>`;
    }

    const overlay = document.createElement("div");
    overlay.id = "sentinel-block-overlay";
    overlay.innerHTML = `
      <div id="sentinel-block-modal">
        <div class="sentinel-block-header">
          <div class="sentinel-block-icon sentinel-block-icon-${iconClass}">
            ${isCritical ? shieldSvg : warnSvg}
          </div>
          <div>
            <div class="sentinel-block-title sentinel-block-title-${iconClass}">${title}</div>
          </div>
        </div>
        <div class="sentinel-block-subtitle">${subtitle}</div>
        <div class="sentinel-findings-list">${findingsHtml}</div>
        <div class="sentinel-block-actions">
          <button class="sentinel-btn-edit" id="sentinel-btn-edit">Edit Message</button>
          ${isCritical ? "" : `<button class="sentinel-btn-proceed" id="sentinel-btn-proceed">Send Anyway</button>`}
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    document.getElementById("sentinel-btn-edit").addEventListener("click", () => {
      removeEl("sentinel-block-overlay");
      if (typeof onEdit === "function") onEdit();
    });

    if (!isCritical) {
      document.getElementById("sentinel-btn-proceed").addEventListener("click", async () => {
        removeEl("sentinel-block-overlay");
        if (typeof onProceed === "function") await onProceed();
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  UI — HELPERS
  // ═══════════════════════════════════════════════════════════

  function removeEl(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function dedupeFindings(findings) {
    const seen = new Set();
    return findings.filter((f) => {
      const key = `${f.type}:${f.severity}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  COMMUNICATION WITH BACKGROUND
  // ═══════════════════════════════════════════════════════════

  function sendMessage(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
          if (chrome.runtime.lastError) {
            console.debug("Sentinel: runtime error:", chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          resolve(response);
        });
      } catch (err) {
        console.debug("Sentinel: sendMessage exception:", err);
        resolve(null);
      }
    });
  }

  function sendCapture(promptText, metadata = {}) {
    return sendMessage("sentinel_capture_prompt", {
      prompt_text: promptText,
      target_tool: inferTargetTool(),
      page_url: window.location.href,
      metadata: { source: "browser_extension", ...metadata },
    });
  }

  function sendPreCheck(promptText) {
    return sendMessage("sentinel_pre_check", {
      prompt_text: promptText,
      target_tool: inferTargetTool(),
      page_url: window.location.href,
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  SUBMISSION INTERCEPTION
  // ═══════════════════════════════════════════════════════════

  function handleKeyDown(event) {
    if (bypass || scanning) return;
    if (event.key !== "Enter" || event.shiftKey) return;

    const field = currentField || findField();
    if (!field) return;

    const text = getFieldText(field).trim();
    if (!text) return;

    pendingText = text;
    event.preventDefault();
    event.stopImmediatePropagation();

    interceptedTrigger = "enter";
    interceptedButton = null;
    performCheck(text);
  }

  function handleClick(event) {
    if (bypass || scanning) return;

    const target = event.target;
    if (!target) return;
    const btn = target.closest("button, [role='button'], [data-testid*='send']");
    if (!btn) return;

    const label = `${btn.innerText || ""} ${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("data-testid") || ""}`.toLowerCase();
    const isSend = label.includes("send") || label.includes("submit");
    if (!isSend) return;

    const field = currentField || findField();
    if (!field) return;

    const text = getFieldText(field).trim();
    if (!text) return;

    pendingText = text;
    event.preventDefault();
    event.stopImmediatePropagation();

    interceptedTrigger = "click";
    interceptedButton = btn;
    performCheck(text);
  }

  async function performCheck(text) {
    scanning = true;
    showScanning();

    const localResult = scanText(text);

    if (localResult.blocked) {
      hideScanning();
      scanning = false;

      sendCapture(text, { event_type: "blocked_prompt", local_findings: localResult.findings.length });

      showBlockModal(localResult, {
        onEdit: () => {
          focusField();
        },
        onProceed: () => {
          sendCapture(text, { event_type: "warning_override", local_findings: localResult.findings.length });
          releaseSubmission();
        },
      });
      return;
    }

    let backendBlocked = false;
    try {
      const result = await Promise.race([
        sendPreCheck(text),
        new Promise((resolve) => setTimeout(() => resolve(null), BACKEND_TIMEOUT_MS)),
      ]);

      if (result && result.ok && result.result) {
        const analysis = result.result;
        if (analysis.requires_confirmation && analysis.detections && analysis.detections.length > 0) {
          backendBlocked = true;
          hideScanning();
          scanning = false;

          const backendFindings = analysis.detections.map((d) => ({
            type: d.subtype || d.type,
            severity: d.severity || "high",
            label: d.detail || d.subtype || d.type,
            matchText: "",
          }));

          const backendResult = {
            findings: backendFindings,
            maxSeverity: analysis.risk_level || "high",
            blocked: true,
          };

          showBlockModal(backendResult, {
            onEdit: () => focusField(),
            onProceed: async () => {
              await sendMessage("sentinel_capture_prompt", {
                prompt_text: text,
                target_tool: inferTargetTool(),
                page_url: window.location.href,
                warning_confirmed: true,
                warning_context_id: analysis.warning_context_id,
                metadata: { event_type: "warning_confirmed", source: "browser_extension" },
              });
              releaseSubmission();
            },
          });
        }
      }
    } catch (err) {
      console.debug("Sentinel: backend pre-check error:", err);
    }

    if (!backendBlocked) {
      hideScanning();
      scanning = false;

      sendCapture(text, { event_type: "submitted_prompt" });
      releaseSubmission();
    }
  }

  function releaseSubmission() {
    bypass = true;

    const field = currentField || findField();

    if (interceptedTrigger === "click" && interceptedButton && document.contains(interceptedButton)) {
      interceptedButton.click();
    } else if (interceptedTrigger === "enter" && field) {
      const sendBtn = findSendButton();
      if (sendBtn) {
        sendBtn.click();
      } else {
        field.focus();
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
    } else {
      const sendBtn = findSendButton();
      if (sendBtn) sendBtn.click();
    }

    lastSubmittedPrompt = pendingText;
    pendingText = "";
    interceptedButton = null;
    interceptedTrigger = null;

    setTimeout(() => {
      bypass = false;
    }, 300);
  }

  function focusField() {
    const field = currentField || findField();
    if (field) field.focus();
  }

  // ═══════════════════════════════════════════════════════════
  //  AI OUTPUT CAPTURE (preserved from original)
  // ═══════════════════════════════════════════════════════════

  function extractAiOutputText() {
    const selectors = [
      "[data-message-author-role='assistant']",
      ".assistant",
      "[data-testid*='assistant']",
      "main article",
      "[class*='response']",
      "[class*='answer']",
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

  // ═══════════════════════════════════════════════════════════
  //  EXISTING CONVERSATION SCRAPER (preserved)
  // ═══════════════════════════════════════════════════════════

  function scrapeExistingMessages() {
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
      sendCapture(text, { event_type: "scraped_history" });
      captured++;
    }
    if (captured > 0) {
      console.log(`Sentinel: scraped ${captured} existing messages`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  FIELD MONITORING
  // ═══════════════════════════════════════════════════════════

  function watchField(field) {
    if (!field) return;

    const observer = new MutationObserver(() => {
      const text = getFieldText(field).trim();
      if (text) pendingText = text;
    });
    observer.observe(field, { childList: true, subtree: true, characterData: true });

    field.addEventListener("input", () => {
      const text = getFieldText(field).trim();
      if (text) pendingText = text;
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE HOOK INJECTION (bridges main-world network capture)
  // ═══════════════════════════════════════════════════════════

  function injectPageHook() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("page_hook.js");
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (err) {
      console.debug("Sentinel: page_hook injection skipped:", err);
    }
  }

  function listenForPageHookMessages() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (!event.data || event.data.source !== "sentinel_page_hook") return;
      if (event.data.type === "sentinel_network_prompt") {
        const payload = event.data.payload;
        sendCapture(payload.prompt_text, {
          event_type: "network_intercept",
          request_url: payload.request_url,
          request_method: payload.request_method,
          capture_method: payload.capture_method,
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init() {
    console.log("Sentinel: content script active on", window.location.host);

    showBanner();
    injectPageHook();
    listenForPageHookMessages();

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleClick, true);

    function pollForField() {
      const field = findField();
      if (field && field !== currentField) {
        currentField = field;
        watchField(field);
        console.log("Sentinel: monitoring prompt field:", field.tagName, field.className?.slice(0, 40));
      }
      fieldPollTimer = setTimeout(pollForField, 2000);
    }

    pollForField();

    const outputObserver = new MutationObserver(() => {
      if (outputDebounceTimer) clearTimeout(outputDebounceTimer);
      outputDebounceTimer = setTimeout(captureOutputIfChanged, 1500);
    });
    outputObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    setTimeout(scrapeExistingMessages, 2000);
  }

  init();
})();
