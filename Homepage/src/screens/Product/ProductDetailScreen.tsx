import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
  FlatList, Dimensions, ActivityIndicator, Alert, Share, TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';
import {
  getProductDetail, getProductReviews, getProductReviewStats,
  getSimilarProducts, submitReview, voteReview,
} from '../../api';
import { Product, Review, ReviewStats, RootStackParamList } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';
import ProductCard from '../../components/common/ProductCard';

const { width } = Dimensions.get('window');
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ProductDetail'>;

export default function ProductDetailScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { addItem, items } = useCart();
  const { isFavorite: ctxIsFavorite, toggle: toggleFav } = useFavorites();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { productId } = route.params;

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [imgIndex, setImgIndex] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [votedReviews, setVotedReviews] = useState<Record<number, 'like' | 'dislike' | null>>({});
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const imgRef = useRef<ScrollView>(null);

  const inCart = items.some(i => i.productId === productId);

  useEffect(() => {
    loadAll();
  }, [productId]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [prodData, revData, statsData, simData] = await Promise.allSettled([
        getProductDetail(productId),
        getProductReviews(productId, user?.phone),
        getProductReviewStats(productId),
        getSimilarProducts(productId),
      ]);
      if (prodData.status === 'fulfilled') setProduct(prodData.value);
      if (revData.status === 'fulfilled') {
        setReviews(revData.value);
        const initialVotes: Record<number, 'like' | 'dislike' | null> = {};
        revData.value.forEach(r => {
          if (r.userVote) initialVotes[r.id] = r.userVote;
        });
        setVotedReviews(initialVotes);
      }
      if (statsData.status === 'fulfilled') setStats(statsData.value);
      if (simData.status === 'fulfilled') setSimilar(simData.value.slice(0, 6));

    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleFavorite = () => {
    if (!user) return;
    toggleFav(productId, product ?? undefined);
  };

  const handleAddToCart = async () => {
    if (!product || !user) return;
    if (inCart) {
      navigation.navigate('Main' as any, { screen: 'Cart' });
      return;
    }
    setIsAddingToCart(true);
    try {
      await addItem(productId, 1, selectedColor || undefined);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось добавить в корзину');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product || !user) return;
    if (!inCart) {
      try {
        await addItem(productId, 1, selectedColor || undefined);
      } catch { /* ignore */ }
    }
    navigation.navigate('Checkout');
  };

  const handleShare = async () => {
    if (!product) return;
    await Share.share({ message: `${product.name} — ${(product.sellingPrice || product.price).toLocaleString('ru-RU')} сум` });
  };

  const handleVote = async (reviewId: number, voteType: 'like' | 'dislike') => {
    if (!user) return;
    const currentVote = votedReviews[reviewId] ?? null;

    // Optimistic UI update
    const newVote = currentVote === voteType ? null : voteType;
    setVotedReviews(prev => ({ ...prev, [reviewId]: newVote }));
    setReviews(prev => prev.map(r => {
      if (r.id !== reviewId) return r;
      let likes = r.likes;
      let dislikes = r.dislikes;
      if (currentVote === 'like') likes = Math.max(0, likes - 1);
      if (currentVote === 'dislike') dislikes = Math.max(0, dislikes - 1);
      if (newVote === 'like') likes = likes + 1;
      if (newVote === 'dislike') dislikes = dislikes + 1;
      return { ...r, likes, dislikes };
    }));

    try {
      await voteReview(reviewId, user.phone, voteType);
    } catch {
      // Revert on failure
      setVotedReviews(prev => ({ ...prev, [reviewId]: currentVote }));
      setReviews(prev => prev.map(r => {
        if (r.id !== reviewId) return r;
        let likes = r.likes;
        let dislikes = r.dislikes;
        if (newVote === 'like') likes = Math.max(0, likes - 1);
        if (newVote === 'dislike') dislikes = Math.max(0, dislikes - 1);
        if (currentVote === 'like') likes = likes + 1;
        if (currentVote === 'dislike') dislikes = dislikes + 1;
        return { ...r, likes, dislikes };
      }));
    }
  };

  const handleSubmitReview = async () => {
    if (!user || !product) return;
    if (!newComment.trim()) {
      Alert.alert('Ошибка', 'Нельзя отправить пустой отзыв');
      return;
    }
    const userReviewCount = reviews.filter(r => r.userPhone === user.phone).length;
    if (userReviewCount >= 2) {
      Alert.alert('Ограничение', 'Вы уже оставили максимальное количество отзывов (2) для этого товара');
      return;
    }
    setIsSubmittingReview(true);
    try {
      const review = await submitReview({
        product_id: productId,
        user_phone: user.phone,
        user_name: user.name,
        rating: newRating,
        comment: newComment.trim() || undefined,
      });
      setReviews(prev => [review, ...prev]);
      setNewComment('');
      setNewRating(5);
      Alert.alert('Спасибо!', 'Ваш отзыв добавлен');
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось отправить отзыв');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Товар не найден</Text>
      </View>
    );
  }

  const images = product.images?.length > 0 ? product.images : [];
  const displayPrice = product.discountedPrice || product.sellingPrice || product.price;
  const originalPrice = product.discountedPrice ? (product.sellingPrice || product.price) : null;
  const discount = product.discountPercent;

  const COLORS = ['#1E1E1E', '#F5F5F5', '#7B5CF0', '#FF6B6B', '#4CAF50'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.topBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.topActions}>
          <TouchableOpacity onPress={handleShare} style={[styles.topBtn, { backgroundColor: colors.surface }]}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleFavorite} style={[styles.topBtn, { backgroundColor: colors.surface }]}>
            <Ionicons
              name={ctxIsFavorite(productId) ? 'heart' : 'heart-outline'}
              size={20}
              color={ctxIsFavorite(productId) ? colors.error : colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image gallery */}
        <View style={[styles.imgGallery, { backgroundColor: colors.cardAlt }]}>
          {images.length > 0 ? (
            <>
              <ScrollView
                ref={imgRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  setImgIndex(Math.round(e.nativeEvent.contentOffset.x / width));
                }}
              >
                {images.map((img, i) => (
                  imgErrors[i] ? (
                    <View key={i} style={[styles.noImg, { width }]}>
                      <Ionicons name="cube-outline" size={80} color={colors.textMuted} />
                    </View>
                  ) : (
                    <Image
                      key={i}
                      source={{ uri: getImageUrl(img) || '' }}
                      style={[styles.mainImg, { width }]}
                      resizeMode="contain"
                      onError={() => setImgErrors(prev => ({ ...prev, [i]: true }))}
                    />
                  )
                ))}
              </ScrollView>
              {images.length > 1 && (
                <View style={styles.imgDots}>
                  {images.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.imgDot,
                        { backgroundColor: i === imgIndex ? colors.primary : colors.border },
                        i === imgIndex && { width: 18 },
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={[styles.noImg, { width }]}>
              <Ionicons name="cube-outline" size={80} color={colors.textMuted} />
            </View>
          )}

          {/* Badges */}
          <View style={styles.badges}>
            {discount && discount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <Text style={styles.badgeText}>-{discount}%</Text>
              </View>
            )}
            {product.soldCount > 100 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>Топ</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.body}>
          {/* Title + rating */}
          <Text style={[styles.prodName, { color: colors.text }]}>{product.name}</Text>

          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons
                key={s}
                name={s <= Math.round(stats?.averageRating || 4.5) ? 'star' : 'star-outline'}
                size={14}
                color={colors.star}
              />
            ))}
            <Text style={[styles.ratingNum, { color: colors.textSecondary }]}>
              {stats?.averageRating?.toFixed(1) || '4.8'}
            </Text>
            <Text style={[styles.ratingCount, { color: colors.textMuted }]}>
              · {stats?.totalReviews ? `${stats.totalReviews} отзывов` : 'Нет отзывов'}
            </Text>
          </View>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]}>
              {displayPrice.toLocaleString('ru-RU')} сум
            </Text>
            {originalPrice && (
              <Text style={[styles.oldPrice, { color: colors.textMuted }]}>
                {originalPrice.toLocaleString('ru-RU')} сум
              </Text>
            )}
          </View>

          {/* Color selector */}
          {product.hasColorOptions && (
            <View style={styles.colorSection}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Цвет:</Text>
              <View style={styles.colorRow}>
                {COLORS.slice(0, 4).map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c, borderColor: selectedColor === c ? colors.primary : colors.border },
                      selectedColor === c && styles.colorSelected,
                    ]}
                    onPress={() => setSelectedColor(selectedColor === c ? null : c)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Delivery */}
          <View style={[styles.deliveryBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="bicycle-outline" size={18} color={colors.primary} />
            <Text style={[styles.deliveryText, { color: colors.text }]}>
              Курьером · <Text style={{ color: colors.success }}>Доставка доступна</Text>
            </Text>
          </View>

          {/* Description */}
          <View style={styles.descSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>О товаре</Text>
            <Text
              style={[styles.desc, { color: colors.textSecondary }]}
              numberOfLines={showFullDesc ? undefined : 4}
            >
              {product.description
                ? product.description
                : `${product.name}. Категория: ${product.category || 'Общее'}. Артикул: ${product.barcode || product.id}. Доступно: ${product.quantity} шт.`
              }
            </Text>
            <TouchableOpacity onPress={() => setShowFullDesc(p => !p)}>
              <Text style={[styles.showMore, { color: colors.primary }]}>
                {showFullDesc ? 'Свернуть' : 'Читать полностью'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Company */}
          {product.companyId ? (
            <TouchableOpacity
              style={[styles.companyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate('CompanyStore', { companyId: product.companyId })}
              activeOpacity={0.8}
            >
              <View style={[styles.companyIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="storefront-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.companyLabel, { color: colors.textMuted }]}>Продавец</Text>
                <Text style={[styles.companyName, { color: colors.text }]}>
                  {product.companyName || `Магазин #${product.companyId}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          {/* Write Review */}
          {user && reviews.filter(r => r.userPhone === user.phone).length < 2 ? (
            <View style={[styles.writeReviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Написать отзыв</Text>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity key={s} onPress={() => setNewRating(s)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                    <Ionicons
                      name={s <= newRating ? 'star' : 'star-outline'}
                      size={30}
                      color={colors.star}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.reviewInput, {
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                  borderColor: colors.border,
                }]}
                placeholder="Поделитесь впечатлениями..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                value={newComment}
                onChangeText={setNewComment}
              />
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmitReview}
                disabled={isSubmittingReview}
                activeOpacity={0.85}
              >
                {isSubmittingReview ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Отправить отзыв</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Reviews */}
          <View style={styles.reviewsSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              Отзывы {reviews.length > 0 ? `(${reviews.length})` : ''}
            </Text>
            {reviews.length === 0 ? (
              <Text style={[styles.noReviews, { color: colors.textMuted }]}>Нет отзывов. Будьте первым!</Text>
            ) : (
              reviews.map((review) => (
                <View
                  key={review.id}
                  style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.reviewHeader}>
                    <View style={[styles.reviewAvatar, { backgroundColor: colors.primary + '30' }]}>
                      <Text style={[styles.reviewAvatarText, { color: colors.primary }]}>
                        {review.userName?.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewName, { color: colors.text }]}>{review.userName}</Text>
                      <View style={styles.reviewStars}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Ionicons key={s} name={s <= review.rating ? 'star' : 'star-outline'} size={11} color={colors.star} />
                        ))}
                      </View>
                    </View>
                    <Text style={[styles.reviewDate, { color: colors.textMuted }]}>
                      {new Date(review.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  {review.comment ? (
                    <Text style={[styles.reviewComment, { color: colors.textSecondary }]}>{review.comment}</Text>
                  ) : null}
                  {/* Like / Dislike */}
                  <View style={styles.voteRow}>
                    <TouchableOpacity
                      style={[
                        styles.voteBtn,
                        { backgroundColor: votedReviews[review.id] === 'like' ? colors.primary + '20' : colors.inputBg },
                      ]}
                      onPress={() => handleVote(review.id, 'like')}
                    >
                      <Ionicons
                        name={votedReviews[review.id] === 'like' ? 'thumbs-up' : 'thumbs-up-outline'}
                        size={14}
                        color={votedReviews[review.id] === 'like' ? colors.primary : colors.textMuted}
                      />
                      <Text style={[
                        styles.voteCount,
                        { color: votedReviews[review.id] === 'like' ? colors.primary : colors.textMuted },
                      ]}>
                        {review.likes}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.voteBtn,
                        { backgroundColor: votedReviews[review.id] === 'dislike' ? colors.error + '20' : colors.inputBg },
                      ]}
                      onPress={() => handleVote(review.id, 'dislike')}
                    >
                      <Ionicons
                        name={votedReviews[review.id] === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'}
                        size={14}
                        color={votedReviews[review.id] === 'dislike' ? colors.error : colors.textMuted}
                      />
                      <Text style={[
                        styles.voteCount,
                        { color: votedReviews[review.id] === 'dislike' ? colors.error : colors.textMuted },
                      ]}>
                        {review.dislikes}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Similar */}
          {similar.length > 0 && (
            <View style={styles.similarSection}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Похожие товары</Text>
              <FlatList
                data={similar}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ gap: 10 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.similarCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => navigation.replace('ProductDetail', { productId: item.id })}
                    activeOpacity={0.8}
                  >
                    {item.images?.[0] ? (
                      <Image
                        source={{ uri: getImageUrl(item.images[0]) || '' }}
                        style={styles.similarImg}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.similarImg, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="cube-outline" size={30} color={colors.textMuted} />
                      </View>
                    )}
                    <Text style={[styles.similarName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                    <Text style={[styles.similarPrice, { color: colors.primary }]}>
                      {(item.sellingPrice || item.price).toLocaleString('ru-RU')} сум
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.bottomPriceBlock}>
          <Text style={[styles.bottomPrice, { color: colors.text }]}>
            {displayPrice.toLocaleString('ru-RU')} сум
          </Text>
          {originalPrice && (
            <Text style={[styles.bottomOldPrice, { color: colors.textMuted }]}>
              {originalPrice.toLocaleString('ru-RU')} сум
            </Text>
          )}
        </View>
        <View style={styles.ctaButtons}>
          <TouchableOpacity
            style={[
              styles.addBtn,
              { backgroundColor: (inCart || addedToCart) ? colors.success : colors.primary + '20',
                borderWidth: 1, borderColor: (inCart || addedToCart) ? colors.success : colors.primary },
            ]}
            onPress={handleAddToCart}
            disabled={isAddingToCart}
            activeOpacity={0.85}
          >
            {isAddingToCart ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons
                name={inCart || addedToCart ? 'checkmark' : 'bag-outline'}
                size={20}
                color={(inCart || addedToCart) ? '#FFF' : colors.primary}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.buyNowBtn, { backgroundColor: colors.primary }]}
            onPress={handleBuyNow}
            activeOpacity={0.85}
          >
            <Text style={styles.buyNowText}>Купить сейчас</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActions: { flexDirection: 'row', gap: 8 },
  imgGallery: { paddingTop: 100 },
  mainImg: { height: 300 },
  noImg: { height: 300, alignItems: 'center', justifyContent: 'center' },
  imgDots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  imgDot: { width: 6, height: 6, borderRadius: 3 },
  badges: { position: 'absolute', top: 110, left: 16, flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  body: { padding: 16 },
  prodName: { fontSize: 20, fontWeight: '700', marginBottom: 10, lineHeight: 28 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 12 },
  ratingNum: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  ratingCount: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 16 },
  price: { fontSize: 26, fontWeight: '800' },
  oldPrice: { fontSize: 15, textDecorationLine: 'line-through', marginBottom: 2 },
  colorSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  colorSelected: { transform: [{ scale: 1.15 }] },
  deliveryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  deliveryText: { fontSize: 14 },
  descSection: { marginBottom: 16 },
  desc: { fontSize: 14, lineHeight: 21 },
  showMore: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  companyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyLabel: { fontSize: 11, marginBottom: 2 },
  companyName: { fontSize: 15, fontWeight: '600' },
  writeReviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  starRow: { flexDirection: 'row', gap: 6 },
  reviewInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  reviewsSection: { marginBottom: 20 },
  noReviews: { fontSize: 14, marginTop: 4 },
  reviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarText: { fontSize: 16, fontWeight: '700' },
  reviewName: { fontSize: 14, fontWeight: '600' },
  reviewStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 12 },
  reviewComment: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  voteRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  voteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  voteCount: { fontSize: 12, fontWeight: '600' },
  similarSection: { marginBottom: 20 },
  similarCard: {
    width: 130,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
  },
  similarImg: { width: '100%', height: 100, borderRadius: 8 },
  similarName: { fontSize: 12, fontWeight: '500', marginTop: 6, marginBottom: 4, lineHeight: 17 },
  similarPrice: { fontSize: 13, fontWeight: '700' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    paddingBottom: 28,
    gap: 12,
  },
  bottomPriceBlock: { flex: 1 },
  bottomPrice: { fontSize: 22, fontWeight: '800' },
  bottomOldPrice: { fontSize: 13, textDecorationLine: 'line-through' },
  ctaButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyNowBtn: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyNowText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
