import type {
  AccountStats,
  CtString,
  ListMessagesRequest,
  ListMessagesResult,
  MessageView,
  MessageMetadata,
  ReadMessageRequest,
  ReadMessageResult,
  SendMessageRequest,
  SendMessageResult
} from "./types.js";
import { PrivateMessagingClient } from "./client.js";

export const DEFAULT_MAX_MESSAGE_CHUNK_BYTES = 24;
export const DEFAULT_ENCRYPTED_MESSAGE_GAS_LIMIT = 8_000_000n;

function normalizeBigInt(
  value: bigint | number | string | undefined
): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }

  return BigInt(value);
}

function resolveMessageGasLimit(
  requestedGasLimit: bigint | number | string | undefined
): bigint {
  const gasLimit = normalizeBigInt(requestedGasLimit);
  return gasLimit ?? DEFAULT_ENCRYPTED_MESSAGE_GAS_LIMIT;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function assertRecipientIsValid(
  client: PrivateMessagingClient,
  recipient: string
): Promise<void> {
  const normalizedRecipient = normalizeAddress(recipient);
  if (normalizedRecipient === ZERO_ADDRESS) {
    throw new Error(
      "Cannot send a private message to the zero address. Choose a valid recipient address."
    );
  }

  const sender = await client.getAddress();
  if (normalizeAddress(sender) === normalizedRecipient) {
    throw new Error(
      "Cannot send a private message to the sender address. Choose a different recipient to avoid the contract's InvalidRecipient() revert."
    );
  }
}

function assertChunkSizeIsSafe(maxChunkBytes: number): void {
  if (maxChunkBytes > DEFAULT_MAX_MESSAGE_CHUNK_BYTES) {
    throw new Error(
      `Configured chunk size exceeds the safe encrypted message limit for COTI. Use maxChunkBytes <= ${DEFAULT_MAX_MESSAGE_CHUNK_BYTES}.`
    );
  }
}

async function assertChunkCountIsWithinLimit(
  client: PrivateMessagingClient,
  chunkCount: number
): Promise<void> {
  const maxChunksPerMessage = BigInt(await client.contract.MAX_CHUNKS_PER_MESSAGE());
  if (BigInt(chunkCount) > maxChunksPerMessage) {
    throw new Error(
      `Message is too long for a single send. The current contract allows at most ${maxChunksPerMessage.toString()} encrypted chunks per message.`
    );
  }
}

function asBigIntArray(values: readonly unknown[]): bigint[] {
  return values.map((value) => BigInt(value as string | number | bigint));
}

function normalizeMessageView(raw: any): MessageView {
  return {
    id: BigInt(raw.id),
    from: raw.from,
    to: raw.to,
    timestamp: BigInt(raw.timestamp),
    epoch: BigInt(raw.epoch),
    chunkCount: BigInt(raw.chunkCount ?? 1),
    ciphertext: {
      value: asBigIntArray(raw.ciphertext.value ?? [])
    }
  };
}

function normalizeMessageMetadata(raw: any): MessageMetadata {
  return {
    from: raw.from,
    to: raw.to,
    timestamp: BigInt(raw.timestamp),
    epoch: BigInt(raw.epoch)
  };
}

function normalizeCiphertext(raw: any): CtString {
  return {
    value: asBigIntArray(raw.value ?? [])
  };
}

function splitPlaintextIntoChunks(
  plaintext: string,
  maxChunkBytes: number = DEFAULT_MAX_MESSAGE_CHUNK_BYTES
): string[] {
  if (!Number.isInteger(maxChunkBytes) || maxChunkBytes <= 0) {
    throw new Error("maxChunkBytes must be a positive integer.");
  }

  const chunks: string[] = [];
  let currentChunk = "";
  let currentBytes = 0;

  for (const char of plaintext) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (charBytes > maxChunkBytes) {
      throw new Error("A single character exceeds the configured chunk size.");
    }

    if (currentBytes + charBytes > maxChunkBytes) {
      chunks.push(currentChunk);
      currentChunk = char;
      currentBytes = charBytes;
      continue;
    }

    currentChunk += char;
    currentBytes += charBytes;
  }

  if (currentChunk.length > 0 || chunks.length === 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function encryptChunkInput(
  client: PrivateMessagingClient,
  plaintext: string,
  functionSelector: string
) {
  if (typeof client.runner?.encryptString === "function") {
    return client.runner.encryptString(
      plaintext,
      client.contractAddress,
      functionSelector
    );
  }

  if (typeof client.runner?.encryptValue === "function") {
    return client.runner.encryptValue(
      plaintext,
      client.contractAddress,
      functionSelector
    );
  }

  throw new Error("Runner does not support string encryption.");
}

async function maybeDecryptMessage(
  client: PrivateMessagingClient,
  chunks: CtString[],
  decrypt: boolean
): Promise<string | undefined> {
  if (!decrypt) {
    return undefined;
  }

  if (typeof client.runner?.decryptString === "function") {
    const plaintextChunks = await Promise.all(
      chunks.map((chunk) => client.runner.decryptString(chunk))
    );
    return plaintextChunks.join("");
  }

  if (typeof client.runner?.decryptValue === "function") {
    const plaintextChunks = await Promise.all(
      chunks.map((chunk) => client.runner.decryptValue(chunk))
    );
    return plaintextChunks.join("");
  }

  return undefined;
}

function extractMessageId(client: PrivateMessagingClient, receipt: any): bigint | undefined {
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = client.contract.interface.parseLog(log);
      if (parsed?.name === "MessageSent") {
        return BigInt(parsed.args.messageId);
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function encryptMessageInput(
  client: PrivateMessagingClient,
  plaintext: string
) {
  return encryptChunkInput(client, plaintext, client.sendMessageSelector);
}

export async function sendMessage(
  client: PrivateMessagingClient,
  request: SendMessageRequest
): Promise<SendMessageResult> {
  await assertRecipientIsValid(client, request.to);

  const maxChunkBytes = request.maxChunkBytes ?? DEFAULT_MAX_MESSAGE_CHUNK_BYTES;
  assertChunkSizeIsSafe(maxChunkBytes);

  const plaintextChunks = splitPlaintextIntoChunks(
    request.plaintext,
    maxChunkBytes
  );
  await assertChunkCountIsWithinLimit(client, plaintextChunks.length);
  const functionSelector =
    plaintextChunks.length === 1
      ? client.sendMessageSelector
      : client.sendMultipartMessageSelector;

  const encryptedChunks = await Promise.all(
    plaintextChunks.map((chunk) => encryptChunkInput(client, chunk, functionSelector))
  );
  const txOverrides = {
    gasLimit: resolveMessageGasLimit(request.gasLimit)
  };

  let tx;
  if (encryptedChunks.length === 1) {
    tx =
      await client.contract.sendMessage(request.to, encryptedChunks[0], txOverrides);
  } else {
    tx =
      await client.contract.sendMultipartMessage(request.to, encryptedChunks, txOverrides);
  }
  const receipt = await tx.wait();

  return {
    transactionHash: receipt.hash ?? tx.hash,
    messageId: extractMessageId(client, receipt)
  };
}

export async function readMessage(
  client: PrivateMessagingClient,
  request: ReadMessageRequest
): Promise<ReadMessageResult> {
  const raw = await client.contract.getMessage(request.messageId);
  const message = normalizeMessageView(raw);
  const chunks: CtString[] = [message.ciphertext];

  for (let chunkIndex = 1; chunkIndex < Number(message.chunkCount); chunkIndex += 1) {
    const rawChunk = await client.contract.getMessageChunk(request.messageId, chunkIndex);
    chunks.push(normalizeCiphertext(rawChunk));
  }

  const plaintext = await maybeDecryptMessage(client, chunks, request.decrypt ?? true);

  return {
    message,
    chunks,
    plaintext
  };
}

export async function getMessageMetadata(
  client: PrivateMessagingClient,
  messageId: bigint | number | string
): Promise<MessageMetadata> {
  return normalizeMessageMetadata(await client.contract.getMessageMetadata(messageId));
}

async function listMessageIds(
  client: PrivateMessagingClient,
  direction: "getInboxPage" | "getSentPage",
  request: ListMessagesRequest
): Promise<bigint[]> {
  const rawIds = await client.contract[direction](
    request.account,
    request.offset ?? 0,
    request.limit ?? 20
  );

  return (rawIds as readonly unknown[]).map((value) => BigInt(value as string | number | bigint));
}

export async function listInbox(
  client: PrivateMessagingClient,
  request: ListMessagesRequest
): Promise<ListMessagesResult> {
  const ids = await listMessageIds(client, "getInboxPage", request);
  if (request.decrypt === false) {
    return { ids };
  }

  const messages = await Promise.all(ids.map((messageId) => readMessage(client, { messageId })));
  return { ids, messages };
}

export async function getAccountStats(
  client: PrivateMessagingClient,
  account: string
): Promise<AccountStats> {
  const [inboxCount, sentCount] = await Promise.all([
    client.contract.inboxCount(account),
    client.contract.sentCount(account)
  ]);

  return {
    account,
    inboxCount: BigInt(inboxCount),
    sentCount: BigInt(sentCount)
  };
}

export async function listSent(
  client: PrivateMessagingClient,
  request: ListMessagesRequest
): Promise<ListMessagesResult> {
  const ids = await listMessageIds(client, "getSentPage", request);
  if (request.decrypt === false) {
    return { ids };
  }

  const messages = await Promise.all(ids.map((messageId) => readMessage(client, { messageId })));
  return { ids, messages };
}
