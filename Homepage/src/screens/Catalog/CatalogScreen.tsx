import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { getCategories } from '../../api';
import { Category, RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FALLBACK_CATEGORIES = [
  { id: 1, name: 'Электроника', icon: 'phone-portrait-outline', is_active: true, sort_order: 1 },
  { id: 2, name: 'Бытовая техника', icon: 'tv-outline', is_active: true, sort_order: 2 },
  { id: 3, name: 'Телефоны и гаджеты', icon: 'phone-portrait-outline', is_active: true, sort_order: 3 },
  { id: 4, name: 'Компьютеры и ноутбуки', icon: 'laptop-outline', is_active: true, sort_order: 4 },
  { id: 5, name: 'Для дома', icon: 'home-outline', is_active: true, sort_order: 5 },
  { id: 6, name: 'Одежда и обувь', icon: 'shirt-outline', is_active: true, sort_order: 6 },
  { id: 7, name: 'Красота и здоровье', icon: 'heart-outline', is_active: true, sort_order: 7 },
  { id: 8, name: 'Детские товары', icon: 'happy-outline', is_active: true, sort_order: 8 },
  { id: 9, name: 'Спорт и отдых', icon: 'fitness-outline', is_active: true, sort_order: 9 },
  { id: 10, name: 'Автотовары', icon: 'car-outline', is_active: true, sort_order: 10 },
  { id: 11, name: 'Строительство и ремонт', icon: 'construct-outline', is_active: true, sort_order: 11 },
];

const CATEGORY_ICONS: Record<string, string> = {
  'Электроника': 'phone-portrait-outline',
  'Бытовая техника': 'tv-outline',
  'Телефоны и гаджеты': 'phone-portrait-outline',
  'Компьютеры и ноутбуки': 'laptop-outline',
  'Для дома': 'home-outline',
  'Одежда и обувь': 'shirt-outline',
  'Красота и здоровье': 'heart-outline',
  'Детские товары': 'happy-outline',
  'Спорт и отдых': 'fitness-outline',
  'Автотовары': 'car-outline',
  'Строительство и ремонт': 'construct-outline',
};

const getIcon = (name: string) => CATEGORY_ICONS[name] || 'grid-outline';

export default function CatalogScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<Nav>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getCategories();
      setCategories(data.length > 0 ? data : (FALLBACK_CATEGORIES as any));
    } catch {
      setCategories(FALLBACK_CATEGORIES as any);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = search.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  const renderItem = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => navigation.navigate('CategoryProducts', { category: item.name, categoryName: item.name })}
      activeOpacity={0.7}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
        <Ionicons name={getIcon(item.name) as any} size={22} color={colors.primary} />
      </View>
      <Text style={[styles.rowText, { color: colors.text }]}>{item.name}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Каталог</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Поиск в каталоге"
            placeholderTextColor={colors.textMuted}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.divider }]} />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Ничего не найдено</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  searchWrap: { paddingHorizontal: 16, marginBottom: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: '500' },
  separator: { height: 8 },
  emptyText: { fontSize: 15, marginTop: 8 },
});
