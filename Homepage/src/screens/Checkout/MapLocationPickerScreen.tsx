import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
  NativeModules, UIManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'MapLocationPicker'>;

// `react-native-webview` is a native module. On an OTA-updated build that does not
// yet bundle it, the import/native view is unavailable — so we load it defensively
// and fall back to the GPS-only flow. The full map activates after a native rebuild.
let WebViewComp: any = null;
try {
  WebViewComp = require('react-native-webview').WebView;
} catch {
  WebViewComp = null;
}

function isWebViewAvailable(): boolean {
  if (!WebViewComp) return false;
  try {
    const cfg = (UIManager as any).getViewManagerConfig?.('RNCWebView');
    return !!cfg || !!(NativeModules as any).RNCWebView;
  } catch {
    return false;
  }
}

// Default center: Tashkent.
const DEFAULT_LAT = 41.3111;
const DEFAULT_LNG = 69.2797;

const buildHtml = (lat: number, lng: number) => `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>html,body,#map{height:100%;margin:0;padding:0;background:#e8eaed;}</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${lat}, ${lng}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    var marker = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);

    function post(ll) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ lat: ll.lat, lng: ll.lng }));
      }
    }
    post(marker.getLatLng());
    map.on('click', function (e) { marker.setLatLng(e.latlng); post(e.latlng); });
    marker.on('dragend', function () { post(marker.getLatLng()); });

    // Called from the native side (injectJavaScript)
    window.setLocation = function (la, lo) {
      var ll = L.latLng(la, lo);
      marker.setLatLng(ll);
      map.setView(ll, 16);
      post(ll);
    };
  </script>
</body>
</html>`;

async function resolveAddress(lat: number, lng: number): Promise<string> {
  let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (geo.length > 0) {
      const g = geo[0];
      const parts = [g.street, g.streetNumber, g.district, g.subregion, g.city, g.region].filter(Boolean);
      if (parts.length > 0) address = parts.join(', ');
    }
  } catch {}
  return address;
}

export default function MapLocationPickerScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const webRef = useRef<any>(null);

  const mapAvailable = useMemo(isWebViewAvailable, []);

  const initial = route.params?.initialCoords;
  const startLat = initial?.lat ?? DEFAULT_LAT;
  const startLng = initial?.lng ?? DEFAULT_LNG;

  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: startLat, lng: startLng });
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const onMessage = useCallback((e: any) => {
    try {
      const d = JSON.parse(e.nativeEvent.data);
      if (typeof d.lat === 'number' && typeof d.lng === 'number') {
        setCoords({ lat: d.lat, lng: d.lng });
      }
    } catch {}
  }, []);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Нет доступа', 'Разрешите доступ к геолокации в настройках устройства.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      setCoords({ lat: latitude, lng: longitude });
      webRef.current?.injectJavaScript(`window.setLocation(${latitude}, ${longitude}); true;`);
    } catch {
      Alert.alert('Ошибка', 'Не удалось получить геолокацию.');
    } finally {
      setLocating(false);
    }
  };

  const confirm = async () => {
    setConfirming(true);
    const address = await resolveAddress(coords.lat, coords.lng);
    setConfirming(false);
    navigation.navigate('Checkout', {
      selectedCoords: { lat: coords.lat, lng: coords.lng },
      selectedAddress: address,
    });
  };

  // Fallback flow used when the WebView native module is unavailable (e.g. OTA
  // update onto a build that predates react-native-webview).
  const pickWithGps = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Нет доступа', 'Разрешите доступ к геолокации в настройках устройства.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      const address = await resolveAddress(latitude, longitude);
      navigation.navigate('Checkout', {
        selectedCoords: { lat: latitude, lng: longitude },
        selectedAddress: address,
      });
    } catch {
      Alert.alert('Ошибка', 'Не удалось получить геолокацию.');
    } finally {
      setLocating(false);
    }
  };

  const Header = (
    <View style={[styles.header, { backgroundColor: colors.background }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface }]}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>
        {mapAvailable ? 'Выберите на карте' : 'Адрес доставки'}
      </Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (!mapAvailable) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {Header}
        <View style={styles.center}>
          <Ionicons name="location-outline" size={72} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>Определить местоположение</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Нажмите кнопку ниже, чтобы определить ваш адрес доставки автоматически
          </Text>
          <TouchableOpacity
            style={[styles.fallbackBtn, { backgroundColor: colors.primary }]}
            onPress={pickWithGps}
            disabled={locating}
            activeOpacity={0.85}
          >
            {locating
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.confirmText}>Использовать моё местоположение</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {Header}

      {/* Map */}
      <View style={styles.mapWrap}>
        <WebViewComp
          ref={webRef}
          originWhitelist={['*']}
          source={{ html: buildHtml(startLat, startLng) }}
          onMessage={onMessage}
          style={styles.webview}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.loading, { backgroundColor: colors.background }]}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          )}
        />

        {/* Hint */}
        <View style={styles.hint}>
          <Text style={styles.hintText}>Нажмите на карту или перетащите маркер</Text>
        </View>

        {/* My location button */}
        <TouchableOpacity
          style={[styles.myLocBtn, { backgroundColor: colors.surface }]}
          onPress={useMyLocation}
          disabled={locating}
          activeOpacity={0.85}
        >
          {locating
            ? <ActivityIndicator color={colors.primary} />
            : <Ionicons name="locate" size={22} color={colors.primary} />}
        </TouchableOpacity>
      </View>

      {/* Bottom confirm bar */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View style={styles.coordsRow}>
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text style={[styles.coordsText, { color: colors.textSecondary }]} numberOfLines={1}>
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
          onPress={confirm}
          disabled={confirming}
          activeOpacity={0.85}
        >
          {confirming
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.confirmText}>Подтвердить адрес</Text>}
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
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  fallbackBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
    width: '100%',
  },
  mapWrap: { flex: 1, overflow: 'hidden' },
  webview: { flex: 1 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  hint: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  hintText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  myLocBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    gap: 12,
  },
  coordsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coordsText: { fontSize: 13, flex: 1 },
  confirmBtn: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
