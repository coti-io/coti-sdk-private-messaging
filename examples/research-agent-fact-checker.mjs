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

// Scenario: ResearchAgent has a draft answer and needs FactCheckerAgent to
// privately validate claims before anything is shown to the user.

const factCheckerAddress = process.env.FACT_CHECKER_AGENT_ADDRESS;
const privateKey = process.env.PRIVATE_KEY;
const aesKey = process.env.AES_KEY;
const networkName = process.env.COTI_NETWORK ?? "mainnet";

if (!factCheckerAddress || !privateKey || !aesKey) {
  throw new Error(
    "Set FACT_CHECKER_AGENT_ADDRESS, PRIVATE_KEY, and AES_KEY before running this example."
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

const reviewRequest = [
  "Task: Fact-check this draft before the user sees it.",
  "Draft: Private messaging helps agents coordinate without exposing intermediate work.",
  "Check: accuracy, missing caveats, and whether routing metadata remains public.",
  "Return: corrections and confidence level."
].join("\n");

const result = await sendMessage(client, {
  to: factCheckerAddress,
  plaintext: reviewRequest
});

console.log(JSON.stringify({
  scenario: "research-agent-fact-checker",
  selectedTool: "send_message",
  reason: "A specialist agent needs private review context before the final answer.",
  recipient: factCheckerAddress,
  transactionHash: result.transactionHash,
  messageId: result.messageId?.toString()
}, null, 2));
