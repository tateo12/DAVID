// =============================================================
// Sentinel AI Security — Content Script
// Monitors AI tool textarea inputs for sensitive data patterns
// =============================================================

(function () {
  "use strict";

  // ---- Configuration ----
  const BACKEND_URL = "http://localhost:8000/api/analyze";
  const DEBOUNCE_MS = 300;
  const WARNING_AUTO_DISMISS_MS = 10000;
  const SELECTOR_RETRY_MS = 2000;

  // ---- Regex Patterns ----
  const PATTERNS = {
    SSN: {
      regex: /\b\d{3}-\d{2}-\d{4}\b/,
      label: "Social Security Number",
      severity: "red",
    },
    "Credit Card": {
      regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
      label: "Credit Card Number",
      severity: "red",
    },
    "API Key": {
      regex:
        /\b(sk-|sk_live_|sk_test_|AKIA|ghp_|xoxb-|xapp-)[A-Za-z0-9_\-]{10,}\b/,
      label: "API Key / Secret",
      severity: "red",
    },
    Password: {
      regex: /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
      label: "Password",
      severity: "yellow",
    },
    "Email Dump": {
      regex: null, // custom detection
      label: "Bulk Email Addresses",
      severity: "yellow",
    },
  };

  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const EMAIL_DUMP_THRESHOLD = 3;

  // ---- Session State ----
  let stats = {
    promptsScanned: 0,
    threatsDetected: 0,
    detections: [], // { type, severity, timestamp }
    currentTool: detectCurrentTool(),
  };

  let bannerVisible = true;
  let currentWarningTimeout = null;
  let currentTimerInterval = null;
  let attachedElements = new WeakSet();

  // ---- Utility Functions ----

  function detectCurrentTool() {
    const host = window.location.hostname;
    if (host.includes("chatgpt.com") || host.includes("chat.openai.com"))
      return "ChatGPT";
    if (host.includes("claude.ai")) return "Claude";
    return "Unknown AI Tool";
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function saveStats() {
    try {
      chrome.storage.local.set({
        sentinelStats: {
          promptsScanned: stats.promptsScanned,
          threatsDetected: stats.threatsDetected,
          detections: stats.detections.slice(-10), // keep last 10
          currentTool: stats.currentTool,
          lastUpdated: Date.now(),
        },
      });
    } catch (e) {
      // Extension context may be invalidated; silently ignore
    }
  }

  function loadStats() {
    try {
      chrome.storage.local.get("sentinelStats", (result) => {
        if (result.sentinelStats) {
          stats.promptsScanned = result.sentinelStats.promptsScanned || 0;
          stats.threatsDetected = result.sentinelStats.threatsDetected || 0;
          stats.detections = result.sentinelStats.detections || [];
        }
      });
    } catch (e) {
      // Ignore
    }
  }

  // ---- Banner Injection ----

  function injectBanner() {
    if (document.getElementById("sentinel-banner")) return;

    // Spacer to push content down
    const spacer = document.createElement("div");
    spacer.id = "sentinel-spacer";
    document.body.prepend(spacer);

    // Banner element
    const banner = document.createElement("div");
    banner.id = "sentinel-banner";
    banner.innerHTML = `
      <span id="sentinel-banner-text">
        <span style="font-size:15px;">&#x1f6e1;&#xfe0f;</span>
        Sentinel AI Security &mdash; Monitoring Active
        <span id="sentinel-status-dot" class="sentinel-status-dot sentinel-status-dot-green"></span>
      </span>
      <button id="sentinel-banner-close" title="Close banner">&times;</button>
    `;
    document.body.prepend(banner);

    document.getElementById("sentinel-banner-close").addEventListener("click", () => {
      banner.style.animation = "sentinel-fadeOut 0.25s ease forwards";
      setTimeout(() => {
        banner.remove();
        spacer.remove();
        bannerVisible = false;
      }, 250);
    });
  }

  function updateBannerStatus(severity) {
    const dot = document.getElementById("sentinel-status-dot");
    if (!dot) return;

    dot.className = "sentinel-status-dot";
    if (severity === "red") {
      dot.classList.add("sentinel-status-dot-red");
    } else if (severity === "yellow") {
      dot.classList.add("sentinel-status-dot-yellow");
    } else {
      dot.classList.add("sentinel-status-dot-green");
    }
  }

  // ---- Warning Overlay ----

  function showWarning(type, severity) {
    // Remove existing warning
    dismissWarning(true);

    const container = document.createElement("div");
    container.id = "sentinel-warning-container";
    container.className =
      severity === "red" ? "sentinel-warning-red" : "sentinel-warning-yellow";

    const icon = severity === "red" ? "&#x1f6a8;" : "&#x26a0;&#xfe0f;";
    const severityLabel = severity === "red" ? "High Risk" : "Warning";

    container.innerHTML = `
      <div class="sentinel-warning-card">
        <div class="sentinel-warning-header">
          <span class="sentinel-warning-title">
            <span>${icon}</span>
            ${severityLabel}: ${type} Detected
          </span>
        </div>
        <div class="sentinel-warning-body">
          Sentinel detected potential <strong>${type.toLowerCase()}</strong> in your prompt.
          Consider removing sensitive data before sending.
        </div>
        <div class="sentinel-warning-actions">
          <button class="sentinel-btn-dismiss" id="sentinel-dismiss-btn">Dismiss</button>
          <a class="sentinel-link-learn" href="http://localhost:3000/learn" target="_blank">Learn More</a>
        </div>
        <div class="sentinel-warning-timer">
          <div class="sentinel-warning-timer-bar" id="sentinel-timer-bar"></div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Dismiss button
    document.getElementById("sentinel-dismiss-btn").addEventListener("click", () => {
      dismissWarning();
    });

    // Auto-dismiss timer with visual countdown
    let elapsed = 0;
    const step = 100; // ms
    const timerBar = document.getElementById("sentinel-timer-bar");

    currentTimerInterval = setInterval(() => {
      elapsed += step;
      const pct = Math.max(0, 100 - (elapsed / WARNING_AUTO_DISMISS_MS) * 100);
      if (timerBar) timerBar.style.width = pct + "%";
    }, step);

    currentWarningTimeout = setTimeout(() => {
      dismissWarning();
    }, WARNING_AUTO_DISMISS_MS);

    // Update banner dot
    updateBannerStatus(severity);
  }

  function dismissWarning(immediate) {
    clearTimeout(currentWarningTimeout);
    clearInterval(currentTimerInterval);
    currentWarningTimeout = null;
    currentTimerInterval = null;

    const existing = document.getElementById("sentinel-warning-container");
    if (!existing) return;

    if (immediate) {
      existing.remove();
    } else {
      existing.classList.add("sentinel-dismissing");
      setTimeout(() => existing.remove(), 250);
    }
  }

  // ---- Text Scanning ----

  function scanText(text) {
    const findings = [];

    for (const [type, config] of Object.entries(PATTERNS)) {
      if (type === "Email Dump") continue; // handled separately
      if (config.regex && config.regex.test(text)) {
        findings.push({
          type: config.label,
          severity: config.severity,
        });
      }
    }

    // Email dump detection
    const emailMatches = text.match(EMAIL_REGEX);
    if (emailMatches && emailMatches.length >= EMAIL_DUMP_THRESHOLD) {
      findings.push({
        type: PATTERNS["Email Dump"].label,
        severity: PATTERNS["Email Dump"].severity,
      });
    }

    return findings;
  }

  async function analyzeWithBackend(text) {
    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          source: stats.currentTool,
          timestamp: new Date().toISOString(),
        }),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      // Backend unreachable — fall back to client-side regex
    }
    return null;
  }

  function getTextFromElement(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return el.value || "";
    }
    // contenteditable (Claude's ProseMirror, etc.)
    return el.innerText || el.textContent || "";
  }

  const handleInput = debounce(async function (e) {
    const el = e.target || e.currentTarget;
    const text = getTextFromElement(el);

    if (!text || text.trim().length < 5) return;

    stats.promptsScanned++;

    // Client-side regex scan
    const findings = scanText(text);

    // Attempt backend analysis (non-blocking)
    analyzeWithBackend(text);

    if (findings.length > 0) {
      // Pick the highest severity finding
      const worst = findings.find((f) => f.severity === "red") || findings[0];

      stats.threatsDetected++;
      stats.detections.push({
        type: worst.type,
        severity: worst.severity,
        timestamp: new Date().toISOString(),
      });

      // Keep detections array bounded
      if (stats.detections.length > 10) {
        stats.detections = stats.detections.slice(-10);
      }

      showWarning(worst.type, worst.severity);
    } else {
      // Reset banner to green if no findings
      updateBannerStatus("green");
    }

    saveStats();
  }, DEBOUNCE_MS);

  // ---- Textarea Discovery & Attachment ----

  const SELECTORS = [
    // ChatGPT
    "#prompt-textarea",
    'textarea[data-id]',
    // Claude
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"].ProseMirror',
    // Generic fallback
    "textarea",
    '[contenteditable="true"]',
  ];

  function attachListeners() {
    for (const selector of SELECTORS) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        if (attachedElements.has(el)) return;
        attachedElements.add(el);

        el.addEventListener("input", handleInput, { passive: true });
        // Also listen to keyup for contenteditable elements that may not fire input
        if (el.getAttribute("contenteditable") === "true") {
          el.addEventListener("keyup", handleInput, { passive: true });
        }
      });
    }
  }

  // ---- MutationObserver for SPA Navigation ----

  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldReattach = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldReattach = true;
          break;
        }
      }
      if (shouldReattach) {
        attachListeners();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ---- Initialization ----

  function init() {
    loadStats();
    injectBanner();
    attachListeners();
    startObserver();

    // Periodic re-scan for new textareas (safety net)
    setInterval(attachListeners, SELECTOR_RETRY_MS);

    console.log(
      "%c[Sentinel AI Security]%c Content script loaded. Monitoring active.",
      "color: #38bdf8; font-weight: bold;",
      "color: inherit;"
    );
  }

  // Wait for body to be available
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
