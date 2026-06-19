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
                { backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.9)' },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={15}
                  color={isFavorite ? '#FF3B6A' : isDark ? '#888' : '#999'}
                />
              </Animated.View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Product info ── */}
        <View style={styles.info}>
          <Text
            style={[styles.name, { color: isDark ? '#D0D0E0' : '#333333' }]}
            numberOfLines={2}
          >
            {product.name}
          </Text>
          <Text style={[styles.price, { color: isDark ? '#FFFFFF' : '#0F0F1E' }]}>
            {priceLabel}
          </Text>
          {originalPrice ? (
            <Text style={[styles.oldPrice, { color: isDark ? '#555566' : '#AAAAAA' }]}>
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
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
    paddingVertical: 10,
    gap: 4,
  },
  name: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  price: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  oldPrice: {
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
});
