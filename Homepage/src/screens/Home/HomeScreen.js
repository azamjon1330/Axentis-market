import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
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
import { getProducts, getCategories, getApprovedAds, getTopCompanies } from '../../api';
import { getImageUrl } from '../../utils/imageUrl';
import { orderListing } from '../../utils/orderListing';
import ProductCard from '../../components/common/ProductCard';
import BannerCarousel from '../../components/common/BannerCarousel';

const LIMIT = 20;
const DEBOUNCE_MS = 300;

// Generate a fresh 32-bit seed for the subscription round-robin ordering.
// A new seed is produced on each listing load/reload so the order of subscribed
// companies is re-randomized every time (Req 9.3).
function makeListingSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

// Default placeholder shown when a category has no configured icon (Req 7.2).
// Mirrors the backend's default `categories.icon` value (📦).
export const PLACEHOLDER_CATEGORY_ICON = '📦';

// Resolve a category's configured `icon` field (returned by GetCategories) into
// something renderable (Req 7.1–7.3 / Property 6).
//
// The backend `categories.icon` column is a short emoji string (VARCHAR(10),
// defaulting to 📦), so the common case is an emoji/text glyph rendered as text.
// We also defensively support an uploaded image path/URL. When the icon is
// empty or missing we fall back to the placeholder, so the result is never empty.
export function resolveCategoryIcon(icon) {
  const value = typeof icon === 'string' ? icon.trim() : '';
  if (!value) {
    return { kind: 'emoji', value: PLACEHOLDER_CATEGORY_ICON };
  }
  // An uploaded image is stored as an http(s) URL or an `uploads/...` path.
  if (/^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('uploads/')) {
    return { kind: 'image', value: getImageUrl(value) };
  }
  // Otherwise treat it as an emoji / short text glyph rendered as-is.
  return { kind: 'emoji', value };
}

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
  const [topCompanies, setTopCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  // Fresh random seed per listing load/reload so the subscribed-company
  // round-robin order is re-randomized on every load (Req 9.3).
  const [listingSeed, setListingSeed] = useState(() => makeListingSeed());

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
    setListingSeed(makeListingSeed());
    try {
      const [prodRes, catRes, adsRes, topRes] = await Promise.allSettled([
        getProducts({ limit: LIMIT, offset: 0, availableOnly: true, ...getModeParams() }),
        getCategories(),
        getApprovedAds(),
        getTopCompanies(user?.phone),
      ]);
      if (prodRes.status === 'fulfilled') {
        setProducts(prodRes.value);
        setOffset(LIMIT);
        setHasMore(prodRes.value.length === LIMIT);
      }
      if (catRes.status === 'fulfilled') setCategories(catRes.value);
      if (adsRes.status === 'fulfilled') setAds(adsRes.value);
      if (topRes.status === 'fulfilled') setTopCompanies(topRes.value);
    } finally {
      setIsLoading(false);
    }
  }, [getModeParams, user?.phone]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setListingSeed(makeListingSeed());
    setOffset(0);
    setHasMore(true);
    setActiveCategory(null);
    try {
      const [prodRes, catRes, adsRes, topRes] = await Promise.allSettled([
        getProducts({ limit: LIMIT, offset: 0, availableOnly: true, ...getModeParams() }),
        getCategories(),
        getApprovedAds(),
        getTopCompanies(user?.phone),
      ]);
      if (prodRes.status === 'fulfilled') {
        setProducts(prodRes.value);
        setOffset(LIMIT);
        setHasMore(prodRes.value.length === LIMIT);
      }
      if (catRes.status === 'fulfilled') setCategories(catRes.value);
      if (adsRes.status === 'fulfilled') setAds(adsRes.value);
      if (topRes.status === 'fulfilled') setTopCompanies(topRes.value);
    } finally {
      setRefreshing(false);
    }
  }, [getModeParams, user?.phone]);

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
    // Apply subscription-based round-robin ordering: subscribed-company products
    // first, interleaved fairly across companies, with a per-reload random seed
    // so the order re-randomizes each load (Req 9.1–9.3).
    return orderListing(list, listingSeed);
  }, [products, debouncedSearch, activeCategory, listingSeed]);

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

  // Ad banner carousel + Top Companies promo — shown at the top of the feed
  // (hidden while searching or filtering by category). The banner only renders
  // when there are approved ads; the Top Companies section only renders when the
  // backend returns more than one company (mirrors the feed's existing gating).
  const ListHeader = useMemo(() => {
    if (debouncedSearch.trim() || activeCategory) return null;

    const showBanner = ads.length > 0;
    const showTopCompanies = topCompanies.length > 1;
    if (!showBanner && !showTopCompanies) return null;

    return (
      <View>
        {showBanner && (
          <View style={styles.bannerWrap}>
            <BannerCarousel ads={ads} />
          </View>
        )}

        {showTopCompanies && (
          <View style={styles.topCompaniesWrap}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('topCompanies')}</Text>
            <FlatList
              data={topCompanies}
              horizontal
              keyExtractor={item => String(item.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.topCompaniesList}
              renderItem={({ item }) => {
                const logo = getImageUrl(item.logoUrl);
                return (
                  <TouchableOpacity
                    style={[styles.companyCard, { backgroundColor: colors.surface }]}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('CompanyStore', { companyId: item.id })}
                  >
                    <View style={[styles.companyLogoBox, { backgroundColor: colors.inputBg }]}>
                      {logo ? (
                        <Image source={{ uri: logo }} style={styles.companyLogo} resizeMode="cover" />
                      ) : (
                        <Ionicons name="storefront-outline" size={26} color={colors.textMuted} />
                      )}
                      {item.isSubscribed && (
                        <View style={[styles.companyBadge, { backgroundColor: colors.primary }]}>
                          <Ionicons name="checkmark" size={11} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.companyName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!!item.address && (
                      <Text style={[styles.companyAddress, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.address}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}
      </View>
    );
  }, [ads, topCompanies, debouncedSearch, activeCategory, colors, navigation, t]);

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
            placeholder={t('searchPlaceholder')}
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
              {debouncedSearch.trim() ? t('notFound') : t('noProducts')}
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
                {(() => {
                  const resolved = resolveCategoryIcon(item.icon);
                  return resolved.kind === 'image' ? (
                    <Image
                      source={{ uri: resolved.value }}
                      style={styles.drawerIconImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={styles.drawerIconEmoji}>{resolved.value}</Text>
                  );
                })()}
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
  bannerWrap: {
    paddingTop: 4,
    paddingBottom: 4,
  },

  topCompaniesWrap: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  topCompaniesList: {
    paddingHorizontal: 12,
    gap: 12,
  },
  companyCard: {
    width: 110,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  companyLogoBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  companyLogo: {
    width: '100%',
    height: '100%',
  },
  companyBadge: {
    position: 'absolute',
    bottom: 0,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  companyName: {
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  companyAddress: {
    fontSize: 10.5,
    textAlign: 'center',
    marginTop: 2,
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
    overflow: 'hidden',
  },
  drawerIconEmoji: { fontSize: 20, textAlign: 'center' },
  drawerIconImage: { width: 26, height: 26, borderRadius: 6 },
  drawerRowText: { flex: 1, fontSize: 15, fontWeight: '500' },
});
