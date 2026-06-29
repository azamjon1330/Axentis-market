import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { resolveRegion } from '../utils/region';

// Контекст геолокации покупателя.
//
// При каждом запуске приложения мы спрашиваем разрешение на геолокацию. Если
// пользователь отказал — статус становится 'denied', и при следующем заходе
// запрос повторится (приложение перезапускает провайдер). После согласия мы
// определяем регион (область) покупателя и сохраняем его, чтобы каталог
// показывал только товары компаний, обслуживающих этот регион.

const LocationContext = createContext({
  region: null,
  status: 'idle', // idle | requesting | granted | denied | unavailable
  requestLocation: async () => {},
});

export function LocationProvider({ children }) {
  const [region, setRegion] = useState(null);
  const [status, setStatus] = useState('idle');
  const inFlight = useRef(false);

  const requestLocation = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus('requesting');
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('denied');
        setRegion(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      let resolved = null;
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (Array.isArray(places) && places.length > 0) {
          resolved = resolveRegion(places[0]);
        }
      } catch {
        // обратное геокодирование недоступно — оставляем регион пустым
      }
      setRegion(resolved);
      setStatus('granted');
    } catch {
      setStatus('unavailable');
      setRegion(null);
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Запрашиваем геолокацию один раз при запуске приложения.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return (
    <LocationContext.Provider value={{ region, status, requestLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationRegion() {
  return useContext(LocationContext);
}
