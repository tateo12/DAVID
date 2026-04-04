/**
 * IPC handlers — bridge between the renderer (app UI)
 * and the main process (proxy, keychain, cert install, OS proxy settings).
 *
 * Auth flow: Supabase signInWithPassword → /api/auth/provision → keychain
 */

import { ipcMain } from "electron";
import { saveCredentials, loadCredentials, clearCredentials } from "./keychain";
import { startProxy, stopProxy, getStatus, getThreatCount } from "./proxy-manager";
import { generateCaCert } from "./proxy-manager";
import { isCertTrusted, installCert, getCertPath } from "./cert-manager";
import { enableSystemProxy, disableSystemProxy } from "./proxy-settings";

export type LoginPayload = {
  apiBaseUrl: string;
  email: string;
  password: string;
};

export type LoginResult =
  | { ok: true; user: { id: number; username: string; role: string; employee_id: number | null; org_id: number | null } }
  | { ok: false; error: string };

/** Validate that the given string is a safe https URL (http allowed only for localhost). */
function _validateApiBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Invalid API URL — must be a full http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API URL must use http or https");
  }
  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocalhost) {
    throw new Error("API URL must use HTTPS for non-localhost hosts");
  }
  return parsed.origin;
}

export function registerIpcHandlers(): void {
  // ---- Auth (Supabase) ----------------------------------------------------

  ipcMain.handle("sentinel:login", async (_e, payload: LoginPayload): Promise<LoginResult> => {
    try {
      const safeBase = _validateApiBaseUrl(payload.apiBaseUrl);

      // 1. Fetch Supabase config from backend
      const configRes = await fetch(`${safeBase}/api/auth/config`);
      if (!configRes.ok) {
        return { ok: false, error: "Could not reach backend — check the URL" };
      }
      const { supabase_url, supabase_anon_key } = (await configRes.json()) as {
        supabase_url: string;
        supabase_anon_key: string;
      };
      if (!supabase_url || !supabase_anon_key) {
        return { ok: false, error: "Backend returned invalid Supabase config" };
      }

      // 2. Sign in with Supabase REST API (no SDK dependency needed)
      const supabaseAuthRes = await fetch(
        `${supabase_url}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: supabase_anon_key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: payload.email, password: payload.password }),
        }
      );

      if (!supabaseAuthRes.ok) {
        const errBody = await supabaseAuthRes.json().catch(() => ({})) as { error_description?: string; msg?: string };
        return { ok: false, error: errBody.error_description || errBody.msg || "Invalid email or password" };
      }

      const supabaseData = (await supabaseAuthRes.json()) as {
        access_token: string;
        expires_in: number;
        refresh_token: string;
      };

      // 3. Provision with backend to get local user mapping
      const provisionRes = await fetch(`${safeBase}/api/auth/provision`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseData.access_token}` },
      });

      if (!provisionRes.ok) {
        const body = (await provisionRes.json().catch(() => ({}))) as { detail?: string };
        return { ok: false, error: body.detail ?? "Failed to provision user" };
      }

      const prov = (await provisionRes.json()) as {
        access_token: string;
        expires_at: string;
        user: { id: number; username: string; role: string; employee_id: number | null; org_id: number | null; email?: string };
      };

      // 4. Save to keychain
      await saveCredentials({
        accessToken: supabaseData.access_token,
        apiBaseUrl: safeBase,
        employeeId: String(prov.user.employee_id ?? ""),
        userId: String(prov.user.id),
        username: prov.user.username,
        email: payload.email,
        role: prov.user.role,
        orgId: String(prov.user.org_id ?? ""),
      });

      return { ok: true, user: prov.user };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("sentinel:logout", async (): Promise<void> => {
    await stopProxy();
    await disableSystemProxy().catch(() => {});
    await clearCredentials();
  });

  ipcMain.handle("sentinel:get-credentials", async () => {
    const creds = await loadCredentials();
    return {
      hasToken: Boolean(creds.accessToken),
      apiBaseUrl: creds.apiBaseUrl,
      employeeId: creds.employeeId,
    };
  });

  ipcMain.handle("sentinel:get-user", async () => {
    const creds = await loadCredentials();
    if (!creds.accessToken) return null;
    return {
      username: creds.username ?? "",
      email: creds.email ?? "",
      role: creds.role ?? "",
      employeeId: creds.employeeId ?? "",
      orgId: creds.orgId ?? "",
    };
  });

  // ---- Status --------------------------------------------------------------

  ipcMain.handle("sentinel:get-status", () => ({
    status: getStatus(),
    threatCount: getThreatCount(),
  }));

  // ---- Data fetching -------------------------------------------------------

  ipcMain.handle("sentinel:fetch-activity", async (_e, limit: number = 20) => {
    try {
      const creds = await loadCredentials();
      if (!creds.accessToken || !creds.apiBaseUrl) return { ok: false, error: "Not logged in" };

      const res = await fetch(`${creds.apiBaseUrl}/api/prompts?limit=${limit}`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

      const data = await res.json();
      return { ok: true, prompts: data };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("sentinel:fetch-metrics", async () => {
    try {
      const creds = await loadCredentials();
      if (!creds.accessToken || !creds.apiBaseUrl) return { ok: false, error: "Not logged in" };

      const res = await fetch(`${creds.apiBaseUrl}/api/metrics/dashboard`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

      const data = await res.json();
      return { ok: true, metrics: data };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ---- Proxy ---------------------------------------------------------------

  ipcMain.handle("sentinel:start-proxy", async () => {
    await startProxy();
    return getStatus();
  });

  ipcMain.handle("sentinel:stop-proxy", async () => {
    await stopProxy();
    return getStatus();
  });

  // ---- Dependency check ----------------------------------------------------

  ipcMain.handle("sentinel:check-mitmdump", async (): Promise<{ installed: boolean; version?: string }> => {
    const { execSync } = require("child_process");
    try {
      const out = execSync("mitmdump --version", { timeout: 5000, encoding: "utf8" });
      const match = out.match(/Mitmproxy:\s+([\d.]+)/);
      return { installed: true, version: match ? match[1] : "unknown" };
    } catch {
      return { installed: false };
    }
  });

  ipcMain.handle("sentinel:install-mitmdump", async (): Promise<{ ok: boolean; error?: string }> => {
    const { execSync } = require("child_process");
    try {
      if (process.platform === "darwin") {
        execSync("brew install mitmproxy", { timeout: 120000, encoding: "utf8" });
      } else if (process.platform === "win32") {
        // Windows: mitmdump.exe is bundled
        return { ok: true };
      } else {
        execSync("pip3 install mitmproxy", { timeout: 120000, encoding: "utf8" });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ---- Certificate ---------------------------------------------------------

  ipcMain.handle("sentinel:generate-cert", async (): Promise<{ ok: boolean; certPath?: string; error?: string }> => {
    try {
      const certPath = await generateCaCert();
      return { ok: true, certPath };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("sentinel:is-cert-trusted", async (): Promise<boolean> => {
    return isCertTrusted();
  });

  ipcMain.handle("sentinel:install-cert", async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const certPath = getCertPath();
      await installCert(certPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ---- OS Proxy ------------------------------------------------------------

  ipcMain.handle("sentinel:enable-system-proxy", async (_e, port: number): Promise<{ ok: boolean; error?: string }> => {
    try {
      await enableSystemProxy(port);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("sentinel:disable-system-proxy", async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      await disableSystemProxy();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
