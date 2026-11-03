import { loadEnv } from "vite";
import { bindings, defineConfig, exports as workerExports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };
import { refreshSchedule } from "./src/refresh-schedule.ts";

const env = loadEnv("production", ".", "PROFILE_");

export default defineConfig({
  worker: {
    name: "github-profile-stats",
    compatibilityDate: "2026-10-01",
    entrypoint,
    cache: { enabled: true },
    exports: {
      ProfileRefresh: workerExports.workflow({
        name: "github-profile-refresh",
        schedules: refreshSchedule,
        concurrency: { limit: 1 },
      }),
    },
    env: {
      // No id: the first deploy provisions the namespace and later deploys inherit it from the deployed Worker.
      PROFILE_STATS: bindings.kv(),
      PROFILE_USER: bindings.text(env.PROFILE_USER || "Pugma"),
      GITHUB_TOKEN: bindings.secret(),
    },
  },
});
