const refreshHour = 3;
const refreshMinute = 17;
const dayMilliseconds = 24 * 60 * 60 * 1000;

export const refreshSchedule = `${refreshMinute} ${refreshHour} * * *`;
export const kvPropagationDelay = "2 minutes";

export function latestScheduledRefresh(now = Date.now()) {
  const boundary = new Date(now);
  boundary.setUTCHours(refreshHour, refreshMinute, 0, 0);
  return boundary.getTime() > now ? boundary.getTime() - dayMilliseconds : boundary.getTime();
}

export function cardCacheControl(snapshotTo: string, now = Date.now()) {
  const mostRecentRefresh = latestScheduledRefresh(now);
  // A stale KV read after the daily refresh must not refill the response cache for another day.
  if (Date.parse(snapshotTo) < mostRecentRefresh) return "no-store";
  const secondsUntilRefresh = Math.ceil((mostRecentRefresh + dayMilliseconds - now) / 1000);
  return `public, max-age=0, s-maxage=${secondsUntilRefresh}`;
}
