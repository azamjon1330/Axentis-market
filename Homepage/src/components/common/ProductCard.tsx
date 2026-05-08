import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Product } from '../../types';
import { UPLOADS_URL } from '../../constants/Api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

interface Props {
  product: Product;
  onPress: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  horizontal?: boolean;
}

const ProductCard: React.FC<Props> = ({ product, onPress, onFavorite, isFavorite, horizontal }) => {
  const { colors } = useTheme();

  const imageUri = product.images?.[0]
    ? (product.images[0].startsWith('http') ? product.images[0] : `${UPLOADS_URL}/${product.images[0]}`)
    : null;

  const displayPrice = product.discountedPrice || product.sellingPrice || product.price;
  const originalPrice = product.discountedPrice ? (product.sellingPrice || product.price) : null;
  const hasDiscount = !!product.discountPercent && product.discountPercent > 0;

  const formatPrice = (p: number) => `${p.toLocaleString('ru-RU')} ₽`;

  if (horizontal) {
    return (
      <TouchableOpacity
        style={[styles.hCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={[styles.hImageBox, { backgroundColor: colors.cardAlt }]}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.hImage} resizeMode="contain" />
          ) : (
            <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
          )}
          {hasDiscount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{product.discountPercent}%</Text>
            </View>
          )}
        </View>
        <View style={styles.hInfo}>
          <Text style={[styles.hName, { color: colors.text }]} numberOfLines={2}>{product.name}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color={colors.star} />
            <Text style={[styles.ratingText, { color: colors.textSecondary }]}> 4.8</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]}>{formatPrice(displayPrice)}</Text>
            {originalPrice && (
              <Text style={[styles.oldPrice, { color: colors.textMuted }]}>{formatPrice(originalPrice)}</Text>
            )}
          </View>
          {onFavorite && (
            <TouchableOpacity onPress={onFavorite} style={styles.favBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={18}
                color={isFavorite ? colors.error : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, width: CARD_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.imageBox, { backgroundColor: colors.cardAlt }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        ) : (
          <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
        )}
        {hasDiscount && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{product.discountPercent}%</Text>
          </View>
        )}
        {onFavorite && (
          <TouchableOpacity
            onPress={onFavorite}
            style={[styles.favIcon, { backgroundColor: colors.surface }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={16}
              color={isFavorite ? colors.error : colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{product.name}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={11} color={colors.star} />
          <Text style={[styles.ratingText, { color: colors.textSecondary }]}> 4.8</Text>
        </View>
        <Text style={[styles.price, { color: colors.text }]}>{formatPrice(displayPrice)}</Text>
        {originalPrice && (
          <Text style={[styles.oldPrice, { color: colors.textMuted }]}>{formatPrice(originalPrice)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  imageBox: { height: 140, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  info: { padding: 10 },
  name: { fontSize: 13, fontWeight: '500', marginBottom: 4, lineHeight: 18 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ratingText: { fontSize: 11 },
  price: { fontSize: 15, fontWeight: '700' },
  oldPrice: { fontSize: 11, textDecorationLine: 'line-through', marginTop: 2 },
  discountBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#FF3B30', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  favIcon: { position: 'absolute', top: 8, right: 8, borderRadius: 20, padding: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  hCard: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 10 },
  hImageBox: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  hImage: { width: '100%', height: '100%' },
  hInfo: { flex: 1, padding: 12, justifyContent: 'space-between' },
  hName: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  favBtn: { position: 'absolute', right: 12, bottom: 12 },
});

export default ProductCard;
