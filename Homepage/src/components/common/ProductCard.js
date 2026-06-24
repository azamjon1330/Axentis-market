import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getImageUrl } from '../../utils/imageUrl';

export default function ProductCard({ product, onPress, onFavorite, isFavorite }) {
  const { colors, isDark } = useTheme();
  const [imgError, setImgError] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;

  const imageUri = getImageUrl(product.images?.[0]);

  const displayPrice = product.discountedPrice || product.sellingPrice || product.price;
  const originalPrice = product.discountedPrice ? (product.sellingPrice || product.price) : null;
  const hasDiscount = !!product.discountPercent && product.discountPercent > 0;
  const hasVariants = product.hasColorOptions;
  const soldCount = product.sold_count ?? product.soldCount ?? 0;
  const companyName = product.company_name || product.companyName;

  const formatPrice = p => `${(p || 0).toLocaleString('ru-RU')} сум`;
  const priceLabel = hasVariants ? `от ${formatPrice(displayPrice)}` : formatPrice(displayPrice);

  const handleFavorite = () => {
    if (!onFavorite) return;
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 80, bounciness: 18 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onFavorite();
  };

  const onPressIn = () =>
    Animated.spring(cardScale, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 0 }).start();

  const onPressOut = () =>
    Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 0 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: cardScale }], marginBottom: 14 }}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>

        {/* ── Image block — only this is the "card" ── */}
        <View
          style={[
            styles.imageCard,
            {
              backgroundColor: isDark ? '#1E2130' : '#F5F5F5',
              shadowColor: isDark ? '#000' : '#9BA1B0',
            },
          ]}
        >
          {imageUri && !imgError ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <Ionicons name="image-outline" size={44} color={colors.textMuted} />
          )}

          {/* Discount badge — top left */}
          {hasDiscount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{product.discountPercent}%</Text>
            </View>
          )}

          {/* Heart button — top right */}
          {onFavorite && (
            <TouchableOpacity
              onPress={handleFavorite}
              style={[
                styles.heartBtn,
                { backgroundColor: isDark ? 'rgba(0,0,0,0.50)' : 'rgba(255,255,255,0.90)' },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={16}
                  color={isFavorite ? '#FF3B6A' : isDark ? '#888' : '#999'}
                />
              </Animated.View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Text info — OUTSIDE the card block ── */}
        <View style={styles.info}>
          {companyName ? (
            <Text style={[styles.company, { color: colors.textSecondary }]} numberOfLines={1}>
              {companyName}
            </Text>
          ) : null}

          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {product.name}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{priceLabel}</Text>
            {soldCount > 0 && (
              <Text style={[styles.sold, { color: colors.textMuted }]}>
                {soldCount >= 1000 ? `${(soldCount / 1000).toFixed(1)}k` : soldCount} продано
              </Text>
            )}
          </View>

          {originalPrice ? (
            <Text style={[styles.oldPrice, { color: colors.textMuted }]}>
              {formatPrice(originalPrice)}
            </Text>
          ) : null}
        </View>

      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  imageCard: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  image: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  discountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 20,
    padding: 6,
  },
  // Text info outside the card — no background, clean
  info: {
    paddingHorizontal: 2,
    paddingTop: 8,
    gap: 2,
  },
  company: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 3,
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: '#E8472A',
  },
  sold: {
    fontSize: 10,
    fontWeight: '500',
  },
  oldPrice: {
    fontSize: 11,
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
});
