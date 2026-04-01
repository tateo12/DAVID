/**
 * Secure credential storage using the OS keychain.
 * Windows: Windows Credential Manager
 * macOS:   Keychain
 * Linux:   libsecret / kwallet
 *
 * Uses the `keytar` package which ships with Electron.
 */

import keytar from "keytar";

const SERVICE = "sentinel-desktop-agent";

export type StoredCredentials = {
  accessToken: string;
  apiBaseUrl: string;
  employeeId: string;
  password: string;
};

export async function saveCredentials(creds: Partial<StoredCredentials>): Promise<void> {
  const entries = Object.entries(creds) as [keyof StoredCredentials, string][];
  await Promise.all(
    entries.map(([key, value]) => keytar.setPassword(SERVICE, key, value))
  );
}

export async function loadCredentials(): Promise<Partial<StoredCredentials>> {
  const keys: (keyof StoredCredentials)[] = ["accessToken", "apiBaseUrl", "employeeId", "password"];
  const results: Partial<StoredCredentials> = {};
  await Promise.all(
    keys.map(async (key) => {
      const value = await keytar.getPassword(SERVICE, key);
      if (value !== null) results[key] = value;
    })
  );
  return results;
}

export async function clearCredentials(): Promise<void> {
  const keys: (keyof StoredCredentials)[] = ["accessToken", "apiBaseUrl", "employeeId", "password"];
  await Promise.all(keys.map((key) => keytar.deletePassword(SERVICE, key)));
}

export async function hasValidSession(): Promise<boolean> {
  const token = await keytar.getPassword(SERVICE, "accessToken");
  return token !== null && token.length > 0;
}
