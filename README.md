# COTI SDK Private Messaging

TypeScript client for `PrivateMessaging`.

## Features

- Encrypt message bodies with a COTI-capable signer or wallet.
- Send private messages to public recipient addresses.
- Automatically split long plaintext into multipart encrypted chunks.
- Page through inbox and sent messages.
- Read viewer-specific ciphertext and decrypt it client-side.
- Check and claim biweekly rewards.
- Request, inspect, or submit a one-time starter COTI claim.
- Expose JSON-safe MCP-style tool definitions and a tool dispatcher.

## Example

For a copy-paste operator path, use the [Private Messaging Quickstart](https://github.com/coti-io/documentation/blob/main/private-messaging/quickstart.md) in the docs repo. This README is the SDK reference.

For zero-prereq setup, initialize local `.env` first:

```bash
npx coti-private-messaging-init
npx coti-private-messaging-send-read-smoke
```

From this SDK repository checkout:

```bash
npm run init
npm run smoke:send-read
```

The init command fills missing `PRIVATE_KEY` and `AES_KEY`, requests a starter grant when the generated wallet has no gas, defaults to mainnet, and leaves existing env values untouched.

Install:

```bash
npm install @coti-io/coti-sdk-private-messaging @coti-io/coti-ethers
```

```ts
import { Wallet, JsonRpcProvider, CotiNetwork } from "@coti-io/coti-ethers";
import {
  getDefaultCotiRpcUrl,
  createPrivateMessagingClient,
  sendMessage,
  listInbox,
  claimRewards
} from "@coti-io/coti-sdk-private-messaging";

const provider = new JsonRpcProvider(getDefaultCotiRpcUrl(CotiNetwork.Testnet));
const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);
wallet.setAesKey(process.env.AES_KEY!);

const client = createPrivateMessagingClient({
  network: CotiNetwork.Testnet,
  runner: wallet
});

await sendMessage(client, {
  to: "0xRecipient",
  plaintext: "hello from coti"
});

const inbox = await listInbox(client, {
  account: wallet.address
});

const claim = await claimRewards(client, {
  epoch: 0n
});
```

Longer plaintext is chunked automatically. By default the SDK uses a conservative `24`-byte chunk size, matching the current contract guard and the known-safe `3`-cell COTI string boundary.

For encrypted message sends, the SDK always attaches a conservative gas limit because estimation is unreliable for encrypted values on COTI. You can still override it when needed:

```ts
await sendMessage(client, {
  to: "0xRecipient",
  plaintext: "very long message ...",
  gasLimit: 8_000_000n
});
```

## Additional Read APIs

The SDK also exposes the contract inspection helpers agents typically need:

- `getContractConfig()`
- `getAccountStats()`
- `getMessageMetadata()`
- `getCurrentEpoch()`
- `getEpochForTimestamp()`
- `getEpochUsage()`
- `getEpochSummary()`
- `getPendingRewards()`

## MCP-Style Tool Surface

```ts
import {
  PRIVATE_MESSAGING_MCP_TOOLS,
  invokePrivateMessagingTool
} from "@coti-io/coti-sdk-private-messaging";

const tools = PRIVATE_MESSAGING_MCP_TOOLS;

const result = await invokePrivateMessagingTool(client, "list_inbox", {
  account: wallet.address,
  limit: 10,
  decrypt: true
});
```

`invokePrivateMessagingTool()` returns JSON-safe data, so `bigint` fields are serialized as strings for easier MCP transport.

The MCP tool registry includes:

- `send_message`
- `read_message`
- `list_inbox`
- `list_sent`
- `get_contract_config`
- `get_account_stats`
- `get_message_metadata`
- `get_current_epoch`
- `get_epoch_for_timestamp`
- `get_epoch_usage`
- `get_pending_rewards`
- `get_epoch_summary`
- `claim_rewards`
- `fund_epoch`
- `get_starter_grant_challenge`
- `claim_starter_grant`

## MCP Server

The package also ships a stdio MCP server entrypoint.

If the SDK is installed in your project, run the package binary:

```bash
npx coti-sdk-private-messaging-mcp
```

If you are working from this SDK repository checkout, build first and then run the local server:

```bash
npm run build
npm run start:mcp
```

Required environment variables:

- `PRIVATE_KEY`
- `AES_KEY`

Optional overrides:

- `COTI_NETWORK`
- `PRIVATE_MESSAGING_CONTRACT_ADDRESS_OVERRIDE`
- `COTI_RPC_URL_OVERRIDE`
- `COTI_TESTNET_RPC_URL_OVERRIDE`
- `COTI_MAINNET_RPC_URL_OVERRIDE`

Optional starter-grant service config overrides:

- `STARTER_GRANT_SERVICE_URL`
- `STARTER_GRANT_SERVICE_TIMEOUT_MS`
- `STARTER_GRANT_SERVICE_AUTH_TOKEN`
- `STARTER_GRANT_INSTALL_ID_PATH`

Copy `.env.example` to `.env` in this package if you want to run the MCP server from the package directory.

## Send/read smoke test

From an installed project, run init once, then run the smoke test:

```bash
npx coti-private-messaging-init
npx coti-private-messaging-send-read-smoke
```

From this SDK repository checkout:

```bash
npm run init
npm run smoke:send-read
```

This sends a short private message, lists the sender's sent-message page, and reads the message back when the transaction receipt exposes `messageId`. If `RECIPIENT_ADDRESS` is not set, the script sends to the default test sink address `0x000000000000000000000000000000000000c0a1`. Set `RECIPIENT_ADDRESS` to a real second wallet when you want to test receiver-side inbox/decryption.

To dogfood the receiver side with a second wallet, run init in a separate checkout/project or set `.env` to the receiver wallet's `PRIVATE_KEY` and `AES_KEY`, then run:

```bash
npm run smoke:read-inbox
```

From an installed project:

```bash
npx coti-private-messaging-read-inbox-smoke
```

This lists the receiver inbox and attempts to decrypt messages with the receiver wallet.

## Default Network Config

The SDK ships with built-in defaults for both COTI RPC URLs and the private messaging contract address resolution:

- Testnet RPC: `https://testnet.coti.io/rpc`
- Mainnet RPC: `https://mainnet.coti.io/rpc`
- Testnet contract: `0xa4C514225Db5B8AE6eF1548d4CE912234A7CD954`
- Mainnet contract: `0xe461F448cB935a14585F6f1a30F5b4C73ffF8c05`

If you use `createPrivateMessagingClient()` without `contractAddress`, the SDK resolves the address from `network` and defaults to mainnet. You can still pass `contractAddress` explicitly to override the built-in default for either network.

The MCP server exposes these starter-grant tools by default, pointing at the deployed service unless you override it with `STARTER_GRANT_SERVICE_URL`:

- `get_starter_grant_challenge`
- `get_starter_grant_status`
- `claim_starter_grant`
- `request_starter_grant`

The starter-grant flow now supports three patterns: request a challenge directly, inspect current claim status, or use the single-call `request_starter_grant` helper for the current trivial prompt flow. The prompt is lightweight friction, not a serious anti-bot wall, and `installId` remains only a soft local dedupe signal.

The SDK-level starter-grant helpers also default to the deployed service, so `url` is optional unless you want to override it:

```ts
import { requestStarterGrant } from "@coti-io/coti-sdk-private-messaging";

const result = await requestStarterGrant(client, {
  timeoutMs: 15000
});
```

## ABI Source

The SDK ships a vendored ABI snapshot in `src/abi.ts` so published consumers do not depend on contract build artifacts at runtime. Maintainers can refresh it with:

```bash
npm run sync:abi
```

By default the sync script reads `./abi/PrivateMessaging.json` when that file exists in this repository. Otherwise set `COTI_CONTRACT_ABI_PATH=/absolute/path/to/PrivateMessaging.json`.
