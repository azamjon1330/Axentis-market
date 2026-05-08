import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
  FlatList, Dimensions, ActivityIndicator, Alert, Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { getProductDetail, getProductReviews, getProductReviewStats, toggleFavorite, checkFavorite, getSimilarProducts } from '../../api';
import { Product, Review, ReviewStats, RootStackParamList } from '../../types';
import { UPLOADS_URL } from '../../constants/Api';
import ProductCard from '../../components/common/ProductCard';

const { width } = Dimensions.get('window');
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ProductDetail'>;

export default function ProductDetailScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { addItem, items } = useCart();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { productId } = route.params;

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [imgIndex, setImgIndex] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
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
        getProductReviews(productId),
        getProductReviewStats(productId),
        getSimilarProducts(productId),
      ]);
      if (prodData.status === 'fulfilled') setProduct(prodData.value);
      if (revData.status === 'fulfilled') setReviews(revData.value);
      if (statsData.status === 'fulfilled') setStats(statsData.value);
      if (simData.status === 'fulfilled') setSimilar(simData.value.slice(0, 6));

      if (user && prodData.status === 'fulfilled') {
        try {
          const fav = await checkFavorite(user.phone, productId);
          setIsFavorite(fav);
        } catch { /* ignore */ }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleFavorite = async () => {
    if (!user) return;
    try {
      const res = await toggleFavorite(user.phone, productId);
      setIsFavorite(res.added);
    } catch { /* ignore */ }
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

  const handleShare = async () => {
    if (!product) return;
    await Share.share({ message: `${product.name} — ${(product.sellingPrice || product.price).toLocaleString('ru-RU')} ₽` });
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
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorite ? colors.error : colors.text}
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
                  <Image
                    key={i}
                    source={{ uri: img.startsWith('http') ? img : `${UPLOADS_URL}/${img}` }}
                    style={[styles.mainImg, { width }]}
                    resizeMode="contain"
                  />
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
              · {stats?.totalReviews ? `Более ${stats.totalReviews} отзывов` : 'Более 1000 покупок'}
            </Text>
          </View>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]}>
              {displayPrice.toLocaleString('ru-RU')} ₽
            </Text>
            {originalPrice && (
              <Text style={[styles.oldPrice, { color: colors.textMuted }]}>
                {originalPrice.toLocaleString('ru-RU')} ₽
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
              Курьером, 24 мая — <Text style={{ color: colors.success }}>бесплатно</Text>
            </Text>
          </View>

          {/* Description */}
          <View style={styles.descSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>О товаре</Text>
            <Text
              style={[styles.desc, { color: colors.textSecondary }]}
              numberOfLines={showFullDesc ? undefined : 3}
            >
              {product.name} — это качественный товар от проверенного продавца.
              Категория: {product.category || 'Общее'}. Артикул: {product.barcode || product.id}.
              Доступное количество: {product.quantity} шт.
            </Text>
            <TouchableOpacity onPress={() => setShowFullDesc(p => !p)}>
              <Text style={[styles.showMore, { color: colors.primary }]}>
                {showFullDesc ? 'Свернуть' : 'Читать полностью'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Reviews */}
          {reviews.length > 0 && (
            <View style={styles.reviewsSection}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>
                Отзывы ({reviews.length})
              </Text>
              {reviews.slice(0, 3).map((review) => (
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
                  {review.comment && (
                    <Text style={[styles.reviewComment, { color: colors.textSecondary }]}>{review.comment}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

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
                        source={{ uri: item.images[0].startsWith('http') ? item.images[0] : `${UPLOADS_URL}/${item.images[0]}` }}
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
                      {(item.sellingPrice || item.price).toLocaleString('ru-RU')} ₽
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
            {displayPrice.toLocaleString('ru-RU')} ₽
          </Text>
          {originalPrice && (
            <Text style={[styles.bottomOldPrice, { color: colors.textMuted }]}>
              {originalPrice.toLocaleString('ru-RU')} ₽
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.addBtn,
            { backgroundColor: (inCart || addedToCart) ? colors.success : colors.primary },
          ]}
          onPress={handleAddToCart}
          disabled={isAddingToCart}
          activeOpacity={0.85}
        >
          {isAddingToCart ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons
                name={inCart || addedToCart ? 'checkmark' : 'bag-outline'}
                size={18}
                color="#FFF"
              />
              <Text style={styles.addBtnText}>
                {inCart ? 'В корзине' : addedToCart ? 'Добавлено!' : 'В корзину'}
              </Text>
            </>
          )}
        </TouchableOpacity>
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
  colorCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
  },
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
  descSection: { marginBottom: 20 },
  desc: { fontSize: 14, lineHeight: 21 },
  showMore: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  reviewsSection: { marginBottom: 20 },
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
  reviewComment: { fontSize: 14, lineHeight: 20 },
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
    gap: 16,
  },
  bottomPriceBlock: { flex: 1 },
  bottomPrice: { fontSize: 22, fontWeight: '800' },
  bottomOldPrice: { fontSize: 13, textDecorationLine: 'line-through' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    height: 52,
    borderRadius: 16,
  },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
