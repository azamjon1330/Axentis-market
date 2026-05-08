import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getPaymentCards, addPaymentCard, deletePaymentCard, setDefaultCard } from '../../api';
import { PaymentCard } from '../../types';

const CARD_TYPES = [
  { id: 'uzcard', label: 'UzCard', color: '#1BA874' },
  { id: 'humo', label: 'Humo', color: '#FF6B00' },
  { id: 'visa', label: 'Visa', color: '#1A1F71' },
  { id: 'mastercard', label: 'Mastercard', color: '#EB001B' },
] as const;

export default function PaymentCardsScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();

  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [cardType, setCardType] = useState<'uzcard' | 'humo' | 'visa' | 'mastercard'>('uzcard');
  const [last4, setLast4] = useState('');
  const [expiry, setExpiry] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getPaymentCards(user.phone);
      setCards(data);
    } catch {
      setCards([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setCardType('uzcard');
    setLast4('');
    setExpiry('');
    setFirstName('');
    setLastName('');
  };

  const handleSave = async () => {
    if (!user) return;
    if (last4.length !== 4 || !/^\d{4}$/.test(last4)) {
      Alert.alert('Ошибка', 'Введите последние 4 цифры номера карты');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      Alert.alert('Ошибка', 'Введите срок в формате ММ/ГГ');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Ошибка', 'Введите имя и фамилию держателя карты');
      return;
    }
    setSaving(true);
    try {
      const card = await addPaymentCard({
        userPhone: user.phone,
        cardNumberLast4: last4,
        cardExpiry: expiry,
        cardHolderFirstName: firstName.trim(),
        cardHolderLastName: lastName.trim(),
        cardType,
      });
      setCards(prev => [...prev, card]);
      setShowForm(false);
      resetForm();
    } catch {
      Alert.alert('Ошибка', 'Не удалось добавить карту');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (card: PaymentCard) => {
    Alert.alert('Удалить карту', `Удалить карту **** ${card.cardNumberLast4}?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePaymentCard(card.id);
            setCards(prev => prev.filter(c => c.id !== card.id));
          } catch {
            Alert.alert('Ошибка', 'Не удалось удалить карту');
          }
        },
      },
    ]);
  };

  const handleSetDefault = async (card: PaymentCard) => {
    if (card.isDefault) return;
    try {
      await setDefaultCard(card.id);
      setCards(prev => prev.map(c => ({ ...c, isDefault: c.id === card.id })));
    } catch {
      Alert.alert('Ошибка', 'Не удалось установить карту по умолчанию');
    }
  };

  const handleExpiryChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 2) {
      setExpiry(cleaned);
    } else {
      setExpiry(`${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
    }
  };

  const getCardColor = (type: string) => CARD_TYPES.find(c => c.id === type)?.color || colors.primary;

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
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Способы оплаты</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="card-outline" size={52} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Нет добавленных карт</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.cardItem, { backgroundColor: getCardColor(item.cardType) }]}
            onPress={() => handleSetDefault(item)}
            activeOpacity={0.85}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTypeLabel}>
                {CARD_TYPES.find(c => c.id === item.cardType)?.label || item.cardType}
              </Text>
              {item.isDefault && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Основная</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardNumber}>**** **** **** {item.cardNumberLast4}</Text>
            <View style={styles.cardBottom}>
              <View>
                <Text style={styles.cardLabel}>Держатель</Text>
                <Text style={styles.cardValue}>
                  {item.cardHolderFirstName} {item.cardHolderLastName}
                </Text>
              </View>
              <View>
                <Text style={styles.cardLabel}>Срок</Text>
                <Text style={styles.cardValue}>{item.cardExpiry}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item)}
                style={styles.deleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowForm(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={22} color="#FFF" />
            <Text style={styles.addBtnText}>Добавить карту</Text>
          </TouchableOpacity>
        }
      />

      <Modal
        visible={showForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowForm(false); resetForm(); }}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Новая карта</Text>
            <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Тип карты</Text>
            <View style={styles.typeRow}>
              {CARD_TYPES.map((ct) => (
                <TouchableOpacity
                  key={ct.id}
                  style={[
                    styles.typeBtn,
                    { borderColor: cardType === ct.id ? ct.color : colors.border,
                      backgroundColor: cardType === ct.id ? ct.color + '20' : colors.surface },
                  ]}
                  onPress={() => setCardType(ct.id)}
                >
                  <Text style={[styles.typeBtnText, { color: cardType === ct.id ? ct.color : colors.textSecondary }]}>
                    {ct.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Последние 4 цифры</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="1234"
              placeholderTextColor={colors.textMuted}
              value={last4}
              onChangeText={(t) => setLast4(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Срок действия</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="ММ/ГГ"
              placeholderTextColor={colors.textMuted}
              value={expiry}
              onChangeText={handleExpiryChange}
              keyboardType="number-pad"
              maxLength={5}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Имя держателя</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Имя"
              placeholderTextColor={colors.textMuted}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Фамилия держателя</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Фамилия"
              placeholderTextColor={colors.textMuted}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 15 },
  cardItem: {
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTypeLabel: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  defaultBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  defaultBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  cardNumber: { color: '#FFF', fontSize: 18, fontWeight: '600', letterSpacing: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 2 },
  cardValue: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  deleteBtn: { padding: 4 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  addBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 24,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  form: { padding: 20, gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6, marginTop: 10 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  typeBtnText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
  },
  saveBtn: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
