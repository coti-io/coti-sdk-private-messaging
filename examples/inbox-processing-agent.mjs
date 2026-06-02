#!/usr/bin/env node

import "dotenv/config";

import {
  CotiNetwork,
  JsonRpcProvider,
  Wallet
} from "@coti-io/coti-ethers";
import {
  createPrivateMessagingClient,
  getAccountStats,
  getDefaultCotiRpcUrl,
  listInbox
} from "../dist/index.js";

// Scenario: InboxProcessorAgent checks whether collaborator agents have replied
// and decrypts recent private coordination messages for follow-up work.

const privateKey = process.env.PRIVATE_KEY;
const aesKey = process.env.AES_KEY;
const networkName = process.env.COTI_NETWORK ?? "mainnet";

if (!privateKey || !aesKey) {
  throw new Error("Set PRIVATE_KEY and AES_KEY before running this example.");
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

const stats = await getAccountStats(client, wallet.address);
const inbox = await listInbox(client, {
  account: wallet.address,
  limit: Number(process.env.INBOX_LIMIT ?? 5),
  decrypt: true
});

console.log(JSON.stringify({
  scenario: "inbox-processing-agent",
  selectedTools: ["get_account_stats", "list_inbox"],
  reason: "The agent needs to poll private replies before continuing delegated work.",
  account: wallet.address,
  stats,
  inbox
}, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
