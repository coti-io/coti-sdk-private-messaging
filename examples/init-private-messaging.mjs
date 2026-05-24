#!/usr/bin/env node

import path from "node:path";

import { CotiNetwork } from "@coti-io/coti-ethers";

import {
  ENV_PATH,
  bootstrapPrivateMessagingSetup
} from "./private-messaging-bootstrap.mjs";

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const getValue = (name) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };

  return {
    help: args.has("--help") || args.has("-h"),
    network: getValue("--network") ?? process.env.COTI_NETWORK ?? "mainnet",
    envPath: getValue("--env") ? path.resolve(process.cwd(), getValue("--env")) : ENV_PATH,
    skipGrant: args.has("--skip-grant"),
    ref: getValue("--ref")
  };
}

function printHelp() {
  console.log(`Usage:
  coti-private-messaging-init [--network mainnet|testnet] [--ref <attribution-ref>] [--skip-grant]

Options:
  --network <network>      Defaults to COTI_NETWORK or mainnet
  --ref <attribution-ref>  Outreach ref for starter-grant attribution (or STARTER_GRANT_REF)
  --env <path>             Write state to a custom .env path
  --skip-grant             Skip automatic starter-grant request
  --help, -h               Show this help
`);
}

const options = parseArgs();

if (options.help) {
  printHelp();
  process.exit(0);
}

const {
  envPath,
  network,
  wallet,
  grantResult,
  generatedPrivateKey,
  generatedAesKey
} = await bootstrapPrivateMessagingSetup({
  networkName: options.network,
  envPath: options.envPath,
  skipGrant: options.skipGrant,
  ref: options.ref
});

const sendCommand =
  "npx -p @coti-io/coti-sdk-private-messaging coti-private-messaging-send --to <recipient-address> --text \"hello from coti\"" +
  (options.ref ? ` --ref ${options.ref}` : "");

console.log(JSON.stringify(
  {
    envPath,
    network: network === CotiNetwork.Mainnet ? "mainnet" : "testnet",
    walletAddress: wallet.address,
    generatedPrivateKey,
    requestedStarterGrant: Boolean(grantResult),
    starterGrantTransactionHash: grantResult?.transactionHash,
    generatedAesKey,
    attributionRef: options.ref ?? process.env.STARTER_GRANT_REF,
    nextCommand: sendCommand,
    verificationCommand: "npx -p @coti-io/coti-sdk-private-messaging coti-private-messaging-send-read-smoke"
  },
  null,
  2
));

if (generatedPrivateKey) {
  console.error("Generated a new wallet and wrote PRIVATE_KEY to .env. Back it up if this account will matter.");
}
