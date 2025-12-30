import React from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View, FlatList } from 'react-native';
import { router } from 'expo-router';
import { useClusters } from '../src/state/ClustersContext';
import { ClusterCard } from '../src/ui/ClusterCard';

export default function IndexScreen() {
  const { permission, requestPermission, openPermissionsPickerIfAvailable, isLoading, error, clusters, reload } = useClusters();
  const access = permission?.accessPrivileges;

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.h1}>Нужен доступ к фото</Text>
          <Text style={styles.p}>Чтобы собрать смысловые кластеры, приложению нужен доступ к вашей галерее.</Text>

          <Pressable style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Разрешить доступ</Text>
          </Pressable>

          {access === 'limited' && (
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={openPermissionsPickerIfAvailable}>
              <Text style={styles.btnText}>Выбрать больше фото…</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Ваши кластеры</Text>
        <Pressable style={styles.link} onPress={reload}>
          <Text style={styles.linkText}>Обновить</Text>
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.p}>Собираем кластеры…</Text>
        </View>
      )}

      <FlatList
        data={clusters}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <ClusterCard
            cluster={item}
            onPress={() => router.push({ pathname: '/cluster/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={!isLoading ? (
          <View style={styles.center}>
            <Text style={styles.p}>Не нашли фото или нет доступа.</Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  list: { padding: 12 },
  headerRow: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: 'white', fontSize: 22, fontWeight: '800' },
  p: { color: '#bbb', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  btn: { marginTop: 14, backgroundColor: '#2d5bff', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  btnSecondary: { backgroundColor: '#222' },
  btnText: { color: 'white', fontWeight: '700' },
  link: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#111', borderRadius: 10 },
  linkText: { color: '#ddd', fontSize: 12, fontWeight: '600' },
  loading: { alignItems: 'center', gap: 8, paddingBottom: 6 },
  error: { color: '#ff6b6b', paddingHorizontal: 12, paddingBottom: 6 },
});
