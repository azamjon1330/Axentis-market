import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getUserOrders } from '../../api';
import { Order, RootStackParamList } from '../../types';
import { UPLOADS_URL } from '../../constants/Api';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TABS = [
  { key: '', label: 'Все' },
  { key: 'pending,confirmed,processing,shipped', label: 'Активные' },
  { key: 'delivered', label: 'Доставленные' },
  { key: 'cancelled', label: 'Отменённые' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Ожидает', color: '#FFA726', icon: 'time-outline' },
  confirmed: { label: 'Подтверждён', color: '#7B5CF0', icon: 'checkmark-circle-outline' },
  processing: { label: 'Обрабатывается', color: '#7B5CF0', icon: 'refresh-outline' },
  shipped: { label: 'В пути', color: '#2196F3', icon: 'bicycle-outline' },
  delivered: { label: 'Доставлен', color: '#4CAF50', icon: 'checkmark-done-outline' },
  cancelled: { label: 'Отменён', color: '#FF5252', icon: 'close-circle-outline' },
};

export default function OrdersScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const [activeTab, setActiveTab] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUserOrders(user.phone);
      setOrders(data);
    } catch (e: any) {
      console.error('OrdersScreen load error:', e?.response?.data || e?.message || e);
      setError('Не удалось загрузить заказы');
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime polling — updates status badges without full reload feel
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const data = await getUserOrders(user.phone);
        setOrders(data);
      } catch {
        // silent — don't show error on background refresh
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = activeTab
    ? orders.filter(o => activeTab.split(',').includes(o.status))
    : orders;

  const renderOrder = ({ item }: { item: Order }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const orderItems = Array.isArray(item.items) ? item.items : [];
    const firstItem = orderItems[0];

    return (
      <TouchableOpacity
        style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.cardTop}>
          {/* Product thumbnail */}
          <View style={[styles.thumbnail, { backgroundColor: colors.cardAlt }]}>
            {firstItem?.imageUrl ? (
              <Image
                source={{ uri: firstItem.imageUrl.startsWith('http') ? firstItem.imageUrl : `${UPLOADS_URL}/${firstItem.imageUrl}` }}
                style={styles.thumbnailImg}
                resizeMode="contain"
              />
            ) : (
              <Ionicons name="cube-outline" size={28} color={colors.textMuted} />
            )}
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.orderNum, { color: colors.text }]}>Заказ №{item.orderCode}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
                <Ionicons name={statusCfg.icon as any} size={12} color={statusCfg.color} />
                <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              </View>
            </View>

            <Text style={[styles.orderDate, { color: colors.textMuted }]}>
              {new Date(item.createdAt).toLocaleDateString('ru-RU', {
                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </Text>

            {orderItems.length > 0 && (
              <Text style={[styles.orderItems, { color: colors.textSecondary }]} numberOfLines={1}>
                {orderItems.map(i => i.productName).join(', ')}
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.cardDivider, { backgroundColor: colors.divider }]} />

        <View style={styles.cardBottom}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Итого</Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {item.totalAmount.toLocaleString('ru-RU')} сум
          </Text>
          {item.deliveryType && (
            <Text style={[styles.deliveryInfo, { color: colors.textMuted }]}>
              · {item.deliveryType === 'delivery' ? 'Доставка' : 'Самовывоз'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Мои заказы</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <FlatList
          data={TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.tabs}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.tab,
                {
                  backgroundColor: activeTab === item.key ? colors.primary : colors.surface,
                  borderColor: activeTab === item.key ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setActiveTab(item.key)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.tabText,
                { color: activeTab === item.key ? '#FFF' : colors.textSecondary },
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="wifi-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Ошибка загрузки</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{error}</Text>
          <TouchableOpacity
            onPress={load}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Text style={styles.retryBtnText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="receipt-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Заказов нет</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {activeTab ? 'Нет заказов в этой категории' : 'Вы ещё не делали заказов'}
              </Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  tabsWrap: { marginBottom: 8 },
  tabs: { paddingHorizontal: 16, gap: 8 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: { fontSize: 13, fontWeight: '500' },
  list: { paddingHorizontal: 16, gap: 10 },
  orderCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', gap: 12, padding: 14 },
  thumbnail: {
    width: 70,
    height: 70,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImg: { width: '100%', height: '100%', borderRadius: 12 },
  cardInfo: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNum: { fontSize: 15, fontWeight: '700' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  orderDate: { fontSize: 12 },
  orderItems: { fontSize: 13 },
  cardDivider: { height: 1, marginHorizontal: 14 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 6,
  },
  totalLabel: { fontSize: 13 },
  totalValue: { fontSize: 16, fontWeight: '700' },
  deliveryInfo: { fontSize: 13 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
