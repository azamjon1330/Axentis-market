import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { createOrder } from '../../api';
import { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DeliveryType = 'delivery' | 'pickup';
type PaymentMethod = 'cash' | 'card';
type CardSubtype = 'uzcard' | 'humo' | 'visa' | 'mastercard';

const STEPS = ['Доставка', 'Оплата', 'Подтверждение'];

export default function CheckoutScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { items, total, clearAllItems } = useCart();
  const navigation = useNavigation<Nav>();

  const [step, setStep] = useState(0);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('delivery');
  const [address, setAddress] = useState(user?.defaultDeliveryAddress || '');
  const [recipientName, setRecipientName] = useState(user?.defaultRecipientName || user?.name || '');
  const [recipientPhone, setRecipientPhone] = useState(user?.phone || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [cardSubtype, setCardSubtype] = useState<CardSubtype>('visa');
  const [comment, setComment] = useState('');
  const [isPlacing, setIsPlacing] = useState(false);

  const deliveryCost = deliveryType === 'delivery' ? 0 : 0;

  const groupByCompany = () => {
    const groups: Record<number, typeof items> = {};
    for (const item of items) {
      const cid = item.product?.companyId || 1;
      if (!groups[cid]) groups[cid] = [];
      groups[cid].push(item);
    }
    return groups;
  };

  const handleNext = () => {
    if (step === 0) {
      if (deliveryType === 'delivery' && !address.trim()) {
        Alert.alert('Укажите адрес доставки');
        return;
      }
    }
    if (step < 2) setStep(s => s + 1);
  };

  const handlePlaceOrder = async () => {
    if (!user || items.length === 0) return;
    setIsPlacing(true);
    try {
      const groups = groupByCompany();
      const firstCompanyId = Object.keys(groups)[0];
      const companyItems = groups[Number(firstCompanyId)];

      const orderData = {
        companyId: Number(firstCompanyId),
        customerName: recipientName || user.name,
        customerPhone: user.phone,
        items: companyItems.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.product?.sellingPrice || i.product?.price || 0,
        })),
        totalAmount: total + deliveryCost,
        deliveryType: deliveryType,
        deliveryAddress: deliveryType === 'delivery' ? address : undefined,
        deliveryCost: deliveryCost,
        paymentMethod: paymentMethod,
        cardSubtype: paymentMethod === 'card' ? cardSubtype : undefined,
        recipientName: recipientName,
        comment: comment || undefined,
      };

      const order = await createOrder(orderData);
      await clearAllItems();
      navigation.replace('OrderConfirmed', { orderId: order.id, orderCode: order.orderCode });
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось оформить заказ. Попробуйте позже.');
    } finally {
      setIsPlacing(false);
    }
  };

  const formatPrice = (p: number) => `${p.toLocaleString('ru-RU')} ₽`;

  const CARD_TYPES: { key: CardSubtype; label: string; icon: string }[] = [
    { key: 'visa', label: 'Visa', icon: '💳' },
    { key: 'mastercard', label: 'Mastercard', icon: '💳' },
    { key: 'uzcard', label: 'Uzcard', icon: '🏦' },
    { key: 'humo', label: 'Humo', icon: '🏦' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => step > 0 ? setStep(s => s - 1) : navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Оформление заказа</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepper}>
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                {
                  backgroundColor: i <= step ? colors.primary : colors.surface,
                  borderColor: i <= step ? colors.primary : colors.border,
                },
              ]}>
                {i < step ? (
                  <Ionicons name="checkmark" size={14} color="#FFF" />
                ) : (
                  <Text style={[styles.stepNum, { color: i <= step ? '#FFF' : colors.textSecondary }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text style={[
                styles.stepLabel,
                { color: i <= step ? colors.primary : colors.textMuted },
              ]}>
                {label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, { backgroundColor: i < step ? colors.primary : colors.border }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Step 0: Delivery */}
        {step === 0 && (
          <>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Способ доставки</Text>
              {[
                { key: 'delivery' as DeliveryType, label: 'Курьером', sublabel: '24 мая, с 10:00 до 13:00', price: 'Бесплатно' },
                { key: 'pickup' as DeliveryType, label: 'Пункт выдачи', sublabel: 'Завтра, с 10:00', price: 'Бесплатно' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.optionRow,
                    {
                      borderColor: deliveryType === opt.key ? colors.primary : colors.border,
                      backgroundColor: deliveryType === opt.key ? colors.primary + '10' : colors.surface,
                    },
                  ]}
                  onPress={() => setDeliveryType(opt.key)}
                  activeOpacity={0.8}
                >
                  <View style={[
                    styles.radioOuter,
                    { borderColor: deliveryType === opt.key ? colors.primary : colors.border },
                  ]}>
                    {deliveryType === opt.key && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { color: colors.text }]}>{opt.label}</Text>
                    <Text style={[styles.optionSub, { color: colors.textMuted }]}>{opt.sublabel}</Text>
                  </View>
                  <Text style={[styles.optionPrice, { color: colors.success }]}>{opt.price}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {deliveryType === 'delivery' && (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Адрес доставки</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="ул. Ленина, 10, кв. 25"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                </View>
              </View>
            )}

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Получатель</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={recipientName}
                  onChangeText={setRecipientName}
                  placeholder="Имя получателя"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Ionicons name="call-outline" size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={recipientPhone}
                  onChangeText={setRecipientPhone}
                  placeholder="+7 (___) ___-__-__"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Комментарий к заказу</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border, minHeight: 80, alignItems: 'flex-start', paddingTop: 12 }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Например: оставить у двери"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          </>
        )}

        {/* Step 1: Payment */}
        {step === 1 && (
          <>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Способ оплаты</Text>
              {[
                { key: 'card' as PaymentMethod, label: 'Банковская карта', icon: 'card-outline' },
                { key: 'cash' as PaymentMethod, label: 'Наличными при получении', icon: 'cash-outline' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.optionRow,
                    {
                      borderColor: paymentMethod === opt.key ? colors.primary : colors.border,
                      backgroundColor: paymentMethod === opt.key ? colors.primary + '10' : colors.surface,
                    },
                  ]}
                  onPress={() => setPaymentMethod(opt.key)}
                  activeOpacity={0.8}
                >
                  <View style={[
                    styles.radioOuter,
                    { borderColor: paymentMethod === opt.key ? colors.primary : colors.border },
                  ]}>
                    {paymentMethod === opt.key && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <Ionicons name={opt.icon as any} size={20} color={colors.textSecondary} style={{ marginHorizontal: 8 }} />
                  <Text style={[styles.optionLabel, { color: colors.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {paymentMethod === 'card' && (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Тип карты</Text>
                <View style={styles.cardTypesGrid}>
                  {CARD_TYPES.map((ct) => (
                    <TouchableOpacity
                      key={ct.key}
                      style={[
                        styles.cardTypeBtn,
                        {
                          backgroundColor: cardSubtype === ct.key ? colors.primary + '20' : colors.inputBg,
                          borderColor: cardSubtype === ct.key ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setCardSubtype(ct.key)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cardTypeIcon}>{ct.icon}</Text>
                      <Text style={[styles.cardTypeLabel, { color: cardSubtype === ct.key ? colors.primary : colors.text }]}>
                        {ct.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* Step 2: Confirmation */}
        {step === 2 && (
          <>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ваш заказ</Text>
              {items.map((item) => (
                <View key={item.id} style={styles.orderItemRow}>
                  <Text style={[styles.orderItemName, { color: colors.text }]} numberOfLines={1}>
                    {item.product?.name}
                  </Text>
                  <Text style={[styles.orderItemQty, { color: colors.textSecondary }]}>× {item.quantity}</Text>
                  <Text style={[styles.orderItemPrice, { color: colors.text }]}>
                    {((item.product?.sellingPrice || item.product?.price || 0) * item.quantity).toLocaleString('ru-RU')} ₽
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Доставка</Text>
              <View style={styles.confirmRow}>
                <Ionicons name="bicycle-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.confirmText, { color: colors.textSecondary }]}>
                  {deliveryType === 'delivery' ? `Курьером, ${address}` : 'Самовывоз'}
                </Text>
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Оплата</Text>
              <View style={styles.confirmRow}>
                <Ionicons name={paymentMethod === 'card' ? 'card-outline' : 'cash-outline'} size={16} color={colors.textSecondary} />
                <Text style={[styles.confirmText, { color: colors.textSecondary }]}>
                  {paymentMethod === 'card' ? `Карта (${cardSubtype.toUpperCase()})` : 'Наличными'}
                </Text>
              </View>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Товары</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{formatPrice(total)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Доставка</Text>
                <Text style={[styles.freeText, { color: colors.success }]}>Бесплатно</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryRow}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Итого</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>{formatPrice(total + deliveryCost)}</Text>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.bottomTotal}>
          <Text style={[styles.bottomTotalLabel, { color: colors.textSecondary }]}>Итого</Text>
          <Text style={[styles.bottomTotalValue, { color: colors.text }]}>{formatPrice(total + deliveryCost)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={step < 2 ? handleNext : handlePlaceOrder}
          disabled={isPlacing}
          activeOpacity={0.85}
        >
          {isPlacing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.nextBtnText}>
              {step < 2 ? 'Продолжить' : `Оплатить ${formatPrice(total + deliveryCost)}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { fontSize: 13, fontWeight: '700' },
  stepLabel: { fontSize: 11, fontWeight: '500' },
  stepLine: { flex: 1, height: 2, marginHorizontal: 6, marginBottom: 18 },
  scroll: { paddingHorizontal: 16 },
  section: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  optionLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  optionSub: { fontSize: 12, marginTop: 2 },
  optionPrice: { fontSize: 13, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
  },
  input: { flex: 1, fontSize: 15 },
  cardTypesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cardTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  cardTypeIcon: { fontSize: 18 },
  cardTypeLabel: { fontSize: 13, fontWeight: '600' },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderItemName: { flex: 1, fontSize: 14 },
  orderItemQty: { fontSize: 13 },
  orderItemPrice: { fontSize: 14, fontWeight: '600' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmText: { fontSize: 14, flex: 1 },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14 },
  freeText: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    paddingBottom: 28,
  },
  bottomTotal: { flex: 1 },
  bottomTotalLabel: { fontSize: 12 },
  bottomTotalValue: { fontSize: 18, fontWeight: '800' },
  nextBtn: {
    flex: 2,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
