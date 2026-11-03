import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { runRefresh } from "./refresh-run.ts";
import type { RefreshBindings, RefreshSteps } from "./refresh-run.ts";
import { purgeCardCache } from "../render/cards-handler.ts";

export class ProfileRefresh extends WorkflowEntrypoint<RefreshBindings> {
  async run(event: WorkflowEvent<Record<string, never>>, step: WorkflowStep) {
    return runRefresh(
      new Date(event.schedule?.scheduledTime ?? event.timestamp),
      this.env,
      // The runtime-neutral collector returns plain data from every durable step.
      step as RefreshSteps,
      // The Workflow runs in the serving Worker, so it can purge that Worker's cache directly.
      () => purgeCardCache(this.ctx.cache),
    );
  }
}
