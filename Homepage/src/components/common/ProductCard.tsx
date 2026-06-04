import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Product } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';

interface Props {
  product: Product;
  onPress: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  horizontal?: boolean;
}

const ProductCard: React.FC<Props> = ({ product, onPress, onFavorite, isFavorite, horizontal }) => {
  const { colors, isDark } = useTheme();
  const [imgError, setImgError] = useState(false);
  const [hImgError, setHImgError] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleFavorite = () => {
    if (!onFavorite) return;
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.45, useNativeDriver: true, speed: 80, bounciness: 18 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onFavorite();
  };

  const imageUri = getImageUrl(product.images?.[0]);
  const displayPrice = product.discountedPrice || product.sellingPrice || product.price;
  const originalPrice = product.discountedPrice ? (product.sellingPrice || product.price) : null;
  const hasDiscount = !!product.discountPercent && product.discountPercent > 0;
  const hasVariants = product.hasColorOptions;

  const formatPrice = (p: number) =>
    p >= 1_000_000
      ? `${(p / 1_000_000).toFixed(1)} млн сум`
      : `${p.toLocaleString('ru-RU')} сум`;

  const priceLabel = hasVariants ? `от ${formatPrice(displayPrice)}` : formatPrice(displayPrice);

  if (horizontal) {
    return (
      <TouchableOpacity
        style={[styles.hCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.82}
      >
        <View style={[styles.hImageBox, { backgroundColor: colors.card }]}>
          {imageUri && !hImgError ? (
            <Image source={{ uri: imageUri }} style={styles.hImage} resizeMode="contain" onError={() => setHImgError(true)} />
          ) : (
            <Ionicons name="cube-outline" size={36} color={colors.textMuted} />
          )}
          {hasDiscount && (
            <View style={[styles.discountBadge, { backgroundColor: colors.error }]}>
              <Text style={styles.discountText}>-{product.discountPercent}%</Text>
            </View>
          )}
        </View>
        <View style={styles.hInfo}>
          <Text style={[styles.hName, { color: colors.text }]} numberOfLines={2}>{product.name}</Text>
          {product.brand ? (
            <Text style={[styles.brand, { color: colors.textMuted }]} numberOfLines={1}>{product.brand}</Text>
          ) : null}
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]}>{priceLabel}</Text>
          </View>
          {originalPrice && (
            <Text style={[styles.oldPrice, { color: colors.textMuted }]}>{formatPrice(originalPrice)}</Text>
          )}
          {product.soldCount > 0 && (
            <View style={styles.soldRow}>
              <Ionicons name="flame-outline" size={11} color={colors.orange} />
              <Text style={[styles.sold, { color: colors.textMuted }]}>{product.soldCount} продаж</Text>
            </View>
          )}
          {onFavorite && (
            <TouchableOpacity onPress={handleFavorite} style={styles.favBtnH} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={18}
                  color={isFavorite ? colors.error : colors.textMuted}
                />
              </Animated.View>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={[styles.imageBox, { backgroundColor: colors.card }]}>
        {imageUri && !imgError ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" onError={() => setImgError(true)} />
        ) : (
          <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
        )}
        {hasDiscount && (
          <View style={[styles.discountBadge, { backgroundColor: colors.error }]}>
            <Text style={styles.discountText}>-{product.discountPercent}%</Text>
          </View>
        )}
        {onFavorite && (
          <TouchableOpacity
            onPress={handleFavorite}
            style={[styles.favIcon, { backgroundColor: isDark ? 'rgba(19,22,28,0.82)' : 'rgba(255,255,255,0.88)' }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={14}
                color={isFavorite ? colors.error : colors.textMuted}
              />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{product.name}</Text>
        {product.brand ? (
          <Text style={[styles.brand, { color: colors.textMuted }]} numberOfLines={1}>{product.brand}</Text>
        ) : null}
        <Text style={[styles.price, { color: colors.text }]}>{priceLabel}</Text>
        {originalPrice && (
          <Text style={[styles.oldPrice, { color: colors.textMuted }]}>{formatPrice(originalPrice)}</Text>
        )}
        {product.soldCount > 0 && (
          <View style={styles.soldRow}>
            <Ionicons name="flame-outline" size={10} color={colors.orange} />
            <Text style={[styles.sold, { color: colors.textMuted }]}>{product.soldCount} продаж</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  imageBox: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  info: { padding: 10, gap: 3 },
  name: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  brand: { fontSize: 10, fontWeight: '400' },
  price: { fontSize: 13, fontWeight: '800', marginTop: 3 },
  oldPrice: { fontSize: 10, textDecorationLine: 'line-through' },
  soldRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  sold: { fontSize: 10 },
  discountBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  discountText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  favIcon: {
    position: 'absolute',
    top: 7,
    right: 7,
    borderRadius: 18,
    padding: 5,
  },
  // Horizontal
  hCard: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  hImageBox: {
    width: 106,
    height: 106,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hImage: { width: '100%', height: '100%' },
  hInfo: { flex: 1, padding: 12, gap: 3, justifyContent: 'center' },
  hName: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  favBtnH: { position: 'absolute', right: 12, top: 12 },
});

export default ProductCard;
