import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { runRefresh } from "./refresh-run.ts";
import type { RefreshBindings } from "./refresh-run.ts";
import { purgeCardCache } from "../render/cards-handler.ts";

type RefreshParams = { scheduledTime?: number };

export class ProfileRefresh extends WorkflowEntrypoint<RefreshBindings, RefreshParams> {
  async run(event: WorkflowEvent<RefreshParams>, step: WorkflowStep) {
    return runRefresh(
      new Date(event.schedule?.scheduledTime ?? event.payload?.scheduledTime ?? event.timestamp),
      this.env,
      step,
      // The Workflow runs in the serving Worker, so it can purge that Worker's cache directly.
      () => purgeCardCache(this.ctx.cache),
    );
  }
}
