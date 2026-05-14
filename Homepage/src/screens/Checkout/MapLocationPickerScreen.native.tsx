import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'MapLocationPicker'>;

const TASHKENT = {
  latitude: 41.2995,
  longitude: 69.2401,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export default function MapLocationPickerScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();

  const initialCoords = route.params?.initialCoords;
  const [region, setRegion] = useState({
    latitude: initialCoords?.lat ?? TASHKENT.latitude,
    longitude: initialCoords?.lng ?? TASHKENT.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [confirming, setConfirming] = useState(false);
  const [locating, setLocating] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    const { latitude, longitude } = region;
    let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo.length > 0) {
        const g = geo[0];
        const parts = [g.street, g.streetNumber, g.district, g.subregion, g.city, g.region].filter(Boolean);
        if (parts.length > 0) address = parts.join(', ');
      }
    } catch {}
    setConfirming(false);
    navigation.navigate('Checkout', {
      selectedCoords: { lat: latitude, lng: longitude },
      selectedAddress: address,
    });
  };

  const handleMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Нет доступа', 'Разрешите доступ к геолокации в настройках устройства.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setRegion(r => ({
        ...r,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      }));
    } catch {
      Alert.alert('Ошибка', 'Не удалось получить геолокацию.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Выберите адрес доставки</Text>
        <View style={{ width: 40 }} />
      </View>

      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
      />

      {/* Fixed center pin — tip at screen center */}
      <View style={styles.pinWrap} pointerEvents="none">
        <Ionicons name="location" size={44} color={colors.primary} />
        <View style={[styles.pinShadow, { backgroundColor: colors.primary + '35' }]} />
      </View>

      <TouchableOpacity
        style={[styles.locateBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={handleMyLocation}
        disabled={locating}
        activeOpacity={0.8}
      >
        {locating
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Ionicons name="locate-outline" size={22} color={colors.primary} />
        }
      </TouchableOpacity>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.coordsText, { color: colors.textSecondary }]} numberOfLines={1}>
          {region.latitude.toFixed(5)},  {region.longitude.toFixed(5)}
        </Text>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
          onPress={handleConfirm}
          disabled={confirming}
          activeOpacity={0.85}
        >
          {confirming
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.confirmBtnText}>Подтвердить место доставки</Text>
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
    zIndex: 10,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  pinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -22,
    marginTop: -44,
    alignItems: 'center',
    zIndex: 5,
  },
  pinShadow: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: -6,
  },
  locateBtn: {
    position: 'absolute',
    right: 16,
    bottom: 160,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 36,
    borderTopWidth: 1,
    gap: 10,
    zIndex: 10,
    elevation: 10,
  },
  coordsText: { fontSize: 13, textAlign: 'center' },
  confirmBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
