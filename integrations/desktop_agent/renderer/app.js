/**
 * Sentinel Desktop App — Renderer
 *
 * Single-page app with views: login, dashboard, activity, setup, settings.
 * Communicates with main process via window.sentinel (contextBridge).
 */

// ─── State ──────────────────────────────────────────────────────────────────

let currentView = "dashboard";
let proxyRunning = false;
let pollTimer = null;

// ─── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const creds = await window.sentinel.getCredentials();
  if (creds.hasToken) {
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById("view-login").style.display = "flex";
  document.getElementById("view-app").style.display = "none";
  stopPolling();
}

async function showApp() {
  document.getElementById("view-login").style.display = "none";
  document.getElementById("view-app").style.display = "flex";
  await loadUserInfo();
  await refreshStatus();
  await refreshDashboard();
  startPolling();
}

// ─── Login ──────────────────────────────────────────────────────────────────

document.getElementById("btn-login").addEventListener("click", doLogin);
document.getElementById("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});

async function doLogin() {
  const btn = document.getElementById("btn-login");
  const errEl = document.getElementById("login-error");
  errEl.style.display = "none";

  const apiBaseUrl = document.getElementById("login-url").value.trim();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!apiBaseUrl || !email || !password) {
    errEl.textContent = "Please fill in all fields.";
    errEl.style.display = "";
    return;
  }

  btn.disabled = true;
  btn.innerHTML = 'Signing in... <span class="material-symbols-rounded" style="font-size:16px">hourglass_empty</span>';

  try {
    const result = await window.sentinel.login({ apiBaseUrl, email, password });
    if (result.ok) {
      showApp();
      // Check if setup is needed (first run)
      const status = await window.sentinel.getStatus();
      if (status.status !== "running") {
        showView("setup");
      }
    } else {
      errEl.textContent = result.error;
      errEl.style.display = "";
    }
  } catch (err) {
    errEl.textContent = String(err);
    errEl.style.display = "";
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In <span class="material-symbols-rounded" style="font-size:16px">login</span>';
  }
}

// ─── Sign Out ───────────────────────────────────────────────────────────────

document.getElementById("btn-signout").addEventListener("click", async () => {
  await window.sentinel.logout();
  showLogin();
});

// ─── Navigation ─────────────────────────────────────────────────────────────

const VIEW_TITLES = {
  dashboard: "Dashboard",
  activity: "Activity Log",
  setup: "Setup",
  settings: "Settings",
};

document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function showView(name) {
  currentView = name;
  // Sidebar active state
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === name);
  });
  // Page visibility
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add("active");
  // Header title
  document.getElementById("main-title").textContent = VIEW_TITLES[name] || name;
  // Load data for the view
  if (name === "activity") loadActivity();
  if (name === "settings") loadSettings();
  if (name === "setup") initSetup();
}

// ─── User Info ──────────────────────────────────────────────────────────────

async function loadUserInfo() {
  const user = await window.sentinel.getUser();
  if (user) {
    document.getElementById("sidebar-user").textContent =
      `${user.username || user.email} · ${user.role}`;
  }
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

async function refreshDashboard() {
  // Metrics
  const metricsRes = await window.sentinel.fetchMetrics();
  if (metricsRes.ok && metricsRes.metrics) {
    const m = metricsRes.metrics;
    document.getElementById("stat-threats").textContent = m.threats_blocked ?? 0;
    document.getElementById("stat-prompts").textContent = m.prompts_analyzed ?? 0;
    document.getElementById("stat-employees").textContent = m.active_employees ?? 0;
  }

  // Recent activity (top 5 for dashboard)
  const actRes = await window.sentinel.fetchActivity(5);
  if (actRes.ok) {
    renderActivityTable("dash-activity", actRes.prompts || []);
  }
}

async function refreshStatus() {
  const status = await window.sentinel.getStatus();
  proxyRunning = status.status === "running";
  updateMonitoringBanner();
}

function updateMonitoringBanner() {
  const banner = document.getElementById("monitoring-banner");
  const text = document.getElementById("monitor-text");
  const btn = document.getElementById("btn-toggle-proxy");

  if (proxyRunning) {
    banner.className = "monitoring-banner active";
    text.textContent = "Monitoring active — proxy running on port 9876";
    btn.textContent = "Pause";
  } else {
    banner.className = "monitoring-banner paused";
    text.textContent = "Monitoring paused";
    btn.textContent = "Resume";
  }
}

document.getElementById("btn-toggle-proxy").addEventListener("click", async () => {
  const btn = document.getElementById("btn-toggle-proxy");
  btn.disabled = true;
  if (proxyRunning) {
    await window.sentinel.stopProxy();
  } else {
    await window.sentinel.startProxy();
  }
  await refreshStatus();
  btn.disabled = false;
});

// ─── Activity ───────────────────────────────────────────────────────────────

async function loadActivity() {
  const el = document.getElementById("activity-list");
  el.innerHTML = '<div class="status-msg info">Loading...</div>';
  const res = await window.sentinel.fetchActivity(50);
  if (res.ok) {
    renderActivityTable("activity-list", res.prompts || []);
  } else {
    el.innerHTML = `<div class="status-msg error">${res.error}</div>`;
  }
}

function renderActivityTable(containerId, prompts) {
  const el = document.getElementById(containerId);

  if (!prompts.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">inbox</span>
        <p>No prompts captured yet. Activity will appear here once monitoring is active.</p>
      </div>`;
    return;
  }

  const rows = prompts.map((p) => {
    const risk = p.risk_level || "low";
    const time = p.created_at ? new Date(p.created_at).toLocaleTimeString() : "—";
    const tool = p.target_tool || "—";
    const name = p.employee_name || "—";
    const prompt = p.prompt_text
      ? (p.prompt_text.length > 60 ? p.prompt_text.slice(0, 60) + "..." : p.prompt_text)
      : "—";
    return `<tr>
      <td>${time}</td>
      <td>${name}</td>
      <td class="prompt-preview">${_escapeHtml(prompt)}</td>
      <td>${tool}</td>
      <td><span class="risk-badge ${risk}">${risk}</span></td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <table class="activity-table">
      <thead><tr>
        <th>Time</th><th>Employee</th><th>Prompt</th><th>Tool</th><th>Risk</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

async function initSetup() {
  // Check cert status
  const certEl = document.getElementById("cert-status");
  certEl.textContent = "Generating CA certificate...";
  certEl.className = "status-msg info";

  try {
    const gen = await window.sentinel.generateCert();
    if (!gen.ok) {
      certEl.textContent = `Failed: ${gen.error}`;
      certEl.className = "status-msg error";
      return;
    }

    const trusted = await window.sentinel.isCertTrusted();
    if (trusted) {
      certEl.textContent = "Certificate already installed";
      certEl.className = "status-msg ok";
      document.getElementById("btn-install-cert").textContent = "Continue";
    } else {
      certEl.textContent = "Certificate not yet trusted. Click Install to add it.";
      certEl.className = "status-msg info";
    }
  } catch (err) {
    certEl.textContent = `Error: ${err}`;
    certEl.className = "status-msg error";
  }
}

function showSetupStep(name) {
  document.querySelectorAll(".setup-step").forEach((el) => el.classList.remove("visible"));
  const step = document.getElementById(`setup-step-${name}`);
  if (step) step.classList.add("visible");
}

document.getElementById("btn-install-cert").addEventListener("click", async () => {
  const btn = document.getElementById("btn-install-cert");
  if (btn.textContent === "Continue") {
    showSetupStep("proxy");
    return;
  }

  btn.disabled = true;
  const certEl = document.getElementById("cert-status");
  certEl.textContent = "Installing certificate (you may see a UAC prompt)...";
  certEl.className = "status-msg info";

  try {
    const result = await window.sentinel.installCert();
    if (result.ok) {
      certEl.textContent = "Certificate installed successfully";
      certEl.className = "status-msg ok";
      btn.textContent = "Continue";
    } else {
      certEl.textContent = `Failed: ${result.error}`;
      certEl.className = "status-msg error";
    }
  } catch (err) {
    certEl.textContent = `Error: ${err}`;
    certEl.className = "status-msg error";
  }
  btn.disabled = false;
});

document.getElementById("btn-skip-cert").addEventListener("click", () => showSetupStep("proxy"));

// Proxy activation
function setCheck(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = { pending: "○", running: "◌", ok: "✓", error: "✗" }[state] || "○";
  el.className = "check-icon" + ({ ok: " ok", error: " error", running: " running" }[state] || "");
}

document.getElementById("btn-activate").addEventListener("click", async () => {
  const btn = document.getElementById("btn-activate");
  btn.disabled = true;

  // Step A: system proxy
  setCheck("chk-proxy", "running");
  const proxyResult = await window.sentinel.enableSystemProxy(9876);
  setCheck("chk-proxy", proxyResult.ok ? "ok" : "error");

  if (!proxyResult.ok) {
    const s = document.getElementById("proxy-status");
    s.style.display = "";
    s.textContent = `Could not configure proxy: ${proxyResult.error}`;
    s.className = "status-msg error";
    btn.disabled = false;
    return;
  }

  // Step B: start mitmproxy
  setCheck("chk-mitm", "running");
  const startResult = await window.sentinel.startProxy();
  const running = startResult === "running" || startResult === "starting";
  setCheck("chk-mitm", running ? "ok" : "error");

  if (!running) {
    const s = document.getElementById("proxy-status");
    s.style.display = "";
    s.textContent = "Could not start traffic monitor. Check that mitmproxy is installed.";
    s.className = "status-msg error";
    btn.disabled = false;
    return;
  }

  // Step C: verify
  setCheck("chk-verify", "running");
  await new Promise((r) => setTimeout(r, 1500));
  const status = await window.sentinel.getStatus();
  const verified = status.status === "running";
  setCheck("chk-verify", verified ? "ok" : "error");

  if (verified) {
    proxyRunning = true;
    setTimeout(() => showSetupStep("done"), 500);
  } else {
    const s = document.getElementById("proxy-status");
    s.style.display = "";
    s.textContent = "Proxy started but backend could not be verified.";
    s.className = "status-msg error";
    btn.disabled = false;
  }
});

// ─── Settings ───────────────────────────────────────────────────────────────

async function loadSettings() {
  const user = await window.sentinel.getUser();
  const creds = await window.sentinel.getCredentials();
  const status = await window.sentinel.getStatus();
  const certTrusted = await window.sentinel.isCertTrusted();

  document.getElementById("settings-url").textContent = creds.apiBaseUrl || "—";

  const proxyEl = document.getElementById("settings-proxy-status");
  proxyEl.textContent = status.status;
  proxyEl.className = "value" + (status.status === "running" ? " ok" : status.status === "error" ? " error" : "");

  if (user) {
    document.getElementById("settings-email").textContent = user.email || "—";
    document.getElementById("settings-role").textContent = user.role || "—";
    document.getElementById("settings-org").textContent = user.orgId ? `Org #${user.orgId}` : "—";
  }

  const certEl = document.getElementById("settings-cert");
  certEl.textContent = certTrusted ? "Trusted" : "Not installed";
  certEl.className = "value" + (certTrusted ? " ok" : " error");
}

// ─── Polling ────────────────────────────────────────────────────────────────

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    await refreshStatus();
    if (currentView === "dashboard") {
      await refreshDashboard();
    }
  }, 15000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

init();
