// ─── AXENTIS MARKET — BACKEND CONFIG ─────────────────────────────────────────
// Chtoby izmenit' adres servera — izmeni tol'ko etu stroku:
const VPS_IP = '109.123.253.238';
const BACKEND_PORT = '3000';

// ─── API ─────────────────────────────────────────────────────────────────────
export const API_BASE_URL = `http://${VPS_IP}:${BACKEND_PORT}/api`;
export const UPLOADS_BASE_URL = `http://${VPS_IP}:${BACKEND_PORT}/uploads`;
export const SOCKET_URL = `http://${VPS_IP}:${BACKEND_PORT}`;

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
