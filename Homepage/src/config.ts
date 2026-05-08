// ─── AXENTIS MARKET — BACKEND CONFIG ─────────────────────────────────────────
// Chtoby izmenit' adres servera — izmeni tol'ko etu stroku:
const DOMAIN = 'axentis.uz';

// ─── API ─────────────────────────────────────────────────────────────────────
export const API_BASE_URL = `https://${DOMAIN}/api`;
export const UPLOADS_BASE_URL = `https://${DOMAIN}/uploads`;
export const SOCKET_URL = `https://${DOMAIN}`;

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
