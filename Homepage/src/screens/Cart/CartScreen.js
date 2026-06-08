import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Image, ActivityIndicator, Alert, RefreshControl, TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useCart, clampQuantity } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { getImageUrl } from '../../utils/imageUrl';

// Treat unknown stock as effectively unlimited so the plus control still works
// when the variant stock has not been loaded.
const UNKNOWN_STOCK = Number.MAX_SAFE_INTEGER;

// Resolve the available stock for a cart line: the selected variant's stock
// when the line is a specific color/size variant, otherwise the product's own
// quantity. Unknown / non-positive values fall back to "unlimited".
const getLineStock = (item) => {
  const product = item?.product || {};
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const color = item?.selected_color || '';
  const size = item?.selected_size || '';

  if ((color || size) && variants.length) {
    const match = variants.find((v) =>
      ((v.color ?? v.selected_color ?? v.colorName ?? '') === color) &&
      ((v.size ?? v.selected_size ?? v.sizeName ?? '') === size)
    );
    if (match) {
      const s = match.stockQuantity ?? match.stock_quantity ?? match.quantity;
      if (Number.isFinite(s) && s >= 1) return s;
    }
  }

  const pq = product.quantity;
  if (Number.isFinite(pq) && pq >= 1) return pq;
  return UNKNOWN_STOCK;
};

// Pure decision for the minus control (Req 16.3). Given the current line
// quantity, decide what should happen:
//   - quantity > 1  -> { action: 'decrement',     nextQuantity: q - 1 }
//   - quantity <= 1 -> { action: 'promptRemoval',  nextQuantity: 1 }
// The minus control never silently deletes a line: at quantity 1 the line is
// kept (nextQuantity stays 1) and an explicit removal prompt is triggered.
export const decideMinus = (quantity) => {
  if (quantity > 1) {
    return { action: 'decrement', nextQuantity: quantity - 1 };
  }
  return { action: 'promptRemoval', nextQuantity: 1 };
};

export default function CartScreen() {
  const { colors, isDark } = useTheme();
  const { items, count, total, isLoading, updateItem, removeItem, clearAllItems, refresh } = useCart();
  const { t } = useLanguage();
  const navigation = useNavigation();
  const [updatingId, setUpdatingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [qtyInputs, setQtyInputs] = useState({});

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const showStockWarning = (message) => {
    Alert.alert(t('stockLimit') || 'Stock limit', message);
  };

  const commitQuantity = async (item, requested) => {
    const stock = getLineStock(item);
    const { quantity, warning } = clampQuantity(requested, stock);
    if (warning) showStockWarning(warning);
    if (quantity === item.quantity) return;
    setUpdatingId(item.id);
    try {
      await updateItem(
        item.productId,
        quantity,
        item.selected_color || undefined,
        item.selected_size || undefined,
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleIncrement = async (item) => {
    // Plus: +1 capped at the variant's available stock (Req 16.1, 20.1).
    await commitQuantity(item, item.quantity + 1);
  };

  const handleDecrement = async (item) => {
    const { action, nextQuantity } = decideMinus(item.quantity);
    if (action === 'decrement') {
      // Minus above 1: simply decrease by one (Req 16.2).
      await commitQuantity(item, nextQuantity);
      return;
    }
    // Minus at quantity 1: never silently delete. Keep at 1 and ask the buyer
    // to explicitly confirm removal (Req 16.3).
    Alert.alert(
      t('removeItem') || 'Remove item',
      t('removeItemMsg') || 'Remove this item from your cart?',
      [
        { text: t('no') || 'Cancel', style: 'cancel' },
        {
          text: t('remove') || 'Remove',
          style: 'destructive',
          onPress: () => handleRemove(item),
        },
      ],
      { cancelable: true },
    );
  };

  const handleQtyInputChange = (item, text) => {
    setQtyInputs(prev => ({ ...prev, [item.id]: text }));
  };

  const handleQtyInputBlur = async (item) => {
    const raw = qtyInputs[item.id];
    setQtyInputs(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    if (raw === undefined) return;
    // Empty / invalid input is treated as 1; otherwise clamp to [1, stock]
    // (Req 19.1, 19.2, 19.3, 20.2).
    const parsed = parseInt(raw, 10);
    await commitQuantity(item, parsed);
  };

  const handleRemove = async (item) => {
    await removeItem(item.id);
  };

  const handleClearCart = () => {
    Alert.alert(
      t('clearCart'),
      t('clearCartMsg'),
      [
        { text: t('no'), style: 'cancel' },
        {
          text: t('clear'),
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllItems();
            } catch {
              Alert.alert(t('error'), t('error'));
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const formatPrice = (p) => `${p.toLocaleString('ru-RU')} сум`;

  const renderItem = ({ item }) => {
    const product = item.product;
    const price = product?.discountedPrice || product?.sellingPrice || product?.price || 0;
    const itemTotal = price * item.quantity;
    const imageUri = getImageUrl(product?.images?.[0]);
    const qtyDisplay = qtyInputs[item.id] !== undefined ? qtyInputs[item.id] : String(item.quantity);

    return (
      <View style={[styles.cartItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.itemImg, { backgroundColor: colors.cardAlt }]}
          onPress={() => navigation.navigate('ProductDetail', { productId: item.productId })}
          activeOpacity={0.8}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.img} resizeMode="contain" />
          ) : (
            <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
          )}
        </TouchableOpacity>

        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
              {product?.name || 'Товар'}
            </Text>
            <TouchableOpacity
              onPress={() => handleRemove(item)}
              style={[styles.deleteBtn, { backgroundColor: colors.error + '18' }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
          {item.selected_color && (
            <Text style={[styles.itemColor, { color: colors.textMuted }]}>Цвет: {item.selected_color}</Text>
          )}
          {item.selected_size && (
            <Text style={[styles.itemColor, { color: colors.textMuted }]}>Размер: {item.selected_size}</Text>
          )}

          <View style={styles.itemBottom}>
            <View style={[styles.qtyControl, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => handleDecrement(item)}
                style={styles.qtyBtn}
                disabled={updatingId === item.id}
              >
                <Ionicons name="remove" size={16} color={item.quantity <= 1 ? colors.error : colors.text} />
              </TouchableOpacity>
              {updatingId === item.id ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ width: 32 }} />
              ) : (
                <TextInput
                  style={[styles.qtyInput, { color: colors.text }]}
                  value={qtyDisplay}
                  onChangeText={(txt) => handleQtyInputChange(item, txt)}
                  onBlur={() => handleQtyInputBlur(item)}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              )}
              <TouchableOpacity
                onPress={() => handleIncrement(item)}
                style={styles.qtyBtn}
                disabled={updatingId === item.id}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.itemTotal, { color: colors.text }]}>{formatPrice(itemTotal)}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('cartTitle')}</Text>
        {items.length > 0 && (
          <TouchableOpacity
            onPress={handleClearCart}
            style={[styles.trashHeader, { backgroundColor: colors.error + '15' }]}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconBg, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="cart-outline" size={64} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('emptyCart')}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('emptyCartHint')}</Text>
          <TouchableOpacity
            style={[styles.shopBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('Main', { screen: 'Home' })}
            activeOpacity={0.85}
          >
            <Ionicons name="storefront-outline" size={18} color="#FFF" />
            <Text style={styles.shopBtnText}>{t('goToHome')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            ListFooterComponent={<View style={{ height: 8 }} />}
          />

          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.bottomTotalLabel, { color: colors.textSecondary }]}>
                {t('total')} · {count} шт.
              </Text>
              <Text style={[styles.bottomTotal, { color: colors.text }]}>{formatPrice(total)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.checkoutBtn, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('Checkout')}
              activeOpacity={0.85}
            >
              <Text style={styles.checkoutBtnText}>{t('checkout')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  trashHeader: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  emptyIconBg: {
    width: 120,
    height: 120,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 21 },
  shopBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
  },
  shopBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  list: { padding: 16, paddingBottom: 0 },
  cartItem: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  itemImg: {
    width: 80,
    height: 80,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: '100%', height: '100%', borderRadius: 12 },
  itemInfo: { flex: 1 },
  itemNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  itemName: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 19 },
  itemColor: { fontSize: 12, marginBottom: 8 },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  qtyBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  qtyInput: {
    width: 36,
    height: 32,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  itemTotal: { fontSize: 16, fontWeight: '700' },
  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
    paddingBottom: 28,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bottomTotalLabel: { fontSize: 14 },
  bottomTotal: { fontSize: 20, fontWeight: '800' },
  checkoutBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
