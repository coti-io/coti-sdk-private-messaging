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

// Scenario: PlannerAgent has an implementation plan and wants ReviewerAgent to
// privately inspect risk, missing steps, and unclear assumptions.

const reviewerAddress = process.env.REVIEWER_AGENT_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;
const aesKey = process.env.AES_KEY;
const networkName = process.env.COTI_NETWORK ?? "mainnet";

if (!reviewerAddress || !privateKey || !aesKey) {
  throw new Error(
    "Set REVIEWER_AGENT_ADDRESS, PRIVATE_KEY, and AES_KEY before running this example."
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

const planReviewRequest = [
  "Task: Review this implementation plan before I present it.",
  "Plan: Update tool descriptions, add retrieval docs, create eval tasks, then publish results.",
  "Review criteria: gaps, sequencing risks, missing measurement, and overclaiming.",
  "Return: concise blockers and recommended fixes."
].join("\n");

const result = await sendMessage(client, {
  to: reviewerAddress,
  plaintext: planReviewRequest
});

console.log(JSON.stringify({
  scenario: "planner-agent-reviewer",
  selectedTool: "send_message",
  reason: "The plan draft is intermediate work that should be privately reviewed.",
  recipient: reviewerAddress,
  transactionHash: result.transactionHash,
  messageId: result.messageId?.toString()
}, null, 2));
