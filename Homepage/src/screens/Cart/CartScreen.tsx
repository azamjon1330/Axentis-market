import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Image, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { CartItem, RootStackParamList } from '../../types';
import { UPLOADS_URL } from '../../constants/Api';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CartScreen() {
  const { colors, isDark } = useTheme();
  const { items, count, total, isLoading, updateItem, removeItem, clearAllItems, refresh } = useCart();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const [editing, setEditing] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleQuantityChange = async (item: CartItem, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      handleRemove(item);
      return;
    }
    setUpdatingId(item.id);
    try {
      await updateItem(item.productId, newQty, item.selected_color || undefined);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (item: CartItem) => {
    Alert.alert(
      'Удалить товар',
      `Удалить "${item.product?.name}" из корзины?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await removeItem(item.id);
          },
        },
      ]
    );
  };

  const handleClearCart = () => {
    Alert.alert('Очистить корзину', 'Удалить все товары из корзины?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Очистить', style: 'destructive', onPress: clearAllItems },
    ]);
  };

  const formatPrice = (p: number) => `${p.toLocaleString('ru-RU')} ₽`;

  const renderItem = ({ item }: { item: CartItem }) => {
    const product = item.product;
    const price = product?.sellingPrice || product?.price || 0;
    const itemTotal = price * item.quantity;
    const imageUri = product?.images?.[0]
      ? (product.images[0].startsWith('http') ? product.images[0] : `${UPLOADS_URL}/${product.images[0]}`)
      : null;

    return (
      <View style={[styles.cartItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Image */}
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

        {/* Info */}
        <View style={styles.itemInfo}>
          <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
            {product?.name || 'Товар'}
          </Text>
          {item.selected_color && (
            <Text style={[styles.itemColor, { color: colors.textMuted }]}>
              Цвет: {item.selected_color}
            </Text>
          )}

          {/* Qty + price */}
          <View style={styles.itemBottom}>
            <View style={[styles.qtyControl, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => handleQuantityChange(item, -1)}
                style={styles.qtyBtn}
                disabled={updatingId === item.id}
              >
                <Ionicons name="remove" size={18} color={item.quantity <= 1 ? colors.error : colors.text} />
              </TouchableOpacity>
              {updatingId === item.id ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ width: 28 }} />
              ) : (
                <Text style={[styles.qtyNum, { color: colors.text }]}>{item.quantity}</Text>
              )}
              <TouchableOpacity
                onPress={() => handleQuantityChange(item, 1)}
                style={styles.qtyBtn}
                disabled={updatingId === item.id}
              >
                <Ionicons name="add" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.itemTotal, { color: colors.text }]}>{formatPrice(itemTotal)}</Text>
          </View>
        </View>

        {/* Delete btn */}
        {editing && (
          <TouchableOpacity
            onPress={() => handleRemove(item)}
            style={[styles.deleteBtn, { backgroundColor: colors.error + '20' }]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        )}
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

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Корзина</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={() => setEditing(p => !p)} activeOpacity={0.7}>
            <Text style={[styles.editBtn, { color: colors.primary }]}>
              {editing ? 'Готово' : 'Изменить'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconBg, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="bag-outline" size={64} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Корзина пуста</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Добавьте товары из каталога, чтобы сделать заказ
          </Text>
          <TouchableOpacity
            style={[styles.shopBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('Main' as any, { screen: 'Catalog' })}
            activeOpacity={0.85}
          >
            <Text style={styles.shopBtnText}>Перейти в каталог</Text>
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
            ListFooterComponent={() => (
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                    Товары ({count} шт.)
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>{formatPrice(total)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Доставка</Text>
                  <Text style={[styles.summaryFree, { color: colors.success }]}>Бесплатно</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.totalLabel, { color: colors.text }]}>Итого</Text>
                  <Text style={[styles.totalValue, { color: colors.text }]}>{formatPrice(total)}</Text>
                </View>
              </View>
            )}
          />

          {/* Bottom checkout bar */}
          <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.bottomTotalLabel, { color: colors.textSecondary }]}>Итого</Text>
              <Text style={[styles.bottomTotal, { color: colors.text }]}>{formatPrice(total)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.checkoutBtn, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('Checkout')}
              activeOpacity={0.85}
            >
              <Text style={styles.checkoutBtnText}>Оформить заказ</Text>
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
  editBtn: { fontSize: 15, fontWeight: '500' },
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
  itemName: { fontSize: 14, fontWeight: '500', lineHeight: 19, marginBottom: 4 },
  itemColor: { fontSize: 12, marginBottom: 8 },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  qtyBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  qtyNum: { width: 28, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  itemTotal: { fontSize: 16, fontWeight: '700' },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
    gap: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '500' },
  summaryFree: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },
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
