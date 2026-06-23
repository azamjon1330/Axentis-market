import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Image, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { getCompanyDetail, getProducts, getCompanyStats, subscribeToCompany, unsubscribeFromCompany } from '../../api';
import { getImageUrl } from '../../utils/imageUrl';
import ProductCard from '../../components/common/ProductCard';
import { Radius, Spacing } from '../../constants/theme';

const SUBS_KEY = 'subscribedCompanies';

async function getLocalSubs() {
  try {
    const d = await AsyncStorage.getItem(SUBS_KEY);
    return d ? JSON.parse(d) : [];
  } catch { return []; }
}

async function saveLocalSubs(ids) {
  await AsyncStorage.setItem(SUBS_KEY, JSON.stringify(ids));
}

export default function CompanyStoreScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const navigation = useNavigation();
  const route = useRoute();
  const { companyId } = route.params;

  const [company, setCompany] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [companyStats, setCompanyStats] = useState(null);

  const load = useCallback(async () => {
    try {
      const [compRes, prodRes, statsRes] = await Promise.allSettled([
        getCompanyDetail(companyId),
        getProducts({ companyId }),
        getCompanyStats(companyId),
      ]);
      if (compRes.status === 'fulfilled') setCompany(compRes.value);
      if (prodRes.status === 'fulfilled') setProducts(prodRes.value);
      if (statsRes.status === 'fulfilled') setCompanyStats(statsRes.value);

      const subs = await getLocalSubs();
      setIsSubscribed(subs.includes(companyId));
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleSubscribe = async () => {
    if (!user) {
      Alert.alert('Требуется авторизация', 'Войдите в аккаунт чтобы подписаться');
      return;
    }
    setIsSubscribing(true);
    try {
      const subs = await getLocalSubs();
      if (isSubscribed) {
        await unsubscribeFromCompany(companyId, user.phone);
        await saveLocalSubs(subs.filter(id => id !== companyId));
        setIsSubscribed(false);
      } else {
        await subscribeToCompany(companyId, user.phone);
        await saveLocalSubs([...subs, companyId]);
        setIsSubscribed(true);
      }
    } catch {
      Alert.alert('Ошибка', 'Попробуйте позже');
    } finally {
      setIsSubscribing(false);
    }
  };

  const logoUri = getImageUrl(company?.logoUrl);

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

      <FlatList
        data={products}
        numColumns={2}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={[styles.topBar, { backgroundColor: colors.background }]}>
              <TouchableOpacity
                style={[styles.backBtn, { backgroundColor: colors.surface }]}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.topTitle, { color: colors.text }]} numberOfLines={1}>
                {company?.name || 'Магазин'}
              </Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Store cover + overlapping avatar (Amazon storefront style) */}
            <View style={[styles.cover, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.coverAccent, { backgroundColor: colors.primary + '22' }]} />
            </View>

            <View style={[styles.companyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.avatarFloat}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={[styles.logo, { borderColor: colors.surface }]} />
                ) : (
                  <View style={[styles.logoFallback, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
                    <Text style={styles.logoInitial}>
                      {company?.name?.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={[styles.companyName, { color: colors.text }]}>{company?.name}</Text>
              {company?.address ? (
                <View style={styles.addressRow}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.addressText, { color: colors.textMuted }]} numberOfLines={1}>
                    {company.address}
                  </Text>
                </View>
              ) : null}

              {/* Stat tiles */}
              <View style={styles.statTiles}>
                <View style={[styles.statTile, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {companyStats?.total_products ?? products.length}
                  </Text>
                  <Text style={[styles.statTileLabel, { color: colors.textMuted }]}>Товары</Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {companyStats?.subscribers ?? 0}
                  </Text>
                  <Text style={[styles.statTileLabel, { color: colors.textMuted }]}>Подписчики</Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: colors.cardAlt }]}>
                  <View style={styles.ratingValue}>
                    <Ionicons name="star" size={14} color={colors.star} />
                    <Text style={[styles.statValue, { color: colors.text }]}>
                      {Number(company?.rating ?? companyStats?.rating ?? 5).toFixed(1)}
                    </Text>
                  </View>
                  <Text style={[styles.statTileLabel, { color: colors.textMuted }]}>Рейтинг</Text>
                </View>
              </View>

              {company?.description ? (
                <Text style={[styles.companyDesc, { color: colors.textSecondary }]} numberOfLines={3}>
                  {company.description}
                </Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.subscribeBtn,
                  {
                    backgroundColor: isSubscribed ? 'transparent' : colors.primary,
                    borderColor: isSubscribed ? colors.primary : 'transparent',
                    borderWidth: 1,
                  },
                ]}
                onPress={handleSubscribe}
                disabled={isSubscribing}
                activeOpacity={0.8}
              >
                {isSubscribing ? (
                  <ActivityIndicator color={isSubscribed ? colors.primary : '#FFF'} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={isSubscribed ? 'checkmark-circle-outline' : 'add-circle-outline'}
                      size={18}
                      color={isSubscribed ? colors.primary : '#FFF'}
                    />
                    <Text style={[styles.subscribeBtnText, { color: isSubscribed ? colors.primary : '#FFF' }]}>
                      {isSubscribed ? 'Подписан' : 'Подписаться'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.productsLabel, { color: colors.text }]}>Товары</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={52} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Нет товаров</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ProductCard
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              onFavorite={() => toggleFav(item.id, item)}
              isFavorite={isFavorite(item.id)}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  cover: {
    marginHorizontal: 16,
    height: 96,
    borderRadius: Radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  coverAccent: { flex: 1 },
  companyCard: {
    marginHorizontal: 16,
    marginTop: -40,
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: 16,
    gap: 12,
  },
  avatarFloat: { marginTop: -52 },
  logo: { width: 72, height: 72, borderRadius: Radius.card, borderWidth: 3 },
  logoFallback: { width: 72, height: 72, borderRadius: Radius.card, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  logoInitial: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  companyName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressText: { fontSize: 13, flex: 1 },
  statTiles: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statTile: { flex: 1, borderRadius: Radius.input, paddingVertical: 12, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  ratingValue: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statTileLabel: { fontSize: 11, fontWeight: '600' },
  companyDesc: { fontSize: 14, lineHeight: 20 },
  subscribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: Radius.button },
  subscribeBtnText: { fontSize: 15, fontWeight: '600' },
  productsLabel: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 16, marginBottom: 12 },
  listContent: { paddingBottom: 24 },
  row: { paddingHorizontal: 16, gap: 12 },
  cardWrap: { flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 15 },
});
