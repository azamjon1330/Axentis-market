import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
  FlatList, Dimensions, ActivityIndicator, Alert, Share, TextInput, Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';
import {
  getProductDetail, getProductReviews, getProductReviewStats,
  getSimilarProducts, submitReview, voteReview, getProductVariants,
  getProductQuestions, askProductQuestion, getFrequentlyBoughtWith,
  getCompanyDetail,
} from '../../api';
import { getImageUrl } from '../../utils/imageUrl';
import ProductCard from '../../components/common/ProductCard';

const { width } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { addItem, items } = useCart();
  const { isFavorite: ctxIsFavorite, toggle: toggleFav } = useFavorites();
  const navigation = useNavigation();
  const route = useRoute();
  const { productId } = route.params;

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [frequentlyBought, setFrequentlyBought] = useState([]);
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
  // ❓ Вопросы о товаре
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [imgErrors, setImgErrors] = useState({});
  const [company, setCompany] = useState(null);
  const [companyLogoError, setCompanyLogoError] = useState(false);
  const [reviewAvatarErrors, setReviewAvatarErrors] = useState({});
  const [zoomVisible, setZoomVisible] = useState(false);
  const imgRef = useRef(null);
  const imgIndexRef = useRef(0);

  const inCart = items.some(i => i.productId === productId);

  useEffect(() => {
    loadAll();
  }, [productId]);

  // Автопрокрутка фото товара каждые 6 сек, если фото больше одного
  useEffect(() => {
    const count = product?.images?.length || 0;
    if (count <= 1 || zoomVisible) return;
    const t = setInterval(() => {
      const next = (imgIndexRef.current + 1) % count;
      imgIndexRef.current = next;
      setImgIndex(next);
      imgRef.current?.scrollTo({ x: next * width, animated: true });
    }, 6000);
    return () => clearInterval(t);
  }, [product?.images?.length, zoomVisible]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [prodData, revData, statsData, simData, varData, qData, freqData] = await Promise.allSettled([
        getProductDetail(productId),
        getProductReviews(productId, user?.phone),
        getProductReviewStats(productId),
        getSimilarProducts(productId),
        getProductVariants(productId),
        getProductQuestions(productId),
        getFrequentlyBoughtWith(productId),
      ]);
      if (qData.status === 'fulfilled') setQuestions(qData.value);
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
      if (freqData.status === 'fulfilled') setFrequentlyBought(freqData.value.slice(0, 6));
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  // Подгружаем данные магазина (логотип, рейтинг) для блока «Продавец».
  useEffect(() => {
    const cid = product?.companyId;
    if (!cid) return;
    let active = true;
    setCompanyLogoError(false);
    getCompanyDetail(cid)
      .then((c) => { if (active) setCompany(c); })
      .catch(() => { if (active) setCompany(null); });
    return () => { active = false; };
  }, [product?.companyId]);

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
      await addItem(
        productId, 1,
        selectedVariant?.color || selectedColor || undefined,
        selectedVariant?.size || selectedSize || undefined,
      );
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
    if (hasVariants && !selectedVariant) {
      Alert.alert('Выберите вариант', uniqueColors.length > 0 ? 'Выберите цвет и размер' : 'Выберите размер');
      return;
    }
    if (!inCart) {
      try {
        await addItem(
          productId, 1,
          selectedVariant?.color || selectedColor || undefined,
          selectedVariant?.size || selectedSize || undefined,
        );
      } catch (err) {
        Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось добавить в корзину');
        return;
      }
    }
    navigation.navigate('Main', { screen: 'Cart' });
  };

  const handleShare = async () => {
    if (!product) return;
    const price = (selectedVariant?.sellingPrice || selectedVariant?.price || product.sellingPrice || product.price || 0).toLocaleString('ru-RU');
    const url = `https://axentis.uz/#product-${productId}`;
    await Share.share({
      title: product.name,
      message: `${product.name}\n${price} сум\n\n${url}`,
      url,
    });
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

  const handleAskQuestion = async () => {
    if (!user) {
      Alert.alert(t('loginWord'), t('loginToAskMsg'));
      return;
    }
    if (!newQuestion.trim()) {
      Alert.alert(t('questionWord'), t('enterQuestion'));
      return;
    }
    setIsSubmittingQuestion(true);
    try {
      await askProductQuestion(productId, {
        userPhone: user.phone,
        userName: user.name,
        question: newQuestion.trim(),
      });
      setNewQuestion('');
      // Обновляем список вопросов с сервера
      try { setQuestions(await getProductQuestions(productId)); } catch { /* ignore */ }
      Alert.alert(t('thanksWord'), t('questionSentMsg'));
    } catch (err) {
      Alert.alert(t('error'), err?.response?.data?.error || t('uploadFail'));
    } finally {
      setIsSubmittingQuestion(false);
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
  const bottomDisplayPrice = selectedVariant
    ? (selectedVariant.sellingPrice || selectedVariant.price)
    : (hasVariants && minVariantPrice !== null ? minVariantPrice : basePrice);
  const hasReviews = (stats?.totalReviews ?? 0) > 0;
  const displayRating = hasReviews ? (stats?.averageRating ?? 5) : 5;

  // Ширина карточки в блоках «Похожие» / «С этим покупают» — примерно на 30%
  // меньше карточки на главной (там 2 в ряд), но та же раскладка ProductCard.
  const SIM_CARD_W = Math.round((width - 32) / 2.85);
  const IMG_W = Math.round((width - 32) * 0.46); // фото в двухколоночной шапке
  const normalizeImages = (imgs) =>
    Array.isArray(imgs) ? imgs : imgs ? [imgs] : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.topBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.topActions}>
          <TouchableOpacity onPress={handleShare} style={[styles.topBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleFavorite} style={[styles.topBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
            <Ionicons
              name={ctxIsFavorite(productId) ? 'heart' : 'heart-outline'}
              size={20}
              color={ctxIsFavorite(productId) ? colors.error : colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          {/* ── Двухколоночная шапка: фото слева, информация справа ── */}
          <View style={styles.topHeader}>
            <View style={[styles.imgCol, { width: IMG_W, backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
              {images.length > 0 ? (
                <>
                  <ScrollView
                    ref={imgRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) => {
                      const i = Math.round(e.nativeEvent.contentOffset.x / IMG_W);
                      imgIndexRef.current = i;
                      setImgIndex(i);
                    }}
                  >
                    {images.map((img, i) => (
                      imgErrors[i] ? (
                        <View key={i} style={[styles.noImg, { width: IMG_W, height: IMG_W }]}>
                          <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
                        </View>
                      ) : (
                        <TouchableOpacity key={i} activeOpacity={0.95} onPress={() => setZoomVisible(true)}>
                          <Image
                            source={{ uri: getImageUrl(img) || '' }}
                            style={{ width: IMG_W, height: IMG_W }}
                            resizeMode="cover"
                            onError={() => setImgErrors(prev => ({ ...prev, [i]: true }))}
                          />
                        </TouchableOpacity>
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
                            i === imgIndex && { width: 14 },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <View style={[styles.noImg, { width: IMG_W, height: IMG_W }]}>
                  <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
                </View>
              )}
              {discount && discount > 0 && (
                <View style={[styles.badge, styles.badgeAbs, { backgroundColor: colors.error }]}>
                  <Text style={styles.badgeText}>-{discount}%</Text>
                </View>
              )}
            </View>

            <View style={styles.infoCol}>
              <Text style={[styles.prodName, { color: colors.text }]} numberOfLines={3}>{product.name}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={13} color={colors.star} />
                <Text style={[styles.ratingNum, { color: colors.textSecondary }]}>{displayRating.toFixed(1)}</Text>
                <Text style={[styles.ratingCount, { color: colors.textMuted }]}>
                  · {hasReviews ? `${stats.totalReviews} отзывов` : 'Нет отзывов'}
                </Text>
              </View>
              <Text style={[styles.priceFrom, { color: colors.textMuted }]}>от</Text>
              {selectedVariant ? (
                <Text style={[styles.price, { color: colors.primary }]}>{displayPrice.toLocaleString('ru-RU')} сум</Text>
              ) : hasVariants && minVariantPrice !== null && minVariantPrice !== maxVariantPrice ? (
                <Text style={[styles.price, { color: colors.text }]}>
                  {minVariantPrice.toLocaleString('ru-RU')} — {maxVariantPrice.toLocaleString('ru-RU')} сум
                </Text>
              ) : (
                <Text style={[styles.price, { color: colors.text }]}>
                  {(hasVariants && minVariantPrice !== null ? minVariantPrice : displayPrice).toLocaleString('ru-RU')} сум
                </Text>
              )}
              {originalPrice && !selectedVariant && (
                <Text style={[styles.oldPrice, { color: colors.textMuted }]}>{originalPrice.toLocaleString('ru-RU')} сум</Text>
              )}
            </View>
          </View>

          {hasVariants && (
            <View style={styles.variantSection}>
              {uniqueColors.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.variantLabel, { color: colors.text }]}>Цвет</Text>
                  <View style={styles.chipRow}>
                    {uniqueColors.map((c) => {
                      const isSel = selectedColor === c;
                      return (
                        <TouchableOpacity
                          key={c}
                          onPress={() => handleSelectColor(c)}
                          style={[
                            styles.colorChip,
                            {
                              backgroundColor: colors.inputBg,
                              borderColor: isSel ? colors.primary : colors.border,
                              borderWidth: isSel ? 2 : 1,
                            },
                          ]}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.colorChipText, { color: colors.text }]} numberOfLines={1}>{c}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {sizesForColor(selectedColor).length > 0 && (
                <View>
                  <Text style={[styles.variantLabel, { color: colors.text }]}>
                    {sizesForColor(selectedColor).some(s => /gb|гб|tb|тб|\d\/\d/i.test(String(s))) ? 'Память' : 'Размер'}
                  </Text>
                  <View style={styles.chipRow}>
                    {sizesForColor(selectedColor).map((s) => {
                      const v = variants.find(vv => vv.color === selectedColor && vv.size === s)
                        ?? variants.find(vv => vv.size === s);
                      const outOfStock = v ? v.stockQuantity === 0 : false;
                      const isSel = selectedSize === s;
                      const sizePrice = v ? (v.sellingPrice || v.price) : null;
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => !outOfStock && handleSelectSize(s)}
                          style={[
                            styles.sizeChip,
                            {
                              backgroundColor: colors.inputBg,
                              borderColor: isSel ? colors.primary : colors.border,
                              borderWidth: isSel ? 2 : 1,
                              opacity: outOfStock ? 0.4 : 1,
                            },
                          ]}
                          activeOpacity={outOfStock ? 1 : 0.75}
                        >
                          <Text style={[styles.sizeChipText, { color: colors.text }]}>{s}</Text>
                          {sizePrice ? (
                            <Text style={[styles.sizeChipPrice, { color: isSel ? colors.primary : colors.textMuted }]}>
                              {sizePrice.toLocaleString('ru-RU')} сум
                            </Text>
                          ) : null}
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
            <Ionicons name="bicycle-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.deliveryTitle, { color: colors.text }]}>Доставка доступна</Text>
              <Text style={[styles.deliverySub, { color: colors.textMuted }]}>Курьером по вашему адресу</Text>
            </View>
            <Text style={[styles.deliveryFree, { color: colors.success }]}>Бесплатно</Text>
          </View>

          <View style={[styles.aboutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 12 }]}>О товаре</Text>
            <View style={styles.aboutGrid}>
              <View style={styles.aboutCell}>
                <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.aboutCellLabel, { color: colors.textMuted }]}>Категория</Text>
                <Text style={[styles.aboutCellValue, { color: colors.text }]} numberOfLines={1}>{product.category || 'Общее'}</Text>
              </View>
              <View style={[styles.aboutCell, { borderLeftColor: colors.border, borderLeftWidth: 1, borderRightColor: colors.border, borderRightWidth: 1 }]}>
                <Ionicons name="barcode-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.aboutCellLabel, { color: colors.textMuted }]}>Артикул</Text>
                <Text style={[styles.aboutCellValue, { color: colors.text }]} numberOfLines={1}>{product.barcode || product.id}</Text>
              </View>
              <View style={styles.aboutCell}>
                <Ionicons name="cube-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.aboutCellLabel, { color: colors.textMuted }]}>Доступно</Text>
                <Text style={[styles.aboutCellValue, { color: colors.text }]} numberOfLines={1}>{product.quantity} шт.</Text>
              </View>
            </View>
            {product.description ? (
              <>
                <Text
                  style={[styles.desc, { color: colors.textSecondary, marginTop: 12 }]}
                  numberOfLines={showFullDesc ? undefined : 3}
                >
                  {product.description}
                </Text>
                <TouchableOpacity onPress={() => setShowFullDesc(p => !p)}>
                  <Text style={[styles.showMore, { color: colors.primary }]}>
                    {showFullDesc ? 'Свернуть' : 'Читать полностью'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          {product.companyId ? (
            <View style={[styles.companyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity
                style={styles.companyTop}
                onPress={() => navigation.navigate('CompanyStore', { companyId: product.companyId })}
                activeOpacity={0.8}
              >
                <View style={[styles.companyLogo, { backgroundColor: colors.primary + '18', borderColor: colors.border }]}>
                  {company?.logoUrl && !companyLogoError ? (
                    <Image
                      source={{ uri: getImageUrl(company.logoUrl) || '' }}
                      style={styles.companyLogoImg}
                      onError={() => setCompanyLogoError(true)}
                    />
                  ) : (
                    <Text style={[styles.companyLogoText, { color: colors.primary }]}>
                      {(company?.name || product.companyName || 'M').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.companyLabel, { color: colors.textMuted }]}>Продавец</Text>
                  <View style={styles.companyNameRow}>
                    <Text style={[styles.companyName, { color: colors.text }]} numberOfLines={1}>
                      {company?.name || product.companyName || `Магазин #${product.companyId}`}
                    </Text>
                    {Number(company?.averageRating || 0) >= 4.5 && (
                      <Ionicons name="checkmark-circle" size={16} color="#3B82F6" />
                    )}
                  </View>
                  {company?.ratingCount > 0 ? (
                    <View style={styles.companyMetaRow}>
                      <Ionicons name="star" size={12} color={colors.star} />
                      <Text style={[styles.companyMetaText, { color: colors.textSecondary }]}>
                        {Number(company.averageRating || 0).toFixed(1)} · {company.ratingCount} оценок
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.companyMetaText, { color: colors.textMuted }]}>Перейти в магазин</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.companyAllBtn, { borderColor: colors.border }]}
                onPress={() => navigation.navigate('CompanyStore', { companyId: product.companyId })}
                activeOpacity={0.8}
              >
                <Ionicons name="storefront-outline" size={16} color={colors.primary} />
                <Text style={[styles.companyAllBtnText, { color: colors.primary }]}>Все товары продавца</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {user && reviews.filter(r => r.userPhone === user.phone).length < 2 ? (
            <View style={styles.writeReviewCard}>
              <Text style={[styles.writeReviewTitle, { color: colors.text }]}>Оставить отзыв</Text>
              <Text style={[styles.writeReviewSub, { color: colors.textMuted }]}>
                Ваш отзыв поможет другим покупателям сделать правильный выбор
              </Text>

              {/* Оценка */}
              <View style={styles.ratingBlock}>
                <View style={styles.ratingHeader}>
                  <Text style={[styles.ratingFieldLabel, { color: colors.textSecondary }]}>Ваша оценка</Text>
                  <Text style={[styles.ratingValueHint, { color: colors.textMuted }]}>
                    {['', 'Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'][newRating] || 'Выберите оценку'}
                  </Text>
                </View>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity key={s} onPress={() => setNewRating(s)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <Ionicons name={s <= newRating ? 'star' : 'star-outline'} size={32} color={colors.star} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Комментарий */}
              <View style={styles.commentHeader}>
                <Text style={[styles.ratingFieldLabel, { color: colors.textSecondary }]}>Комментарий</Text>
                <Text style={[styles.optionalLabel, { color: colors.textMuted }]}>Необязательно</Text>
              </View>
              <View style={[styles.reviewInputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.reviewInput, { color: colors.text }]}
                  placeholder="Поделитесь своими впечатлениями о товаре, качестве, доставке или обслуживании продавца…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  value={newComment}
                  onChangeText={setNewComment}
                />
                <Text style={[styles.charCounter, { color: colors.textMuted }]}>{newComment.length}/500</Text>
              </View>

              {/* Подсказки */}
              <View style={styles.tipsRow}>
                {[
                  { icon: 'happy-outline', label: 'Будьте вежливы' },
                  { icon: 'checkmark-circle-outline', label: 'Пишите по теме' },
                  { icon: 'people-outline', label: 'Помогите другим' },
                ].map((tip) => (
                  <View key={tip.label} style={[styles.tipChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Ionicons name={tip.icon} size={13} color={colors.textMuted} />
                    <Text style={[styles.tipChipText, { color: colors.textSecondary }]}>{tip.label}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: isSubmittingReview ? 0.6 : 1 }]}
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
                      {review.userAvatarUrl && !reviewAvatarErrors[review.id] ? (
                        <Image
                          source={{ uri: getImageUrl(review.userAvatarUrl) || '' }}
                          style={styles.reviewAvatarImg}
                          onError={() => setReviewAvatarErrors(prev => ({ ...prev, [review.id]: true }))}
                        />
                      ) : (
                        <Text style={[styles.reviewAvatarText, { color: colors.primary }]}>
                          {review.userName?.charAt(0).toUpperCase() || 'U'}
                        </Text>
                      )}
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

          {/* ❓ Вопросы о товаре — раскрываются по кнопке */}
          <View style={styles.reviewsSection}>
            <TouchableOpacity
              style={[styles.questionToggleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowQuestions((v) => !v)}
              activeOpacity={0.8}
            >
              <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
              <Text style={[styles.questionToggleText, { color: colors.text }]}>
                {t('questionsTitle')}{questions.length > 0 ? ` (${questions.length})` : ''}
              </Text>
              <Ionicons
                name={showQuestions ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            {showQuestions && (
              <View style={{ marginTop: 12, gap: 10 }}>
                <View style={[styles.questionInputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <TextInput
                    style={[styles.questionInput, { color: colors.text }]}
                    value={newQuestion}
                    onChangeText={setNewQuestion}
                    placeholder={user ? t('askPlaceholder') : t('loginToAskPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    editable={!!user}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.questionSendBtn, { backgroundColor: colors.primary, opacity: isSubmittingQuestion || !user ? 0.5 : 1 }]}
                    onPress={handleAskQuestion}
                    disabled={isSubmittingQuestion || !user}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="send" size={18} color="#FFF" />
                  </TouchableOpacity>
                </View>

                {questions.length === 0 ? (
                  <Text style={[styles.noReviews, { color: colors.textMuted }]}>{t('noQuestionsYet')}</Text>
                ) : (
                  questions.map((q) => (
                    <View key={q.id} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.questionRow}>
                        <Ionicons name="help-circle-outline" size={18} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.reviewName, { color: colors.text }]}>{q.userName || 'Покупатель'}</Text>
                          <Text style={[styles.reviewComment, { color: colors.textSecondary, marginTop: 2 }]}>{q.question}</Text>
                        </View>
                      </View>
                      {q.isAnswered && q.answer ? (
                        <View style={[styles.answerBox, { backgroundColor: colors.cardAlt, borderLeftColor: colors.primary }]}>
                          <Text style={[styles.answerLabel, { color: colors.primary }]}>Ответ продавца</Text>
                          <Text style={[styles.reviewComment, { color: colors.textSecondary }]}>{q.answer}</Text>
                        </View>
                      ) : (
                        <Text style={[styles.reviewDate, { color: colors.textMuted, marginTop: 6 }]}>Ожидает ответа продавца</Text>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          {frequentlyBought.length > 0 && (
            <View style={styles.similarSection}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>С этим товаром покупают</Text>
              <FlatList
                data={frequentlyBought}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => 'freq-' + String(item.id)}
                contentContainerStyle={{ gap: 12, paddingVertical: 2 }}
                renderItem={({ item }) => (
                  <View style={{ width: SIM_CARD_W }}>
                    <ProductCard
                      product={{ ...item, images: normalizeImages(item.images) }}
                      compact
                      onPress={() => navigation.replace('ProductDetail', { productId: item.id })}
                      onFavorite={() => toggleFav(item.id, item)}
                      isFavorite={ctxIsFavorite(item.id)}
                    />
                  </View>
                )}
              />
            </View>
          )}

          {similar.length > 0 && (
            <View style={styles.similarSection}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Похожие товары</Text>
              <FlatList
                data={similar}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ gap: 12, paddingVertical: 2 }}
                renderItem={({ item }) => (
                  <View style={{ width: SIM_CARD_W }}>
                    <ProductCard
                      product={{ ...item, images: normalizeImages(item.images) }}
                      compact
                      onPress={() => navigation.replace('ProductDetail', { productId: item.id })}
                      onFavorite={() => toggleFav(item.id, item)}
                      isFavorite={ctxIsFavorite(item.id)}
                    />
                  </View>
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
            {hasVariants && !selectedVariant && minVariantPrice !== maxVariantPrice
              ? `от ${bottomDisplayPrice.toLocaleString('ru-RU')} сум`
              : `${bottomDisplayPrice.toLocaleString('ru-RU')} сум`
            }
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

      {/* Полноэкранный просмотр фото товара с увеличением */}
      <Modal visible={zoomVisible} transparent animationType="fade" onRequestClose={() => setZoomVisible(false)}>
        <View style={styles.zoomBackdrop}>
          <TouchableOpacity style={styles.zoomClose} onPress={() => setZoomVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: imgIndex * width, y: 0 }}
          >
            {(product?.images || []).map((img, i) => (
              <ScrollView
                key={i}
                style={{ width, height: '100%' }}
                contentContainerStyle={styles.zoomPage}
                maximumZoomScale={3}
                minimumZoomScale={1}
                showsVerticalScrollIndicator={false}
                centerContent
              >
                <Image
                  source={{ uri: getImageUrl(img) || '' }}
                  style={{ width, height: width }}
                  resizeMode="contain"
                />
              </ScrollView>
            ))}
          </ScrollView>
        </View>
      </Modal>
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
  mainImg: { height: width },
  noImg: { height: width, alignItems: 'center', justifyContent: 'center' },
  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  zoomClose: {
    position: 'absolute', top: 50, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  zoomPage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  imgDots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  imgDot: { width: 6, height: 6, borderRadius: 3 },
  badges: { position: 'absolute', top: 110, left: 16, flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeAbs: { position: 'absolute', top: 8, left: 8 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  // Двухколоночная шапка
  topHeader: { flexDirection: 'row', gap: 14, marginBottom: 18 },
  imgCol: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  infoCol: { flex: 1, paddingTop: 2 },
  priceFrom: { fontSize: 12, marginTop: 8, marginBottom: 2 },
  variantStrip: { flexShrink: 0 },
  variantStripContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  variantPill: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8, minWidth: 90, maxWidth: 140, gap: 2 },
  variantPillColor: { fontSize: 13, fontWeight: '700' },
  variantPillSizes: { fontSize: 10 },
  variantPillPrice: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  variantPillOos: { fontSize: 10, fontWeight: '500' },
  body: { padding: 16, paddingTop: 104 },
  prodName: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3, marginBottom: 6, lineHeight: 24 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  ratingNum: { fontSize: 13, fontWeight: '600', marginLeft: 2 },
  ratingCount: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 16 },
  price: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  oldPrice: { fontSize: 14, textDecorationLine: 'line-through', marginTop: 2 },
  sectionLabel: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  variantSection: { marginBottom: 16 },
  variantLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
  chipSub: { fontSize: 10, marginTop: 1 },
  // Цвет: текстовая пилюля (без образца цвета — только текст)
  colorChip: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 },
  colorChipText: { fontSize: 15, fontWeight: '600' },
  // Память/размер: пилюля с ценой снизу
  sizeChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, alignItems: 'flex-start', minWidth: 96 },
  sizeChipText: { fontSize: 15, fontWeight: '700' },
  sizeChipPrice: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  variantInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
  variantInfoText: { fontSize: 13, flex: 1 },
  variantHint: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  deliveryBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  deliveryText: { fontSize: 14 },
  deliveryTitle: { fontSize: 14, fontWeight: '700' },
  deliverySub: { fontSize: 12, marginTop: 2 },
  deliveryFree: { fontSize: 14, fontWeight: '700' },
  aboutCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  aboutGrid: { flexDirection: 'row' },
  aboutCell: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  aboutCellLabel: { fontSize: 11 },
  aboutCellValue: { fontSize: 13, fontWeight: '700' },
  descSection: { marginBottom: 16 },
  desc: { fontSize: 14, lineHeight: 21 },
  showMore: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  companyCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16 },
  companyTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  companyLogo: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1 },
  companyLogoImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  companyLogoText: { fontSize: 20, fontWeight: '800' },
  companyLabel: { fontSize: 11, marginBottom: 2 },
  companyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  companyName: { fontSize: 16, fontWeight: '700', maxWidth: '82%' },
  companyMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  companyMetaText: { fontSize: 12, marginTop: 2 },
  companyAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  companyAllBtnText: { fontSize: 13, fontWeight: '700' },
  writeReviewCard: { paddingVertical: 8, marginBottom: 16 },
  writeReviewTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  writeReviewSub: { fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
  ratingBlock: { marginBottom: 14 },
  ratingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  ratingFieldLabel: { fontSize: 13, fontWeight: '600' },
  ratingValueHint: { fontSize: 12 },
  starRow: { flexDirection: 'row', gap: 8 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  optionalLabel: { fontSize: 11 },
  reviewInputWrap: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  reviewInput: { fontSize: 14, minHeight: 76, textAlignVertical: 'top', padding: 0 },
  charCounter: { fontSize: 11, alignSelf: 'flex-end', marginTop: 4 },
  tipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 14 },
  tipChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  tipChipText: { fontSize: 11.5, fontWeight: '500' },
  submitBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  reviewsSection: { marginBottom: 20 },
  noReviews: { fontSize: 14, marginTop: 4 },
  reviewCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  reviewAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  reviewAvatarText: { fontSize: 16, fontWeight: '700' },
  reviewName: { fontSize: 14, fontWeight: '600' },
  reviewStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 12 },
  reviewComment: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  voteRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  voteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  voteCount: { fontSize: 12, fontWeight: '600' },
  questionToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  questionToggleText: { flex: 1, fontSize: 15, fontWeight: '700' },
  questionInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: 12, padding: 8 },
  questionInput: { flex: 1, fontSize: 14, minHeight: 38, maxHeight: 100, paddingHorizontal: 6, textAlignVertical: 'top' },
  questionSendBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  answerBox: { marginTop: 8, padding: 10, borderRadius: 10, borderLeftWidth: 3 },
  answerLabel: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
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
