const statusEl = document.getElementById("status");
const apiBaseUrlEl = document.getElementById("apiBaseUrl");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const captureScreenshotBtn = document.getElementById("captureScreenshotBtn");
const screenshotEl = document.getElementById("screenshot");
const livePromptEl = document.getElementById("livePrompt");

async function loadState() {
  const state = await chrome.storage.local.get([
    "apiBaseUrl",
    "accessToken",
    "user",
  ]);
  apiBaseUrlEl.value = state.apiBaseUrl || "https://david-production-f999.up.railway.app";
  if (state.user) {
    statusEl.textContent = `Logged in as ${state.user.username} (${state.user.role})`;
    statusEl.className = "";
  } else {
    statusEl.textContent = "Not logged in.";
    statusEl.className = "muted";
  }
}

async function login() {
  const apiBaseUrl = apiBaseUrlEl.value.trim().replace(/\/$/, "");
  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  if (!apiBaseUrl || !username || !password) {
    statusEl.textContent = "Fill backend URL, username, and password.";
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = await response.json();
    if (!response.ok) {
      statusEl.textContent = body.detail || "Login failed.";
      return;
    }

    await chrome.storage.local.set({
      apiBaseUrl,
      accessToken: body.access_token,
      user: body.user,
      expiresAt: body.expires_at,
    });
    statusEl.textContent = `Logged in as ${body.user.username} (${body.user.role})`;
    statusEl.className = "";
  } catch (error) {
    statusEl.textContent = `Login error: ${String(error)}`;
  }
}

async function logout() {
  await chrome.storage.local.remove(["accessToken", "user", "expiresAt"]);
  statusEl.textContent = "Logged out.";
  statusEl.className = "muted";
}

function captureScreenshot() {
  chrome.tabs.captureVisibleTab(null, { format: "png", quality: 100 }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = `Screenshot failed: ${chrome.runtime.lastError.message}`;
      statusEl.className = "";
      return;
    }
    if (!dataUrl) {
      statusEl.textContent = "Screenshot failed: empty image.";
      statusEl.className = "";
      return;
    }

    // Display in <img src={dataUrl}> or download/process it
    screenshotEl.src = dataUrl;
    statusEl.textContent = "Screenshot captured.";
    statusEl.className = "";
  });
}

async function refreshLiveCapturePreview() {
  const state = await chrome.storage.local.get([
    "latestScreenshotDataUrl",
    "latestScreenshotCapturedAt",
    "latestPromptBarText",
    "latestPromptCapturedAt",
  ]);

  if (state.latestScreenshotDataUrl) {
    screenshotEl.src = state.latestScreenshotDataUrl;
  }

  if (state.latestPromptBarText) {
    const timestamp = state.latestPromptCapturedAt ? ` (${state.latestPromptCapturedAt})` : "";
    livePromptEl.textContent = `${state.latestPromptBarText}${timestamp}`;
    livePromptEl.className = "";
  } else {
    livePromptEl.textContent = "No prompt bar text captured yet.";
    livePromptEl.className = "muted";
  }
}

loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);
captureScreenshotBtn.addEventListener("click", captureScreenshot);
loadState();
refreshLiveCapturePreview();
setInterval(refreshLiveCapturePreview, 1000);
