import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { getOrderDetail } from '../../api';
import { Order, RootStackParamList } from '../../types';
import { UPLOADS_URL } from '../../constants/Api';

type Route = RouteProp<RootStackParamList, 'OrderDetail'>;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; step: number }> = {
  pending: { label: 'Ожидает подтверждения', color: '#FFA726', icon: 'time-outline', step: 0 },
  confirmed: { label: 'Подтверждён', color: '#7B5CF0', icon: 'checkmark-circle-outline', step: 1 },
  processing: { label: 'Обрабатывается', color: '#7B5CF0', icon: 'refresh-outline', step: 1 },
  shipped: { label: 'В пути', color: '#2196F3', icon: 'bicycle-outline', step: 2 },
  delivered: { label: 'Доставлен', color: '#4CAF50', icon: 'checkmark-done-outline', step: 3 },
  cancelled: { label: 'Отменён', color: '#FF5252', icon: 'close-circle-outline', step: -1 },
};

export default function OrderDetailScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { orderId } = route.params;

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getOrderDetail(orderId)
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setIsLoading(false));
  }, [orderId]);

  // Polling for live status updates
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const updated = await getOrderDetail(orderId);
        if (updated) setOrder(updated);
      } catch {
        // silent background refresh
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [orderId]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Заказ не найден</Text>
      </View>
    );
  }

  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const PROGRESS_STEPS = ['Оформлен', 'Подтверждён', 'В пути', 'Доставлен'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Заказ №{order.orderCode}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Status card */}
        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: statusCfg.color + '40' }]}>
          <View style={[styles.statusIconBg, { backgroundColor: statusCfg.color + '20' }]}>
            <Ionicons name={statusCfg.icon as any} size={28} color={statusCfg.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            <Text style={[styles.statusDate, { color: colors.textMuted }]}>
              Заказ от {new Date(order.createdAt).toLocaleDateString('ru-RU', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        {order.status !== 'cancelled' && (
          <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.progressSteps}>
              {PROGRESS_STEPS.map((label, i) => (
                <View key={i} style={styles.progressStep}>
                  <View style={[
                    styles.progressDot,
                    {
                      backgroundColor: i <= statusCfg.step ? colors.primary : colors.border,
                      borderColor: i <= statusCfg.step ? colors.primary : colors.border,
                    },
                  ]}>
                    {i < statusCfg.step && (
                      <Ionicons name="checkmark" size={10} color="#FFF" />
                    )}
                  </View>
                  <Text style={[
                    styles.progressLabel,
                    { color: i <= statusCfg.step ? colors.text : colors.textMuted },
                  ]}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.progressLineWrap}>
              {PROGRESS_STEPS.slice(0, -1).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressLine,
                    { backgroundColor: i < statusCfg.step ? colors.primary : colors.border },
                  ]}
                />
              ))}
            </View>
          </View>
        )}

        {/* Delivery info */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Доставка</Text>
          <View style={styles.infoRow}>
            <Ionicons name="bicycle-outline" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {order.deliveryType === 'delivery' ? 'Курьером' : 'Самовывоз'}
            </Text>
          </View>
          {order.deliveryAddress && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={18} color={colors.textMuted} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {order.deliveryAddress}
              </Text>
            </View>
          )}
          {order.recipientName && (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={18} color={colors.textMuted} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {order.recipientName}
              </Text>
            </View>
          )}
        </View>

        {/* Order items */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Товары</Text>
          {orderItems.map((item, i) => (
            <View key={i} style={[styles.orderItem, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl.startsWith('http') ? item.imageUrl : `${UPLOADS_URL}/${item.imageUrl}` }}
                  style={[styles.itemImg, { backgroundColor: colors.cardAlt }]}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.itemImg, { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="cube-outline" size={24} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.text }]}>{item.productName}</Text>
                <Text style={[styles.itemQty, { color: colors.textMuted }]}>{item.quantity} шт.</Text>
              </View>
              <Text style={[styles.itemPrice, { color: colors.text }]}>
                {(item.price * item.quantity).toLocaleString('ru-RU')} сум
              </Text>
            </View>
          ))}
        </View>

        {/* Payment */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Оплата</Text>
          <View style={styles.infoRow}>
            <Ionicons name={order.paymentMethod === 'card' ? 'card-outline' : 'cash-outline'} size={18} color={colors.textMuted} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {order.paymentMethod === 'card'
                ? `Карта (${(order.cardSubtype || 'card').toUpperCase()})`
                : 'Наличными'}
            </Text>
          </View>
          <View style={[styles.totalRow, { borderTopColor: colors.divider }]}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Итого</Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>
              {order.totalAmount.toLocaleString('ru-RU')} сум
            </Text>
          </View>
        </View>

        {/* Support button */}
        <TouchableOpacity
          style={[styles.supportBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => Linking.openURL('tel:+74951234567').catch(() => Alert.alert('Поддержка', 'Свяжитесь с нами по телефону'))}
          activeOpacity={0.8}
        >
          <Ionicons name="headset-outline" size={20} color={colors.primary} />
          <Text style={[styles.supportText, { color: colors.primary }]}>Связаться с поддержкой</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  scroll: { padding: 16, gap: 12 },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
  },
  statusIconBg: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: { fontSize: 16, fontWeight: '700' },
  statusDate: { fontSize: 12, marginTop: 2 },
  progressCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    position: 'relative',
  },
  progressSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStep: { alignItems: 'center', gap: 6, flex: 1 },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLabel: { fontSize: 10, textAlign: 'center' },
  progressLineWrap: {
    position: 'absolute',
    top: 28,
    left: 40,
    right: 40,
    flexDirection: 'row',
  },
  progressLine: { flex: 1, height: 2, marginHorizontal: 4 },
  section: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
  },
  itemImg: { width: 60, height: 60, borderRadius: 10 },
  itemName: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  itemQty: { fontSize: 12, marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: '700' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  supportText: { fontSize: 15, fontWeight: '600' },
});
