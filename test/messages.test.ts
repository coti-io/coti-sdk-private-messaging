import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ENCRYPTED_MESSAGE_GAS_LIMIT,
  sendMessage
} from "../src/messages.js";

function buildStubClient() {
  const tx = {
    hash: "0xtx",
    wait: async () => ({
      hash: "0xtx",
      logs: []
    })
  };
  let sendMessageArgs: unknown[] | undefined;
  let sendMultipartMessageArgs: unknown[] | undefined;

  return {
    contractAddress: "0x0000000000000000000000000000000000000001",
    sendMessageSelector: "0x11111111",
    sendMultipartMessageSelector: "0x22222222",
    getAddress: async () => "0x0000000000000000000000000000000000000003",
    get sendMessageArgs() {
      return sendMessageArgs;
    },
    get sendMultipartMessageArgs() {
      return sendMultipartMessageArgs;
    },
    runner: {
      encryptString: async () => ({
        ciphertext: { value: [1n] },
        signature: [new Uint8Array([1])]
      })
    },
    contract: {
      MAX_CHUNKS_PER_MESSAGE: async () => 4,
      sendMessage: async (...args: unknown[]) => {
        sendMessageArgs = args;
        return { ...tx, args };
      },
      sendMultipartMessage: async (...args: unknown[]) => {
        sendMultipartMessageArgs = args;
        return { ...tx, args };
      }
    }
  };
}

test("sendMessage supplies the default gas limit for single-chunk sends", async () => {
  const client = buildStubClient() as any;

  const result = await sendMessage(client, {
    to: "0x0000000000000000000000000000000000000002",
    plaintext: "grant e2e test"
  });

  assert.equal(result.transactionHash, "0xtx");
  assert.equal(client.sendMessageArgs?.length, 3);
  assert.deepEqual(client.sendMessageArgs?.[2], {
    gasLimit: DEFAULT_ENCRYPTED_MESSAGE_GAS_LIMIT
  });
});

test("sendMessage supplies the default gas limit for multipart sends", async () => {
  const client = buildStubClient() as any;

  const result = await sendMessage(client, {
    to: "0x0000000000000000000000000000000000000002",
    plaintext: "abcdefghijklmnopqrstuvwxyz"
  });

  assert.equal(result.transactionHash, "0xtx");
  assert.equal(client.sendMultipartMessageArgs?.length, 3);
  assert.deepEqual(client.sendMultipartMessageArgs?.[2], {
    gasLimit: DEFAULT_ENCRYPTED_MESSAGE_GAS_LIMIT
  });
});

test("sendMessage preserves explicit gas limit overrides", async () => {
  const client = buildStubClient() as any;

  await sendMessage(client, {
    to: "0x0000000000000000000000000000000000000002",
    plaintext: "grant e2e test",
    gasLimit: 1234567n
  });

  assert.deepEqual(client.sendMessageArgs?.[2], {
    gasLimit: 1234567n
  });
});

test("sendMessage fails early for self-sends with a user-facing error", async () => {
  const client = buildStubClient() as any;

  await assert.rejects(
    sendMessage(client, {
      to: "0x0000000000000000000000000000000000000003",
      plaintext: "self send"
    }),
    /Cannot send a private message to the sender address/
  );

  assert.equal(client.sendMessageArgs, undefined);
  assert.equal(client.sendMultipartMessageArgs, undefined);
});

test("sendMessage fails early for zero-address recipients with a user-facing error", async () => {
  const client = buildStubClient() as any;

  await assert.rejects(
    sendMessage(client, {
      to: "0x0000000000000000000000000000000000000000",
      plaintext: "zero address send"
    }),
    /Cannot send a private message to the zero address/
  );

  assert.equal(client.sendMessageArgs, undefined);
  assert.equal(client.sendMultipartMessageArgs, undefined);
});

test("sendMessage rejects unsafe chunk size overrides before broadcast", async () => {
  const client = buildStubClient() as any;

  await assert.rejects(
    sendMessage(client, {
      to: "0x0000000000000000000000000000000000000002",
      plaintext: "unsafe chunk size",
      maxChunkBytes: 25
    }),
    /Configured chunk size exceeds the safe encrypted message limit/
  );

  assert.equal(client.sendMessageArgs, undefined);
  assert.equal(client.sendMultipartMessageArgs, undefined);
});

test("sendMessage rejects messages that exceed the contract chunk limit", async () => {
  const client = buildStubClient() as any;

  await assert.rejects(
    sendMessage(client, {
      to: "0x0000000000000000000000000000000000000002",
      plaintext: "abcde",
      maxChunkBytes: 1
    }),
    /Message is too long for a single send/
  );

  assert.equal(client.sendMessageArgs, undefined);
  assert.equal(client.sendMultipartMessageArgs, undefined);
});
