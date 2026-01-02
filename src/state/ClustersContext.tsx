import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { Cluster, clusterByTime, toMillisMaybeSeconds } from '../cluster/timeClustering';

type ClusterPhotosMap = Record<string, MediaLibrary.Asset[]>;

type ClustersState = {
  permission: MediaLibrary.PermissionResponse | null;
  requestPermission: () => Promise<void>;
  openPermissionsPickerIfAvailable: () => Promise<void>;

  isLoading: boolean;
  error?: string;

  clusters: Cluster[];
  clusterPhotos: ClusterPhotosMap;

  reload: () => Promise<void>;
  loadClusterPhotosIfNeeded: (clusterId: string) => Promise<void>;
};

const Ctx = createContext<ClustersState | null>(null);

const MAX_ASSETS = 2500;
const PAGE_SIZE = 200;

// Небольшой "зазор", чтобы не терять фото на границах моментов из-за округления времени
const MOMENT_EDGE_PADDING_MS = 2 * 60 * 1000; // 2 минуты

async function fetchRecentPhotoAssets(): Promise<MediaLibrary.Asset[]> {
  const all: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let hasNext = true;

  while (hasNext && all.length < MAX_ASSETS) {
    const page = await MediaLibrary.getAssetsAsync({
      first: Math.min(PAGE_SIZE, MAX_ASSETS - all.length),
      after,
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    all.push(...page.assets);
    hasNext = page.hasNextPage;
    after = page.endCursor;
  }

  return all;
}

async function fetchPhotoAssetsByTimeRange(startTimeMs: number, endTimeMs: number): Promise<MediaLibrary.Asset[]> {
  const assets: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let hasNext = true;

  const createdAfter = new Date(Math.max(0, startTimeMs - MOMENT_EDGE_PADDING_MS));
  const createdBefore = new Date(endTimeMs + MOMENT_EDGE_PADDING_MS);

  while (hasNext && assets.length < MAX_ASSETS) {
    const page = await MediaLibrary.getAssetsAsync({
      first: Math.min(PAGE_SIZE, MAX_ASSETS - assets.length),
      after,
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [MediaLibrary.SortBy.creationTime],
      createdAfter,
      createdBefore,
    });

    assets.push(...page.assets);
    hasNext = page.hasNextPage;
    after = page.endCursor;
  }

  return assets;
}

async function buildIOSMomentClusters(): Promise<Cluster[]> {
  const moments = await MediaLibrary.getMomentsAsync();
  const result: Cluster[] = [];

  for (const m of moments) {
    // В expo-media-library moments приходят как "albums" типа moment
    // (но на практике при limited access выборка по album может ломаться).
    if ((m as any).type !== 'moment') continue;

    const startMs = toMillisMaybeSeconds((m as any).startTime);
    const endMs = toMillisMaybeSeconds((m as any).endTime);

    const startD = new Date(startMs);
    const endD = new Date(endMs);

    const titleDate =
      startD.toDateString() === endD.toDateString()
        ? startD.toLocaleDateString()
        : `${startD.toLocaleDateString()} – ${endD.toLocaleDateString()}`;

    const place =
      (m as any).locationNames && (m as any).locationNames.length > 0 ? (m as any).locationNames[0] : undefined;

    // Обложку берём из диапазона времени (стабильнее при limited access)
    const coverPage = await MediaLibrary.getAssetsAsync({
      first: 1,
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [MediaLibrary.SortBy.creationTime],
      createdAfter: new Date(Math.max(0, startMs - MOMENT_EDGE_PADDING_MS)),
      createdBefore: new Date(endMs + MOMENT_EDGE_PADDING_MS),
    });

    result.push({
      id: `moment_${(m as any).id}`,
      kind: 'moment',
      title: place ? place : titleDate,
      subtitle: place ? titleDate : undefined,
      coverUri: coverPage.assets[0]?.uri,
      // assetCount у моментов может включать не только фото; для UI достаточно приблизительно
      count: (m as any).assetCount ?? undefined,
      startTimeMs: startMs,
      endTimeMs: endMs,
      albumId: (m as any).id,
    });
  }

  // newest first
  return result.sort((a, b) => (b.startTimeMs ?? 0) - (a.startTimeMs ?? 0));
}

export function ClustersProvider({ children }: { children: React.ReactNode }) {
  const [permission, requestPermissionHook] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterPhotos, setClusterPhotos] = useState<ClusterPhotosMap>({});

  const isGranted = permission?.granted;

  const requestPermission = useCallback(async () => {
    await requestPermissionHook();
  }, [requestPermissionHook]);

  const openPermissionsPickerIfAvailable = useCallback(async () => {
    try {
      // iOS and Android 14+ (no-op otherwise)
      await MediaLibrary.presentPermissionsPickerAsync(['photo']);
    } catch {
      // ignore
    }
  }, []);

  const reload = useCallback(async () => {
    if (!isGranted) return;

    setIsLoading(true);
    setError(undefined);

    try {
      const momentClusters: Cluster[] = Platform.OS === 'ios' ? await buildIOSMomentClusters() : [];
      const assets = await fetchRecentPhotoAssets();
      const timeClusters = clusterByTime(assets, { timeGapMinutes: 180, minClusterSize: 3 });

      setClusters([...momentClusters, ...timeClusters]);

      // Prefill time clusters with already fetched assets
      const timeMap: ClusterPhotosMap = {};
      for (const c of timeClusters) {
        const ids = new Set(c.assetIds ?? []);
        timeMap[c.id] = assets.filter(a => ids.has(a.id));
      }
      setClusterPhotos(prev => ({ ...prev, ...timeMap }));
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось загрузить фото');
    } finally {
      setIsLoading(false);
    }
  }, [isGranted]);

  const loadClusterPhotosIfNeeded = useCallback(
    async (clusterId: string) => {
      if (clusterPhotos[clusterId]) return;

      const cluster = clusters.find(c => c.id === clusterId);
      if (!cluster) return;

      // Главный фикс: moments на iOS грузим по времени, а не по albumId,
      // чтобы не получать один и тот же список при "Selected Photos" (limited access).
      if (cluster.kind === 'moment') {
        if (cluster.startTimeMs != null && cluster.endTimeMs != null) {
          const byRange = await fetchPhotoAssetsByTimeRange(cluster.startTimeMs, cluster.endTimeMs);
          setClusterPhotos(prev => ({ ...prev, [clusterId]: byRange }));
          return;
        }

        // Фолбэк: если вдруг нет времени — пробуем как album
        if (cluster.albumId) {
          const assets: MediaLibrary.Asset[] = [];
          let after: string | undefined;
          let hasNext = true;

          while (hasNext && assets.length < MAX_ASSETS) {
            const page = await MediaLibrary.getAssetsAsync({
              first: Math.min(PAGE_SIZE, MAX_ASSETS - assets.length),
              after,
              album: cluster.albumId,
              mediaType: [MediaLibrary.MediaType.photo],
              sortBy: [MediaLibrary.SortBy.creationTime],
            });
            assets.push(...page.assets);
            hasNext = page.hasNextPage;
            after = page.endCursor;
          }

          setClusterPhotos(prev => ({ ...prev, [clusterId]: assets }));
        }

        return;
      }

      // time clusters уже предзагружены в reload()
    },
    [clusterPhotos, clusters]
  );

  useEffect(() => {
    if (isGranted) void reload();
  }, [isGranted, reload]);

  const value = useMemo<ClustersState>(
    () => ({
      permission,
      requestPermission,
      openPermissionsPickerIfAvailable,
      isLoading,
      error,
      clusters,
      clusterPhotos,
      reload,
      loadClusterPhotosIfNeeded,
    }),
    [permission, requestPermission, openPermissionsPickerIfAvailable, isLoading, error, clusters, clusterPhotos, reload, loadClusterPhotosIfNeeded]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClusters() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useClusters must be used within ClustersProvider');
  return ctx;
}
