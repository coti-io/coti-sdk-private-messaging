#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CotiNetwork,
  JsonRpcProvider,
  Wallet
} from "@coti-io/coti-ethers";
import {
  createPrivateMessagingClient,
  getDefaultCotiRpcUrl,
  requestStarterGrant
} from "../dist/index.js";

const ENV_PATH = path.resolve(process.cwd(), ".env");

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const getValue = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };

  return {
    network: getValue("--network") ?? process.env.COTI_NETWORK ?? "mainnet",
    envPath: getValue("--env") ? path.resolve(process.cwd(), getValue("--env")) : ENV_PATH,
    skipGrant: args.has("--skip-grant")
  };
}

function resolveNetwork(value) {
  return value.toLowerCase() === "mainnet" ? CotiNetwork.Mainnet : CotiNetwork.Testnet;
}

async function readEnvFile(envPath) {
  if (!existsSync(envPath)) {
    return { values: {}, lines: [] };
  }

  const raw = await readFile(envPath, "utf8");
  const values = {};
  const lines = raw.split(/\r?\n/u);
  for (const line of raw.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) {
      continue;
    }
    values[match[1]] = match[2];
  }
  return { values, lines };
}

async function writeEnvFile(envPath, current, updates) {
  const writtenKeys = new Set();
  const lines = current.lines
    .filter((line, index) => line.length > 0 || index < current.lines.length - 1)
    .map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
      if (!match || !(match[1] in updates)) {
        return line;
      }
      writtenKeys.add(match[1]);
      return `${match[1]}=${updates[match[1]] ?? ""}`;
    });

  for (const [key, value] of Object.entries(updates)) {
    if (!writtenKeys.has(key)) {
      lines.push(`${key}=${value ?? ""}`);
    }
  }

  await writeFile(envPath, `${lines.join("\n")}\n`, "utf8");
}

async function getBalance(provider, address) {
  const balance = await provider.getBalance(address);
  return typeof balance === "bigint" ? balance : BigInt(balance.toString());
}

async function waitForGrant(provider, transactionHash) {
  if (!transactionHash || typeof provider.waitForTransaction !== "function") {
    return;
  }
  await provider.waitForTransaction(transactionHash, 1, 60_000).catch(() => undefined);
}

const options = parseArgs();
const network = resolveNetwork(options.network);
const currentEnv = await readEnvFile(options.envPath);
const updates = {};

let privateKey = currentEnv.values.PRIVATE_KEY || process.env.PRIVATE_KEY;
let generatedPrivateKey = false;
if (!privateKey) {
  privateKey = Wallet.createRandom().privateKey;
  updates.PRIVATE_KEY = privateKey;
  generatedPrivateKey = true;
}

updates.COTI_NETWORK = currentEnv.values.COTI_NETWORK || process.env.COTI_NETWORK || options.network;

const rpcUrl =
  currentEnv.values.COTI_RPC_URL_OVERRIDE ||
  process.env.COTI_RPC_URL_OVERRIDE ||
  getDefaultCotiRpcUrl(network);
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const existingAesKey = currentEnv.values.AES_KEY || process.env.AES_KEY;
if (existingAesKey) {
  wallet.setAesKey(existingAesKey);
}

const client = createPrivateMessagingClient({
  network,
  runner: wallet
});

let grantResult;
const initialBalance = await getBalance(provider, wallet.address);
if (initialBalance === 0n && !options.skipGrant) {
  grantResult = await requestStarterGrant(client, {
    url: currentEnv.values.STARTER_GRANT_SERVICE_URL || process.env.STARTER_GRANT_SERVICE_URL,
    authToken: currentEnv.values.STARTER_GRANT_SERVICE_AUTH_TOKEN || process.env.STARTER_GRANT_SERVICE_AUTH_TOKEN,
    timeoutMs: Number(currentEnv.values.STARTER_GRANT_SERVICE_TIMEOUT_MS || process.env.STARTER_GRANT_SERVICE_TIMEOUT_MS) || undefined,
    installIdPath: currentEnv.values.STARTER_GRANT_INSTALL_ID_PATH || process.env.STARTER_GRANT_INSTALL_ID_PATH
  });
  await waitForGrant(provider, grantResult.transactionHash);
}

let generatedAesKey = false;
if (!existingAesKey) {
  await wallet.generateOrRecoverAes();
  const aesKey = wallet.getUserOnboardInfo()?.aesKey;
  if (!aesKey) {
    throw new Error("Onboarding completed but no AES key was available on the wallet.");
  }
  updates.AES_KEY = aesKey;
  generatedAesKey = true;
}

await writeEnvFile(options.envPath, currentEnv, updates);

console.log(JSON.stringify(
  {
    envPath: options.envPath,
    network: network === CotiNetwork.Mainnet ? "mainnet" : "testnet",
    walletAddress: wallet.address,
    generatedPrivateKey,
    requestedStarterGrant: Boolean(grantResult),
    starterGrantTransactionHash: grantResult?.transactionHash,
    generatedAesKey,
    nextCommand: "npm run smoke:send-read"
  },
  null,
  2
));

if (generatedPrivateKey) {
  console.error("Generated a new wallet and wrote PRIVATE_KEY to .env. Back it up if this account will matter.");
}
