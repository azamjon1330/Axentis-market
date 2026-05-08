// ─── AXENTIS MARKET — BACKEND CONFIG ─────────────────────────────────────────
// Menyu izmenit': pomenay tol'ko etu stroku
const API_HOST = 'http://109.123.253.238';

// ─── API ─────────────────────────────────────────────────────────────────────
export const API_BASE_URL = `${API_HOST}/api`;
export const UPLOADS_BASE_URL = `${API_HOST}/uploads`;
export const SOCKET_URL = API_HOST;

// ─── APP ─────────────────────────────────────────────────────────────────────
export const APP_CONFIG = {
  name: 'Axentis Market',
  version: '1.0.0',
  defaultCity: 'Москва',
  deliveryCost: 30000,
  freeDeliveryFrom: 0,
  currency: '₽',
  supportPhone: '+74951234567',
  supportEmail: 'support@axentis.uz',
};
