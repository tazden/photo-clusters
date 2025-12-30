import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { Cluster } from '../cluster/timeClustering';

export function ClusterCard({ cluster, onPress }: { cluster: Cluster; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.thumb}>
        {cluster.coverUri ? (
          <Image source={{ uri: cluster.coverUri }} style={styles.image} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}
      </View>

      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.title}>{cluster.title}</Text>
        {!!cluster.subtitle && <Text numberOfLines={1} style={styles.subtitle}>{cluster.subtitle}</Text>}
        <Text style={styles.count}>{cluster.count} фото</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: '#111', borderRadius: 14, alignItems: 'center' },
  pressed: { opacity: 0.85 },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: '#222' },
  image: { width: '100%', height: '100%' },
  placeholder: { backgroundColor: '#222' },
  meta: { flex: 1, gap: 4 },
  title: { color: 'white', fontSize: 16, fontWeight: '700' },
  subtitle: { color: '#bbb', fontSize: 13 },
  count: { color: '#888', fontSize: 12 },
});
