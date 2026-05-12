import "dotenv/config";

import {
  CotiNetwork,
  JsonRpcProvider,
  Wallet
} from "@coti-io/coti-ethers";
import {
  createPrivateMessagingClient,
  getDefaultCotiRpcUrl,
  listSent,
  readMessage,
  sendMessage
} from "../dist/index.js";

const DEFAULT_RECIPIENT_ADDRESS = "0x000000000000000000000000000000000000c0a1";

function requiredEnv(name) {
  return process.env[name];
}

function validateRequiredEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill PRIVATE_KEY and AES_KEY. COTI_NETWORK defaults to testnet; RECIPIENT_ADDRESS is optional."
    );
  }
}

function resolveNetwork() {
  return (process.env.COTI_NETWORK ?? "testnet").toLowerCase() === "mainnet"
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

const network = resolveNetwork();
const rpcUrl = process.env.COTI_RPC_URL_OVERRIDE ?? getDefaultCotiRpcUrl(network);
validateRequiredEnv(["PRIVATE_KEY", "AES_KEY"]);
const privateKey = requiredEnv("PRIVATE_KEY");
const aesKey = requiredEnv("AES_KEY");
const recipient = process.env.RECIPIENT_ADDRESS ?? DEFAULT_RECIPIENT_ADDRESS;
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
wallet.setAesKey(aesKey);

const client = createPrivateMessagingClient({
  network,
  runner: wallet
});

const plaintext =
  process.env.SMOKE_MESSAGE_TEXT ??
  `COTI private messaging smoke test ${new Date().toISOString()}`;

console.log(`sender=${wallet.address}`);
console.log(`recipient=${recipient}`);
console.log(`network=${process.env.COTI_NETWORK ?? "testnet"}`);

const sent = await sendMessage(client, {
  to: recipient,
  plaintext
});

console.log("send_result=");
console.log(jsonStringify(sent));

const sentPage = await listSent(client, {
  account: wallet.address,
  limit: 5,
  decrypt: false
});

console.log("sent_page=");
console.log(jsonStringify(sentPage));

if (sent.messageId !== undefined) {
  const readBack = await readMessage(client, {
    messageId: sent.messageId,
    decrypt: true
  });

  console.log("read_back=");
  console.log(jsonStringify({
    messageId: sent.messageId,
    plaintext: readBack.plaintext,
    from: readBack.message.from,
    to: readBack.message.to,
    epoch: readBack.message.epoch
  }));
} else {
  console.log("messageId was not found in the receipt; use list_sent or transaction logs to locate it.");
}
