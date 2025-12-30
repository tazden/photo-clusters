import type * as MediaLibrary from 'expo-media-library';

export type ClusterKind = 'moment' | 'time';

export type Cluster = {
  id: string;
  kind: ClusterKind;
  title: string;
  subtitle?: string;
  coverUri?: string;
  count: number;
  startTimeMs?: number;
  endTimeMs?: number;
  assetIds?: string[]; // for 'time'
  albumId?: string;    // for 'moment'
};

export type TimeClusteringConfig = {
  timeGapMinutes: number;
  minClusterSize: number;
};

const DEFAULT_CONFIG: TimeClusteringConfig = {
  timeGapMinutes: 180,
  minClusterSize: 3,
};

export function toMillisMaybeSeconds(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(d: Date): string {
  return d.toLocaleDateString();
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function clusterByTime(
  assets: MediaLibrary.Asset[],
  config: Partial<TimeClusteringConfig> = {}
): Cluster[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (assets.length === 0) return [];

  // newest -> oldest
  const sorted = [...assets].sort((a, b) => toMillisMaybeSeconds(b.creationTime) - toMillisMaybeSeconds(a.creationTime));

  const chunks: MediaLibrary.Asset[][] = [];
  let current: MediaLibrary.Asset[] = [];
  const gapMs = cfg.timeGapMinutes * 60 * 1000;

  for (const asset of sorted) {
    const t = toMillisMaybeSeconds(asset.creationTime);

    if (current.length === 0) {
      current.push(asset);
      continue;
    }

    const prev = current[current.length - 1];
    const prevT = toMillisMaybeSeconds(prev.creationTime);

    if (Math.abs(prevT - t) <= gapMs) current.push(asset);
    else {
      chunks.push(current);
      current = [asset];
    }
  }
  if (current.length) chunks.push(current);

  // Merge tiny clusters into previous if same day (UX: меньше мусора)
  const merged: MediaLibrary.Asset[][] = [];
  for (const c of chunks) {
    if (c.length >= cfg.minClusterSize) {
      merged.push(c);
      continue;
    }

    const first = c[c.length - 1];
    const cStart = new Date(toMillisMaybeSeconds(first.creationTime));

    const prev = merged[merged.length - 1];
    if (prev) {
      const prevFirst = prev[prev.length - 1];
      const prevStart = new Date(toMillisMaybeSeconds(prevFirst.creationTime));
      if (sameDay(prevStart, cStart)) {
        merged[merged.length - 1] = [...prev, ...c];
        continue;
      }
    }

    merged.push(c);
  }

  return merged.map((assetsChunk, idx) => {
    const firstOldest = assetsChunk[assetsChunk.length - 1];
    const lastNewest = assetsChunk[0];

    const startMs = toMillisMaybeSeconds(firstOldest.creationTime);
    const endMs = toMillisMaybeSeconds(lastNewest.creationTime);

    const startD = new Date(startMs);
    const endD = new Date(endMs);

    const title = startD.toDateString() === endD.toDateString()
      ? formatDate(startD)
      : `${formatDate(startD)} – ${formatDate(endD)}`;

    const subtitle = `${formatTime(startD)} – ${formatTime(endD)}`;

    return {
      id: `time_${idx}_${firstOldest.id}`,
      kind: 'time',
      title,
      subtitle,
      coverUri: lastNewest.uri,
      count: assetsChunk.length,
      startTimeMs: startMs,
      endTimeMs: endMs,
      assetIds: assetsChunk.map(a => a.id),
    } satisfies Cluster;
  });
}
