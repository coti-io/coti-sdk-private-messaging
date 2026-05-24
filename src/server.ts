#!/usr/bin/env node
import "dotenv/config";

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CotiNetwork,
  JsonRpcProvider,
  Wallet
} from "@coti-io/coti-ethers";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createPrivateMessagingClient } from "./client.js";
import {
  getDefaultCotiRpcUrl,
  getDefaultPrivateMessagingContractAddress
} from "./constants.js";
import {
  DEFAULT_STARTER_GRANT_INSTALL_ID_PATH,
  DEFAULT_STARTER_GRANT_SERVICE_TIMEOUT_MS,
  DEFAULT_STARTER_GRANT_SERVICE_URL
} from "./starter-grants.js";
import { invokePrivateMessagingTool } from "./mcp.js";
import { PRIVATE_MESSAGING_MCP_TOOLS } from "./mcp.js";
import { formatToolErrorResult, formatUserFacingError } from "./errors.js";
import type { StarterGrantServiceConfig } from "./types.js";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function resolveNetwork(): CotiNetwork {
  const raw = (process.env.COTI_NETWORK ?? "mainnet").toLowerCase();

  if (raw === "mainnet") {
    return CotiNetwork.Mainnet;
  }

  return CotiNetwork.Testnet;
}

function resolveRpcUrl(): string | undefined {
  if (process.env.COTI_RPC_URL_OVERRIDE) {
    return process.env.COTI_RPC_URL_OVERRIDE;
  }

  const network = resolveNetwork();
  if (network === CotiNetwork.Mainnet) {
    return process.env.COTI_MAINNET_RPC_URL_OVERRIDE ?? getDefaultCotiRpcUrl(network);
  }

  return process.env.COTI_TESTNET_RPC_URL_OVERRIDE ?? getDefaultCotiRpcUrl(network);
}

function resolveContractAddress(network: CotiNetwork): string {
  return (
    process.env.PRIVATE_MESSAGING_CONTRACT_ADDRESS_OVERRIDE ??
    getDefaultPrivateMessagingContractAddress(network)
  );
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveStarterGrantServiceConfig(): StarterGrantServiceConfig | undefined {
  const ref = process.env.STARTER_GRANT_REF?.trim();
  return {
    url: process.env.STARTER_GRANT_SERVICE_URL ?? DEFAULT_STARTER_GRANT_SERVICE_URL,
    timeoutMs: parseNumber(
      process.env.STARTER_GRANT_SERVICE_TIMEOUT_MS,
      DEFAULT_STARTER_GRANT_SERVICE_TIMEOUT_MS
    ),
    authToken: process.env.STARTER_GRANT_SERVICE_AUTH_TOKEN,
    installIdPath:
      process.env.STARTER_GRANT_INSTALL_ID_PATH ?? DEFAULT_STARTER_GRANT_INSTALL_ID_PATH,
    ...(ref ? { ref } : {})
  };
}

function buildClient() {
  const network = resolveNetwork();
  const rpcUrl = resolveRpcUrl();
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(getRequiredEnv("PRIVATE_KEY"), provider);
  wallet.setAesKey(getRequiredEnv("AES_KEY"));

  return createPrivateMessagingClient({
    contractAddress: resolveContractAddress(network),
    network,
    runner: wallet
  });
}

function formatToolContent(result: unknown) {
  return [
    {
      type: "text" as const,
      text: JSON.stringify(result, null, 2)
    }
  ];
}

async function executeTool(action: () => Promise<unknown>) {
  try {
    const result = await action();
    return { content: formatToolContent(result) };
  } catch (error) {
    return formatToolErrorResult(error);
  }
}

export async function startMcpServer() {
  const client = buildClient();
  const starterGrantConfig = resolveStarterGrantServiceConfig();

  const server = new McpServer(
    {
      name: "coti-sdk-private-messaging",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      },
      instructions:
        "Private agent messaging on COTI with encrypted message bodies, inbox/sent queries, epoch summaries, and reward claims."
    }
  );

  server.registerTool(
    "send_message",
    {
      title: "Send Message",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find((tool) => tool.name === "send_message")
        ?.description,
      inputSchema: {
        to: z.string().min(1),
        plaintext: z.string(),
        maxChunkBytes: z.number().int().positive().optional(),
        gasLimit: z.union([z.string(), z.number().int().nonnegative()]).optional(),
        gasBufferBps: z.number().int().nonnegative().optional()
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "send_message", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "read_message",
    {
      title: "Read Message",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find((tool) => tool.name === "read_message")
        ?.description,
      inputSchema: {
        messageId: z.union([z.string(), z.number().int().nonnegative()]),
        decrypt: z.boolean().optional()
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "read_message", args, {
          starterGrantConfig
        })
      );
    }
  );

  const listSchema = {
    account: z.string().min(1),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
    decrypt: z.boolean().optional()
  };

  server.registerTool(
    "list_inbox",
    {
      title: "List Inbox",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find((tool) => tool.name === "list_inbox")
        ?.description,
      inputSchema: listSchema
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "list_inbox", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "list_sent",
    {
      title: "List Sent",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find((tool) => tool.name === "list_sent")
        ?.description,
      inputSchema: listSchema
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "list_sent", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "get_contract_config",
    {
      title: "Get Contract Config",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_contract_config"
      )?.description
    },
    async () => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_contract_config", {}, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "get_account_stats",
    {
      title: "Get Account Stats",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_account_stats"
      )?.description,
      inputSchema: {
        account: z.string().min(1)
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_account_stats", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "get_message_metadata",
    {
      title: "Get Message Metadata",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_message_metadata"
      )?.description,
      inputSchema: {
        messageId: z.union([z.string(), z.number().int().nonnegative()])
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_message_metadata", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "get_current_epoch",
    {
      title: "Get Current Epoch",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_current_epoch"
      )?.description
    },
    async () => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_current_epoch", {}, {
          starterGrantConfig
        })
      );
    }
  );

  const epochSchema = {
    epoch: z.union([z.string(), z.number().int().nonnegative()])
  };

  server.registerTool(
    "get_epoch_for_timestamp",
    {
      title: "Get Epoch For Timestamp",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_epoch_for_timestamp"
      )?.description,
      inputSchema: {
        timestamp: z.union([z.string(), z.number().int().nonnegative()])
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_epoch_for_timestamp", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "get_epoch_usage",
    {
      title: "Get Epoch Usage",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_epoch_usage"
      )?.description,
      inputSchema: {
        epoch: z.union([z.string(), z.number().int().nonnegative()]),
        agent: z.string().min(1)
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_epoch_usage", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "get_epoch_summary",
    {
      title: "Get Epoch Summary",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_epoch_summary"
      )?.description,
      inputSchema: epochSchema
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_epoch_summary", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "get_pending_rewards",
    {
      title: "Get Pending Rewards",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_pending_rewards"
      )?.description,
      inputSchema: {
        epoch: z.union([z.string(), z.number().int().nonnegative()]),
        agent: z.string().min(1)
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_pending_rewards", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "claim_rewards",
    {
      title: "Claim Rewards",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "claim_rewards"
      )?.description,
      inputSchema: epochSchema
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "claim_rewards", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "fund_epoch",
    {
      title: "Fund Epoch",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find((tool) => tool.name === "fund_epoch")
        ?.description,
      inputSchema: {
        epoch: z.union([z.string(), z.number().int().nonnegative()]),
        amountWei: z.union([z.string(), z.number().int().nonnegative()])
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "fund_epoch", args, {
          starterGrantConfig
        })
      );
    }
  );

  const starterGrantRefSchema = {
    ref: z
      .string()
      .min(1)
      .optional()
      .describe("Outreach attribution ref (mo_…). Falls back to STARTER_GRANT_REF.")
  };

  server.registerTool(
    "get_starter_grant_challenge",
    {
      title: "Get Starter Grant Challenge",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_starter_grant_challenge"
      )?.description,
      inputSchema: starterGrantRefSchema
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_starter_grant_challenge", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "get_starter_grant_status",
    {
      title: "Get Starter Grant Status",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "get_starter_grant_status"
      )?.description
    },
    async () => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "get_starter_grant_status", {}, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "claim_starter_grant",
    {
      title: "Claim Starter Grant",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "claim_starter_grant"
      )?.description,
      inputSchema: {
        challengeId: z.string().min(1),
        challengeAnswer: z.string().min(1),
        claimPayload: z.string().min(1),
        ...starterGrantRefSchema
      }
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "claim_starter_grant", args, {
          starterGrantConfig
        })
      );
    }
  );

  server.registerTool(
    "request_starter_grant",
    {
      title: "Request Starter Grant",
      description: PRIVATE_MESSAGING_MCP_TOOLS.find(
        (tool) => tool.name === "request_starter_grant"
      )?.description,
      inputSchema: starterGrantRefSchema
    },
    async (args) => {
      return executeTool(() =>
        invokePrivateMessagingTool(client, "request_starter_grant", args, {
          starterGrantConfig
        })
      );
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isDirectExecution(): boolean {
  const argvPath = process.argv[1];
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return argvPath.endsWith("/server.js") || argvPath.endsWith("\\server.js");
  }
}

if (isDirectExecution()) {
  startMcpServer().catch((error) => {
    console.error(formatUserFacingError(error));
    process.exitCode = 1;
  });
}
