import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getSavedAddresses, createSavedAddress, updateSavedAddress, deleteSavedAddress,
} from '../../api';

// Saved delivery addresses UI (Requirement 13).
//
// Reachable two ways:
//   1. From Profile ("Адреса доставки") — manage mode: list / create / edit / delete.
//   2. From Checkout (route param `selectMode: true`) — picking an address to apply
//      to the current order; tapping a row returns to Checkout with that address.
//
// Editing a location opens MapLocationPickerScreen (OpenStreetMap/Leaflet WebView)
// via `returnScreen: 'SavedAddresses'`; the picked coordinate comes back through
// `route.params.selectedCoords` / `selectedAddress`, along with the echoed form draft.

export default function SavedAddressesScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const selectMode = !!route.params?.selectMode;

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editor state. editingId === null means "create new".
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [label, setLabel] = useState('');
  const [addressText, setAddressText] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [coords, setCoords] = useState(null);

  const loadAddresses = useCallback(async () => {
    if (!user?.phone) return;
    try {
      const list = await getSavedAddresses(user.phone);
      setAddresses(list);
    } catch {
      // keep whatever was loaded
    } finally {
      setLoading(false);
    }
  }, [user?.phone]);

  useFocusEffect(
    useCallback(() => {
      loadAddresses();
    }, [loadAddresses])
  );

  // Restore the in-progress editor form when returning from the map picker.
  useEffect(() => {
    if (!route.params?.selectedCoords) return;
    setFormVisible(true);
    setEditingId(route.params.editId ?? null);
    setLabel(route.params.formLabel ?? '');
    setAddressText(route.params.selectedAddress ?? route.params.formAddressText ?? '');
    setRecipientName(route.params.formRecipientName ?? '');
    setIsDefault(route.params.formIsDefault ?? false);
    setCoords(route.params.selectedCoords);
    // Clear so the effect does not re-fire on re-render.
    navigation.setParams({ selectedCoords: undefined, selectedAddress: undefined });
  }, [route.params?.selectedCoords]);

  const resetForm = () => {
    setFormVisible(false);
    setEditingId(null);
    setLabel('');
    setAddressText('');
    setRecipientName('');
    setIsDefault(false);
    setCoords(null);
  };

  const openCreate = () => {
    resetForm();
    setRecipientName(user?.name || '');
    setFormVisible(true);
  };

  const openEdit = (addr) => {
    setEditingId(addr.id);
    setLabel(addr.label || '');
    setAddressText(addr.addressText || '');
    setRecipientName(addr.recipientName || '');
    setIsDefault(!!addr.isDefault);
    setCoords(
      addr.latitude != null && addr.longitude != null
        ? { lat: addr.latitude, lng: addr.longitude }
        : null
    );
    setFormVisible(true);
  };

  const openMapPicker = () => {
    navigation.navigate('MapLocationPicker', {
      returnScreen: 'SavedAddresses',
      initialCoords: coords ?? undefined,
      draft: {
        editId: editingId,
        formLabel: label,
        formAddressText: addressText,
        formRecipientName: recipientName,
        formIsDefault: isDefault,
        selectMode,
      },
    });
  };

  const handleSave = async () => {
    if (!user?.phone) return;
    if (!label.trim()) {
      Alert.alert('Ошибка', 'Укажите название адреса (например «Дом»)');
      return;
    }
    if (!addressText.trim()) {
      Alert.alert('Ошибка', 'Укажите адрес');
      return;
    }
    const payload = {
      label: label.trim(),
      addressText: addressText.trim(),
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      recipientName: recipientName.trim(),
      isDefault,
    };
    setSaving(true);
    try {
      if (editingId) {
        await updateSavedAddress(user.phone, editingId, payload);
      } else {
        await createSavedAddress(user.phone, payload);
      }
      resetForm();
      await loadAddresses();
    } catch (err) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось сохранить адрес');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addr) => {
    Alert.alert(
      'Удалить адрес?',
      `«${addr.label}» будет удалён из сохранённых.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavedAddress(user.phone, addr.id);
              setAddresses(prev => prev.filter(a => a.id !== addr.id));
            } catch {
              Alert.alert('Ошибка', 'Не удалось удалить адрес');
            }
          },
        },
      ]
    );
  };

  // In select mode, tapping a row applies the address to the order at Checkout.
  const handleSelect = (addr) => {
    navigation.navigate('Checkout', {
      selectedAddress: addr.addressText,
      selectedCoords:
        addr.latitude != null && addr.longitude != null
          ? { lat: addr.latitude, lng: addr.longitude }
          : undefined,
      selectedRecipient: addr.recipientName || undefined,
      selectedLabel: addr.label || undefined,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {selectMode ? 'Выберите адрес' : 'Адреса доставки'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {selectMode && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Нажмите на адрес, чтобы применить его к заказу.
          </Text>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : addresses.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              У вас пока нет сохранённых адресов
            </Text>
          </View>
        ) : (
          addresses.map(addr => (
            <TouchableOpacity
              key={addr.id}
              activeOpacity={selectMode ? 0.7 : 1}
              onPress={selectMode ? () => handleSelect(addr) : undefined}
              style={[styles.addressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.addrIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="location" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.labelRow}>
                  <Text style={[styles.addrLabel, { color: colors.text }]} numberOfLines={1}>
                    {addr.label}
                  </Text>
                  {addr.isDefault && (
                    <View style={[styles.defaultBadge, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.defaultBadgeText, { color: colors.primary }]}>По умолчанию</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.addrText, { color: colors.textSecondary }]} numberOfLines={2}>
                  {addr.addressText}
                </Text>
                {!!addr.recipientName && (
                  <Text style={[styles.addrRecipient, { color: colors.textMuted }]} numberOfLines={1}>
                    {addr.recipientName}
                  </Text>
                )}
              </View>
              {selectMode ? (
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              ) : (
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => openEdit(addr)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="create-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(addr)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={22} color={colors.error} />
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        {!formVisible && (
          <TouchableOpacity
            style={[styles.addBtn, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '08' }]}
            onPress={openCreate}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.addBtnText, { color: colors.primary }]}>Добавить адрес</Text>
          </TouchableOpacity>
        )}

        {formVisible && (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formTitle, { color: colors.text }]}>
              {editingId ? 'Редактировать адрес' : 'Новый адрес'}
            </Text>

            <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="pricetag-outline" size={18} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={label}
                onChangeText={setLabel}
                placeholder="Название (Дом, Работа…)"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={addressText}
                onChangeText={(text) => { setAddressText(text); }}
                placeholder="ул. Ленина, 10, кв. 25"
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <TouchableOpacity onPress={openMapPicker} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="map-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {coords && (
              <Text style={[styles.coordsText, { color: colors.textMuted }]}>
                <Ionicons name="navigate" size={12} color={colors.primary} />
                {`  ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}
              </Text>
            )}

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

            <View style={styles.defaultToggleRow}>
              <Text style={[styles.defaultToggleLabel, { color: colors.text }]}>Адрес по умолчанию</Text>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={resetForm}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={styles.saveBtnText}>Сохранить</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  scroll: { padding: 16, gap: 12 },
  hint: { fontSize: 13, marginBottom: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  addrIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addrLabel: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  defaultBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 10, fontWeight: '700' },
  addrText: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  addrRecipient: { fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 14,
  },
  addBtnText: { fontSize: 14, fontWeight: '600' },
  formCard: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  formTitle: { fontSize: 16, fontWeight: '700' },
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
  coordsText: { fontSize: 12, marginTop: -4, marginLeft: 4 },
  defaultToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  defaultToggleLabel: { fontSize: 14, fontWeight: '500' },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 2, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
