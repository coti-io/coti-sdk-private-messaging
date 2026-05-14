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
  listInbox
} from "../dist/index.js";

function validateRequiredEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Run `npm run init` for this receiver wallet setup, or set the receiver PRIVATE_KEY and AES_KEY manually."
    );
  }
}

function resolveNetwork() {
  return (process.env.COTI_NETWORK ?? "mainnet").toLowerCase() === "mainnet"
    ? CotiNetwork.Mainnet
    : CotiNetwork.Testnet;
}

function jsonStringify(value) {
  return JSON.stringify(
    value,
    (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry),
    2
  );
}

validateRequiredEnv(["PRIVATE_KEY", "AES_KEY"]);

const network = resolveNetwork();
const rpcUrl = process.env.COTI_RPC_URL_OVERRIDE ?? getDefaultCotiRpcUrl(network);
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
wallet.setAesKey(process.env.AES_KEY);

const client = createPrivateMessagingClient({
  network,
  runner: wallet
});

const limit = Number(process.env.INBOX_LIMIT ?? 10);
const inbox = await listInbox(client, {
  account: wallet.address,
  limit: Number.isFinite(limit) && limit > 0 ? limit : 10,
  decrypt: true
});

console.log(`receiver=${wallet.address}`);
console.log(`network=${process.env.COTI_NETWORK ?? "mainnet"}`);
console.log("inbox=");
console.log(jsonStringify(inbox));
