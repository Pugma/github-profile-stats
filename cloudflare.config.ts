import { loadEnv } from "vite";
import { bindings, defineConfig, exports as workerExports, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };
import { refreshSchedule } from "./src/refresh-schedule.ts";

const env = loadEnv("production", ".", "PROFILE_");

export default defineConfig({
  worker: {
    name: "github-profile-stats",
    compatibilityDate: "2026-10-01",
    entrypoint,
    cache: { enabled: true },
    triggers: [triggers.scheduled({ schedule: refreshSchedule })],
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
