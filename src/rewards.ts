import type {
  ClaimRewardsRequest,
  ClaimRewardsResult,
  ContractConfig,
  EpochUsage,
  EpochSummary,
  FundEpochRequest
} from "./types.js";
import { PrivateMessagingClient } from "./client.js";

function normalizeEpoch(value: bigint | number | string): bigint {
  return BigInt(value);
}

function assertFundingAmountIsPositive(amountWei: bigint): void {
  if (amountWei <= 0n) {
    throw new Error("Funding amount must be greater than zero.");
  }
}

async function assertClaimRewardsRequestIsValid(
  client: PrivateMessagingClient,
  epoch: bigint
): Promise<void> {
  const agent = await client.getAddress();
  const [currentEpoch, usage] = await Promise.all([
    getCurrentEpoch(client),
    getEpochUsage(client, epoch, agent)
  ]);

  if (epoch >= currentEpoch) {
    throw new Error("Cannot claim rewards for an active or future epoch. Wait until the epoch is closed.");
  }

  if (usage.hasClaimed) {
    throw new Error("Rewards for this epoch were already claimed by the configured wallet.");
  }

  if (usage.pendingRewards <= 0n) {
    throw new Error("No rewards are available to claim for this epoch and wallet.");
  }
}

async function assertFundEpochRequestIsValid(
  client: PrivateMessagingClient,
  epoch: bigint,
  amountWei: bigint
): Promise<void> {
  assertFundingAmountIsPositive(amountWei);

  const currentEpoch = await getCurrentEpoch(client);
  if (epoch < currentEpoch) {
    throw new Error("Cannot fund a past epoch. Choose the current or a future epoch.");
  }
}

export async function getCurrentEpoch(client: PrivateMessagingClient): Promise<bigint> {
  return BigInt(await client.contract.currentEpoch());
}

export async function getEpochForTimestamp(
  client: PrivateMessagingClient,
  timestamp: bigint | number | string
): Promise<bigint> {
  return BigInt(await client.contract.epochForTimestamp(timestamp));
}

export async function getContractConfig(
  client: PrivateMessagingClient
): Promise<ContractConfig> {
  const [owner, epochDuration, genesisTimestamp, maxChunkCells, maxChunksPerMessage] =
    await Promise.all([
      client.contract.owner(),
      client.contract.epochDuration(),
      client.contract.genesisTimestamp(),
      client.contract.MAX_CHUNK_CELLS(),
      client.contract.MAX_CHUNKS_PER_MESSAGE()
    ]);

  return {
    owner,
    epochDuration: BigInt(epochDuration),
    genesisTimestamp: BigInt(genesisTimestamp),
    maxChunkCells: BigInt(maxChunkCells),
    maxChunksPerMessage: BigInt(maxChunksPerMessage)
  };
}

export async function getPendingRewards(
  client: PrivateMessagingClient,
  epoch: bigint | number | string,
  agent: string
): Promise<bigint> {
  return BigInt(await client.contract.pendingRewards(epoch, agent));
}

export async function getEpochUsage(
  client: PrivateMessagingClient,
  epoch: bigint | number | string,
  agent: string
): Promise<EpochUsage> {
  const [usageUnits, totalUsageUnits, hasClaimed, pendingRewards] = await Promise.all([
    client.contract.epochUsageUnits(epoch, agent),
    client.contract.epochTotalUsageUnits(epoch),
    client.contract.epochHasClaimed(epoch, agent),
    client.contract.pendingRewards(epoch, agent)
  ]);

  return {
    epoch: BigInt(epoch),
    agent,
    usageUnits: BigInt(usageUnits),
    totalUsageUnits: BigInt(totalUsageUnits),
    pendingRewards: BigInt(pendingRewards),
    hasClaimed
  };
}

export async function getEpochSummary(
  client: PrivateMessagingClient,
  epoch: bigint | number | string
): Promise<EpochSummary> {
  const [totalUsageUnits, rewardPool, claimedAmount, claimedUsageUnits] =
    await client.contract.getEpochSummary(epoch);

  return {
    totalUsageUnits: BigInt(totalUsageUnits),
    rewardPool: BigInt(rewardPool),
    claimedAmount: BigInt(claimedAmount),
    claimedUsageUnits: BigInt(claimedUsageUnits)
  };
}

export async function claimRewards(
  client: PrivateMessagingClient,
  request: ClaimRewardsRequest
): Promise<ClaimRewardsResult> {
  const epoch = normalizeEpoch(request.epoch);
  await assertClaimRewardsRequestIsValid(client, epoch);

  const callResult = await client.contract.claimRewards.staticCall(epoch);
  const tx = await client.contract.claimRewards(epoch);
  const receipt = await tx.wait();

  return {
    transactionHash: receipt.hash ?? tx.hash,
    amount: BigInt(callResult)
  };
}

export async function fundEpoch(
  client: PrivateMessagingClient,
  request: FundEpochRequest
): Promise<string> {
  const epoch = normalizeEpoch(request.epoch);
  await assertFundEpochRequestIsValid(client, epoch, request.amountWei);

  const tx = await client.contract.fundEpoch(epoch, {
    value: request.amountWei
  });
  const receipt = await tx.wait();

  return receipt.hash ?? tx.hash;
}
