import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { getCategoryProducts, getProducts } from '../../api';
import ProductCard from '../../components/common/ProductCard';

const LIMIT = 20;

export default function CategoryProductsScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { category, categoryName } = route.params;

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState('popular');

  const load = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    if (reset) setIsLoading(true); else setIsLoadingMore(true);
    try {
      const res = await getCategoryProducts(category, { limit: LIMIT, offset: currentOffset });
      const items = Array.isArray(res) ? res : (res?.products || []);
      setTotal(items.length);
      if (reset) {
        setProducts(items);
        setOffset(LIMIT);
      } else {
        setProducts(prev => [...prev, ...items]);
        setOffset(prev => prev + LIMIT);
      }
    } catch {
      try {
        const res = await getProducts({ category, limit: LIMIT, availableOnly: true });
        const items = Array.isArray(res) ? res : (res?.products || []);
        if (reset) { setProducts(items); setOffset(LIMIT); }
        else { setProducts(prev => [...prev, ...items]); setOffset(prev => prev + LIMIT); }
        setTotal(items.length);
      } catch {}
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [category, offset]);

  useEffect(() => { load(true); }, [category]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const onEndReached = () => {
    if (!isLoadingMore && products.length < total) {
      load(false);
    }
  };

  const sorted = [...products].sort((a, b) => {
    if (sortBy === 'price_asc') return (a.sellingPrice || a.price) - (b.sellingPrice || b.price);
    if (sortBy === 'price_desc') return (b.sellingPrice || b.price) - (a.sellingPrice || a.price);
    if (sortBy === 'new') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    return (b.soldCount || 0) - (a.soldCount || 0);
  });

  const SORTS = [
    { key: 'popular', label: 'Популярное' },
    { key: 'new', label: 'Новинки' },
    { key: 'price_asc', label: 'Дешевле' },
    { key: 'price_desc', label: 'Дороже' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {categoryName}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[
              styles.sortChip,
              {
                backgroundColor: sortBy === s.key ? colors.primary : colors.surface,
                borderColor: sortBy === s.key ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setSortBy(s.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortChipText, { color: sortBy === s.key ? '#FFFFFF' : colors.textSecondary }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isLoading && (
        <Text style={[styles.countText, { color: colors.textSecondary }]}>
          {total} товаров
        </Text>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <ProductCard
                product={item}
                onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              />
            </View>
          )}
          ListFooterComponent={isLoadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : null}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="cube-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Товары не найдены</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                В этой категории пока нет товаров
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, flexWrap: 'wrap' },
  sortChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  sortChipText: { fontSize: 13, fontWeight: '500' },
  countText: { fontSize: 13, paddingHorizontal: 16, marginBottom: 8 },
  grid: { paddingHorizontal: 16, paddingBottom: 20 },
  row: { gap: 12, marginBottom: 0 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
