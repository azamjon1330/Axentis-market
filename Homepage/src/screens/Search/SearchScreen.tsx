import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { getProducts } from '../../api';
import { Product, RootStackParamList } from '../../types';
import ProductCard from '../../components/common/ProductCard';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const POPULAR_SEARCHES = ['AirPods', 'Samsung', 'iPhone', 'Nike', 'Adidas', 'PlayStation'];

export default function SearchScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<Nav>();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsLoading(true);
    setHasSearched(true);
    try {
      const res = await getProducts({ search: q, limit: 30, availableOnly: true });
      setResults(res.products || []);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(text), 500);
  };

  const handleSubmit = () => {
    clearTimeout(searchTimer.current);
    doSearch(query);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Search header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
            onChangeText={handleChange}
            onSubmitEditing={handleSubmit}
            placeholder="Поиск товаров"
            placeholderTextColor={colors.textMuted}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setHasSearched(false); }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={[styles.cancelText, { color: colors.primary }]}>Отмена</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {!hasSearched ? (
        <View style={styles.idle}>
          <Text style={[styles.popularTitle, { color: colors.text }]}>Популярные запросы</Text>
          <View style={styles.tagsWrap}>
            {POPULAR_SEARCHES.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.tag, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setQuery(tag); doSearch(tag); }}
                activeOpacity={0.7}
              >
                <Ionicons name="trending-up-outline" size={14} color={colors.primary} />
                <Text style={[styles.tagText, { color: colors.text }]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.noResultTitle, { color: colors.text }]}>Ничего не найдено</Text>
          <Text style={[styles.noResultText, { color: colors.textMuted }]}>
            По запросу «{query}» товаров не найдено
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
            />
          )}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
              Найдено: {results.length} товаров
            </Text>
          }
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },
  cancelText: { fontSize: 15, fontWeight: '500' },
  idle: { padding: 16 },
  popularTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagText: { fontSize: 14 },
  grid: { paddingHorizontal: 16, paddingBottom: 20 },
  resultCount: { fontSize: 13, marginBottom: 12 },
  noResultTitle: { fontSize: 18, fontWeight: '600' },
  noResultText: { fontSize: 14, textAlign: 'center' },
});
