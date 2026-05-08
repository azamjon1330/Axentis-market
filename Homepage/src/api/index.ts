import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';
import { ENDPOINTS } from '../constants/Api';
import {
  User, Product, CartItem, Order, Category, Notification,
  Review, ReviewStats, PaymentCard, Ad, Discount, Company,
} from '../types';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('userToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Auth ────────────────────────────────────────────────────────────────────
export const loginUser = async (phone: string, password: string): Promise<{ user: User; token?: string }> => {
  const res = await api.post(ENDPOINTS.loginUser, { phone, password });
  return res.data;
};

export const registerUser = async (
  phone: string,
  name: string,
  surname: string,
  password: string,
): Promise<{ user: User; token?: string }> => {
  const res = await api.post(ENDPOINTS.registerUser, { phone, name, surname, password });
  return res.data;
};

// ─── Products ────────────────────────────────────────────────────────────────
export const getProducts = async (params: {
  companyId?: number;
  search?: string;
  category?: string;
  availableOnly?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<Product[]> => {
  const res = await api.get(ENDPOINTS.products, { params: { ...params, availableOnly: true } });
  // Backend returns plain array
  return Array.isArray(res.data) ? res.data : (res.data?.products || []);
};

export const getProductDetail = async (id: number): Promise<Product> => {
  const res = await api.get(ENDPOINTS.productDetail(id));
  return res.data;
};

export const getProductReviews = async (id: number): Promise<Review[]> => {
  const res = await api.get(ENDPOINTS.productReviews(id));
  return Array.isArray(res.data) ? res.data : (res.data?.reviews || []);
};

export const getProductReviewStats = async (id: number): Promise<ReviewStats> => {
  const res = await api.get(ENDPOINTS.productReviewStats(id));
  return res.data;
};

export const getSimilarProducts = async (id: number): Promise<Product[]> => {
  const res = await api.get(ENDPOINTS.productSimilar(id));
  return Array.isArray(res.data) ? res.data : (res.data?.products || []);
};

export const submitReview = async (data: {
  product_id: number;
  user_phone: string;
  user_name: string;
  rating: number;
  comment?: string;
}): Promise<Review> => {
  const res = await api.post(ENDPOINTS.reviews, data);
  return res.data;
};

export const voteReview = async (reviewId: number, phone: string, voteType: 'like' | 'dislike') => {
  const res = await api.post(ENDPOINTS.reviewVote(reviewId), { user_phone: phone, vote_type: voteType });
  return res.data;
};

// ─── Categories ──────────────────────────────────────────────────────────────
export const getCategories = async (): Promise<Category[]> => {
  const res = await api.get(ENDPOINTS.categories);
  return Array.isArray(res.data) ? res.data : (res.data?.categories || []);
};

export const getCategoryProducts = async (category: string, params: { limit?: number; offset?: number } = {}): Promise<Product[]> => {
  const res = await api.get(ENDPOINTS.categoryProducts, { params: { category, availableOnly: true, ...params } });
  return Array.isArray(res.data) ? res.data : (res.data?.products || []);
};

// ─── Cart ─────────────────────────────────────────────────────────────────────
export const getCart = async (phone: string): Promise<CartItem[]> => {
  const res = await api.get(ENDPOINTS.cart(phone));
  return Array.isArray(res.data) ? res.data : (res.data?.items || []);
};

export const getCartCount = async (phone: string): Promise<number> => {
  const res = await api.get(ENDPOINTS.cartCount(phone));
  return res.data?.count || 0;
};

export const addToCart = async (data: {
  user_phone: string;
  product_id: number;
  quantity?: number;
  selected_color?: string;
}): Promise<CartItem> => {
  const res = await api.post(ENDPOINTS.cartAdd, data);
  return res.data;
};

export const setCartItem = async (data: {
  user_phone: string;
  product_id: number;
  quantity: number;
  selected_color?: string;
}): Promise<void> => {
  await api.post(ENDPOINTS.cartSet, data);
};

export const removeCartItem = async (itemId: number): Promise<void> => {
  await api.delete(ENDPOINTS.cartDeleteItem(itemId));
};

export const clearCart = async (phone: string): Promise<void> => {
  await api.delete(ENDPOINTS.cartClear(phone));
};

// ─── Favorites ────────────────────────────────────────────────────────────────
export const getFavorites = async (phone: string): Promise<Product[]> => {
  const res = await api.get(ENDPOINTS.favorites(phone));
  return Array.isArray(res.data) ? res.data : (res.data?.products || res.data?.items || []);
};

export const getFavoritesCount = async (phone: string): Promise<number> => {
  const res = await api.get(ENDPOINTS.favoritesCount(phone));
  return res.data?.count || 0;
};

export const toggleFavorite = async (phone: string, productId: number): Promise<{ added: boolean }> => {
  const res = await api.post(ENDPOINTS.favoritesToggle, { user_phone: phone, product_id: productId });
  return res.data;
};

export const checkFavorite = async (phone: string, productId: number): Promise<boolean> => {
  const res = await api.get(ENDPOINTS.favoritesCheck, { params: { phone, product_id: productId } });
  return res.data?.is_favorite || false;
};

// ─── Orders ──────────────────────────────────────────────────────────────────
export const createOrder = async (data: {
  company_id: number;
  customer_name: string;
  customer_phone: string;
  items: { product_id: number; quantity: number; price: number }[];
  total_amount: number;
  delivery_type: 'pickup' | 'delivery';
  delivery_address?: string;
  delivery_cost?: number;
  payment_method: 'cash' | 'card';
  card_subtype?: string;
  recipient_name?: string;
  comment?: string;
}): Promise<Order> => {
  const res = await api.post(ENDPOINTS.orders, data);
  return res.data;
};

export const getUserOrders = async (phone: string, status?: string): Promise<Order[]> => {
  const res = await api.get(ENDPOINTS.orders, { params: { customer_phone: phone, status } });
  return Array.isArray(res.data) ? res.data : (res.data?.orders || []);
};

export const getOrderDetail = async (id: number): Promise<Order> => {
  const res = await api.get(ENDPOINTS.orderDetail(id));
  return res.data;
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = async (phone: string): Promise<Notification[]> => {
  const res = await api.get(ENDPOINTS.notifications, { params: { userPhone: phone } });
  return Array.isArray(res.data) ? res.data : (res.data?.notifications || []);
};

export const getUnreadCount = async (phone: string): Promise<number> => {
  const res = await api.get(ENDPOINTS.notificationsUnread, { params: { userPhone: phone } });
  return res.data?.count || 0;
};

export const markNotificationRead = async (id: number): Promise<void> => {
  await api.put(ENDPOINTS.notificationRead(id));
};

export const markAllNotificationsRead = async (phone: string): Promise<void> => {
  await api.put(ENDPOINTS.notificationsMarkAll, { user_phone: phone });
};

export const savePushToken = async (phone: string, token: string): Promise<void> => {
  await api.post(ENDPOINTS.pushToken, { user_phone: phone, expo_push_token: token });
};

// ─── Ads ──────────────────────────────────────────────────────────────────────
export const getAds = async (): Promise<Ad[]> => {
  const res = await api.get(ENDPOINTS.ads);
  return Array.isArray(res.data) ? res.data : (res.data?.ads || []);
};

// ─── Discounts ────────────────────────────────────────────────────────────────
export const getApprovedDiscounts = async (): Promise<Discount[]> => {
  const res = await api.get(ENDPOINTS.approvedDiscounts);
  return Array.isArray(res.data) ? res.data : (res.data?.discounts || []);
};

export const getAggressiveDiscounts = async (): Promise<Discount[]> => {
  const res = await api.get(ENDPOINTS.approvedAggressiveDiscounts);
  return Array.isArray(res.data) ? res.data : (res.data?.discounts || []);
};

// ─── Companies ────────────────────────────────────────────────────────────────
export const getCompanies = async (params: { approved?: boolean; search?: string; limit?: number } = {}): Promise<Company[]> => {
  const res = await api.get(ENDPOINTS.companies, { params: { approved: true, ...params } });
  return Array.isArray(res.data) ? res.data : (res.data?.companies || []);
};

export const getCompanyDetail = async (id: number): Promise<Company> => {
  const res = await api.get(ENDPOINTS.companyDetail(id));
  return res.data;
};

// ─── User Profile ─────────────────────────────────────────────────────────────
export const getUserProfile = async (phone: string): Promise<User> => {
  const res = await api.get(ENDPOINTS.userProfile(phone));
  return res.data;
};

// ─── Payment Cards ────────────────────────────────────────────────────────────
export const getPaymentCards = async (phone: string): Promise<PaymentCard[]> => {
  const res = await api.get(ENDPOINTS.paymentCards(phone));
  return Array.isArray(res.data) ? res.data : (res.data?.cards || []);
};

export default api;
