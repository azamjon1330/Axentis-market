import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Alert, Linking, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import {
  createOrder, getPaymentCards, addPaymentCard, getCompanyDetail,
  getCompanyPromoCodes, validatePromoCode, redeemPromoCode,
} from '../../api';

const STEPS = ['Доставка', 'Оплата', 'Подтверждение'];
const DELIVERY_COST_PER_KM = 1500;
const DEFAULT_FREE_RADIUS_KM = 2;

const CARD_TYPES = [
  { key: 'visa', label: 'Visa', color: '#1A1F71' },
  { key: 'mastercard', label: 'Mastercard', color: '#EB001B' },
  { key: 'uzcard', label: 'Uzcard', color: '#1BA874' },
  { key: 'humo', label: 'Humo', color: '#FF6B00' },
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CheckoutScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { items, total, clearAllItems } = useCart();
  const navigation = useNavigation();
  const route = useRoute();

  const [step, setStep] = useState(0);
  const [address, setAddress] = useState(user?.defaultDeliveryAddress || '');
  const [recipientName, setRecipientName] = useState(user?.defaultRecipientName || user?.name || '');
  const [recipientPhone, setRecipientPhone] = useState(user?.phone || '');
  const [comment, setComment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [isPlacing, setIsPlacing] = useState(false);

  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);

  const [savedCards, setSavedCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [cardsLoading, setCardsLoading] = useState(false);

  const [inlineCardType, setInlineCardType] = useState('uzcard');
  const [inlineCardNumber, setInlineCardNumber] = useState('');
  const [inlineExpiry, setInlineExpiry] = useState('');
  const [inlineHolderName, setInlineHolderName] = useState('');
  const [inlineCardSaved, setInlineCardSaved] = useState(false);
  const [savingInlineCard, setSavingInlineCard] = useState(false);
  const [showAddCardForm, setShowAddCardForm] = useState(false);

  // ─── Promo codes (Req 21.1–21.3) ──────────────────────────────────────────
  const [promoCodes, setPromoCodes] = useState([]);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null); // { id, code }
  const [discount, setDiscount] = useState(0);
  const [promoMessage, setPromoMessage] = useState('');
  const [promoError, setPromoError] = useState(false);
  const [applyingPromo, setApplyingPromo] = useState(false);

  // The order is placed against the first item's company (see handlePlaceOrder).
  const orderCompanyId = useMemo(() => items[0]?.product?.companyId || null, [items]);

  useEffect(() => {
    if (route.params?.selectedCoords) {
      setDeliveryCoords(route.params.selectedCoords);
    }
    if (route.params?.selectedAddress) {
      setAddress(route.params.selectedAddress);
    }
    // Applied from a chosen saved address (SavedAddresses screen, select mode).
    if (route.params?.selectedRecipient) {
      setRecipientName(route.params.selectedRecipient);
    }
  }, [
    route.params?.selectedCoords,
    route.params?.selectedAddress,
    route.params?.selectedRecipient,
    route.params?.selectedLabel,
  ]);

  useEffect(() => {
    const companyId = items[0]?.product?.companyId;
    if (companyId) {
      getCompanyDetail(companyId).then(setCompanyInfo).catch(() => {});
    }
  }, [items]);

  useEffect(() => {
    if (!user) return;
    setCardsLoading(true);
    getPaymentCards(user.phone)
      .then(cards => {
        setSavedCards(cards);
        const def = cards.find(c => c.isDefault) || cards[0];
        if (def) setSelectedCard(def);
      })
      .catch(() => {})
      .finally(() => setCardsLoading(false));
  }, [user]);

  const deliveryCost = useMemo(() => {
    if (!deliveryCoords || !companyInfo?.latitude || !companyInfo?.longitude) return 0;
    const dist = haversineKm(companyInfo.latitude, companyInfo.longitude, deliveryCoords.lat, deliveryCoords.lng);
    const radius = companyInfo.deliveryRadius ?? DEFAULT_FREE_RADIUS_KM;
    if (dist <= radius) return 0;
    return Math.ceil(dist - radius) * DELIVERY_COST_PER_KM;
  }, [deliveryCoords, companyInfo]);

  // Load the promo codes available for this order's company (Req 21.1).
  useEffect(() => {
    if (!orderCompanyId) return;
    getCompanyPromoCodes(orderCompanyId)
      .then(setPromoCodes)
      .catch(() => setPromoCodes([]));
  }, [orderCompanyId]);

  // If the cart contents change, a previously applied discount may no longer be
  // valid — reset it so the buyer re-applies against the new total.
  useEffect(() => {
    setAppliedPromo(null);
    setDiscount(0);
    setPromoMessage('');
    setPromoError(false);
  }, [total, orderCompanyId]);

  // Discount can never exceed the order amount; the payable total is floored at 0.
  const effectiveDiscount = useMemo(
    () => Math.max(0, Math.min(discount, total)),
    [discount, total],
  );
  const payableTotal = useMemo(
    () => Math.max(0, total + deliveryCost - effectiveDiscount),
    [total, deliveryCost, effectiveDiscount],
  );

  const formatPrice = (p) => `${p.toLocaleString('ru-RU')} сум`;

  const canContinue = useMemo(() => {
    if (step === 1) {
      if (paymentMethod === 'cash') return true;
      if (paymentMethod === 'card') {
        if (showAddCardForm) return inlineCardSaved;
        return !!selectedCard || inlineCardSaved;
      }
      return false;
    }
    return true;
  }, [step, paymentMethod, selectedCard, inlineCardSaved, showAddCardForm]);

  const handlePickLocation = () => {
    navigation.navigate('MapLocationPicker', {
      initialCoords: deliveryCoords ?? undefined,
    });
  };

  const handleSelectSavedAddress = () => {
    navigation.navigate('SavedAddresses', { selectMode: true });
  };

  const openInMaps = () => {
    if (deliveryCoords) {
      Linking.openURL(`https://maps.google.com/?q=${deliveryCoords.lat},${deliveryCoords.lng}`);
    } else if (address.trim()) {
      Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address.trim())}`);
    }
  };

  const handleNext = () => {
    if (step === 0 && !address.trim()) {
      Alert.alert('Укажите адрес доставки');
      return;
    }
    if (step < 2) setStep(s => s + 1);
  };

  const handleCardNumberChange = (text) => {
    const digits = text.replace(/\D/g, '').slice(0, 16);
    setInlineCardNumber(digits.replace(/(.{4})/g, '$1 ').trim());
  };

  const handleExpiryChange = (text) => {
    const cleaned = text.replace(/\D/g, '');
    setInlineExpiry(cleaned.length <= 2 ? cleaned : `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
  };

  const handleSaveInlineCard = async () => {
    if (!user) return;
    const digits = inlineCardNumber.replace(/\s/g, '');
    if (digits.length !== 16) {
      Alert.alert('Ошибка', 'Введите полный 16-значный номер карты');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(inlineExpiry)) {
      Alert.alert('Ошибка', 'Введите срок в формате ММ/ГГ');
      return;
    }
    if (!inlineHolderName.trim()) {
      Alert.alert('Ошибка', 'Введите имя держателя карты');
      return;
    }
    const nameParts = inlineHolderName.trim().split(/\s+/);
    setSavingInlineCard(true);
    try {
      const card = await addPaymentCard({
        userPhone: user.phone,
        cardNumber: digits,
        cardExpiry: inlineExpiry,
        cardHolderFirstName: nameParts[0],
        cardHolderLastName: nameParts.slice(1).join(' ') || ' ',
        cardType: inlineCardType,
      });
      setSelectedCard(card);
      setSavedCards(prev => [...prev, card]);
      setInlineCardSaved(true);
    } catch {
      Alert.alert('Ошибка', 'Не удалось добавить карту');
    } finally {
      setSavingInlineCard(false);
    }
  };

  const getCardColor = (type) =>
    CARD_TYPES.find(ct => ct.key === type)?.color || colors.primary;

  // Apply a promo code: validate against the backend, then either show the
  // resulting discount (Req 21.2) or surface the returned message while leaving
  // the order total unchanged (Req 21.3).
  const handleApplyPromo = async (rawCode) => {
    const code = (rawCode ?? promoInput).trim();
    if (!code) {
      setPromoError(true);
      setPromoMessage('Введите промокод');
      return;
    }
    if (typeof rawCode === 'string') setPromoInput(rawCode);
    setApplyingPromo(true);
    setPromoError(false);
    setPromoMessage('');
    try {
      const result = await validatePromoCode({
        code,
        userPhone: user?.phone,
        companyId: orderCompanyId,
        orderAmount: total,
      });
      if (result.valid && result.discount > 0) {
        const matched = promoCodes.find(
          p => (p.code || '').toLowerCase() === code.toLowerCase(),
        );
        setDiscount(result.discount);
        setAppliedPromo({ id: result.promoId ?? matched?.id ?? null, code });
        setPromoError(false);
        setPromoMessage(result.message || `Скидка применена: −${formatPrice(result.discount)}`);
      } else {
        // Invalid / expired: keep the total unchanged (Req 21.3).
        setDiscount(0);
        setAppliedPromo(null);
        setPromoError(true);
        setPromoMessage(result.message || 'Промокод недействителен или истёк');
      }
    } catch (err) {
      setDiscount(0);
      setAppliedPromo(null);
      setPromoError(true);
      setPromoMessage(err?.response?.data?.message || err?.response?.data?.error || 'Не удалось применить промокод');
    } finally {
      setApplyingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setDiscount(0);
    setPromoInput('');
    setPromoMessage('');
    setPromoError(false);
  };

  const handlePlaceOrder = async () => {
    if (!user || items.length === 0) return;
    setIsPlacing(true);
    try {
      const groups = {};
      for (const item of items) {
        const cid = item.product?.companyId || 1;
        if (!groups[cid]) groups[cid] = [];
        groups[cid].push(item);
      }
      const firstCompanyId = Number(Object.keys(groups)[0]);
      const companyItems = groups[firstCompanyId];

      const order = await createOrder({
        companyId: firstCompanyId || undefined,
        customerName: recipientName || user.name,
        customerPhone: user.phone,
        items: companyItems.map(i => {
          const selectedColor = i.selected_color ?? i.selectedColor ?? undefined;
          const selectedSize = i.selected_size ?? i.selectedSize ?? undefined;
          return {
            productId: i.productId,
            productName: i.product?.name || 'Товар',
            quantity: i.quantity,
            price: i.product?.price || 0,
            price_with_markup: i.product?.sellingPrice || i.product?.price || 0,
            imageUrl: i.product?.images?.[0] || undefined,
            // Carry the selected variant color/size into the order items payload
            // so it survives in orders.items JSON (Req 15.1, 15.2). Both
            // snake_case (as the cart uses) and the plain color/size keys are
            // sent for backend compatibility.
            selected_color: selectedColor,
            selected_size: selectedSize,
            color: selectedColor,
            size: selectedSize,
          };
        }),
        totalAmount: payableTotal,
        deliveryType: 'delivery',
        deliveryAddress: address,
        deliveryCoordinates: deliveryCoords
          ? `${deliveryCoords.lat},${deliveryCoords.lng}`
          : undefined,
        deliveryCost,
        paymentMethod,
        cardSubtype: paymentMethod === 'card' && selectedCard ? selectedCard.cardType : undefined,
        recipientName,
        comment: comment || undefined,
        promoCode: appliedPromo?.code || undefined,
        discount: effectiveDiscount || undefined,
      });
      // Record the promo redemption now that the order exists (Req 21).
      if (appliedPromo && effectiveDiscount > 0) {
        try {
          await redeemPromoCode({
            promoId: appliedPromo.id,
            userPhone: user.phone,
            orderId: order.id,
            discount: effectiveDiscount,
          });
        } catch {
          // Redemption tracking failure must not block a placed order.
        }
      }
      await clearAllItems();
      navigation.replace('OrderConfirmed', { orderId: order.id, orderCode: order.orderCode });
    } catch (err) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось оформить заказ. Попробуйте позже.');
    } finally {
      setIsPlacing(false);
    }
  };

  const paymentOptions = [
    { key: 'card', label: 'Банковская карта', icon: 'card-outline' },
    { key: 'cash', label: 'Наличными при получении', icon: 'cash-outline' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => step > 0 ? setStep(s => s - 1) : navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Оформление заказа</Text>
        <View style={{ width: 40 }} />
      </View>

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
                {i < step
                  ? <Ionicons name="checkmark" size={14} color="#FFF" />
                  : <Text style={[styles.stepNum, { color: i <= step ? '#FFF' : colors.textSecondary }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[styles.stepLabel, { color: i <= step ? colors.primary : colors.textMuted }]}>
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

        {step === 0 && (
          <>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.deliveryBadge, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
                <Ionicons name="bicycle-outline" size={18} color={colors.primary} />
                <Text style={[styles.deliveryBadgeText, { color: colors.primary }]}>
                  {deliveryCost > 0 ? `Доставка: ${formatPrice(deliveryCost)}` : 'Курьерская доставка · Бесплатно'}
                </Text>
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Адрес доставки</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={address}
                  onChangeText={text => { setAddress(text); setDeliveryCoords(null); }}
                  placeholder="ул. Ленина, 10, кв. 25"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <TouchableOpacity
                  onPress={handlePickLocation}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="map-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.savedAddrBtn, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '08' }]}
                onPress={handleSelectSavedAddress}
                activeOpacity={0.8}
              >
                <Ionicons name="bookmarks-outline" size={18} color={colors.primary} />
                <Text style={[styles.savedAddrBtnText, { color: colors.primary }]}>
                  Выбрать из сохранённых
                </Text>
              </TouchableOpacity>
            </View>

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
                  placeholder="+998 (__) ___-__-__"
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

        {step === 1 && (
          <>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Способ оплаты</Text>
              {paymentOptions.map(opt => (
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
                  <View style={[styles.radioOuter, { borderColor: paymentMethod === opt.key ? colors.primary : colors.border }]}>
                    {paymentMethod === opt.key && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Ionicons name={opt.icon} size={20} color={colors.textSecondary} style={{ marginHorizontal: 8 }} />
                  <Text style={[styles.optionLabel, { color: colors.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {paymentMethod === 'card' && (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {cardsLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ paddingVertical: 8 }} />
                ) : savedCards.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Выберите карту</Text>
                    {savedCards.map(card => (
                      <TouchableOpacity
                        key={card.id}
                        style={[
                          styles.savedCardRow,
                          {
                            borderColor: selectedCard?.id === card.id ? colors.primary : colors.border,
                            backgroundColor: selectedCard?.id === card.id ? colors.primary + '10' : colors.inputBg,
                          },
                        ]}
                        onPress={() => { setSelectedCard(card); setShowAddCardForm(false); }}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.radioOuter, { borderColor: selectedCard?.id === card.id ? colors.primary : colors.border }]}>
                          {selectedCard?.id === card.id && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                        </View>
                        <View style={[styles.cardDot, { backgroundColor: getCardColor(card.cardType) }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardRowLabel, { color: colors.text }]}>
                            {CARD_TYPES.find(ct => ct.key === card.cardType)?.label} **** {card.cardNumberLast4}
                          </Text>
                          <Text style={[styles.cardRowSub, { color: colors.textMuted }]}>
                            {card.cardHolderFirstName} {card.cardHolderLastName}
                          </Text>
                        </View>
                        {card.isDefault && (
                          <View style={[styles.defaultBadge, { backgroundColor: colors.primary + '20' }]}>
                            <Text style={[styles.defaultBadgeText, { color: colors.primary }]}>Основная</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}

                    <TouchableOpacity
                      style={[styles.addCardBtn, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '08' }]}
                      onPress={() => { setShowAddCardForm(v => !v); setSelectedCard(null); setInlineCardSaved(false); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={showAddCardForm ? 'remove-circle-outline' : 'add-circle-outline'} size={20} color={colors.primary} />
                      <Text style={[styles.addCardBtnText, { color: colors.primary }]}>
                        {showAddCardForm ? 'Отмена' : 'Добавить новую карту'}
                      </Text>
                    </TouchableOpacity>

                    {showAddCardForm && (
                      <>
                        <View style={styles.cardTypesGrid}>
                          {CARD_TYPES.map(ct => (
                            <TouchableOpacity
                              key={ct.key}
                              style={[
                                styles.cardTypeBtn,
                                {
                                  backgroundColor: inlineCardType === ct.key ? ct.color + '20' : colors.inputBg,
                                  borderColor: inlineCardType === ct.key ? ct.color : colors.border,
                                },
                              ]}
                              onPress={() => setInlineCardType(ct.key)}
                              activeOpacity={0.8}
                            >
                              <View style={[styles.cardDot, { backgroundColor: ct.color }]} />
                              <Text style={[styles.cardTypeLabel, { color: inlineCardType === ct.key ? ct.color : colors.text }]}>
                                {ct.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                          <Ionicons name="card-outline" size={18} color={colors.textSecondary} />
                          <TextInput
                            style={[styles.input, { color: colors.text, letterSpacing: 2 }]}
                            placeholder="1234 5678 9012 3456"
                            placeholderTextColor={colors.textMuted}
                            value={inlineCardNumber}
                            onChangeText={handleCardNumberChange}
                            keyboardType="number-pad"
                            maxLength={19}
                          />
                        </View>
                        <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                          <TextInput
                            style={[styles.input, { color: colors.text }]}
                            placeholder="ММ/ГГ"
                            placeholderTextColor={colors.textMuted}
                            value={inlineExpiry}
                            onChangeText={handleExpiryChange}
                            keyboardType="number-pad"
                            maxLength={5}
                          />
                        </View>
                        <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                          <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                          <TextInput
                            style={[styles.input, { color: colors.text }]}
                            placeholder="Имя Фамилия"
                            placeholderTextColor={colors.textMuted}
                            value={inlineHolderName}
                            onChangeText={setInlineHolderName}
                            autoCapitalize="words"
                          />
                        </View>
                        {!inlineCardSaved ? (
                          <TouchableOpacity
                            style={[styles.saveCardBtn, { backgroundColor: colors.primary }]}
                            onPress={handleSaveInlineCard}
                            disabled={savingInlineCard}
                            activeOpacity={0.85}
                          >
                            {savingInlineCard
                              ? <ActivityIndicator color="#FFF" />
                              : <Text style={styles.saveCardBtnText}>Сохранить карту</Text>
                            }
                          </TouchableOpacity>
                        ) : (
                          <View style={[styles.savedBadge, { backgroundColor: (colors.success || '#4CAF50') + '20', borderColor: (colors.success || '#4CAF50') + '60' }]}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.success || '#4CAF50'} />
                            <Text style={[styles.savedBadgeText, { color: colors.success || '#4CAF50' }]}>Карта сохранена</Text>
                          </View>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Данные карты</Text>
                    <View style={styles.cardTypesGrid}>
                      {CARD_TYPES.map(ct => (
                        <TouchableOpacity
                          key={ct.key}
                          style={[
                            styles.cardTypeBtn,
                            {
                              backgroundColor: inlineCardType === ct.key ? ct.color + '20' : colors.inputBg,
                              borderColor: inlineCardType === ct.key ? ct.color : colors.border,
                            },
                          ]}
                          onPress={() => setInlineCardType(ct.key)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.cardDot, { backgroundColor: ct.color }]} />
                          <Text style={[styles.cardTypeLabel, { color: inlineCardType === ct.key ? ct.color : colors.text }]}>
                            {ct.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <Ionicons name="card-outline" size={18} color={colors.textSecondary} />
                      <TextInput
                        style={[styles.input, { color: colors.text, letterSpacing: 2 }]}
                        placeholder="1234 5678 9012 3456"
                        placeholderTextColor={colors.textMuted}
                        value={inlineCardNumber}
                        onChangeText={handleCardNumberChange}
                        keyboardType="number-pad"
                        maxLength={19}
                      />
                    </View>
                    <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="ММ/ГГ"
                        placeholderTextColor={colors.textMuted}
                        value={inlineExpiry}
                        onChangeText={handleExpiryChange}
                        keyboardType="number-pad"
                        maxLength={5}
                      />
                    </View>
                    <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="Имя Фамилия"
                        placeholderTextColor={colors.textMuted}
                        value={inlineHolderName}
                        onChangeText={setInlineHolderName}
                        autoCapitalize="words"
                      />
                    </View>
                    {!inlineCardSaved ? (
                      <TouchableOpacity
                        style={[styles.saveCardBtn, { backgroundColor: colors.primary }]}
                        onPress={handleSaveInlineCard}
                        disabled={savingInlineCard}
                        activeOpacity={0.85}
                      >
                        {savingInlineCard
                          ? <ActivityIndicator color="#FFF" />
                          : <Text style={styles.saveCardBtnText}>Сохранить карту</Text>
                        }
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.savedBadge, { backgroundColor: (colors.success || '#4CAF50') + '20', borderColor: (colors.success || '#4CAF50') + '60' }]}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.success || '#4CAF50'} />
                        <Text style={[styles.savedBadgeText, { color: colors.success || '#4CAF50' }]}>Карта сохранена</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ваш заказ</Text>
              {items.map(item => (
                <View key={item.id} style={styles.orderItemRow}>
                  <Text style={[styles.orderItemName, { color: colors.text }]} numberOfLines={2}>
                    {item.product?.name}
                  </Text>
                  <Text style={[styles.orderItemQty, { color: colors.textSecondary }]}>× {item.quantity}</Text>
                  <Text style={[styles.orderItemPrice, { color: colors.text }]}>
                    {((item.product?.sellingPrice || item.product?.price || 0) * item.quantity).toLocaleString('ru-RU')} сум
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Доставка</Text>
              <View style={styles.confirmRow}>
                <Ionicons name="bicycle-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.confirmText, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>
                  {address || 'Адрес не указан'}
                </Text>
                {(deliveryCoords || address.trim()) && (
                  <TouchableOpacity onPress={openInMaps} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="map-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Оплата</Text>
              <View style={styles.confirmRow}>
                <Ionicons name={paymentMethod === 'card' ? 'card-outline' : 'cash-outline'} size={16} color={colors.textSecondary} />
                <Text style={[styles.confirmText, { color: colors.textSecondary }]}>
                  {paymentMethod === 'cash'
                    ? 'Наличными при получении'
                    : selectedCard
                      ? `${CARD_TYPES.find(ct => ct.key === selectedCard.cardType)?.label} **** ${selectedCard.cardNumberLast4}`
                      : 'Банковская карта'
                  }
                </Text>
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Промокод</Text>

              {promoCodes.length > 0 && (
                <View style={styles.promoChipsRow}>
                  {promoCodes.map(pc => {
                    const isApplied = appliedPromo && (appliedPromo.code || '').toLowerCase() === (pc.code || '').toLowerCase();
                    return (
                      <TouchableOpacity
                        key={pc.id ?? pc.code}
                        style={[
                          styles.promoChip,
                          {
                            borderColor: isApplied ? colors.primary : colors.border,
                            backgroundColor: isApplied ? colors.primary + '15' : colors.inputBg,
                          },
                        ]}
                        onPress={() => handleApplyPromo(pc.code)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
                        <Text style={[styles.promoChipCode, { color: colors.text }]}>{pc.code}</Text>
                        {!!pc.description && (
                          <Text style={[styles.promoChipDesc, { color: colors.textMuted }]} numberOfLines={1}>
                            {pc.description}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={styles.promoInputRow}>
                <View style={[styles.inputWrap, { flex: 1, backgroundColor: colors.inputBg, borderColor: promoError ? (colors.danger || '#E53935') : colors.border }]}>
                  <Ionicons name="pricetag-outline" size={18} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={promoInput}
                    onChangeText={(t) => { setPromoInput(t); setPromoError(false); }}
                    placeholder="Введите промокод"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!applyingPromo}
                  />
                </View>
                {appliedPromo ? (
                  <TouchableOpacity
                    style={[styles.promoApplyBtn, { backgroundColor: colors.border }]}
                    onPress={handleRemovePromo}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.promoApplyBtnText, { color: colors.text }]}>Убрать</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.promoApplyBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleApplyPromo()}
                    disabled={applyingPromo}
                    activeOpacity={0.85}
                  >
                    {applyingPromo
                      ? <ActivityIndicator color="#FFF" />
                      : <Text style={[styles.promoApplyBtnText, { color: '#FFF' }]}>Применить</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>

              {!!promoMessage && (
                <Text style={[styles.promoMessage, { color: promoError ? (colors.danger || '#E53935') : (colors.success || '#4CAF50') }]}>
                  {promoMessage}
                </Text>
              )}
            </View>

            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {items.map(item => (
                <View key={item.id} style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                    {item.product?.name}
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>
                    {((item.product?.sellingPrice || item.product?.price || 0) * item.quantity).toLocaleString('ru-RU')} сум
                  </Text>
                </View>
              ))}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Доставка</Text>
                {deliveryCost > 0
                  ? <Text style={[styles.summaryValue, { color: colors.text }]}>{formatPrice(deliveryCost)}</Text>
                  : <Text style={[styles.freeText, { color: colors.success || '#4CAF50' }]}>Бесплатно</Text>
                }
              </View>
              {effectiveDiscount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.success || '#4CAF50' }]}>
                    Скидка{appliedPromo?.code ? ` (${appliedPromo.code})` : ''}
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.success || '#4CAF50' }]}>
                    −{formatPrice(effectiveDiscount)}
                  </Text>
                </View>
              )}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryRow}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Итого</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>{formatPrice(payableTotal)}</Text>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.bottomTotal}>
          <Text style={[styles.bottomTotalLabel, { color: colors.textSecondary }]}>Итого</Text>
          <Text style={[styles.bottomTotalValue, { color: colors.text }]}>{formatPrice(payableTotal)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: canContinue ? colors.primary : colors.border }]}
          onPress={canContinue ? (step < 2 ? handleNext : handlePlaceOrder) : undefined}
          disabled={isPlacing}
          activeOpacity={0.85}
        >
          {isPlacing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={[styles.nextBtnText, { color: canContinue ? '#FFF' : colors.textMuted }]}>
              {step < 2 ? 'Продолжить' : `Оплатить ${formatPrice(payableTotal)}`}
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
  deliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  deliveryBadgeText: { fontSize: 14, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 50,
    paddingVertical: 8,
  },
  input: { flex: 1, fontSize: 15 },
  savedAddrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 11,
  },
  savedAddrBtnText: { fontSize: 14, fontWeight: '600' },
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
  savedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  cardDot: { width: 10, height: 10, borderRadius: 5 },
  cardRowLabel: { fontSize: 14, fontWeight: '600' },
  cardRowSub: { fontSize: 12, marginTop: 2 },
  defaultBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  defaultBadgeText: { fontSize: 11, fontWeight: '600' },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 12,
  },
  addCardBtnText: { fontSize: 14, fontWeight: '600' },
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
  cardTypeLabel: { fontSize: 13, fontWeight: '600' },
  saveCardBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveCardBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  savedBadgeText: { fontSize: 14, fontWeight: '600' },
  promoChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  promoChipCode: { fontSize: 13, fontWeight: '700' },
  promoChipDesc: { fontSize: 11, flexShrink: 1 },
  promoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  promoApplyBtn: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoApplyBtnText: { fontSize: 14, fontWeight: '700' },
  promoMessage: { fontSize: 13, fontWeight: '500' },
  orderItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  orderItemName: { flex: 1, fontSize: 14, lineHeight: 20 },
  orderItemQty: { fontSize: 13, marginTop: 2 },
  orderItemPrice: { fontSize: 14, fontWeight: '600' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmText: { fontSize: 14, lineHeight: 20 },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginBottom: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14 },
  freeText: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginVertical: 2 },
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
  nextBtnText: { fontSize: 15, fontWeight: '700' },
});
