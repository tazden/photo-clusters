import React from 'react';
import { Dimensions, FlatList, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type * as MediaLibrary from 'expo-media-library';

const GAP = 2;
const NUM_COLS = 3;
const size = Math.floor((Dimensions.get('window').width - GAP * (NUM_COLS - 1)) / NUM_COLS);

export function AssetGrid({ assets }: { assets: MediaLibrary.Asset[] }) {
  return (
    <FlatList
      data={assets}
      keyExtractor={(a) => a.id}
      numColumns={NUM_COLS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          <Image source={{ uri: item.uri }} style={styles.image} contentFit="cover" transition={120} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: GAP },
  row: { gap: GAP },
  cell: { width: size, height: size, backgroundColor: '#111' },
  image: { width: '100%', height: '100%' },
});
