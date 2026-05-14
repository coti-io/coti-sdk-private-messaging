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
import {
  bootstrapPrivateMessagingSetup
} from "./private-messaging-bootstrap.mjs";

function parseArgs() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv);
  const getValue = (name) => {
    const index = argv.indexOf(name);
    if (index === -1 || index === argv.length - 1) {
      return undefined;
    }
    return argv[index + 1];
  };

  return {
    help: flags.has("--help") || flags.has("-h"),
    init: flags.has("--init"),
    skipGrant: flags.has("--skip-grant"),
    to: getValue("--to"),
    text: getValue("--text"),
    gasLimit: getValue("--gas-limit"),
    maxChunkBytes: getValue("--max-chunk-bytes"),
    network: getValue("--network") ?? process.env.COTI_NETWORK ?? "mainnet"
  };
}

function printHelp() {
  console.log(`Usage:
  coti-private-messaging-send --to <wallet-address> --text "hello from COTI" [--init] [--network mainnet|testnet]

Options:
  --to <address>           Recipient wallet address
  --text <plaintext>       Plaintext message to encrypt and send
  --init                   Create or recover wallet/AES state before sending
  --skip-grant             With --init, skip automatic starter-grant request
  --network <network>      Defaults to COTI_NETWORK or mainnet
  --gas-limit <number>     Optional gas limit override
  --max-chunk-bytes <n>    Optional plaintext chunk size override
  --help, -h               Show this help
`);
}

function validateRequiredEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Run `npx coti-private-messaging-init` first, or add `--init` to this send command."
    );
  }
}

function resolveNetwork(value) {
  return value.toLowerCase() === "mainnet" ? CotiNetwork.Mainnet : CotiNetwork.Testnet;
}

function parseOptionalBigInt(value, flagName) {
  if (value === undefined) {
    return undefined;
  }

  try {
    return BigInt(value);
  } catch {
    throw new Error(`${flagName} must be an integer value.`);
  }
}

function parseOptionalNumber(value, flagName) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

function jsonStringify(value) {
  return JSON.stringify(
    value,
    (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry),
    2
  );
}

const options = parseArgs();

if (options.help) {
  printHelp();
  process.exit(0);
}

if (!options.to || !options.text) {
  printHelp();
  throw new Error("Both --to and --text are required.");
}

const network = resolveNetwork(options.network);
let wallet;
let client;
let bootstrapResult;

if (options.init) {
  bootstrapResult = await bootstrapPrivateMessagingSetup({
    networkName: options.network,
    skipGrant: options.skipGrant
  });
  wallet = bootstrapResult.wallet;
  client = bootstrapResult.client;
} else {
  validateRequiredEnv(["PRIVATE_KEY", "AES_KEY"]);
  const rpcUrl = process.env.COTI_RPC_URL_OVERRIDE ?? getDefaultCotiRpcUrl(network);
  const provider = new JsonRpcProvider(rpcUrl);
  wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  wallet.setAesKey(process.env.AES_KEY);
  client = createPrivateMessagingClient({
    network,
    runner: wallet
  });
}

const result = await sendMessage(client, {
  to: options.to,
  plaintext: options.text,
  gasLimit: parseOptionalBigInt(options.gasLimit, "--gas-limit"),
  maxChunkBytes: parseOptionalNumber(options.maxChunkBytes, "--max-chunk-bytes")
});

console.log(jsonStringify({
  network: network === CotiNetwork.Mainnet ? "mainnet" : "testnet",
  sender: wallet.address,
  recipient: options.to,
  plaintextPreview: options.text,
  initCompleted: Boolean(options.init),
  generatedPrivateKey: bootstrapResult?.generatedPrivateKey,
  generatedAesKey: bootstrapResult?.generatedAesKey,
  starterGrantTransactionHash: bootstrapResult?.grantResult?.transactionHash,
  transactionHash: result.transactionHash,
  messageId: result.messageId
}));
