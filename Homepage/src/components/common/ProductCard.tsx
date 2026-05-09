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
  const { colors } = useTheme();
  const [imgError, setImgError] = useState(false);
  const [hImgError, setHImgError] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleFavorite = () => {
    if (!onFavorite) return;
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.5, useNativeDriver: true, speed: 80, bounciness: 20 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onFavorite();
  };

  const imageUri = getImageUrl(product.images?.[0]);

  const displayPrice = product.discountedPrice || product.sellingPrice || product.price;
  const originalPrice = product.discountedPrice ? (product.sellingPrice || product.price) : null;
  const hasDiscount = !!product.discountPercent && product.discountPercent > 0;

  const formatPrice = (p: number) => `${p.toLocaleString('ru-RU')} сум`;

  if (horizontal) {
    return (
      <TouchableOpacity
        style={[styles.hCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <View style={[styles.hImageBox, { backgroundColor: colors.cardAlt }]}>
          {imageUri && !hImgError ? (
            <Image source={{ uri: imageUri }} style={styles.hImage} resizeMode="contain" onError={() => setHImgError(true)} />
          ) : (
            <Ionicons name="cube-outline" size={36} color={colors.textMuted} />
          )}
          {hasDiscount && (
            <View style={styles.discountBadge}>
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
            <Text style={[styles.price, { color: colors.text }]}>{formatPrice(displayPrice)}</Text>
            {originalPrice && (
              <Text style={[styles.oldPrice, { color: colors.textMuted }]}>{formatPrice(originalPrice)}</Text>
            )}
          </View>
          {product.soldCount > 0 && (
            <Text style={[styles.sold, { color: colors.textMuted }]}>{product.soldCount} продаж</Text>
          )}
          {onFavorite && (
            <TouchableOpacity onPress={handleFavorite} style={styles.favBtnH} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={18}
                  color={isFavorite ? colors.error : colors.textSecondary}
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
      activeOpacity={0.85}
    >
      <View style={[styles.imageBox, { backgroundColor: colors.cardAlt }]}>
        {imageUri && !imgError ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" onError={() => setImgError(true)} />
        ) : (
          <Ionicons name="cube-outline" size={44} color={colors.textMuted} />
        )}
        {hasDiscount && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{product.discountPercent}%</Text>
          </View>
        )}
        {onFavorite && (
          <TouchableOpacity
            onPress={handleFavorite}
            style={[styles.favIcon, { backgroundColor: colors.surface + 'E0' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={15}
                color={isFavorite ? colors.error : colors.textSecondary}
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
        <Text style={[styles.price, { color: colors.text }]}>{formatPrice(displayPrice)}</Text>
        {originalPrice && (
          <Text style={[styles.oldPrice, { color: colors.textMuted }]}>{formatPrice(originalPrice)}</Text>
        )}
        {product.soldCount > 0 && (
          <Text style={[styles.sold, { color: colors.textMuted }]}>{product.soldCount} продаж</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  imageBox: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  info: { padding: 10, gap: 3 },
  name: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  brand: { fontSize: 11 },
  price: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  oldPrice: { fontSize: 11, textDecorationLine: 'line-through' },
  sold: { fontSize: 11, marginTop: 1 },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  favIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 20,
    padding: 5,
  },
  // Horizontal card
  hCard: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  hImageBox: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hImage: { width: '100%', height: '100%' },
  hInfo: { flex: 1, padding: 12, gap: 4, justifyContent: 'center' },
  hName: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  favBtnH: { position: 'absolute', right: 12, top: 12 },
});

export default ProductCard;
