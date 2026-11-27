import { bindings, defineConfig, exports as workerExports, triggers } from "cf/config";
import { loadEnv } from "vite";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

const env = loadEnv("production", ".", "PROFILE_");

export default defineConfig({
  worker: {
    name: "github-profile-stats",
    compatibilityDate: "2026-10-01",
    entrypoint,
    domains: env.PROFILE_DOMAIN ? [env.PROFILE_DOMAIN] : [],
    workersDev: false,
    previewUrls: false,
    cache: { enabled: true },
    observability: { enabled: true },
    // 6:00 & 18:00 JST
    triggers: [triggers.scheduled({ schedule: "0 9,21 * * *" })],
    exports: {
      ProfileRefresh: workerExports.workflow({
        name: "github-profile-refresh",
        concurrency: { limit: 1 },
      }),
    },
    env: {
      // Without an id, CI deploys abort after any dashboard edit: cf's strict config diff ignores binding inheritance.
      PROFILE_STATS: bindings.kv({ id: env.PROFILE_STATS_NAMESPACE_ID || undefined }),
      PROFILE_USER: bindings.text(env.PROFILE_USER || "Pugma"),
      GITHUB_TOKEN: bindings.secret(),
    },
  },
});
