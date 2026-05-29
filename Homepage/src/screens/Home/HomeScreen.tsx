import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Animated,
  TextInput, Pressable, useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useLanguage } from '../../context/LanguageContext';
import { getProducts, getCategories, getApprovedAds } from '../../api';
import { getLocalSubs } from '../Company/CompanyStoreScreen';
import { Product, Category, Ad, RootStackParamList } from '../../types';
import ProductCard from '../../components/common/ProductCard';
import BannerCarousel from '../../components/common/BannerCarousel';

const LIMIT = 20;

type Nav = NativeStackNavigationProp<RootStackParamList>;

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

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const DRAWER_WIDTH = Math.min(width * 0.82, 340);
  const CARD_WIDTH = (width - 16 * 2 - 10) / 2;

  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { count: cartCount } = useCart();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const { t } = useLanguage();
  const navigation = useNavigation<Nav>();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [subscribedIds, setSubscribedIds] = useState<number[]>([]);

  // Drawer animation
  const drawerX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const getModeParams = useCallback(() => {
    if (user?.mode === 'private' && user.privateCompanyId) {
      return { mode: 'private' as const, privateCompanyId: user.privateCompanyId };
    }
    return {};
  }, [user?.mode, user?.privateCompanyId]);

  const loadInitial = useCallback(async () => {
    try {
      const [prodRes, catRes, adsRes] = await Promise.allSettled([
        getProducts({ limit: LIMIT, offset: 0, ...getModeParams() }),
        getCategories(),
        getApprovedAds(),
      ]);
      if (prodRes.status === 'fulfilled') {
        setProducts(prodRes.value);
        setHasMore(prodRes.value.length === LIMIT);
      }
      if (catRes.status === 'fulfilled') setCategories(catRes.value);
      if (adsRes.status === 'fulfilled') setAds(adsRes.value);
      const subs = await getLocalSubs();
      setSubscribedIds(subs);
    } finally {
      setIsLoading(false);
    }
  }, [getModeParams]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const onRefresh = async () => {
    setRefreshing(true);
    setOffset(0);
    setHasMore(true);
    try {
      const [prodRes, catRes, adsRes] = await Promise.allSettled([
        getProducts({ limit: LIMIT, offset: 0, ...getModeParams() }),
        getCategories(),
        getApprovedAds(),
      ]);
      if (prodRes.status === 'fulfilled') {
        setProducts(prodRes.value);
        setHasMore(prodRes.value.length === LIMIT);
      }
      if (catRes.status === 'fulfilled') setCategories(catRes.value);
      if (adsRes.status === 'fulfilled') setAds(adsRes.value);
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (isLoadingMore || !hasMore || search.trim()) return;
    setIsLoadingMore(true);
    try {
      const newOffset = offset + LIMIT;
      const more = await getProducts({ limit: LIMIT, offset: newOffset, ...getModeParams() });
      if (more.length > 0) {
        setProducts(prev => [...prev, ...more]);
        setOffset(newOffset);
        setHasMore(more.length === LIMIT);
      } else {
        setHasMore(false);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Filter by search + weight subscribed companies
  const displayProducts = useMemo(() => {
    let list = search.trim()
      ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      : products;
    if (subscribedIds.length === 0 || search.trim()) return list;
    const subbed = list.filter(p => subscribedIds.includes(p.companyId));
    const others = list.filter(p => !subscribedIds.includes(p.companyId));
    const result: Product[] = [];
    let s = 0, o = 0;
    while (s < subbed.length || o < others.length) {
      if (s < subbed.length) result.push(subbed[s++]);
      if (s < subbed.length) result.push(subbed[s++]);
      if (o < others.length) result.push(others[o++]);
    }
    return result;
  }, [products, search, subscribedIds]);

  // Popular = top 6 by soldCount
  const popularProducts = useMemo(() =>
    [...products].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0)).slice(0, 6),
  [products]);

  const ListHeader = useMemo(() => (
    <View>
      {/* Banner carousel */}
      {!search.trim() && <BannerCarousel ads={ads} />}

      {/* Popular section */}
      {!search.trim() && popularProducts.length > 0 && (
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('popular') || 'Популярное'}
          </Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>
              {t('seeAll') || 'Все'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!search.trim() && popularProducts.length > 0 && (
        <FlatList
          horizontal
          data={popularProducts}
          keyExtractor={(item) => `pop-${item.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          style={{ marginBottom: 20 }}
          renderItem={({ item }) => (
            <View style={{ width: 150 }}>
              <ProductCard
                product={item}
                onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
                onFavorite={() => toggleFav(item.id, item)}
                isFavorite={isFavorite(item.id)}
              />
            </View>
          )}
        />
      )}

      {/* All products header */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: colors.textMuted }]} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {search.trim() ? (t('searchResults') || 'Результаты поиска') : (t('allProducts') || 'Все товары')}
        </Text>
      </View>
    </View>
  ), [ads, popularProducts, search, colors, t]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.menuBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={openDrawer}
          activeOpacity={0.7}
        >
          <Ionicons name="menu-outline" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

        <TouchableOpacity
          style={[styles.cartBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate('Cart' as any)}
          activeOpacity={0.7}
        >
          <Ionicons name="bag-outline" size={22} color={colors.text} />
          {cartCount > 0 && (
            <View style={[styles.cartBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Products grid */}
      <FlatList
        data={displayProducts}
        numColumns={2}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.grid, { paddingHorizontal: 16 }]}
        columnWrapperStyle={{ gap: 10 }}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={52} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {search.trim() ? (t('notFound') || 'Ничего не найдено') : (t('noProducts') || 'Нет товаров')}
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
          <View style={{ width: CARD_WIDTH }}>
            <ProductCard
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              onFavorite={() => toggleFav(item.id, item)}
              isFavorite={isFavorite(item.id)}
            />
          </View>
        )}
      />

      {/* Drawer overlay */}
      {drawerOpen && (
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
        </Animated.View>
      )}

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          { backgroundColor: colors.surface, width: DRAWER_WIDTH, transform: [{ translateX: drawerX }] },
        ]}
      >
        <View style={[styles.drawerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.drawerTitle, { color: colors.text }]}>{t('catalogTitle')}</Text>
          <TouchableOpacity onPress={closeDrawer} style={[styles.closeBtn, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.drawerRow, { borderBottomColor: colors.divider }]}
          onPress={() => { closeDrawer(); setSearch(''); }}
          activeOpacity={0.7}
        >
          <View style={[styles.drawerIcon, { backgroundColor: colors.primary + '1A' }]}>
            <Ionicons name="apps-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.drawerRowText, { color: colors.text }]}>{t('allProducts')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <FlatList
          data={categories}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.drawerRow, { borderBottomColor: colors.divider }]}
              onPress={() => {
                closeDrawer();
                navigation.navigate('CategoryProducts', { category: item.name, categoryName: item.name });
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.drawerIcon, { backgroundColor: colors.primary + '14' }]}>
                <Ionicons name={getIcon(item.name) as any} size={20} color={colors.primary} />
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
    gap: 8,
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cartBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionDot: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  seeAll: { fontSize: 13, fontWeight: '600' },
  grid: { paddingBottom: 24 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15 },
  loadMore: { paddingVertical: 20, alignItems: 'center' },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 24,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  drawerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 14,
  },
  drawerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerRowText: { flex: 1, fontSize: 14, fontWeight: '500' },
});
