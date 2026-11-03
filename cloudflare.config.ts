import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "github-profile-stats",
    compatibilityDate: "2026-10-01",
    entrypoint,
    cache: { enabled: true },
    env: {
      // No id: the first deploy provisions the namespace and later deploys inherit it from the deployed Worker.
      PROFILE_STATS: bindings.kv(),
    },
  },
});
