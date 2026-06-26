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
import {
  getCompanyDetail, getProducts, getCompanyStats, subscribeToCompany, unsubscribeFromCompany,
  rateCompany, getCompanyReviews,
} from '../../api';
import { getImageUrl } from '../../utils/imageUrl';
import ProductCard from '../../components/common/ProductCard';
import { Radius, Spacing } from '../../constants/theme';
import { TextInput } from 'react-native';

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
  const [reviews, setReviews] = useState([]);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const loadReviews = useCallback(async () => {
    try { setReviews(await getCompanyReviews(companyId)); } catch { /* ignore */ }
  }, [companyId]);

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
      loadReviews();

      const subs = await getLocalSubs();
      setIsSubscribed(subs.includes(companyId));
    } finally {
      setIsLoading(false);
    }
  }, [companyId, loadReviews]);

  const handleSubmitReview = async () => {
    if (!user) {
      Alert.alert('Требуется авторизация', 'Войдите в аккаунт, чтобы оставить отзыв');
      return;
    }
    setSubmittingReview(true);
    try {
      await rateCompany(companyId, {
        userPhone: user.phone,
        userName: user.name,
        rating: newRating,
        comment: newComment.trim(),
      });
      setNewComment('');
      setNewRating(5);
      await Promise.all([loadReviews(), getCompanyDetail(companyId).then(setCompany).catch(() => {})]);
      Alert.alert('Спасибо!', 'Ваш отзыв о магазине сохранён');
    } catch (err) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось отправить отзыв');
    } finally {
      setSubmittingReview(false);
    }
  };

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
  const companyRating = Number(company?.averageRating ?? company?.rating ?? companyStats?.rating ?? 0);

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

              <View style={styles.nameRow}>
                <Text style={[styles.companyName, { color: colors.text }]} numberOfLines={1}>{company?.name}</Text>
                {companyRating >= 4.5 && (
                  <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                )}
              </View>
              {companyRating >= 4.5 && (
                <View style={[styles.verifiedBadge, { backgroundColor: '#3B82F6' + '18' }]}>
                  <Ionicons name="shield-checkmark" size={12} color="#3B82F6" />
                  <Text style={styles.verifiedText}>Магазин подтверждён</Text>
                </View>
              )}
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
        ListFooterComponent={
          <View style={styles.reviewsWrap}>
            <Text style={[styles.productsLabel, { color: colors.text, paddingHorizontal: 0, marginBottom: 4 }]}>
              Отзывы о магазине {reviews.length > 0 ? `(${reviews.length})` : ''}
            </Text>

            {/* Оцените магазин */}
            <View style={styles.rateCard}>
              <Text style={[styles.rateTitle, { color: colors.text }]}>Оцените магазин</Text>
              <Text style={[styles.rateSub, { color: colors.textMuted }]}>
                Ваш отзыв поможет другим покупателям сделать правильный выбор
              </Text>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity key={s} onPress={() => setNewRating(s)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                    <Ionicons name={s <= newRating ? 'star' : 'star-outline'} size={30} color={colors.star} />
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.reviewInputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.reviewInput, { color: colors.text }]}
                  placeholder="Поделитесь своими впечатлениями о магазине…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={500}
                  value={newComment}
                  onChangeText={setNewComment}
                />
                <Text style={[styles.charCounter, { color: colors.textMuted }]}>{newComment.length}/500</Text>
              </View>
              <View style={styles.tipsRow}>
                {['Качество товара', 'Скорость доставки', 'Обслуживание', 'Цены'].map((tip) => (
                  <View key={tip} style={[styles.tipChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Text style={[styles.tipChipText, { color: colors.textSecondary }]}>{tip}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submittingReview ? 0.6 : 1 }]}
                onPress={handleSubmitReview}
                disabled={submittingReview}
                activeOpacity={0.85}
              >
                {submittingReview
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={styles.submitBtnText}>Отправить отзыв</Text>}
              </TouchableOpacity>
            </View>

            {/* Список отзывов */}
            {reviews.map((r, i) => (
              <View key={i} style={[styles.reviewItem, { borderTopColor: colors.divider, borderTopWidth: i === 0 ? 0 : 1 }]}>
                <View style={styles.reviewHead}>
                  <View style={[styles.reviewAvatar, { backgroundColor: colors.primary + '30' }]}>
                    <Text style={[styles.reviewAvatarText, { color: colors.primary }]}>
                      {(r.userName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewName, { color: colors.text }]}>{r.userName || 'Покупатель'}</Text>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Ionicons key={s} name={s <= r.rating ? 'star' : 'star-outline'} size={11} color={colors.star} />
                      ))}
                    </View>
                  </View>
                  {r.createdAt ? (
                    <Text style={[styles.reviewDate, { color: colors.textMuted }]}>
                      {new Date(r.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </Text>
                  ) : null}
                </View>
                {r.comment ? <Text style={[styles.reviewComment, { color: colors.textSecondary }]}>{r.comment}</Text> : null}
              </View>
            ))}
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  companyName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, flexShrink: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  verifiedText: { color: '#3B82F6', fontSize: 11, fontWeight: '700' },
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
  reviewsWrap: { paddingHorizontal: 16, paddingTop: 20 },
  rateCard: { paddingVertical: 4, marginBottom: 12 },
  rateTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  rateSub: { fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  starRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  reviewInputWrap: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  reviewInput: { fontSize: 14, minHeight: 64, textAlignVertical: 'top', padding: 0 },
  charCounter: { fontSize: 11, alignSelf: 'flex-end', marginTop: 4 },
  tipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 14 },
  tipChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  tipChipText: { fontSize: 11.5, fontWeight: '500' },
  submitBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  reviewItem: { paddingVertical: 12 },
  reviewHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { fontSize: 16, fontWeight: '700' },
  reviewName: { fontSize: 14, fontWeight: '600' },
  reviewStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 12 },
  reviewComment: { fontSize: 14, lineHeight: 20 },
});
