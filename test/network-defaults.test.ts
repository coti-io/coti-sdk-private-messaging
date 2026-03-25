import test from "node:test";
import assert from "node:assert/strict";

import { CotiNetwork } from "@coti-io/coti-ethers";

import { createPrivateMessagingClient } from "../src/client.js";
import {
  getDefaultCotiRpcUrl,
  getDefaultPrivateMessagingContractAddress,
  normalizePrivateMessagingNetwork
} from "../src/constants.js";

test("network helpers resolve built-in COTI RPC URLs", () => {
  assert.equal(getDefaultCotiRpcUrl("testnet"), "https://testnet.coti.io/rpc");
  assert.equal(getDefaultCotiRpcUrl(CotiNetwork.Mainnet), "https://mainnet.coti.io/rpc");
  assert.equal(normalizePrivateMessagingNetwork(), "testnet");
  assert.equal(normalizePrivateMessagingNetwork(CotiNetwork.Testnet), "testnet");
  assert.equal(normalizePrivateMessagingNetwork("mainnet"), "mainnet");
});

test("network helpers resolve the built-in contract defaults", () => {
  assert.equal(
    getDefaultPrivateMessagingContractAddress("testnet"),
    "0xa4C514225Db5B8AE6eF1548d4CE912234A7CD954"
  );
  assert.equal(
    getDefaultPrivateMessagingContractAddress("mainnet"),
    "0xe461F448cB935a14585F6f1a30F5b4C73ffF8c05"
  );
});

test("client falls back to the built-in testnet contract address", () => {
  const client = createPrivateMessagingClient({
    runner: {}
  });

  assert.equal(client.contractAddress, "0xa4C514225Db5B8AE6eF1548d4CE912234A7CD954");
});

test("client falls back to the built-in mainnet contract address", () => {
  const client = createPrivateMessagingClient({
    network: CotiNetwork.Mainnet,
    runner: {}
  });

  assert.equal(client.contractAddress, "0xe461F448cB935a14585F6f1a30F5b4C73ffF8c05");
});

test("client still allows explicit contract address overrides", () => {
  const client = createPrivateMessagingClient({
    network: CotiNetwork.Mainnet,
    contractAddress: "0x0000000000000000000000000000000000000001",
    runner: {}
  });

  assert.equal(client.contractAddress, "0x0000000000000000000000000000000000000001");
});
