import type { PrivateMessagingClient } from "./client.js";
import {
  getOrCreateInstallId,
  resolveStarterGrantRef,
  setStoredAttributionRef
} from "./install-state.js";
import type {
  ClaimStarterGrantRequest,
  ClaimStarterGrantResult,
  GetStarterGrantChallengeResult,
  GetStarterGrantStatusResult,
  RequestStarterGrantResult,
  StarterGrantServiceConfig
} from "./types.js";

export const DEFAULT_STARTER_GRANT_SERVICE_URL = "https://agents.coti.io/grant";
export const DEFAULT_STARTER_GRANT_SERVICE_TIMEOUT_MS = 15_000;
export const DEFAULT_STARTER_GRANT_INSTALL_ID_PATH =
  "~/.config/coti-sdk-private-messaging/install-state.json";

async function resolveStarterGrantConfig(
  config: StarterGrantServiceConfig | undefined
): Promise<
  Required<Pick<StarterGrantServiceConfig, "url" | "timeoutMs" | "installIdPath">> &
    Pick<StarterGrantServiceConfig, "authToken" | "ref">
> {
  const installIdPath = config?.installIdPath ?? DEFAULT_STARTER_GRANT_INSTALL_ID_PATH;
  return {
    url: config?.url ?? DEFAULT_STARTER_GRANT_SERVICE_URL,
    timeoutMs: config?.timeoutMs ?? DEFAULT_STARTER_GRANT_SERVICE_TIMEOUT_MS,
    authToken: config?.authToken,
    installIdPath,
    ref: await resolveStarterGrantRef(installIdPath, config?.ref)
  };
}

function buildStarterGrantAttributionBody(
  config: Pick<StarterGrantServiceConfig, "ref">,
  body: Record<string, unknown>
): Record<string, unknown> {
  if (!config.ref) {
    return body;
  }

  return {
    ...body,
    ref: config.ref
  };
}

async function postJson<T>(
  url: string,
  body: unknown,
  config: StarterGrantServiceConfig,
  fetchImpl?: typeof fetch
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await (fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Starter grant request failed with status ${response.status}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getStarterGrantChallenge(
  client: PrivateMessagingClient,
  configInput: StarterGrantServiceConfig | undefined,
  fetchImpl?: typeof fetch
): Promise<GetStarterGrantChallengeResult> {
  const config = await resolveStarterGrantConfig(configInput);
  const walletAddress = await client.getAddress();
  const installId = await getOrCreateInstallId(config.installIdPath);

  return postJson<GetStarterGrantChallengeResult>(
    `${config.url.replace(/\/+$/, "")}/challenge`,
    buildStarterGrantAttributionBody(config, {
      walletAddress,
      installId
    }),
    config,
    fetchImpl
  );
}

export async function getStarterGrantStatus(
  client: PrivateMessagingClient,
  configInput: StarterGrantServiceConfig | undefined,
  fetchImpl?: typeof fetch
): Promise<GetStarterGrantStatusResult> {
  const config = await resolveStarterGrantConfig(configInput);
  const walletAddress = await client.getAddress();
  const installId = await getOrCreateInstallId(config.installIdPath);

  return postJson<GetStarterGrantStatusResult>(
    `${config.url.replace(/\/+$/, "")}/status`,
    {
      walletAddress,
      installId
    },
    config,
    fetchImpl
  );
}

export async function claimStarterGrant(
  client: PrivateMessagingClient,
  configInput: StarterGrantServiceConfig | undefined,
  input: ClaimStarterGrantRequest,
  fetchImpl?: typeof fetch
): Promise<ClaimStarterGrantResult> {
  const config = await resolveStarterGrantConfig(configInput);
  const walletAddress = await client.getAddress();
  const installId = await getOrCreateInstallId(config.installIdPath);
  const signature = await client.signMessage(input.claimPayload);

  return postJson<ClaimStarterGrantResult>(
    `${config.url.replace(/\/+$/, "")}/claim`,
    buildStarterGrantAttributionBody(config, {
      challengeId: input.challengeId,
      walletAddress,
      installId,
      challengeAnswer: input.challengeAnswer,
      claimPayload: input.claimPayload,
      signature
    }),
    config,
    fetchImpl
  );
}

function solveStarterGrantPrompt(prompt: string): string {
  const numbers = [...prompt.matchAll(/\b\d+\b/g)].map((match) => Number(match[0]));
  if (numbers.length < 2) {
    throw new Error("Starter grant prompt did not contain enough numeric operands to solve.");
  }

  const [left, right] = numbers;
  if (/\bchunk-thread pairs\b/i.test(prompt)) {
    return String(left * right);
  }

  if (/\bremain\b/i.test(prompt)) {
    return String(left - right);
  }

  return String(left + right);
}

export async function requestStarterGrant(
  client: PrivateMessagingClient,
  configInput: StarterGrantServiceConfig | undefined,
  fetchImpl?: typeof fetch
): Promise<RequestStarterGrantResult> {
  const config = await resolveStarterGrantConfig(configInput);
  const challenge = await getStarterGrantChallenge(client, configInput, fetchImpl);
  const claim = await claimStarterGrant(
    client,
    configInput,
    {
      challengeId: challenge.challengeId,
      challengeAnswer: solveStarterGrantPrompt(challenge.prompt),
      claimPayload: challenge.claimPayload
    },
    fetchImpl
  );

  if (config.ref) {
    await setStoredAttributionRef(config.installIdPath, config.ref);
  }

  return {
    ...claim,
    prompt: challenge.prompt,
    expiresAt: challenge.expiresAt
  };
}
