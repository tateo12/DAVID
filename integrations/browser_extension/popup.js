const statusEl = document.getElementById("status");
const apiBaseUrlEl = document.getElementById("apiBaseUrl");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const loginView = document.getElementById("view-login");
const dashboardView = document.getElementById("view-dashboard");
const diagnosticUserEl = document.getElementById("diagnostic-user");

async function loadState() {
  const state = await chrome.storage.local.get([
    "apiBaseUrl",
    "accessToken",
    "user",
  ]);
  apiBaseUrlEl.value = state.apiBaseUrl || "https://david-production-f999.up.railway.app";
  if (state.user) {
    statusEl.textContent = ``;
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    if (diagnosticUserEl) diagnosticUserEl.textContent = `AGENT: ${state.user.username}`;
  } else {
    statusEl.textContent = "Authentication required.";
    loginView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
  }
}

async function login() {
  const apiBaseUrl = apiBaseUrlEl.value.trim().replace(/\/$/, "");
  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  if (!apiBaseUrl || !username || !password) {
    statusEl.textContent = "Provide credentials.";
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
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    if (diagnosticUserEl) diagnosticUserEl.textContent = `AGENT: ${body.user.username}`;
    statusEl.textContent = ``;
  } catch (error) {
    statusEl.textContent = `Error: ${String(error)}`;
  }
}

async function logout() {
  await chrome.storage.local.remove(["accessToken", "user", "expiresAt"]);
  loginView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  statusEl.textContent = "Signed out.";
}

loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);
loadState();

