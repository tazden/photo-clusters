import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useClusters } from '../../src/state/ClustersContext';
import { AssetGrid } from '../../src/ui/AssetGrid';

export default function ClusterScreen() {
  const params = useLocalSearchParams();
  const rawId = (params as any).id as string | string[] | undefined;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const { clusters, clusterPhotos, loadClusterPhotosIfNeeded } = useClusters();

  const cluster = useMemo(() => clusters.find(c => c.id === id), [clusters, id]);
  const photos = id ? clusterPhotos[id] : undefined;

  useEffect(() => {
    if (id) void loadClusterPhotosIfNeeded(id);
  }, [id, loadClusterPhotosIfNeeded]);

  if (!cluster) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.p}>Кластер не найден</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: cluster.title }} />

      {!photos ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.p}>Загружаем фото…</Text>
        </View>
      ) : photos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.p}>Нет фото в этом кластере</Text>
        </View>
      ) : (
        <AssetGrid key={id} assets={photos} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  p: { color: '#bbb', fontSize: 14, textAlign: 'center' },
});
