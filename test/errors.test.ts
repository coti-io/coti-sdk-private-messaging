import test from "node:test";
import assert from "node:assert/strict";

import { formatToolErrorResult, formatUserFacingError } from "../src/errors.js";

test("formatUserFacingError explains self-send failures clearly", () => {
  assert.equal(
    formatUserFacingError(
      new Error(
        "Cannot send a private message to the sender address. Choose a different recipient to avoid the contract's InvalidRecipient() revert."
      )
    ),
    "Cannot send a private message to the sender address. Choose a different recipient to avoid the contract's InvalidRecipient() revert."
  );
});

test("formatUserFacingError explains zero-address failures clearly", () => {
  assert.equal(
    formatUserFacingError(
      new Error(
        "Cannot send a private message to the zero address. Choose a valid recipient address."
      )
    ),
    "Cannot send a private message to the zero address. Choose a valid recipient address."
  );
});

test("formatUserFacingError translates missing required input fields", () => {
  assert.equal(
    formatUserFacingError(new Error('Expected non-empty string for "to".')),
    "Missing required input `to`. Provide that field and try again."
  );
});

test("formatUserFacingError translates common contract revert names", () => {
  assert.equal(
    formatUserFacingError(new Error("execution reverted: MessageNotFound()")),
    "The requested message does not exist."
  );
  assert.equal(
    formatUserFacingError(new Error("execution reverted: UnauthorizedViewer()")),
    "The configured wallet is not authorized to view or decrypt this message."
  );
  assert.equal(
    formatUserFacingError(new Error("execution reverted: NothingToClaim()")),
    "There are no rewards available to claim for this epoch and wallet."
  );
  assert.equal(
    formatUserFacingError(new Error("execution reverted: AlreadyClaimed()")),
    "Rewards for this epoch were already claimed by this wallet."
  );
  assert.equal(
    formatUserFacingError(new Error("execution reverted: ZeroValue()")),
    "The transaction amount must be greater than zero."
  );
});

test("formatToolErrorResult returns MCP-friendly error payloads", () => {
  const result = formatToolErrorResult(
    new Error("Missing required environment variable: PRIVATE_KEY")
  );

  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [
    {
      type: "text",
      text: "Server configuration is incomplete. Set `PRIVATE_KEY` in the environment and restart the MCP server."
    }
  ]);
});
