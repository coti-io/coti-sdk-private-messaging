function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function formatUserFacingError(error: unknown): string {
  const message = extractErrorMessage(error);

  const missingEnvMatch = message.match(/^Missing required environment variable: (\w+)$/);
  if (missingEnvMatch) {
    return `Server configuration is incomplete. Set \`${missingEnvMatch[1]}\` in the environment and restart the MCP server.`;
  }

  const missingFieldMatch = message.match(/^Expected non-empty string for "([^"]+)"\.$/);
  if (missingFieldMatch) {
    return `Missing required input \`${missingFieldMatch[1]}\`. Provide that field and try again.`;
  }

  const invalidFieldTypeMatch = message.match(
    /^Expected string, number, or bigint for "([^"]+)"\.$/
  );
  if (invalidFieldTypeMatch) {
    return `Invalid value for \`${invalidFieldTypeMatch[1]}\`. Use a string or numeric identifier and try again.`;
  }

  if (message.includes("Cannot send a private message to the sender address")) {
    return message;
  }

  if (message.includes("Cannot send a private message to the zero address")) {
    return message;
  }

  if (message.includes("Configured chunk size exceeds the safe encrypted message limit")) {
    return message;
  }

  if (message.includes("Message is too long for a single send")) {
    return message;
  }

  if (message.includes("Cannot claim rewards for an active or future epoch")) {
    return message;
  }

  if (message.includes("Rewards for this epoch were already claimed")) {
    return message;
  }

  if (message.includes("No rewards are available to claim")) {
    return message;
  }

  if (message.includes("Funding amount must be greater than zero")) {
    return message;
  }

  if (message.includes("Cannot fund a past epoch")) {
    return message;
  }

  if (message === "maxChunkBytes must be a positive integer.") {
    return "Invalid chunk size. `maxChunkBytes` must be a positive integer.";
  }

  if (message === "A single character exceeds the configured chunk size.") {
    return "The configured chunk size is too small for this message content. Increase `maxChunkBytes` and try again.";
  }

  if (message.includes("ChunkTooLarge()")) {
    return "The message chunk exceeds the contract's encrypted chunk limit. Reduce `maxChunkBytes` or shorten the message.";
  }

  if (message.includes("InvalidChunkCount()")) {
    return "The message is split into too many encrypted chunks for the contract to accept. Shorten the message.";
  }

  if (message.includes("ChunkOutOfBounds()")) {
    return "A requested message chunk index is out of bounds. Refresh the message metadata and try again.";
  }

  if (message === "Runner does not support string encryption.") {
    return "The configured wallet or runner cannot encrypt private messages. Use a COTI-compatible runner with encryption support.";
  }

  if (message === "Configured runner does not expose an address.") {
    return "The configured wallet or runner does not expose an address, so the SDK cannot determine the sender.";
  }

  if (message === "Configured runner does not support signMessage().") {
    return "The configured wallet or runner cannot sign messages, which is required for this operation.";
  }

  if (message === "Starter grant prompt did not contain enough numeric operands to solve.") {
    return "The starter-grant service returned an unexpected challenge format, so the SDK could not solve it automatically.";
  }

  if (message.includes("Starter grant service is not configured")) {
    return "Starter-grant support is not configured for this server.";
  }

  if (message.includes("Starter grant request failed with status 401")) {
    return "The starter-grant service rejected the request as unauthorized. Check the configured auth token.";
  }

  if (message.includes("Starter grant request failed with status 403")) {
    return "The starter-grant service rejected the request as forbidden. Verify the service configuration and permissions.";
  }

  if (message.includes("Starter grant request failed with status 404")) {
    return "The starter-grant service endpoint was not found. Check the configured service URL.";
  }

  if (message.includes("Starter grant request failed with status 409")) {
    return "The starter-grant request conflicts with existing grant state, such as an already claimed or pending grant.";
  }

  if (message.includes("aborted") || message.includes("This operation was aborted")) {
    return "The request timed out before the service responded. Try again or increase the configured timeout.";
  }

  if (message.includes("InvalidRecipient()")) {
    return "The contract rejected the recipient address with `InvalidRecipient()`. Make sure the destination is valid and is not the sender address.";
  }

  if (message.includes("MessageNotFound()")) {
    return "The requested message does not exist.";
  }

  if (message.includes("UnauthorizedViewer()")) {
    return "The configured wallet is not authorized to view or decrypt this message.";
  }

  if (message.includes("EpochStillActive()")) {
    return "The selected epoch is still active, so rewards cannot be claimed yet.";
  }

  if (message.includes("AlreadyClaimed()")) {
    return "Rewards for this epoch were already claimed by this wallet.";
  }

  if (message.includes("NothingToClaim()")) {
    return "There are no rewards available to claim for this epoch and wallet.";
  }

  if (message.includes("PastEpochFundingNotAllowed()")) {
    return "Funding a past epoch is not allowed. Choose the current or a future epoch.";
  }

  if (message.includes("ZeroValue()")) {
    return "The transaction amount must be greater than zero.";
  }

  if (message.includes("NativeTransferFailed()")) {
    return "The contract could not complete the native token transfer.";
  }

  if (message.includes("transaction execution reverted")) {
    return `The transaction was rejected on-chain. Details: ${message}`;
  }

  return message;
}

export function formatToolErrorResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: formatUserFacingError(error)
      }
    ],
    isError: true
  };
}
