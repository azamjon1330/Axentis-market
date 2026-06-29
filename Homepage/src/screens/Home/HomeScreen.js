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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useLanguage } from '../../context/LanguageContext';
import { getProducts, getCategories, getApprovedAds, getRecentlyViewed, getRecommendations } from '../../api';
import ProductCard from '../../components/common/ProductCard';
import BannerCarousel from '../../components/common/BannerCarousel';
import CategoryIcon from '../../components/common/CategoryIcon';
import { SectionHeader, Chip } from '../../components/ui';
import { Spacing, Radius, Typography } from '../../constants/theme';

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
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

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

  // «Недавно смотрели» + «Рекомендуем вам» — обновляем при возврате на главную,
  // чтобы только что просмотренные товары сразу появлялись в ленте.
  const loadPersonalized = useCallback(async () => {
    if (!user?.phone) { setRecentlyViewed([]); setRecommendations([]); return; }
    const [rv, rc] = await Promise.allSettled([
      getRecentlyViewed(user.phone, 12),
      getRecommendations(user.phone, 12),
    ]);
    if (rv.status === 'fulfilled') setRecentlyViewed(rv.value);
    if (rc.status === 'fulfilled') setRecommendations(rc.value);
  }, [user?.phone]);

  useFocusEffect(useCallback(() => { loadPersonalized(); }, [loadPersonalized]));

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

  // Ad banner carousel — shown at the top of the feed (hidden while searching or
  // filtering by category, and when there are no approved ads).
  const ListHeader = useMemo(() => {
    const showBanner = !debouncedSearch.trim() && !activeCategory && ads.length > 0;
    let sectionTitle = t('popularProducts');
    if (debouncedSearch.trim()) sectionTitle = t('searchResults');
    else if (activeCategory) sectionTitle = activeCategory;
    const showFeeds = !debouncedSearch.trim() && !activeCategory;
    const renderFeedRow = (title, data) => (
      <View style={styles.feedSection}>
        <Text style={[styles.feedTitle, { color: colors.text }]}>{title}</Text>
        <FlatList
          data={data}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => 'feed-' + String(item.id)}
          contentContainerStyle={styles.feedRow}
          renderItem={({ item }) => (
            <View style={{ width: 132 }}>
              <ProductCard
                product={item}
                compact
                onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
                onFavorite={() => toggleFav(item.id, item)}
                isFavorite={isFavorite(item.id)}
              />
            </View>
          )}
        />
      </View>
    );
    return (
      <View>
        {showBanner && (
          <View style={styles.bannerWrap}>
            <BannerCarousel ads={ads} />
          </View>
        )}
        {showFeeds && recentlyViewed.length > 0 && renderFeedRow(t('recentlyViewed'), recentlyViewed)}
        {showFeeds && recommendations.length > 0 && renderFeedRow(t('recommendedForYou'), recommendations)}
        <SectionHeader title={sectionTitle} style={{ marginTop: showBanner ? Spacing.sm : Spacing.xs }} />
      </View>
    );
  }, [ads, debouncedSearch, activeCategory, t, recentlyViewed, recommendations, colors, navigation, isFavorite, toggleFav]);

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
      <View style={[styles.topBarWrap, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
        {/* Greeting + actions */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greetingHello, { color: colors.textMuted }]}>{t('welcome')}</Text>
            <Text style={[styles.greetingName, { color: colors.text }]} numberOfLines={1}>
              {user?.name ? user.name : 'Axentis Market'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search row */}
        <View style={styles.searchRow}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={openDrawer}
            activeOpacity={0.7}
          >
            <Ionicons name="menu-outline" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t('searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* ── Category chips ── */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          <Chip label={t('tabAll')} active={activeCategory === null} onPress={() => setActiveCategory(null)} icon="apps-outline" />
          {categories.map(cat => (
            <Chip
              key={cat.id}
              label={cat.name}
              active={activeCategory === cat.name}
              onPress={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
              category={cat}
            />
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
              {debouncedSearch.trim() ? t('nothingFound') : t('noProductsAvailable')}
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
          <Text style={[styles.drawerTitle, { color: colors.text }]}>{t('catalogTitle')}</Text>
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
          <Text style={[styles.drawerRowText, { color: colors.text }]}>{t('allProducts')}</Text>
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
                <CategoryIcon category={item} size={20} color={colors.primary} />
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

  topBarWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  greetingHello: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  greetingName: {
    ...Typography.h2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: Radius.input,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: Radius.input,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  chipsScroll: {
    flexGrow: 0,
  },
  chipsRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerWrap: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  feedSection: { marginTop: 8, marginBottom: 4 },
  feedTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, paddingHorizontal: 16, marginBottom: 10 },
  feedRow: { gap: 12, paddingHorizontal: 16 },

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
