import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

interface PersistedInstallState {
  installId: string;
  attributionRef?: string;
}

function resolveHomePath(relativePath: string): string {
  if (relativePath.startsWith("~/")) {
    const homeDir = process.env.HOME;
    if (!homeDir) {
      throw new Error("Cannot resolve '~' because HOME is not set.");
    }

    return path.join(homeDir, relativePath.slice(2));
  }

  return relativePath;
}

export function resolveInstallIdPath(explicitPath?: string): string {
  return resolveHomePath(
    explicitPath ??
      process.env.STARTER_GRANT_INSTALL_ID_PATH ??
      "~/.config/coti-sdk-private-messaging/install-state.json"
  );
}

async function readInstallState(installIdPath: string): Promise<PersistedInstallState | undefined> {
  try {
    const raw = await readFile(installIdPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedInstallState>;
    if (parsed.installId && parsed.installId.length > 0) {
      return {
        installId: parsed.installId,
        attributionRef: parsed.attributionRef
      };
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  return undefined;
}

async function writeInstallState(installIdPath: string, state: PersistedInstallState): Promise<void> {
  await mkdir(path.dirname(installIdPath), { recursive: true });
  const tempPath = `${installIdPath}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await rename(tempPath, installIdPath);
}

export async function getOrCreateInstallId(explicitPath?: string): Promise<string> {
  const installIdPath = resolveInstallIdPath(explicitPath);
  const existing = await readInstallState(installIdPath);
  if (existing) {
    return existing.installId;
  }

  const installId = randomUUID();
  await writeInstallState(installIdPath, { installId });
  return installId;
}

export async function getStoredAttributionRef(explicitPath?: string): Promise<string | undefined> {
  const installIdPath = resolveInstallIdPath(explicitPath);
  const existing = await readInstallState(installIdPath);
  return existing?.attributionRef;
}

export async function setStoredAttributionRef(
  explicitPath: string | undefined,
  attributionRef: string
): Promise<void> {
  const installIdPath = resolveInstallIdPath(explicitPath);
  const installId = await getOrCreateInstallId(explicitPath);
  await writeInstallState(installIdPath, { installId, attributionRef });
}

export async function resolveStarterGrantRef(
  explicitPath?: string,
  explicitRef?: string
): Promise<string | undefined> {
  const trimmedRef = explicitRef?.trim();
  if (trimmedRef) {
    return trimmedRef;
  }

  const envRef = process.env.STARTER_GRANT_REF?.trim();
  if (envRef) {
    return envRef;
  }

  return await getStoredAttributionRef(explicitPath);
}
