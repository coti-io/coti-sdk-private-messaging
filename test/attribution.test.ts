import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { Wallet } from "@coti-io/coti-ethers";

import { recordPrivateMessageAttribution } from "../src/attribution.js";

test("recordPrivateMessageAttribution posts private_message_received and skill_usage", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "attribution-sdk-"));
  const wallet = Wallet.createRandom();
  const requests: Array<{ body: Record<string, unknown> }> = [];

  try {
    await recordPrivateMessageAttribution(
      {
        url: "https://attribution.test/grant",
        timeoutMs: 5_000,
        installIdPath: path.join(tempDir, "install-state.json"),
        ref: "mo_TEST123"
      },
      {
        walletAddress: wallet.address,
        recipient: "0x000000000000000000000000000000000000c0a1",
        transactionHash: "0xabc",
        messageId: "1"
      },
      async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        requests.push({ body });
        return new Response(JSON.stringify({ ok: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" }
        });
      }
    );

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.body.ref, "mo_TEST123");
    assert.equal(requests[0]?.body.type, "private_message_received");
    assert.equal(requests[0]?.body.walletAddress, wallet.address);
    assert.equal(requests[1]?.body.type, "skill_usage");
    assert.equal(requests[1]?.body.skillId, "private-message-send");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("recordPrivateMessageAttribution is a no-op when no ref is available", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "attribution-sdk-empty-"));
  let called = false;

  try {
    await recordPrivateMessageAttribution(
      {
        url: "https://attribution.test/grant",
        timeoutMs: 5_000,
        installIdPath: path.join(tempDir, "install-state.json")
      },
      {
        walletAddress: Wallet.createRandom().address,
        recipient: "0x000000000000000000000000000000000000c0a1",
        transactionHash: "0xabc",
        messageId: "1"
      },
      async () => {
        called = true;
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }
    );

    assert.equal(called, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
