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
    network: getValue("--network") ?? process.env.COTI_NETWORK ?? "mainnet",
    envPath: getValue("--env") ? path.resolve(process.cwd(), getValue("--env")) : ENV_PATH,
    skipGrant: args.has("--skip-grant")
  };
}

const options = parseArgs();
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
  skipGrant: options.skipGrant
});

console.log(JSON.stringify(
  {
    envPath,
    network: network === CotiNetwork.Mainnet ? "mainnet" : "testnet",
    walletAddress: wallet.address,
    generatedPrivateKey,
    requestedStarterGrant: Boolean(grantResult),
    starterGrantTransactionHash: grantResult?.transactionHash,
    generatedAesKey,
    nextCommand: "npx coti-private-messaging-send --to <recipient-address> --text \"hello from coti\"",
    verificationCommand: "npx coti-private-messaging-send-read-smoke"
  },
  null,
  2
));

if (generatedPrivateKey) {
  console.error("Generated a new wallet and wrote PRIVATE_KEY to .env. Back it up if this account will matter.");
}
