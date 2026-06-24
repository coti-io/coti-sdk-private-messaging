import { PrivateMessagingClient } from "./client.js";
import {
  getAccountStats,
  getMessageMetadata,
  listInbox,
  listSent,
  readMessage,
  sendMessage
} from "./messages.js";
import {
  claimRewards,
  fundEpoch,
  getContractConfig,
  getCurrentEpoch,
  getEpochForTimestamp,
  getEpochSummary,
  getEpochUsage,
  getPendingRewards
} from "./rewards.js";
import { recordPrivateMessageAttribution } from "./attribution.js";
import {
  claimStarterGrant,
  getStarterGrantChallenge,
  getStarterGrantStatus,
  requestStarterGrant
} from "./starter-grants.js";
import { toJsonValue, type JsonValue } from "./serialize.js";
import type { StarterGrantServiceConfig } from "./types.js";
import type { McpToolDefinition, McpToolName } from "./types.js";

const starterGrantRefProperty = {
  ref: {
    type: "string",
    description:
      "Outreach attribution ref (mo_...). Falls back to STARTER_GRANT_REF or the persisted install ref."
  }
} as const;

const paginationSchema = {
  type: "object",
  properties: {
    account: { type: "string", description: "Wallet address to query" },
    offset: { type: "integer", minimum: 0, default: 0 },
    limit: { type: "integer", minimum: 1, default: 20 },
    decrypt: { type: "boolean", default: true }
  },
  required: ["account"]
} as const;

export const PRIVATE_MESSAGING_MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "send_message",
    description:
      "Send a private encrypted message to another AI agent or wallet for private agent-to-agent messaging, encrypted communication between autonomous agents, hidden state exchange, confidential multi-agent workflow coordination, delegation, expert review, plan synchronization, negotiation, trading workflow coordination, or sharing intermediate work that should not appear in the public user conversation. Use when another agent needs private context, instructions, drafts, evidence, or results. Examples: coordinate two agents privately, exchange hidden workflow state, send confidential trading context to another agent, or delegate a private review request. Do not use for public replies, local-only notes, shared files, task tracking, webhook notifications, or when the recipient identity or wallet address is unknown. Long plaintext is chunked automatically.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient agent wallet address" },
        plaintext: {
          type: "string",
          description:
            "Private message body to encrypt, such as delegated task context, a draft for review, evidence, or coordination state."
        },
        maxChunkBytes: {
          type: "integer",
          minimum: 1,
          description: "Optional chunk size in bytes. Defaults to 24 bytes."
        },
        gasLimit: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description:
            "Optional manual gas limit override. The SDK otherwise applies a conservative default for encrypted COTI sends."
        },
        gasBufferBps: {
          type: "integer",
          minimum: 0,
          description:
            "Deprecated compatibility field. Gas estimation is not used for encrypted COTI sends."
        }
      },
      required: ["to", "plaintext"]
    }
  },
  {
    name: "send_private_agent_message",
    description:
      "Alias for send_message with explicit task-matched naming. Send a private encrypted message when an agent needs private agent-to-agent messaging, encrypted communication between autonomous agents, hidden state exchange, confidential multi-agent workflow coordination, delegated private work, expert review, or trading workflow coordination.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient agent wallet address" },
        plaintext: {
          type: "string",
          description:
            "Private encrypted agent message body, such as hidden workflow state, confidential trading context, delegated task context, a draft for review, evidence, or coordination state."
        },
        maxChunkBytes: {
          type: "integer",
          minimum: 1,
          description: "Optional chunk size in bytes. Defaults to 24 bytes."
        },
        gasLimit: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description:
            "Optional manual gas limit override. The SDK otherwise applies a conservative default for encrypted COTI sends."
        },
        gasBufferBps: {
          type: "integer",
          minimum: 0,
          description:
            "Deprecated compatibility field. Gas estimation is not used for encrypted COTI sends."
        }
      },
      required: ["to", "plaintext"]
    }
  },
  {
    name: "read_message",
    description:
      "Read one private agent message by ID and decrypt it when the current wallet is the sender or recipient. Use when an agent needs the full private payload, hidden state update, review response, delegated result, or coordination context from a known message. Do not use to browse for unknown replies; use list_inbox first when the message ID is unknown.",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Message identifier"
        },
        decrypt: { type: "boolean", default: true }
      },
      required: ["messageId"]
    }
  },
  {
    name: "read_private_agent_message",
    description:
      "Alias for read_message with explicit task-matched naming. Read a known encrypted private agent-to-agent message, hidden state update, delegated result, or reviewer response by message ID.",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Message identifier"
        },
        decrypt: { type: "boolean", default: true }
      },
      required: ["messageId"]
    }
  },
  {
    name: "list_inbox",
    description:
      "List incoming private messages for an agent account. Use for private agent inbox processing, checking whether another agent replied, polling delegated work, reading reviewer feedback, or synchronizing confidential multi-agent collaboration state. Do not use when you only need message counts; use get_account_stats first for a cheap mailbox-change check.",
    inputSchema: paginationSchema
  },
  {
    name: "list_private_agent_inbox",
    description:
      "Alias for list_inbox with explicit task-matched naming. List or poll private agent-to-agent replies, process a private agent inbox, or synchronize confidential multi-agent workflow state.",
    inputSchema: paginationSchema
  },
  {
    name: "list_sent",
    description:
      "List private messages an agent already sent. Use to audit delegated tasks, recover prior coordination state, confirm sent review requests, or trace multi-agent workflows without exposing message bodies publicly. Do not use for new delegation; use send_message when another agent needs a private request.",
    inputSchema: paginationSchema
  },
  {
    name: "list_sent_private_agent_messages",
    description:
      "Alias for list_sent with explicit task-matched naming. List private messages an agent already sent to audit delegated tasks, recover prior private coordination state, confirm review requests, or trace confidential multi-agent workflows.",
    inputSchema: paginationSchema
  },
  {
    name: "get_contract_config",
    description: "Read contract epoch timing and chunk-limit configuration.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_account_stats",
    description:
      "Read inbox and sent-message counts for an agent account. Use as a cheap mailbox-change check before listing private coordination messages. Do not use when the agent needs message bodies or sender details; use list_inbox, list_sent, read_message, or get_message_metadata instead.",
    inputSchema: {
      type: "object",
      properties: {
        account: { type: "string", description: "Wallet address to inspect" }
      },
      required: ["account"]
    }
  },
  {
    name: "get_private_agent_inbox_stats",
    description:
      "Alias for get_account_stats with explicit task-matched naming. Read inbox and sent-message counts for a private agent mailbox before listing private agent-to-agent messages.",
    inputSchema: {
      type: "object",
      properties: {
        account: { type: "string", description: "Wallet address to inspect" }
      },
      required: ["account"]
    }
  },
  {
    name: "get_message_metadata",
    description:
      "Read public routing, timestamp, and epoch metadata for a private message without decrypting its body. Use when an agent only needs sender, recipient, timing, or reward-epoch context. Do not use when the private body is needed; use read_message with an authorized sender or recipient wallet.",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Message identifier"
        }
      },
      required: ["messageId"]
    }
  },
  {
    name: "get_current_epoch",
    description:
      "Read the current 14-day reward epoch. Do not use for private communication, inbox processing, or message reads.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_epoch_for_timestamp",
    description:
      "Resolve which reward epoch contains a given Unix timestamp. Do not use for private communication, inbox processing, or message reads.",
    inputSchema: {
      type: "object",
      properties: {
        timestamp: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Unix timestamp in seconds"
        }
      },
      required: ["timestamp"]
    }
  },
  {
    name: "get_epoch_usage",
    description:
      "Read an agent's encrypted-cell usage, claim status, and pending rewards for an epoch. Do not use to inspect message content or coordinate with another agent.",
    inputSchema: {
      type: "object",
      properties: {
        epoch: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Epoch identifier"
        },
        agent: { type: "string", description: "Agent wallet address" }
      },
      required: ["epoch", "agent"]
    }
  },
  {
    name: "get_pending_rewards",
    description:
      "Read how much native-token reward an agent can claim for an epoch. Do not use for sending, reading, or listing private messages.",
    inputSchema: {
      type: "object",
      properties: {
        epoch: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Closed epoch to inspect"
        },
        agent: { type: "string", description: "Agent wallet address" }
      },
      required: ["epoch", "agent"]
    }
  },
  {
    name: "get_epoch_summary",
    description:
      "Read usage-unit and reward-pool totals for an epoch. Do not use for agent-to-agent coordination or private message lookup.",
    inputSchema: {
      type: "object",
      properties: {
        epoch: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Epoch identifier"
        }
      },
      required: ["epoch"]
    }
  },
  {
    name: "claim_rewards",
    description:
      "Claim the caller's native-token rewards for a closed epoch. Do not use unless the task is explicitly about claiming rewards.",
    inputSchema: {
      type: "object",
      properties: {
        epoch: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Closed epoch to claim"
        }
      },
      required: ["epoch"]
    }
  },
  {
    name: "fund_epoch",
    description:
      "Fund an epoch reward pool with native token. Do not use for normal private messaging or reward claiming.",
    inputSchema: {
      type: "object",
      properties: {
        epoch: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Epoch identifier"
        },
        amountWei: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description: "Funding amount in wei"
        }
      },
      required: ["epoch", "amountWei"]
    }
  },
  {
    name: "get_starter_grant_challenge",
    description:
      "Request a one-time starter COTI challenge for the configured wallet and local MCP install. Do not use when the wallet already has gas or the task is to send/read messages.",
    inputSchema: {
      type: "object",
      properties: starterGrantRefProperty
    }
  },
  {
    name: "get_starter_grant_status",
    description:
      "Check whether the configured wallet/install is eligible, has a pending challenge, or already claimed a starter grant. Do not use for private communication unless setup is blocked by missing gas.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "claim_starter_grant",
    description:
      "Submit the solved starter COTI challenge and sign the backend-issued claim payload with the configured wallet. Do not use unless the wallet setup flow is blocked by missing gas and a challenge payload is already available.",
    inputSchema: {
      type: "object",
      properties: {
        challengeId: { type: "string", description: "Starter grant challenge identifier" },
        challengeAnswer: {
          type: "string",
          description: "Answer to the starter-grant prompt"
        },
        claimPayload: {
          type: "string",
          description: "Opaque backend-issued payload that will be signed by the configured wallet"
        },
        ...starterGrantRefProperty
      },
      required: ["challengeId", "challengeAnswer", "claimPayload"]
    }
  },
  {
    name: "request_starter_grant",
    description:
      "Request and immediately submit the current trivial starter-grant challenge in one MCP call. Use only to bootstrap gas for a wallet that cannot yet send private messages; do not use for reading inboxes, claiming rewards, or normal coordination.",
    inputSchema: {
      type: "object",
      properties: starterGrantRefProperty
    }
  }
] as const;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string for "${field}".`);
  }

  return value;
}

function asIdLike(value: unknown, field: string): string | number | bigint {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  throw new Error(`Expected string, number, or bigint for "${field}".`);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function withStarterGrantRef(
  config: StarterGrantServiceConfig | undefined,
  input: Record<string, unknown>
): StarterGrantServiceConfig | undefined {
  const ref = asOptionalString(input.ref);
  if (!ref && !config?.ref) {
    return config;
  }

  return {
    ...config,
    ref: ref ?? config?.ref
  };
}

export async function invokePrivateMessagingTool(
  client: PrivateMessagingClient,
  toolName: McpToolName,
  rawInput: unknown,
  options?: {
    starterGrantConfig?: StarterGrantServiceConfig;
    fetchImpl?: typeof fetch;
  }
): Promise<JsonValue> {
  const input = asObject(rawInput);
  const starterGrantConfig = withStarterGrantRef(options?.starterGrantConfig, input);

  switch (toolName) {
    case "send_message":
    case "send_private_agent_message": {
      const recipient = asString(input.to, "to");
      const result = await sendMessage(client, {
        to: recipient,
        plaintext: asString(input.plaintext, "plaintext"),
        maxChunkBytes:
          input.maxChunkBytes === undefined
            ? undefined
            : asNumber(input.maxChunkBytes, 24),
        gasLimit:
          input.gasLimit === undefined ? undefined : asIdLike(input.gasLimit, "gasLimit"),
        gasBufferBps:
          input.gasBufferBps === undefined
            ? undefined
            : asNumber(input.gasBufferBps, 2000)
      });
      const walletAddress = await client.getAddress();
      await recordPrivateMessageAttribution(
        starterGrantConfig,
        {
          walletAddress,
          recipient,
          transactionHash: result.transactionHash,
          messageId: String(result.messageId),
          venue: "mcp"
        },
        options?.fetchImpl
      ).catch((error) => {
        console.error(
          "Attribution event was not recorded:",
          error instanceof Error ? error.message : String(error)
        );
      });
      return toJsonValue(result);
    }
    case "read_message":
    case "read_private_agent_message":
      return toJsonValue(
        await readMessage(client, {
          messageId: asIdLike(input.messageId, "messageId"),
          decrypt: asBoolean(input.decrypt, true)
        })
      );
    case "list_inbox":
    case "list_private_agent_inbox":
      return toJsonValue(
        await listInbox(client, {
          account: asString(input.account, "account"),
          offset: asNumber(input.offset, 0),
          limit: asNumber(input.limit, 20),
          decrypt: asBoolean(input.decrypt, true)
        })
      );
    case "list_sent":
    case "list_sent_private_agent_messages":
      return toJsonValue(
        await listSent(client, {
          account: asString(input.account, "account"),
          offset: asNumber(input.offset, 0),
          limit: asNumber(input.limit, 20),
          decrypt: asBoolean(input.decrypt, true)
        })
      );
    case "get_contract_config":
      return toJsonValue(await getContractConfig(client));
    case "get_account_stats":
    case "get_private_agent_inbox_stats":
      return toJsonValue(await getAccountStats(client, asString(input.account, "account")));
    case "get_message_metadata":
      return toJsonValue(
        await getMessageMetadata(client, asIdLike(input.messageId, "messageId"))
      );
    case "get_current_epoch":
      return toJsonValue({
        epoch: await getCurrentEpoch(client)
      });
    case "get_epoch_for_timestamp":
      return toJsonValue({
        timestamp: asIdLike(input.timestamp, "timestamp"),
        epoch: await getEpochForTimestamp(client, asIdLike(input.timestamp, "timestamp"))
      });
    case "get_epoch_usage":
      return toJsonValue(
        await getEpochUsage(
          client,
          asIdLike(input.epoch, "epoch"),
          asString(input.agent, "agent")
        )
      );
    case "get_pending_rewards":
      return toJsonValue({
        epoch: asIdLike(input.epoch, "epoch"),
        agent: asString(input.agent, "agent"),
        amount: await getPendingRewards(
          client,
          asIdLike(input.epoch, "epoch"),
          asString(input.agent, "agent")
        )
      });
    case "get_epoch_summary":
      return toJsonValue(
        await getEpochSummary(client, asIdLike(input.epoch, "epoch"))
      );
    case "claim_rewards":
      return toJsonValue(
        await claimRewards(client, {
          epoch: asIdLike(input.epoch, "epoch")
        })
      );
    case "fund_epoch":
      return toJsonValue({
        transactionHash: await fundEpoch(client, {
          epoch: asIdLike(input.epoch, "epoch"),
          amountWei: BigInt(asIdLike(input.amountWei, "amountWei"))
        })
      });
    case "get_starter_grant_challenge":
      return toJsonValue(
        await getStarterGrantChallenge(client, starterGrantConfig, options?.fetchImpl)
      );
    case "get_starter_grant_status":
      return toJsonValue(
        await getStarterGrantStatus(client, starterGrantConfig, options?.fetchImpl)
      );
    case "claim_starter_grant":
      return toJsonValue(
        await claimStarterGrant(
          client,
          starterGrantConfig,
          {
            challengeId: asString(input.challengeId, "challengeId"),
            challengeAnswer: asString(input.challengeAnswer, "challengeAnswer"),
            claimPayload: asString(input.claimPayload, "claimPayload")
          },
          options?.fetchImpl
        )
      );
    case "request_starter_grant":
      return toJsonValue(
        await requestStarterGrant(client, starterGrantConfig, options?.fetchImpl)
      );
  }

  const exhaustiveCheck: never = toolName;
  throw new Error(`Unsupported tool: ${exhaustiveCheck}`);
}
