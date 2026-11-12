import { kvPropagationDelay, latestScheduledRefresh } from "../refresh-schedule.ts";
import { validateSnapshot } from "../stats/schema.ts";
import { SNAPSHOT_KEY } from "../stats/storage.ts";
import { collectSnapshot } from "./collect.ts";
import type { CollectOptions } from "./collect.ts";

export type RefreshSteps = NonNullable<CollectOptions["steps"]> & {
  sleep(name: string, duration: typeof kvPropagationDelay): Promise<void>;
};

export type RefreshBindings = {
  PROFILE_USER: string;
  GITHUB_TOKEN: string;
  PROFILE_STATS: { put(key: string, value: string): Promise<unknown> };
};

export async function runRefresh(
  now: Date,
  env: RefreshBindings,
  steps: RefreshSteps,
  purgeCache: () => Promise<void>,
  collect = collectSnapshot,
) {
  if (!env.GITHUB_TOKEN?.trim()) throw new Error("Missing GitHub token");
  const { snapshot } = await collect({
    login: env.PROFILE_USER,
    token: env.GITHUB_TOKEN,
    now,
    steps,
  });
  await steps.do("publish-snapshot", async () => {
    validateSnapshot(snapshot);
    if (
      snapshot.user.toLowerCase() !== env.PROFILE_USER.toLowerCase() ||
      snapshot.period.to !== now.toISOString()
    )
      throw new Error("Invalid public statistics snapshot");
    if (Date.parse(snapshot.period.to) < latestScheduledRefresh())
      throw new Error("Snapshot is older than the current refresh window; start a new Workflow");
    await env.PROFILE_STATS.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
    return true;
  });
  await steps.sleep("wait-for-kv-propagation", kvPropagationDelay);
  await steps.do("purge-card-cache", async () => {
    await purgeCache();
    return true;
  });
  return { user: snapshot.user, updatedAt: snapshot.updatedAt };
}
