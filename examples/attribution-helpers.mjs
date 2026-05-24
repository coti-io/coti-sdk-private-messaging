import {
  recordPrivateMessageAttribution,
  resolveAttributionRefForInstall
} from "../dist/index.js";

export { recordPrivateMessageAttribution, resolveAttributionRefForInstall };

export function resolveStarterGrantConfig(currentEnv, overrides = {}) {
  return {
    url: overrides.url ?? currentEnv?.STARTER_GRANT_SERVICE_URL ?? process.env.STARTER_GRANT_SERVICE_URL,
    authToken:
      overrides.authToken ??
      currentEnv?.STARTER_GRANT_SERVICE_AUTH_TOKEN ??
      process.env.STARTER_GRANT_SERVICE_AUTH_TOKEN,
    timeoutMs:
      overrides.timeoutMs ??
      (Number(
        currentEnv?.STARTER_GRANT_SERVICE_TIMEOUT_MS ??
          process.env.STARTER_GRANT_SERVICE_TIMEOUT_MS
      ) || undefined),
    installIdPath:
      overrides.installIdPath ??
      currentEnv?.STARTER_GRANT_INSTALL_ID_PATH ??
      process.env.STARTER_GRANT_INSTALL_ID_PATH,
    ref:
      overrides.ref ??
      currentEnv?.STARTER_GRANT_REF ??
      process.env.STARTER_GRANT_REF
  };
}
