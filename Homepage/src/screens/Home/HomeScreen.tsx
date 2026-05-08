import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList,
  Image, RefreshControl, ActivityIndicator, Dimensions, Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { getProducts, getCategories, getAds } from '../../api';
import { Product, Category, Ad } from '../../types';
import { RootStackParamList } from '../../types';
import ProductCard from '../../components/common/ProductCard';
import { UPLOADS_URL } from '../../constants/Api';

const { width } = Dimensions.get('window');

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATIC_CATEGORIES = [
  { id: 'market', name: 'Маркет', icon: 'storefront-outline' },
  { id: 'food', name: 'Еда', icon: 'fast-food-outline' },
  { id: 'taxi', name: 'Такси', icon: 'car-outline' },
  { id: 'delivery', name: 'Доставка', icon: 'bicycle-outline' },
  { id: 'services', name: 'Услуги', icon: 'construct-outline' },
  { id: 'children', name: 'Дети', icon: 'happy-outline' },
  { id: 'nearby', name: 'Рядом', icon: 'location-outline' },
  { id: 'sport', name: 'Спорт', icon: 'fitness-outline' },
];

const BANNER_COLORS: [string, string][] = [
  ['#7B5CF0', '#5B3CD0'],
  ['#FF6B6B', '#EE0979'],
  ['#11998e', '#38ef7d'],
  ['#f7971e', '#ffd200'],
];

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { count: cartCount, addItem } = useCart();
  const navigation = useNavigation<Nav>();

  const [products, setProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerRef = useRef<ScrollView>(null);
  const bannerTimer = useRef<ReturnType<typeof setInterval>>();

  const loadData = useCallback(async () => {
    try {
      const [prodRes, catRes, adsRes] = await Promise.allSettled([
        getProducts({ limit: 20, availableOnly: true }),
        getCategories(),
        getAds(),
      ]);

      if (prodRes.status === 'fulfilled') {
        const all = prodRes.value || [];
        setProducts(all);
        setPopularProducts([...all].sort((a, b) => b.soldCount - a.soldCount).slice(0, 10));
      }
      if (catRes.status === 'fulfilled') setCategories(catRes.value.slice(0, 8));
      if (adsRes.status === 'fulfilled') setAds(adsRes.value.slice(0, 4));
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    bannerTimer.current = setInterval(() => {
      setBannerIndex(prev => {
        const next = (prev + 1) % Math.max(BANNER_COLORS.length, 1);
        bannerRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(bannerTimer.current);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getCityDisplay = () => 'Москва';

  const renderBanners = () => {
    const banners = ads.length > 0 ? ads : BANNER_COLORS.map((_, i) => null);
    return (
      <View style={styles.bannerContainer}>
        <ScrollView
          ref={bannerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            setBannerIndex(index);
          }}
        >
          {BANNER_COLORS.map((grad, i) => (
            <LinearGradient key={i} colors={grad} style={[styles.banner, { width: width - 32 }]}>
              <View style={styles.bannerContent}>
                <Text style={styles.bannerTag}>🔥 Акция</Text>
                <Text style={styles.bannerTitle}>Скидки до 40%</Text>
                <Text style={styles.bannerSubtitle}>на электронику</Text>
                <TouchableOpacity
                  style={styles.bannerBtn}
                  onPress={() => navigation.navigate('Catalog' as any)}
                >
                  <Text style={styles.bannerBtnText}>Смотреть</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.bannerDecor}>
                <Ionicons name="headset" size={80} color="rgba(255,255,255,0.2)" />
              </View>
            </LinearGradient>
          ))}
        </ScrollView>
        <View style={styles.bannerDots}>
          {BANNER_COLORS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === bannerIndex ? '#FFFFFF' : 'rgba(255,255,255,0.4)' },
                i === bannerIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderQuickCategories = () => (
    <View style={styles.quickCats}>
      {STATIC_CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          style={styles.quickCat}
          onPress={() => navigation.navigate('CategoryProducts' as any, { category: cat.name, categoryName: cat.name })}
          activeOpacity={0.7}
        >
          <View style={[styles.quickCatIcon, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name={cat.icon as any} size={22} color={colors.primary} />
          </View>
          <Text style={[styles.quickCatLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {cat.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

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

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.locationBtn} activeOpacity={0.7}>
          <Ionicons name="location-outline" size={16} color={colors.primary} />
          <Text style={[styles.locationText, { color: colors.text }]}>{getCityDisplay()}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surface }]}
            onPress={() => navigation.navigate('Notifications' as any)}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surface }]}
            onPress={() => navigation.navigate('Search' as any)}
          >
            <Ionicons name="search-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Search bar */}
        <TouchableOpacity
          style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate('Search' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.searchPlaceholder, { color: colors.textMuted }]}>Поиск товаров</Text>
        </TouchableOpacity>

        {/* Banners */}
        {renderBanners()}

        {/* Quick categories */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {renderQuickCategories()}
        </View>

        {/* Popular products */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Популярное</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Catalog' as any)}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>Смотреть все</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={popularProducts.slice(0, 6)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.popularCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              activeOpacity={0.85}
            >
              <View style={[styles.popularImgBox, { backgroundColor: colors.cardAlt }]}>
                {item.images?.[0] ? (
                  <Image
                    source={{ uri: item.images[0].startsWith('http') ? item.images[0] : `${UPLOADS_URL}/${item.images[0]}` }}
                    style={styles.popularImg}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons name="cube-outline" size={36} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.popularInfo}>
                <Text style={[styles.popularName, { color: colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={11} color={colors.star} />
                  <Text style={[styles.ratingText, { color: colors.textSecondary }]}> 4.8</Text>
                </View>
                <Text style={[styles.popularPrice, { color: colors.text }]}>
                  {(item.sellingPrice || item.price).toLocaleString('ru-RU')} ₽
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Загрузка товаров...</Text>
          }
        />

        {/* Categories */}
        {categories.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Категории</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Catalog' as any)}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>Смотреть все</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.categoriesGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.catGridItem}
                  onPress={() => navigation.navigate('CategoryProducts' as any, { category: cat.name, categoryName: cat.name })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.catGridIcon, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="grid-outline" size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.catGridLabel, { color: colors.text }]} numberOfLines={2}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* New arrivals */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Новинки</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Catalog' as any)}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>Все</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.productsGrid}>
          {products.slice(0, 6).map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              onFavorite={() => {}}
            />
          ))}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const { width: W } = Dimensions.get('window');
const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 8,
  },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 15, fontWeight: '600' },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingTop: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchPlaceholder: { fontSize: 15 },
  bannerContainer: { marginHorizontal: 16, marginBottom: 16 },
  banner: {
    height: 140,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
    marginRight: 16,
  },
  bannerContent: { flex: 1 },
  bannerTag: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 4 },
  bannerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 2 },
  bannerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginBottom: 12 },
  bannerBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  bannerBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  bannerDecor: { opacity: 0.6 },
  bannerDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18 },
  section: {
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  quickCats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  quickCat: { width: '22%', alignItems: 'center', paddingVertical: 6, gap: 6 },
  quickCatIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickCatLabel: { fontSize: 11, textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  seeAll: { fontSize: 14, fontWeight: '500' },
  horizontalList: { paddingLeft: 16, paddingRight: 8, marginBottom: 16 },
  popularCard: {
    width: 140,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 10,
    overflow: 'hidden',
  },
  popularImgBox: { height: 110, alignItems: 'center', justifyContent: 'center' },
  popularImg: { width: '100%', height: '100%' },
  popularInfo: { padding: 10 },
  popularName: { fontSize: 12, fontWeight: '500', marginBottom: 4, lineHeight: 17 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ratingText: { fontSize: 11 },
  popularPrice: { fontSize: 14, fontWeight: '700' },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 8,
    marginBottom: 16,
    gap: 4,
  },
  catGridItem: { width: '22%', alignItems: 'center', paddingVertical: 8, gap: 6 },
  catGridIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catGridLabel: { fontSize: 10, textAlign: 'center', lineHeight: 14 },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 8,
  },
  emptyText: { paddingVertical: 20, paddingHorizontal: 16, fontSize: 14 },
});
