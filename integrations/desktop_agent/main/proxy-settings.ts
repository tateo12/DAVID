/**
 * OS-level proxy configuration.
 *
 * Sets the system proxy to 127.0.0.1:<port> so that all browser and app
 * traffic routes through the mitmproxy instance.
 *
 * Windows: WinInet registry keys (respected by Chrome, Edge, Electron apps)
 * macOS:   networksetup command
 * Linux:   gsettings (GNOME)
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const PROXY_OVERRIDES = "localhost;127.*;10.*;192.168.*;<local>";

export async function enableSystemProxy(port: number): Promise<void> {
  if (process.platform === "win32") {
    await _enableWindows(port);
  } else if (process.platform === "darwin") {
    await _enableMacos(port);
  } else {
    await _enableLinux(port);
  }
}

export async function disableSystemProxy(): Promise<void> {
  if (process.platform === "win32") {
    await _disableWindows();
  } else if (process.platform === "darwin") {
    await _disableMacos();
  } else {
    await _disableLinux();
  }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

async function _enableWindows(port: number): Promise<void> {
  const regBase = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  await execFileAsync("reg", ["add", regBase, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"]);
  await execFileAsync("reg", ["add", regBase, "/v", "ProxyServer", "/d", `127.0.0.1:${port}`, "/f"]);
  await execFileAsync("reg", ["add", regBase, "/v", "ProxyOverride", "/d", PROXY_OVERRIDES, "/f"]);
  // Notify WinInet of the change
  await _refreshWinInet();
}

async function _disableWindows(): Promise<void> {
  const regBase = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  await execFileAsync("reg", ["add", regBase, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"]);
  await _refreshWinInet();
}

async function _refreshWinInet(): Promise<void> {
  try {
    // Broadcast the settings change to all WinInet consumers
    await execFileAsync("rundll32.exe", [
      "inetcpl.cpl,ClearMyTracksByProcess",
      "8",
    ]);
  } catch {
    // Non-fatal — settings are still written to the registry
  }
}

// ---------------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------------

async function _getMacosNetworkServices(): Promise<string[]> {
  const { stdout } = await execFileAsync("networksetup", ["-listallnetworkservices"]);
  return stdout
    .split("\n")
    .slice(1) // first line is a header
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("*"));
}

async function _enableMacos(port: number): Promise<void> {
  const services = await _getMacosNetworkServices();
  await Promise.all(
    services.flatMap((svc) => [
      execFileAsync("networksetup", ["-setwebproxy", svc, "127.0.0.1", String(port)]),
      execFileAsync("networksetup", ["-setsecurewebproxy", svc, "127.0.0.1", String(port)]),
      execFileAsync("networksetup", ["-setproxybypassdomains", svc, ...PROXY_OVERRIDES.split(";")]),
    ])
  );
}

async function _disableMacos(): Promise<void> {
  const services = await _getMacosNetworkServices();
  await Promise.all(
    services.flatMap((svc) => [
      execFileAsync("networksetup", ["-setwebproxystate", svc, "off"]),
      execFileAsync("networksetup", ["-setsecurewebproxystate", svc, "off"]),
    ])
  );
}

// ---------------------------------------------------------------------------
// Linux (GNOME/gsettings)
// ---------------------------------------------------------------------------

async function _enableLinux(port: number): Promise<void> {
  await execFileAsync("gsettings", ["set", "org.gnome.system.proxy", "mode", "manual"]);
  await execFileAsync("gsettings", ["set", "org.gnome.system.proxy.http", "host", "127.0.0.1"]);
  await execFileAsync("gsettings", ["set", "org.gnome.system.proxy.http", "port", String(port)]);
  await execFileAsync("gsettings", ["set", "org.gnome.system.proxy.https", "host", "127.0.0.1"]);
  await execFileAsync("gsettings", ["set", "org.gnome.system.proxy.https", "port", String(port)]);
  await execFileAsync("gsettings", [
    "set",
    "org.gnome.system.proxy",
    "ignore-hosts",
    `['localhost', '127.0.0.0/8', '10.0.0.0/8', '192.168.0.0/16']`,
  ]);
}

async function _disableLinux(): Promise<void> {
  await execFileAsync("gsettings", ["set", "org.gnome.system.proxy", "mode", "none"]);
}
