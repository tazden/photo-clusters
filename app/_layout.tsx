import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClustersProvider } from '../src/state/ClustersContext';

export default function RootLayout() {
  return (
    <ClustersProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0b0b0b' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#000' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Кластеры' }} />
        <Stack.Screen name="cluster/[id]" options={{ title: 'Кластер' }} />
      </Stack>
    </ClustersProvider>
  );
}
