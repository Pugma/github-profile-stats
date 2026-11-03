export const SNAPSHOT_KEY = "github-profile:v1:snapshot";

export type SnapshotReader = {
  get(key: string): Promise<string | null>;
};
