import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
  FlatList, Dimensions, ActivityIndicator, Alert, Share, TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';
import {
  getProductDetail, getProductReviews, getProductReviewStats,
  getSimilarProducts, submitReview, voteReview, getProductVariants,
} from '../../api';
import { getImageUrl } from '../../utils/imageUrl';
import ProductCard from '../../components/common/ProductCard';

const { width } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { addItem, items } = useCart();
  const { isFavorite: ctxIsFavorite, toggle: toggleFav } = useFavorites();
  const navigation = useNavigation();
  const route = useRoute();
  const { productId } = route.params;

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [variants, setVariants] = useState([]);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [imgIndex, setImgIndex] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [votedReviews, setVotedReviews] = useState({});
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [imgErrors, setImgErrors] = useState({});
  const imgRef = useRef(null);

  const inCart = items.some(i => i.productId === productId);

  useEffect(() => {
    loadAll();
  }, [productId]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [prodData, revData, statsData, simData, varData] = await Promise.allSettled([
        getProductDetail(productId),
        getProductReviews(productId, user?.phone),
        getProductReviewStats(productId),
        getSimilarProducts(productId),
        getProductVariants(productId),
      ]);
      if (prodData.status === 'fulfilled') setProduct(prodData.value);
      if (revData.status === 'fulfilled') {
        setReviews(revData.value);
        const initialVotes = {};
        revData.value.forEach(r => {
          if (r.userVote) initialVotes[r.id] = r.userVote;
        });
        setVotedReviews(initialVotes);
      }
      if (statsData.status === 'fulfilled') setStats(statsData.value);
      if (simData.status === 'fulfilled') setSimilar(simData.value.slice(0, 6));
      if (varData.status === 'fulfilled') setVariants(varData.value);
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

  const uniqueColors = [...new Set(variants.map(v => v.color).filter(Boolean))];
  const sizesForColor = (color) =>
    color
      ? [...new Set(variants.filter(v => v.color === color).map(v => v.size).filter(Boolean))]
      : [...new Set(variants.map(v => v.size).filter(Boolean))];
  const hasVariants = variants.length > 0;

  const handleSelectColor = (color) => {
    const next = selectedColor === color ? null : color;
    setSelectedColor(next);
    setSelectedSize(null);
    setSelectedVariant(null);
  };

  const handleSelectSize = (size) => {
    const next = selectedSize === size ? null : size;
    setSelectedSize(next);
    if (next) {
      const match = variants.find(v => v.color === selectedColor && v.size === next)
        ?? variants.find(v => v.size === next);
      setSelectedVariant(match ?? null);
    } else {
      setSelectedVariant(null);
    }
  };

  const handleAddToCart = async () => {
    if (!product || !user) return;
    if (hasVariants && !selectedVariant) {
      Alert.alert('Выберите вариант', uniqueColors.length > 0 ? 'Выберите цвет и размер' : 'Выберите размер');
      return;
    }
    if (inCart) {
      navigation.navigate('Main', { screen: 'Cart' });
      return;
    }
    setIsAddingToCart(true);
    try {
      await addItem(productId, 1, selectedVariant?.color || selectedColor || undefined);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (err) {
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
      } catch {}
    }
    navigation.navigate('Checkout');
  };

  const handleShare = async () => {
    if (!product) return;
    await Share.share({ message: `${product.name} — ${(product.sellingPrice || product.price).toLocaleString('ru-RU')} сум` });
  };

  const handleVote = async (reviewId, voteType) => {
    if (!user) return;
    const currentVote = votedReviews[reviewId] ?? null;
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
      setVotedReviews(prev => ({ ...prev, [reviewId]: currentVote }));
      await loadAll();
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
    } catch (err) {
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
  const basePrice = product.discountedPrice || product.sellingPrice || product.price;
  const variantPrice = selectedVariant ? (selectedVariant.sellingPrice || selectedVariant.price) : null;
  const displayPrice = variantPrice ?? basePrice;
  const originalPrice = product.discountedPrice ? (product.sellingPrice || product.price) : null;
  const discount = product.discountPercent;
  const minVariantPrice = variants.length > 0 ? Math.min(...variants.map(v => v.sellingPrice || v.price)) : null;
  const maxVariantPrice = variants.length > 0 ? Math.max(...variants.map(v => v.sellingPrice || v.price)) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

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

        {hasVariants && uniqueColors.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.variantStrip, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.variantStripContent}
          >
            {uniqueColors.map((color) => {
              const cv = variants.filter(v => v.color === color);
              const minPrice = Math.min(...cv.map(v => v.sellingPrice || v.price));
              const sizes = [...new Set(cv.map(v => v.size).filter(Boolean))];
              const inStock = cv.some(v => v.stockQuantity > 0);
              const isSelected = selectedColor === color;
              return (
                <TouchableOpacity
                  key={color}
                  onPress={() => inStock && handleSelectColor(color)}
                  activeOpacity={0.75}
                  style={[
                    styles.variantPill,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      opacity: inStock ? 1 : 0.45,
                    },
                  ]}
                >
                  <Text style={[styles.variantPillColor, { color: isSelected ? '#fff' : colors.text }]} numberOfLines={1}>{color}</Text>
                  {sizes.length > 0 && (
                    <Text style={[styles.variantPillSizes, { color: isSelected ? 'rgba(255,255,255,0.8)' : colors.textMuted }]} numberOfLines={1}>
                      {sizes.slice(0, 4).join(' · ')}{sizes.length > 4 ? ' …' : ''}
                    </Text>
                  )}
                  <Text style={[styles.variantPillPrice, { color: isSelected ? '#fff' : colors.primary }]}>
                    {minPrice.toLocaleString('ru-RU')} сум
                  </Text>
                  {!inStock && <Text style={[styles.variantPillOos, { color: isSelected ? '#fff' : colors.error }]}>нет</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.body}>
          <Text style={[styles.prodName, { color: colors.text }]}>{product.name}</Text>

          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons key={s} name={s <= Math.round(stats?.averageRating || 4.5) ? 'star' : 'star-outline'} size={14} color={colors.star} />
            ))}
            <Text style={[styles.ratingNum, { color: colors.textSecondary }]}>
              {stats?.averageRating?.toFixed(1) || '4.8'}
            </Text>
            <Text style={[styles.ratingCount, { color: colors.textMuted }]}>
              · {stats?.totalReviews ? `${stats.totalReviews} отзывов` : 'Нет отзывов'}
            </Text>
          </View>

          <View style={styles.priceRow}>
            {selectedVariant ? (
              <Text style={[styles.price, { color: colors.primary }]}>
                {displayPrice.toLocaleString('ru-RU')} сум
              </Text>
            ) : hasVariants && minVariantPrice !== null ? (
              <Text style={[styles.price, { color: colors.text }]}>
                {minVariantPrice === maxVariantPrice
                  ? `${minVariantPrice.toLocaleString('ru-RU')} сум`
                  : `${minVariantPrice.toLocaleString('ru-RU')} – ${maxVariantPrice.toLocaleString('ru-RU')} сум`
                }
              </Text>
            ) : (
              <Text style={[styles.price, { color: colors.text }]}>
                {displayPrice.toLocaleString('ru-RU')} сум
              </Text>
            )}
            {originalPrice && !selectedVariant && (
              <Text style={[styles.oldPrice, { color: colors.textMuted }]}>
                {originalPrice.toLocaleString('ru-RU')} сум
              </Text>
            )}
          </View>

          {hasVariants && (
            <View style={styles.variantSection}>
              {uniqueColors.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.variantLabel, { color: colors.textSecondary }]}>Цвет:</Text>
                  <View style={styles.chipRow}>
                    {uniqueColors.map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => handleSelectColor(c)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selectedColor === c ? colors.primary : colors.inputBg,
                            borderColor: selectedColor === c ? colors.primary : colors.border,
                          },
                        ]}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.chipText, { color: selectedColor === c ? '#fff' : colors.text }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {sizesForColor(selectedColor).length > 0 && (
                <View>
                  <Text style={[styles.variantLabel, { color: colors.textSecondary }]}>Размер:</Text>
                  <View style={styles.chipRow}>
                    {sizesForColor(selectedColor).map((s) => {
                      const v = variants.find(vv => vv.color === selectedColor && vv.size === s)
                        ?? variants.find(vv => vv.size === s);
                      const outOfStock = v ? v.stockQuantity === 0 : false;
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => !outOfStock && handleSelectSize(s)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: selectedSize === s ? colors.primary : colors.inputBg,
                              borderColor: selectedSize === s ? colors.primary : colors.border,
                              opacity: outOfStock ? 0.4 : 1,
                            },
                          ]}
                          activeOpacity={outOfStock ? 1 : 0.75}
                        >
                          <Text style={[styles.chipText, { color: selectedSize === s ? '#fff' : colors.text }]}>{s}</Text>
                          {outOfStock && <Text style={[styles.chipSub, { color: colors.textMuted }]}>нет</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {selectedVariant && (
                <View style={[styles.variantInfo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={[styles.variantInfoText, { color: colors.text }]}>
                    {[selectedVariant.color, selectedVariant.size].filter(Boolean).join(' / ')}
                    {' · '}
                    <Text style={{ color: colors.primary, fontWeight: '700' }}>
                      {(selectedVariant.sellingPrice || selectedVariant.price).toLocaleString('ru-RU')} сум
                    </Text>
                    {selectedVariant.stockQuantity > 0
                      ? <Text style={{ color: colors.success }}>{`  · ${selectedVariant.stockQuantity} шт.`}</Text>
                      : <Text style={{ color: colors.error }}>  · нет в наличии</Text>
                    }
                  </Text>
                </View>
              )}

              {!selectedVariant && (
                <Text style={[styles.variantHint, { color: colors.textMuted }]}>
                  {uniqueColors.length > 0 ? 'Выберите цвет и размер' : 'Выберите размер'}
                </Text>
              )}
            </View>
          )}

          <View style={[styles.deliveryBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="bicycle-outline" size={18} color={colors.primary} />
            <Text style={[styles.deliveryText, { color: colors.text }]}>
              Курьером · <Text style={{ color: colors.success }}>Доставка доступна</Text>
            </Text>
          </View>

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

          {user && reviews.filter(r => r.userPhone === user.phone).length < 2 ? (
            <View style={[styles.writeReviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Написать отзыв</Text>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity key={s} onPress={() => setNewRating(s)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                    <Ionicons name={s <= newRating ? 'star' : 'star-outline'} size={30} color={colors.star} />
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

          <View style={styles.reviewsSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              Отзывы {reviews.length > 0 ? `(${reviews.length})` : ''}
            </Text>
            {reviews.length === 0 ? (
              <Text style={[styles.noReviews, { color: colors.textMuted }]}>Нет отзывов. Будьте первым!</Text>
            ) : (
              reviews.map((review) => (
                <View key={review.id} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                  <View style={styles.voteRow}>
                    <TouchableOpacity
                      style={[styles.voteBtn, { backgroundColor: votedReviews[review.id] === 'like' ? colors.primary + '20' : colors.inputBg }]}
                      onPress={() => handleVote(review.id, 'like')}
                    >
                      <Ionicons name={votedReviews[review.id] === 'like' ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={votedReviews[review.id] === 'like' ? colors.primary : colors.textMuted} />
                      <Text style={[styles.voteCount, { color: votedReviews[review.id] === 'like' ? colors.primary : colors.textMuted }]}>{review.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.voteBtn, { backgroundColor: votedReviews[review.id] === 'dislike' ? colors.error + '20' : colors.inputBg }]}
                      onPress={() => handleVote(review.id, 'dislike')}
                    >
                      <Ionicons name={votedReviews[review.id] === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'} size={14} color={votedReviews[review.id] === 'dislike' ? colors.error : colors.textMuted} />
                      <Text style={[styles.voteCount, { color: votedReviews[review.id] === 'dislike' ? colors.error : colors.textMuted }]}>{review.dislikes}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

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
                      <Image source={{ uri: getImageUrl(item.images[0]) || '' }} style={styles.similarImg} resizeMode="contain" />
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

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.bottomPriceBlock}>
          <Text style={[styles.bottomPrice, { color: selectedVariant ? colors.primary : colors.text }]}>
            {displayPrice.toLocaleString('ru-RU')} сум
          </Text>
          {hasVariants && !selectedVariant && minVariantPrice !== maxVariantPrice && (
            <Text style={[styles.bottomOldPrice, { color: colors.textMuted }]}>
              до {maxVariantPrice.toLocaleString('ru-RU')} сум
            </Text>
          )}
          {originalPrice && !selectedVariant && (
            <Text style={[styles.bottomOldPrice, { color: colors.textMuted }]}>
              {originalPrice.toLocaleString('ru-RU')} сум
            </Text>
          )}
        </View>
        <View style={styles.ctaButtons}>
          <TouchableOpacity
            style={[
              styles.addBtn,
              {
                backgroundColor: (inCart || addedToCart) ? colors.success : colors.primary + '20',
                borderWidth: 1,
                borderColor: (inCart || addedToCart) ? colors.success : colors.primary,
              },
            ]}
            onPress={handleAddToCart}
            disabled={isAddingToCart}
            activeOpacity={0.85}
          >
            {isAddingToCart ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name={inCart || addedToCart ? 'checkmark' : 'bag-outline'} size={20} color={(inCart || addedToCart) ? '#FFF' : colors.primary} />
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
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 8,
  },
  topBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  topActions: { flexDirection: 'row', gap: 8 },
  imgGallery: { paddingTop: 100 },
  mainImg: { height: 300 },
  noImg: { height: 300, alignItems: 'center', justifyContent: 'center' },
  imgDots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  imgDot: { width: 6, height: 6, borderRadius: 3 },
  badges: { position: 'absolute', top: 110, left: 16, flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  variantStrip: { flexShrink: 0 },
  variantStripContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  variantPill: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, minWidth: 90, maxWidth: 140, gap: 2 },
  variantPillColor: { fontSize: 13, fontWeight: '700' },
  variantPillSizes: { fontSize: 10 },
  variantPillPrice: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  variantPillOos: { fontSize: 10, fontWeight: '500' },
  body: { padding: 16 },
  prodName: { fontSize: 20, fontWeight: '700', marginBottom: 10, lineHeight: 28 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 12 },
  ratingNum: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  ratingCount: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 16 },
  price: { fontSize: 26, fontWeight: '800' },
  oldPrice: { fontSize: 15, textDecorationLine: 'line-through', marginBottom: 2 },
  sectionLabel: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  variantSection: { marginBottom: 16 },
  variantLabel: { fontSize: 13, fontWeight: '500', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
  chipSub: { fontSize: 10, marginTop: 1 },
  variantInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
  variantInfoText: { fontSize: 13, flex: 1 },
  variantHint: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  deliveryBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  deliveryText: { fontSize: 14 },
  descSection: { marginBottom: 16 },
  desc: { fontSize: 14, lineHeight: 21 },
  showMore: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  companyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  companyLabel: { fontSize: 11, marginBottom: 2 },
  companyName: { fontSize: 15, fontWeight: '600' },
  writeReviewCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16, gap: 12 },
  starRow: { flexDirection: 'row', gap: 6 },
  reviewInput: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  reviewsSection: { marginBottom: 20 },
  noReviews: { fontSize: 14, marginTop: 4 },
  reviewCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { fontSize: 16, fontWeight: '700' },
  reviewName: { fontSize: 14, fontWeight: '600' },
  reviewStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 12 },
  reviewComment: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  voteRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  voteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  voteCount: { fontSize: 12, fontWeight: '600' },
  similarSection: { marginBottom: 20 },
  similarCard: { width: 130, borderRadius: 14, borderWidth: 1, overflow: 'hidden', padding: 8 },
  similarImg: { width: '100%', height: 100, borderRadius: 8 },
  similarName: { fontSize: 12, fontWeight: '500', marginTop: 6, marginBottom: 4, lineHeight: 17 },
  similarPrice: { fontSize: 13, fontWeight: '700' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, paddingBottom: 28, gap: 12 },
  bottomPriceBlock: { flex: 1 },
  bottomPrice: { fontSize: 22, fontWeight: '800' },
  bottomOldPrice: { fontSize: 13, textDecorationLine: 'line-through' },
  ctaButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buyNowBtn: { height: 48, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buyNowText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
