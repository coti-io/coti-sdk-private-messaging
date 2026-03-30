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
