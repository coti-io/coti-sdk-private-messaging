import { CotiNetwork } from "@coti-io/coti-ethers";

export type PrivateMessagingNetwork = "testnet" | "mainnet";

export const COTI_RPC_URLS: Record<PrivateMessagingNetwork, string> = {
  testnet: "https://testnet.coti.io/rpc",
  mainnet: "https://mainnet.coti.io/rpc"
};

export const PRIVATE_MESSAGING_CONTRACT_ADDRESSES: Record<PrivateMessagingNetwork, string> = {
  testnet: "0xa4C514225Db5B8AE6eF1548d4CE912234A7CD954",
  mainnet: "0xe461F448cB935a14585F6f1a30F5b4C73ffF8c05"
};

export function normalizePrivateMessagingNetwork(
  network?: PrivateMessagingNetwork | CotiNetwork
): PrivateMessagingNetwork {
  if (network === CotiNetwork.Mainnet || network === "mainnet") {
    return "mainnet";
  }

  return "testnet";
}

export function getDefaultCotiRpcUrl(
  network?: PrivateMessagingNetwork | CotiNetwork
): string {
  return COTI_RPC_URLS[normalizePrivateMessagingNetwork(network)];
}

export function getDefaultPrivateMessagingContractAddress(
  network?: PrivateMessagingNetwork | CotiNetwork
): string {
  const resolvedNetwork = normalizePrivateMessagingNetwork(network);
  const address = PRIVATE_MESSAGING_CONTRACT_ADDRESSES[resolvedNetwork];

  if (!address) {
    throw new Error(
      `PrivateMessaging contract address is not configured for ${resolvedNetwork} yet. Pass contractAddress explicitly until deployment is live.`
    );
  }

  return address;
}
