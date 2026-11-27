// Match the trigger in cloudflare.config.ts to reject delayed Workflows from an earlier cycle.
const refreshHour = 9;
const intervalMilliseconds = 12 * 60 * 60 * 1000;

export const kvPropagationDelay = "2 minutes";

export function latestScheduledRefresh(now = Date.now()) {
  const boundary = new Date(now);
  boundary.setUTCHours(refreshHour, 0, 0, 0);
  if (now >= boundary.getTime() + intervalMilliseconds)
    return boundary.getTime() + intervalMilliseconds;
  return boundary.getTime() > now ? boundary.getTime() - intervalMilliseconds : boundary.getTime();
}
