#!/usr/bin/env node

import "dotenv/config";

import {
  CotiNetwork,
  JsonRpcProvider,
  Wallet
} from "@coti-io/coti-ethers";
import {
  createPrivateMessagingClient,
  getDefaultCotiRpcUrl,
  sendMessage
} from "../dist/index.js";

// Scenario: OrchestratorAgent splits work across several specialist agents and
// sends each specialist private context tailored to its role.

const privateKey = process.env.PRIVATE_KEY;
const aesKey = process.env.AES_KEY;
const networkName = process.env.COTI_NETWORK ?? "mainnet";
const delegates = [
  ["SECURITY_AGENT_ADDRESS", "Review the design for secret leakage and privilege escalation."],
  ["LEGAL_AGENT_ADDRESS", "Review whether the proposed workflow creates compliance concerns."],
  ["ENGINEERING_AGENT_ADDRESS", "Review implementation complexity and integration risk."]
]
  .map(([envName, task]) => ({ envName, address: process.env[envName], task }))
  .filter((delegate) => delegate.address);

if (!privateKey || !aesKey) {
  throw new Error("Set PRIVATE_KEY and AES_KEY before running this example.");
}

if (delegates.length === 0) {
  throw new Error(
    "Set at least one delegate address: SECURITY_AGENT_ADDRESS, LEGAL_AGENT_ADDRESS, or ENGINEERING_AGENT_ADDRESS."
  );
}

const network =
  networkName.toLowerCase() === "testnet" ? CotiNetwork.Testnet : CotiNetwork.Mainnet;
const provider = new JsonRpcProvider(process.env.COTI_RPC_URL_OVERRIDE ?? getDefaultCotiRpcUrl(network));
const wallet = new Wallet(privateKey, provider);
wallet.setAesKey(aesKey);

const client = createPrivateMessagingClient({
  network,
  runner: wallet
});

const results = [];

for (const delegate of delegates) {
  const plaintext = [
    "Task: Specialist review for multi-agent coordination plan.",
    `Role-specific request: ${delegate.task}`,
    "Context: Keep intermediate critique private. Return blockers, caveats, and one recommended next step."
  ].join("\n");

  const result = await sendMessage(client, {
    to: delegate.address,
    plaintext
  });

  results.push({
    envName: delegate.envName,
    recipient: delegate.address,
    transactionHash: result.transactionHash,
    messageId: result.messageId?.toString()
  });
}

console.log(JSON.stringify({
  scenario: "multi-agent-delegation",
  selectedTool: "send_message",
  reason: "An orchestrator is delegating private subtasks to specialist agents.",
  sent: results
}, null, 2));
