import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Animated,
  TextInput,
  Pressable,
  useWindowDimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useLanguage } from '../../context/LanguageContext';
import { getProducts, getCategories, getApprovedAds } from '../../api';
import ProductCard from '../../components/common/ProductCard';
import BannerCarousel from '../../components/common/BannerCarousel';

const LIMIT = 20;
const DEBOUNCE_MS = 300;

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const { t } = useLanguage();
  const navigation = useNavigation();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ads, setAds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);

  // Drawer
  const DRAWER_WIDTH = Math.min(width * 0.82, 340);
  const drawerX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Debounce search
  const debounceTimer = useRef(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), DEBOUNCE_MS);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  const getModeParams = useCallback(() => {
    if (user?.mode === 'private' && user.privateCompanyId) {
      return { mode: 'private', privateCompanyId: user.privateCompanyId };
    }
    return {};
  }, [user?.mode, user?.privateCompanyId]);

  const loadInitial = useCallback(async () => {
    try {
      const [prodRes, catRes, adsRes] = await Promise.allSettled([
        getProducts({ limit: LIMIT, offset: 0, availableOnly: true, ...getModeParams() }),
        getCategories(),
        getApprovedAds(),
      ]);
      if (prodRes.status === 'fulfilled') {
        setProducts(prodRes.value);
        setOffset(LIMIT);
        setHasMore(prodRes.value.length === LIMIT);
      }
      if (catRes.status === 'fulfilled') setCategories(catRes.value);
      if (adsRes.status === 'fulfilled') setAds(adsRes.value);
    } finally {
      setIsLoading(false);
    }
  }, [getModeParams]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setOffset(0);
    setHasMore(true);
    setActiveCategory(null);
    try {
      const [prodRes, catRes, adsRes] = await Promise.allSettled([
        getProducts({ limit: LIMIT, offset: 0, availableOnly: true, ...getModeParams() }),
        getCategories(),
        getApprovedAds(),
      ]);
      if (prodRes.status === 'fulfilled') {
        setProducts(prodRes.value);
        setOffset(LIMIT);
        setHasMore(prodRes.value.length === LIMIT);
      }
      if (catRes.status === 'fulfilled') setCategories(catRes.value);
      if (adsRes.status === 'fulfilled') setAds(adsRes.value);
    } finally {
      setRefreshing(false);
    }
  }, [getModeParams]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || debouncedSearch.trim() || activeCategory) return;
    setIsLoadingMore(true);
    try {
      const more = await getProducts({ limit: LIMIT, offset, availableOnly: true, ...getModeParams() });
      if (more.length > 0) {
        setProducts(prev => [...prev, ...more]);
        setOffset(prev => prev + LIMIT);
        setHasMore(more.length === LIMIT);
      } else {
        setHasMore(false);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, debouncedSearch, activeCategory, offset, getModeParams]);

  const displayProducts = useMemo(() => {
    let list = products;
    if (debouncedSearch.trim()) {
      list = list.filter(p => p.name.toLowerCase().includes(debouncedSearch.toLowerCase()));
    }
    if (activeCategory) {
      list = list.filter(p => p.category === activeCategory);
    }
    return list;
  }, [products, debouncedSearch, activeCategory]);

  // Drawer
  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.spring(drawerX, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.spring(drawerX, { toValue: -DRAWER_WIDTH, useNativeDriver: true, tension: 80, friction: 12 }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setDrawerOpen(false));
  };

  const CARD_GAP = 10;
  const HORIZONTAL_PADDING = 12;
  const cardWidth = (width - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

  const CATEGORY_ICONS = {
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
  };
  const getIcon = name => CATEGORY_ICONS[name] || 'grid-outline';

  // Ad banner carousel — shown at the top of the feed (hidden while searching or
  // filtering by category, and when there are no approved ads).
  const ListHeader = useMemo(() => {
    if (debouncedSearch.trim() || activeCategory || ads.length === 0) return null;
    return (
      <View style={styles.bannerWrap}>
        <BannerCarousel ads={ads} />
      </View>
    );
  }, [ads, debouncedSearch, activeCategory]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── Top bar ── */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: colors.background, paddingTop: insets.top + 10 },
        ]}
      >
        {/* Hamburger */}
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.surface }]}
          onPress={openDrawer}
          activeOpacity={0.7}
        >
          <Ionicons name="menu-outline" size={22} color={colors.text} />
        </TouchableOpacity>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.surface }]}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Поиск товаров..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Category chips ── */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={[styles.chipsScroll, { borderBottomColor: colors.border }]}
        >
          <TouchableOpacity
            onPress={() => setActiveCategory(null)}
            style={[
              styles.chip,
              activeCategory === null
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface },
            ]}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.chipText,
                { color: activeCategory === null ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              Все
            </Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
              style={[
                styles.chip,
                activeCategory === cat.name
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.surface },
              ]}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: activeCategory === cat.name ? '#FFFFFF' : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Products FlatList ── */}
      <FlatList
        data={displayProducts}
        numColumns={2}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 16 }]}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={52} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {debouncedSearch.trim() ? 'Ничего не найдено' : 'Нет доступных товаров'}
            </Text>
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadMore}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <ProductCard
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              onFavorite={() => toggleFav(item.id, item)}
              isFavorite={isFavorite(item.id)}
            />
          </View>
        )}
      />

      {/* ── Drawer overlay ── */}
      {drawerOpen && (
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="box-none">
          <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
        </Animated.View>
      )}

      {/* ── Drawer panel ── */}
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: colors.surface,
            width: DRAWER_WIDTH,
            transform: [{ translateX: drawerX }],
            paddingTop: insets.top,
          },
        ]}
      >
        {/* Drawer header */}
        <View style={[styles.drawerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.drawerTitle, { color: colors.text }]}>Каталог</Text>
          <TouchableOpacity
            onPress={closeDrawer}
            style={[styles.closeBtn, { backgroundColor: colors.inputBg }]}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* All products */}
        <TouchableOpacity
          style={[styles.drawerRow, { borderBottomColor: colors.divider }]}
          onPress={() => { closeDrawer(); setActiveCategory(null); setSearch(''); }}
          activeOpacity={0.7}
        >
          <View style={[styles.drawerIconBox, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="apps-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>Все товары</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Categories */}
        <FlatList
          data={categories}
          keyExtractor={item => String(item.id)}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.drawerRow,
                { borderBottomColor: colors.divider },
                activeCategory === item.name && { backgroundColor: colors.primary + '12' },
              ]}
              onPress={() => {
                closeDrawer();
                setActiveCategory(item.name);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.drawerIconBox, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name={getIcon(item.name)} size={20} color={colors.primary} />
              </View>
              <Text style={[styles.drawerRowText, { color: colors.text }]}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  chipsScroll: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chipsRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bannerWrap: {
    paddingTop: 4,
    paddingBottom: 4,
  },

  grid: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  row: {
    gap: 10,
    marginBottom: 10,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { fontSize: 15 },
  loadMore: { paddingVertical: 20, alignItems: 'center' },

  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  drawerTitle: { fontSize: 22, fontWeight: '800' },
  closeBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 14,
  },
  drawerIconBox: {
    width: 40, height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerRowText: { flex: 1, fontSize: 15, fontWeight: '500' },
});
