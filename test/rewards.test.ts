import test from "node:test";
import assert from "node:assert/strict";

import { claimRewards, fundEpoch, getContractConfig } from "../src/rewards.js";

function buildRewardsClient(options?: {
  currentEpoch?: bigint;
  hasClaimed?: boolean;
  pendingRewards?: bigint;
}) {
  let claimRewardsArgs: unknown[] | undefined;
  let fundEpochArgs: unknown[] | undefined;

  const tx = {
    hash: "0xtx",
    wait: async () => ({
      hash: "0xtx"
    })
  };

  const claimRewardsFn = Object.assign(
    async (...args: unknown[]) => {
      claimRewardsArgs = args;
      return tx;
    },
    {
      staticCall: async () => options?.pendingRewards ?? 50n
    }
  );

  return {
    getAddress: async () => "0x0000000000000000000000000000000000000004",
    get claimRewardsArgs() {
      return claimRewardsArgs;
    },
    get fundEpochArgs() {
      return fundEpochArgs;
    },
    contract: {
      currentEpoch: async () => options?.currentEpoch ?? 5n,
      epochUsageUnits: async () => 1n,
      epochTotalUsageUnits: async () => 10n,
      epochHasClaimed: async () => options?.hasClaimed ?? false,
      pendingRewards: async () => options?.pendingRewards ?? 50n,
      claimRewards: claimRewardsFn,
      fundEpoch: async (...args: unknown[]) => {
        fundEpochArgs = args;
        return tx;
      }
    }
  };
}

test("claimRewards rejects active or future epochs before sending", async () => {
  const client = buildRewardsClient({ currentEpoch: 5n }) as any;

  await assert.rejects(
    claimRewards(client, { epoch: 5n }),
    /Cannot claim rewards for an active or future epoch/
  );

  assert.equal(client.claimRewardsArgs, undefined);
});

test("claimRewards rejects epochs already claimed by the wallet", async () => {
  const client = buildRewardsClient({ currentEpoch: 5n, hasClaimed: true }) as any;

  await assert.rejects(
    claimRewards(client, { epoch: 4n }),
    /Rewards for this epoch were already claimed/
  );

  assert.equal(client.claimRewardsArgs, undefined);
});

test("claimRewards rejects when there is nothing to claim", async () => {
  const client = buildRewardsClient({ currentEpoch: 5n, pendingRewards: 0n }) as any;

  await assert.rejects(
    claimRewards(client, { epoch: 4n }),
    /No rewards are available to claim/
  );

  assert.equal(client.claimRewardsArgs, undefined);
});

test("claimRewards sends the transaction after passing preflight checks", async () => {
  const client = buildRewardsClient({ currentEpoch: 5n, pendingRewards: 50n }) as any;

  const result = await claimRewards(client, { epoch: 4n });

  assert.equal(result.transactionHash, "0xtx");
  assert.equal(result.amount, 50n);
  assert.deepEqual(client.claimRewardsArgs, [4n]);
});

test("fundEpoch rejects zero-value funding before sending", async () => {
  const client = buildRewardsClient({ currentEpoch: 5n }) as any;

  await assert.rejects(fundEpoch(client, { epoch: 5n, amountWei: 0n }), /greater than zero/);

  assert.equal(client.fundEpochArgs, undefined);
});

test("fundEpoch rejects past epochs before sending", async () => {
  const client = buildRewardsClient({ currentEpoch: 5n }) as any;

  await assert.rejects(
    fundEpoch(client, { epoch: 4n, amountWei: 1n }),
    /Cannot fund a past epoch/
  );

  assert.equal(client.fundEpochArgs, undefined);
});

test("fundEpoch sends value for the current epoch after passing preflight checks", async () => {
  const client = buildRewardsClient({ currentEpoch: 5n }) as any;

  const txHash = await fundEpoch(client, { epoch: 5n, amountWei: 123n });

  assert.equal(txHash, "0xtx");
  assert.deepEqual(client.fundEpochArgs, [5n, { value: 123n }]);
});

test("getContractConfig reads epoch and chunk settings", async () => {
  const client = {
    contract: {
      epochDuration: async () => 1209600n,
      genesisTimestamp: async () => 1735689600n,
      MAX_CHUNK_CELLS: async () => 24n,
      MAX_CHUNKS_PER_MESSAGE: async () => 16n
    }
  } as any;

  const config = await getContractConfig(client);

  assert.deepEqual(config, {
    epochDuration: 1209600n,
    genesisTimestamp: 1735689600n,
    maxChunkCells: 24n,
    maxChunksPerMessage: 16n
  });
});
