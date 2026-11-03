import { WorkerEntrypoint } from "cloudflare:workers";
import { purgeCardCache, serveCards } from "./render/cards-handler.ts";
import type { SnapshotReader } from "./stats/storage.ts";

export type ProductionBindings = { PROFILE_STATS: SnapshotReader };

export default class ProfileCards extends WorkerEntrypoint<ProductionBindings> {
  fetch(request: Request) {
    return serveCards(request, this.env.PROFILE_STATS, "public");
  }

  purgeCache() {
    return purgeCardCache(this.ctx.cache);
  }
}
