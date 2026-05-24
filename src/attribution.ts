import { getOrCreateInstallId, resolveStarterGrantRef } from "./install-state.js";
import type { StarterGrantServiceConfig } from "./types.js";

const DEFAULT_ATTRIBUTION_SERVICE_URL = "https://agents.coti.io/grant";
const DEFAULT_ATTRIBUTION_SERVICE_TIMEOUT_MS = 15_000;
const DEFAULT_ATTRIBUTION_INSTALL_ID_PATH =
  "~/.config/coti-sdk-private-messaging/install-state.json";

export type AttributionEventType = "private_message_received" | "skill_usage";

export interface RecordAttributionEventInput {
  ref?: string;
  type: AttributionEventType;
  walletAddress?: string;
  installId?: string;
  skillId?: string;
  venue?: string;
  metadata?: Record<string, unknown>;
}

export async function resolveAttributionRefForInstall(
  config: StarterGrantServiceConfig | undefined
): Promise<string | undefined> {
  return resolveStarterGrantRef(config?.installIdPath, config?.ref);
}

function requireAttributionConfig(
  config: StarterGrantServiceConfig | undefined
): Required<Pick<StarterGrantServiceConfig, "url" | "timeoutMs" | "installIdPath">> &
  Pick<StarterGrantServiceConfig, "authToken" | "ref"> {
  return {
    url: config?.url ?? DEFAULT_ATTRIBUTION_SERVICE_URL,
    timeoutMs: config?.timeoutMs ?? DEFAULT_ATTRIBUTION_SERVICE_TIMEOUT_MS,
    authToken: config?.authToken,
    installIdPath: config?.installIdPath ?? DEFAULT_ATTRIBUTION_INSTALL_ID_PATH,
    ref: config?.ref
  };
}

export async function recordAttributionEvent(
  configInput: StarterGrantServiceConfig | undefined,
  input: RecordAttributionEventInput,
  fetchImpl?: typeof fetch
): Promise<void> {
  const config = requireAttributionConfig(configInput);
  const ref =
    input.ref ??
    (await resolveAttributionRefForInstall(config));
  if (!ref) {
    return;
  }

  const installId =
    input.installId ?? (await getOrCreateInstallId(config.installIdPath));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await (fetchImpl ?? fetch)(
      `${config.url.replace(/\/+$/, "")}/attribution/event`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {})
        },
        body: JSON.stringify({
          ref,
          type: input.type,
          venue: input.venue ?? "sdk_cli",
          walletAddress: input.walletAddress,
          installId,
          skillId: input.skillId,
          metadata: input.metadata
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        payload.error ?? `Attribution event failed with status ${response.status}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export interface RecordPrivateMessageAttributionInput {
  walletAddress: string;
  recipient: string;
  transactionHash: string;
  messageId: string;
  venue?: string;
}

export async function recordPrivateMessageAttribution(
  configInput: StarterGrantServiceConfig | undefined,
  input: RecordPrivateMessageAttributionInput,
  fetchImpl?: typeof fetch
): Promise<void> {
  const ref = await resolveAttributionRefForInstall(configInput);
  if (!ref) {
    return;
  }

  const config = requireAttributionConfig(configInput);
  const installId = await getOrCreateInstallId(config.installIdPath);
  const metadata = {
    recipient: input.recipient,
    transactionHash: input.transactionHash,
    messageId: input.messageId
  };
  const venue = input.venue ?? "sdk_cli";

  await recordAttributionEvent(
    config,
    {
      ref,
      type: "private_message_received",
      walletAddress: input.walletAddress,
      installId,
      venue,
      metadata
    },
    fetchImpl
  );

  try {
    await recordAttributionEvent(
      config,
      {
        ref,
        type: "skill_usage",
        walletAddress: input.walletAddress,
        installId,
        venue,
        skillId: "private-message-send",
        metadata
      },
      fetchImpl
    );
  } catch (error) {
    console.error(
      "skill_usage attribution event was not recorded:",
      error instanceof Error ? error.message : String(error)
    );
  }
}
