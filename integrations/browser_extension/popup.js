// =============================================================
// Sentinel AI Security — Popup Script
// Reads session stats from chrome.storage.local and renders
// them into the popup UI.
// =============================================================

(function () {
  "use strict";

  // ---- DOM References ----
  const statPrompts = document.getElementById("stat-prompts");
  const statThreats = document.getElementById("stat-threats");
  const statTool = document.getElementById("stat-tool");
  const statRisk = document.getElementById("stat-risk");
  const statusDot = document.getElementById("status-dot");
  const statusLabel = document.getElementById("status-label");
  const detectionsList = document.getElementById("detections-list");
  const emptyDetections = document.getElementById("empty-detections");
  const btnDashboard = document.getElementById("btn-dashboard");
  const btnClear = document.getElementById("btn-clear");

  // ---- Helpers ----

  function getRiskLevel(threats) {
    if (threats === 0) return { label: "Low", cls: "badge-low" };
    if (threats <= 2) return { label: "Medium", cls: "badge-medium" };
    return { label: "High", cls: "badge-high" };
  }

  function formatTime(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--:--";
    }
  }

  function severityIcon(severity) {
    return severity === "red" ? "\u{1F6A8}" : "\u26A0\uFE0F";
  }

  function severityClass(severity) {
    return severity === "red" ? "sev-red" : "sev-yellow";
  }

  function severityLabel(severity) {
    return severity === "red" ? "High" : "Medium";
  }

  // ---- Render ----

  function render(data) {
    const prompts = data.promptsScanned || 0;
    const threats = data.threatsDetected || 0;
    const tool = data.currentTool || "--";
    const detections = data.detections || [];

    // Stats
    statPrompts.textContent = prompts;
    statThreats.textContent = threats;
    statThreats.className = "stat-value" + (threats > 0 ? " danger" : "");
    statTool.textContent = tool;

    // Risk badge
    const risk = getRiskLevel(threats);
    statRisk.innerHTML =
      '<span class="stat-badge ' + risk.cls + '">' + risk.label + "</span>";

    // Session status
    const isActive = data.lastUpdated && Date.now() - data.lastUpdated < 300000; // 5 min
    if (isActive) {
      statusDot.className = "status-dot active";
      statusLabel.innerHTML = "Session Active";
    } else if (prompts > 0) {
      statusDot.className = "status-dot active";
      statusLabel.innerHTML = 'Session Active <span>(idle)</span>';
    } else {
      statusDot.className = "status-dot inactive";
      statusLabel.innerHTML = "No Active Session";
    }

    // Detections list (last 3, newest first)
    if (detections.length === 0) {
      emptyDetections.style.display = "block";
    } else {
      emptyDetections.style.display = "none";
      const recent = detections.slice(-3).reverse();

      // Clear previous items (except empty state)
      const items = detectionsList.querySelectorAll(".detection-item");
      items.forEach((item) => item.remove());

      recent.forEach((det) => {
        const item = document.createElement("div");
        item.className = "detection-item";
        item.innerHTML =
          '<span class="detection-icon">' +
          severityIcon(det.severity) +
          "</span>" +
          '<div class="detection-info">' +
          '<div class="detection-type">' +
          escapeHtml(det.type) +
          "</div>" +
          '<div class="detection-time">' +
          formatTime(det.timestamp) +
          "</div>" +
          "</div>" +
          '<span class="detection-severity ' +
          severityClass(det.severity) +
          '">' +
          severityLabel(det.severity) +
          "</span>";
        detectionsList.appendChild(item);
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Load Data ----

  function loadData() {
    chrome.storage.local.get("sentinelStats", (result) => {
      render(result.sentinelStats || {});
    });
  }

  // ---- Event Handlers ----

  btnDashboard.addEventListener("click", () => {
    chrome.tabs.create({ url: "http://localhost:3000" });
  });

  btnClear.addEventListener("click", () => {
    chrome.storage.local.remove("sentinelStats", () => {
      render({});
      // Brief visual feedback
      btnClear.textContent = "Cleared!";
      btnClear.style.color = "#22c55e";
      setTimeout(() => {
        btnClear.innerHTML =
          '<span>\u{1F5D1}\uFE0F</span> Clear Session';
        btnClear.style.color = "";
      }, 1200);
    });
  });

  // ---- Init ----
  loadData();
})();
