import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import {
  Cluster,
  clusterByTime,
  toMillisMaybeSeconds,
} from '../cluster/timeClustering';

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

function pickMomentTitleAndSubtitle(m: any, startMs: number, endMs: number) {
  const startD = new Date(startMs);
  const endD = new Date(endMs);

  const titleDate =
    startD.toDateString() === endD.toDateString()
      ? startD.toLocaleDateString()
      : `${startD.toLocaleDateString()} – ${endD.toLocaleDateString()}`;

  const place =
    m.locationNames && Array.isArray(m.locationNames) && m.locationNames.length > 0
      ? m.locationNames[0]
      : undefined;

  return {
    title: place ? place : titleDate,
    subtitle: place ? titleDate : undefined,
  };
}

/**
 * iOS Moments: вместо getAssetsAsync({ album: moment }) (который на iOS иногда ведёт себя странно),
 * строим moment-кластеры из уже загруженного списка "последних фото" и фильтруем по времени момента.
 *
 * Плюсы:
 * - у каждого moment-кластера будут "свои" фото
 * - обложка тоже станет корректной
 *
 * Минус:
 * - работаем в пределах MAX_ASSETS последних фото (что обычно ок для "недавних" моментов).
 */
async function buildIOSMomentClustersFromRecentAssets(
  recentAssets: MediaLibrary.Asset[],
): Promise<{ clusters: Cluster[]; photosMap: ClusterPhotosMap }> {
  const moments = await MediaLibrary.getMomentsAsync(); // iOS-only :contentReference[oaicite:1]{index=1}
  const result: Cluster[] = [];
  const photosMap: ClusterPhotosMap = {};

  // Небольшая оптимизация: заранее посчитаем creationTimeMs для ассетов
  const assetsWithMs = recentAssets.map(a => ({
    asset: a,
    t: toMillisMaybeSeconds(a.creationTime),
  }));

  for (const m of moments) {
    if (m.type !== 'moment') continue;

    const startMs = toMillisMaybeSeconds(m.startTime);
    const endMs = toMillisMaybeSeconds(m.endTime);

    // Фильтруем ассеты, попадающие в интервал момента
    const momentAssets = assetsWithMs
      .filter(x => x.t >= startMs && x.t <= endMs)
      .map(x => x.asset)
      // обложку обычно логичнее брать "самую новую" в кластере
      .sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0));

    // Если в пределах recentAssets ничего не нашли — не показываем пустой момент
    if (momentAssets.length === 0) continue;

    const { title, subtitle } = pickMomentTitleAndSubtitle(m, startMs, endMs);

    const clusterId = `moment_${m.id}`;

    photosMap[clusterId] = momentAssets;

    result.push({
      id: clusterId,
      kind: 'moment',
      title,
      subtitle,
      coverUri: momentAssets[0]?.uri,
      count: momentAssets.length,
      startTimeMs: startMs,
      endTimeMs: endMs,
      albumId: m.id,
      assetIds: momentAssets.map(a => a.id),
    });
  }

  // newest first
  result.sort((a, b) => (b.startTimeMs ?? 0) - (a.startTimeMs ?? 0));

  return { clusters: result, photosMap };
}

export function ClustersProvider({ children }: { children: React.ReactNode }) {
  const [permission, requestPermissionHook] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterPhotos, setClusterPhotos] = useState<ClusterPhotosMap>({});

  // Держим последние ассеты в памяти, чтобы можно было быстро "собрать" photos для moment-кластера при необходимости
  const [recentAssets, setRecentAssets] = useState<MediaLibrary.Asset[]>([]);

  const isGranted = permission?.granted;

  const requestPermission = useCallback(async () => {
    await requestPermissionHook();
  }, [requestPermissionHook]);

  const openPermissionsPickerIfAvailable = useCallback(async () => {
    try {
      // iOS and Android 14+ (no-op otherwise) :contentReference[oaicite:2]{index=2}
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
      // 1) Всегда сначала грузим recent assets — дальше они нужны и для timeClusters, и для iOS moments
      const assets = await fetchRecentPhotoAssets();
      setRecentAssets(assets);

      // 2) Time clusters (Android + fallback)
      const timeClusters = clusterByTime(assets, {
        timeGapMinutes: 180,
        minClusterSize: 3,
      });

      const timeMap: ClusterPhotosMap = {};
      for (const c of timeClusters) {
        const ids = new Set(c.assetIds ?? []);
        timeMap[c.id] = assets.filter(a => ids.has(a.id));
      }

      // 3) iOS Moments clusters (строим из recent assets, НЕ через album/moment)
      let momentClusters: Cluster[] = [];
      let momentMap: ClusterPhotosMap = {};

      if (Platform.OS === 'ios') {
        const built = await buildIOSMomentClustersFromRecentAssets(assets);
        momentClusters = built.clusters;
        momentMap = built.photosMap;
      }

      setClusters([...momentClusters, ...timeClusters]);

      // Prefill: и moments, и time clusters
      setClusterPhotos(prev => ({ ...prev, ...momentMap, ...timeMap }));
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

      // Для moment-кластеров мы обычно уже префиллим photosMap в reload().
      // Но если вдруг не префиллось (например, кластер попал в список, а recentAssets ещё пустые),
      // то соберём из recentAssets по времени/assetIds.
      if (cluster.kind === 'moment') {
        let assets: MediaLibrary.Asset[] = [];

        if (cluster.assetIds?.length) {
          const ids = new Set(cluster.assetIds);
          assets = recentAssets.filter(a => ids.has(a.id));
        } else if (cluster.startTimeMs && cluster.endTimeMs) {
          const startMs = cluster.startTimeMs;
          const endMs = cluster.endTimeMs;
          assets = recentAssets.filter(a => {
            const t = toMillisMaybeSeconds(a.creationTime);
            return t >= startMs && t <= endMs;
          });
        }

        if (assets.length > 0) {
          setClusterPhotos(prev => ({ ...prev, [clusterId]: assets }));
        }

        return;
      }

      // На всякий: если захотите когда-то "лениво" грузить time-кластеры — можно добавить здесь.
    },
    [clusterPhotos, clusters, recentAssets],
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
    [
      permission,
      requestPermission,
      openPermissionsPickerIfAvailable,
      isLoading,
      error,
      clusters,
      clusterPhotos,
      reload,
      loadClusterPhotosIfNeeded,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClusters() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useClusters must be used within ClustersProvider');
  return ctx;
}
