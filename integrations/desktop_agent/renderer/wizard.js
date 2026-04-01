/**
 * Wizard renderer script.
 * Communicates with the main process via window.sentinel (contextBridge).
 */

const TOTAL_STEPS = 4;
let currentStep = 1;

// ---------------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------------

function showStep(n) {
  document.querySelectorAll(".step").forEach((el) => el.classList.remove("visible"));
  const el = document.getElementById(`step-${n}`);
  if (el) el.classList.add("visible");

  // Progress bar
  document.getElementById("progress-fill").style.width = `${((n - 1) / (TOTAL_STEPS - 1)) * 100}%`;

  // Step dots
  const indicator = document.getElementById("step-indicator");
  indicator.innerHTML = "";
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const dot = document.createElement("div");
    dot.className = "step-dot" + (i === n ? " active" : i < n ? " done" : "");
    indicator.appendChild(dot);
  }

  currentStep = n;

  if (n === 2) initCertStep();
}

function setStatus(id, text, type) {
  const el = document.getElementById(id);
  el.style.display = "";
  el.className = "status-box" + (type ? ` ${type}` : "");
  el.textContent = text;
}

// ---------------------------------------------------------------------------
// Step 1: Login
// ---------------------------------------------------------------------------

document.getElementById("btn-login").addEventListener("click", async () => {
  const btn = document.getElementById("btn-login");
  const apiBaseUrl = document.getElementById("api-url").value.trim();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!apiBaseUrl || !username || !password) {
    setStatus("login-status", "Please fill in all fields.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Connecting…";
  setStatus("login-status", "Authenticating…", "");

  try {
    const result = await window.sentinel.login({ apiBaseUrl, username, password });
    if (result.ok) {
      setStatus("login-status", "✓ Connected", "ok");
      setTimeout(() => showStep(2), 600);
    } else {
      setStatus("login-status", `Error: ${result.error}`, "error");
    }
  } catch (err) {
    setStatus("login-status", `Error: ${err}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Connect →";
  }
});

document.getElementById("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-login").click();
});

// ---------------------------------------------------------------------------
// Step 2: Certificate
// ---------------------------------------------------------------------------

async function initCertStep() {
  setStatus("cert-status", "Generating CA certificate…", "");
  document.getElementById("btn-install-cert").disabled = true;

  try {
    const genResult = await window.sentinel.generateCert();
    if (!genResult.ok) {
      setStatus("cert-status", `Failed to generate cert: ${genResult.error}`, "error");
      return;
    }

    const trusted = await window.sentinel.isCertTrusted();
    if (trusted) {
      setStatus("cert-status", "✓ Certificate already installed", "ok");
      document.getElementById("btn-install-cert").textContent = "Continue →";
      document.getElementById("btn-install-cert").disabled = false;
      document.getElementById("btn-install-cert").onclick = () => showStep(3);
    } else {
      setStatus("cert-status", "Certificate not yet trusted. Click Install to add it to your system trust store.");
      document.getElementById("btn-install-cert").disabled = false;
      document.getElementById("cert-manual").style.display = "";
    }
  } catch (err) {
    setStatus("cert-status", `Error: ${err}`, "error");
  }
}

document.getElementById("btn-install-cert").addEventListener("click", async () => {
  const btn = document.getElementById("btn-install-cert");
  if (btn.textContent.includes("Continue")) { showStep(3); return; }

  btn.disabled = true;
  btn.textContent = "Installing…";
  setStatus("cert-status", "Installing certificate (you may see a UAC prompt)…", "");

  try {
    const result = await window.sentinel.installCert();
    if (result.ok) {
      setStatus("cert-status", "✓ Certificate installed successfully", "ok");
      btn.textContent = "Continue →";
      btn.disabled = false;
      btn.onclick = () => showStep(3);
    } else {
      setStatus("cert-status", `Installation failed: ${result.error}`, "error");
      btn.disabled = false;
      btn.textContent = "Retry →";
    }
  } catch (err) {
    setStatus("cert-status", `Error: ${err}`, "error");
    btn.disabled = false;
    btn.textContent = "Retry →";
  }
});

document.getElementById("btn-skip-cert").addEventListener("click", () => showStep(3));

// ---------------------------------------------------------------------------
// Step 3: Activate proxy
// ---------------------------------------------------------------------------

function setCheck(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = { pending: "○", running: "◌", ok: "✓", error: "✗" }[state] ?? "○";
  el.style.color = { ok: "#c3f400", error: "#f44", running: "#888" }[state] ?? "";
}

document.getElementById("btn-activate").addEventListener("click", async () => {
  const btn = document.getElementById("btn-activate");
  btn.disabled = true;
  btn.textContent = "Activating…";

  // Step A: configure OS proxy
  setCheck("chk-proxy", "running");
  const proxyResult = await window.sentinel.enableSystemProxy(9876);
  setCheck("chk-proxy", proxyResult.ok ? "ok" : "error");

  if (!proxyResult.ok) {
    setStatus("proxy-status", `Could not configure system proxy: ${proxyResult.error}`, "error");
    btn.disabled = false;
    btn.textContent = "Retry →";
    return;
  }

  // Step B: start mitmdump
  setCheck("chk-mitm", "running");
  const startResult = await window.sentinel.startProxy();
  const running = startResult === "running" || startResult === "starting";
  setCheck("chk-mitm", running ? "ok" : "error");

  if (!running) {
    setStatus("proxy-status", "Could not start the traffic monitor. Check that mitmproxy is installed.", "error");
    btn.disabled = false;
    btn.textContent = "Retry →";
    return;
  }

  // Step C: verify backend connection (the proxy already POSTs; just check status)
  setCheck("chk-verify", "running");
  await new Promise((r) => setTimeout(r, 1500)); // allow proxy to start
  const status = await window.sentinel.getStatus();
  const verified = status.status === "running";
  setCheck("chk-verify", verified ? "ok" : "error");

  if (verified) {
    setTimeout(() => showStep(4), 600);
  } else {
    setStatus("proxy-status", "Proxy started but backend could not be verified. Check that the Sentinel API is running.", "error");
    btn.disabled = false;
    btn.textContent = "Retry →";
  }
});

// ---------------------------------------------------------------------------
// Step 4: Done
// ---------------------------------------------------------------------------

document.getElementById("btn-done").addEventListener("click", () => {
  window.close();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

showStep(1);
