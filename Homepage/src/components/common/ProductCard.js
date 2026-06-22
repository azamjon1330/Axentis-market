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
      Animated.spring(heartScale, {
        toValue: 1.4,
        useNativeDriver: true,
        speed: 80,
        bounciness: 18,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 30,
      }),
    ]).start();
    onFavorite();
  };

  const onPressIn = () => {
    Animated.spring(cardScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 60,
      bounciness: 0,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(cardScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 60,
      bounciness: 0,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: cardScale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#1C1C26' : '#FFFFFF',
            shadowColor: isDark ? '#000' : '#9BA1B0',
          },
        ]}
      >
        {/* ── Image area ── */}
        <View
          style={[
            styles.imageBox,
            { backgroundColor: isDark ? '#2A2A3A' : '#F4F4F6' },
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
            <Ionicons
              name="image-outline"
              size={40}
              color={isDark ? '#3A3A4A' : '#CCCCCC'}
            />
          )}

          {/* Bottom gradient overlay */}
          {imageUri && !imgError && (
            <View style={styles.imageGradient} pointerEvents="none" />
          )}

          {/* Discount badge */}
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
                { backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.92)' },
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

        {/* ── Product info ── */}
        <View style={styles.info}>
          {companyName ? (
            <Text
              style={[styles.company, { color: colors.primary }]}
              numberOfLines={1}
            >
              {companyName}
            </Text>
          ) : null}
          <Text
            style={[styles.name, { color: isDark ? '#D8D8EC' : '#1A1A2E' }]}
            numberOfLines={2}
          >
            {product.name}
          </Text>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: isDark ? '#FFFFFF' : '#0F0F1E' }]}>
              {priceLabel}
            </Text>
            {soldCount > 0 && (
              <Text style={[styles.sold, { color: isDark ? '#55556A' : '#AAAABC' }]}>
                {soldCount >= 1000 ? `${(soldCount / 1000).toFixed(1)}k` : soldCount} продано
              </Text>
            )}
          </View>
          {originalPrice ? (
            <Text style={[styles.oldPrice, { color: isDark ? '#555566' : '#BBBBCC' }]}>
              {formatPrice(originalPrice)}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  imageBox: {
    width: '100%',
    aspectRatio: 3 / 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 48,
    // React Native doesn't support CSS gradients directly — use a semi-transparent overlay
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FF3B30',
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
  info: {
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 11,
    gap: 3,
  },
  company: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sold: {
    fontSize: 10,
    fontWeight: '500',
  },
  oldPrice: {
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
});
