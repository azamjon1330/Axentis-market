import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useTheme } from '../../context/ThemeContext';

export default function MapLocationPickerScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();

  // The screen that opened the picker decides where the chosen coordinate is
  // returned. Checkout (default) and SavedAddresses both consume the same
  // `selectedCoords` / `selectedAddress` params. Any `draft` passed in is echoed
  // back so the caller can restore an in-progress form (e.g. the address editor).
  const returnScreen = route.params?.returnScreen || 'Checkout';
  const draft = route.params?.draft;

  const [locating, setLocating] = useState(false);

  const returnWith = (coords, address) => {
    navigation.navigate(returnScreen, {
      ...(draft || {}),
      selectedCoords: coords,
      selectedAddress: address,
    });
  };

  const handlePickLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Нет доступа', 'Разрешите доступ к геолокации в настройках устройства.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo.length > 0) {
          const g = geo[0];
          const parts = [g.street, g.streetNumber, g.district, g.subregion, g.city, g.region].filter(Boolean);
          if (parts.length > 0) address = parts.join(', ');
        }
      } catch {}
      returnWith({ lat: latitude, lng: longitude }, address);
    } catch {
      Alert.alert('Ошибка', 'Не удалось получить геолокацию.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Выберите адрес доставки</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.center}>
        <Ionicons name="location-outline" size={72} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>Определить местоположение</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Нажмите кнопку ниже, чтобы автоматически определить ваш адрес доставки
        </Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={handlePickLocation}
          disabled={locating}
          activeOpacity={0.85}
        >
          {locating
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.btnText}>Использовать моё местоположение</Text>
          }
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
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
    width: '100%',
  },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
