import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';
import { ENDPOINTS } from '../constants/Api';

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

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const loginUser = async (phone, password) => {
  const res = await api.post(ENDPOINTS.loginUser, { phone, password });
  return res.data;
};

export const registerUser = async (phone, name, surname, password) => {
  const res = await api.post(ENDPOINTS.registerUser, { phone, name, surname, password });
  return res.data;
};

// ─── Products ─────────────────────────────────────────────────────────────────
export const getProducts = async (params = {}) => {
  const res = await api.get(ENDPOINTS.products, { params: { ...params, availableOnly: true } });
  return Array.isArray(res.data) ? res.data : (res.data?.products || []);
};

export const getProductDetail = async (id) => {
  const res = await api.get(ENDPOINTS.productDetail(id));
  return res.data;
};

const mapReview = (r) => ({
  id: r.id,
  productId: r.productId ?? r.product_id,
  userPhone: r.userPhone ?? r.user_phone,
  userName: r.userName ?? r.user_name,
  userAvatarUrl: r.userAvatarUrl ?? r.user_avatar_url ?? null,
  rating: r.rating,
  comment: r.comment,
  likes: r.likes ?? 0,
  dislikes: r.dislikes ?? 0,
  createdAt: r.createdAt ?? r.created_at,
  userVote: r.user_vote ?? null,
});

export const getProductReviews = async (id, userPhone) => {
  const res = await api.get(ENDPOINTS.productReviews(id), { params: userPhone ? { user_phone: userPhone } : undefined });
  const raw = Array.isArray(res.data) ? res.data : (res.data?.reviews || []);
  return raw.map(mapReview);
};

export const getProductReviewStats = async (id) => {
  const res = await api.get(ENDPOINTS.productReviewStats(id));
  return res.data;
};

export const getProductVariants = async (id) => {
  const res = await api.get(ENDPOINTS.productVariants(id));
  return Array.isArray(res.data) ? res.data : [];
};

export const getSimilarProducts = async (id) => {
  const res = await api.get(ENDPOINTS.productSimilar(id));
  return Array.isArray(res.data) ? res.data : (res.data?.products || []);
};

export const submitReview = async (data) => {
  const res = await api.post(ENDPOINTS.reviews, data);
  return mapReview(res.data);
};

export const voteReview = async (reviewId, phone, voteType) => {
  const res = await api.post(ENDPOINTS.reviewVote(reviewId), { user_phone: phone, vote_type: voteType });
  return res.data;
};

// ─── Categories ───────────────────────────────────────────────────────────────
export const getCategories = async () => {
  const res = await api.get(ENDPOINTS.categories);
  return Array.isArray(res.data) ? res.data : (res.data?.categories || []);
};

export const getCategoryProducts = async (category, params = {}) => {
  const res = await api.get(ENDPOINTS.categoryProducts, { params: { category, availableOnly: true, ...params } });
  return Array.isArray(res.data) ? res.data : (res.data?.products || []);
};

// ─── Cart ─────────────────────────────────────────────────────────────────────
const mapCartItem = (item) => {
  const productId = item.productId ?? item.product_id ?? 0;
  const product = item.product ?? {
    id: productId,
    companyId: item.companyId ?? item.company_id ?? 0,
    name: item.product_name ?? item.productName ?? '',
    price: item.product_price ?? item.productPrice ?? 0,
    sellingPrice: item.product_price ?? item.sellingPrice ?? item.product_price ?? 0,
    markupPercent: 0,
    markupAmount: 0,
    quantity: 0,
    hasColorOptions: false,
    availableForCustomers: true,
    soldCount: 0,
    images: item.product_images ?? item.productImages ?? [],
    createdAt: '',
    updatedAt: '',
  };
  return {
    id: item.id,
    userPhone: item.userPhone ?? item.user_phone ?? '',
    productId,
    quantity: item.quantity,
    selected_color: item.selected_color ?? item.selectedColor ?? undefined,
    selected_size: item.selected_size ?? item.selectedSize ?? undefined,
    stockQuantity: item.stock_quantity ?? item.stockQuantity ?? undefined,
    product,
  };
};

export const getCart = async (phone) => {
  const res = await api.get(ENDPOINTS.cart(phone));
  const raw = Array.isArray(res.data) ? res.data : (res.data?.items || []);
  return raw.map(mapCartItem);
};

export const getCartCount = async (phone) => {
  const res = await api.get(ENDPOINTS.cartCount(phone));
  return res.data?.count || 0;
};

export const addToCart = async (data) => {
  const res = await api.post(ENDPOINTS.cartAdd, data);
  return res.data;
};

export const setCartItem = async (data) => {
  await api.post(ENDPOINTS.cartSet, data);
};

export const removeCartItem = async (itemId) => {
  await api.delete(ENDPOINTS.cartDeleteItem(itemId));
};

export const clearCart = async (phone) => {
  await api.delete(ENDPOINTS.cartClear(phone));
};

// ─── Favorites ────────────────────────────────────────────────────────────────
export const getFavorites = async (phone) => {
  const res = await api.get(ENDPOINTS.favorites(phone));
  return Array.isArray(res.data) ? res.data : (res.data?.products || res.data?.items || []);
};

export const getFavoritesCount = async (phone) => {
  const res = await api.get(ENDPOINTS.favoritesCount(phone));
  return res.data?.count || 0;
};

export const toggleFavorite = async (phone, productId) => {
  const res = await api.post(ENDPOINTS.favoritesToggle, { user_phone: phone, product_id: productId });
  return { added: res.data?.is_favorite ?? res.data?.added ?? false };
};

export const checkFavorite = async (phone, productId) => {
  const res = await api.get(ENDPOINTS.favoritesCheck, { params: { phone, product_id: productId } });
  return res.data?.is_favorite || false;
};

// ─── Orders ───────────────────────────────────────────────────────────────────
export const createOrder = async (data) => {
  const res = await api.post(ENDPOINTS.orders, data);
  return res.data;
};

const mapOrder = (o) => ({
  id: o.id,
  companyId: o.companyId ?? o.company_id ?? 0,
  customerName: o.customerName ?? o.customer_name ?? '',
  customerPhone: o.customerPhone ?? o.customer_phone ?? '',
  address: o.address,
  items: Array.isArray(o.items) ? o.items.map((i) => ({
    productId: i.productId ?? i.product_id ?? 0,
    productName: i.productName ?? i.product_name ?? i.name ?? 'Товар',
    quantity: i.quantity ?? 1,
    price: i.price ?? 0,
    imageUrl: i.imageUrl ?? i.image_url,
  })) : [],
  totalAmount: o.totalAmount ?? o.total_amount ?? 0,
  status: o.status ?? 'pending',
  comment: o.comment,
  orderCode: o.orderCode ?? o.order_code ?? '',
  deliveryCost: o.deliveryCost ?? o.delivery_cost,
  deliveryType: o.deliveryType ?? o.delivery_type,
  recipientName: o.recipientName ?? o.recipient_name,
  deliveryAddress: o.deliveryAddress ?? o.delivery_address,
  paymentMethod: o.paymentMethod ?? o.payment_method,
  cardSubtype: o.cardSubtype ?? o.card_subtype,
  createdAt: o.createdAt ?? o.created_at ?? '',
  updatedAt: o.updatedAt ?? o.updated_at ?? o.createdAt ?? o.created_at ?? '',
});

export const getUserOrders = async (phone, status) => {
  const res = await api.get(ENDPOINTS.orders, { params: { customer_phone: phone, status } });
  const raw = Array.isArray(res.data) ? res.data : (res.data?.orders || []);
  return raw.map(mapOrder);
};

export const getOrderDetail = async (id) => {
  const res = await api.get(ENDPOINTS.orderDetail(id));
  return mapOrder(res.data);
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = async (phone) => {
  const res = await api.get(ENDPOINTS.notifications, { params: { userPhone: phone } });
  return Array.isArray(res.data) ? res.data : (res.data?.notifications || []);
};

export const getUnreadCount = async (phone) => {
  const res = await api.get(ENDPOINTS.notificationsUnread, { params: { userPhone: phone } });
  return res.data?.count || 0;
};

export const markNotificationRead = async (id) => {
  await api.put(ENDPOINTS.notificationRead(id));
};

export const markAllNotificationsRead = async (phone) => {
  await api.put(ENDPOINTS.notificationsMarkAll, { user_phone: phone });
};

export const savePushToken = async (phone, token) => {
  await api.post(ENDPOINTS.pushToken, { user_phone: phone, expo_push_token: token });
};

// ─── Ads ──────────────────────────────────────────────────────────────────────
export const getAds = async () => {
  const res = await api.get(ENDPOINTS.ads);
  return Array.isArray(res.data) ? res.data : (res.data?.ads || []);
};

// ─── Discounts ────────────────────────────────────────────────────────────────
export const getApprovedDiscounts = async () => {
  const res = await api.get(ENDPOINTS.approvedDiscounts);
  return Array.isArray(res.data) ? res.data : (res.data?.discounts || []);
};

export const getAggressiveDiscounts = async () => {
  const res = await api.get(ENDPOINTS.approvedAggressiveDiscounts);
  return Array.isArray(res.data) ? res.data : (res.data?.discounts || []);
};

// ─── Companies ────────────────────────────────────────────────────────────────
export const getCompanies = async (params = {}) => {
  const res = await api.get(ENDPOINTS.companies, { params: { approved: true, ...params } });
  return Array.isArray(res.data) ? res.data : (res.data?.companies || []);
};

export const getCompanyDetail = async (id) => {
  const res = await api.get(ENDPOINTS.companyDetail(id));
  return res.data;
};

export const getCompanyStats = async (id) => {
  const res = await api.get(ENDPOINTS.companyStats(id));
  return res.data;
};

export const subscribeToCompany = async (companyId, userPhone) => {
  await api.post(ENDPOINTS.companySubscribe(companyId), { user_phone: userPhone });
};

export const unsubscribeFromCompany = async (companyId, userPhone) => {
  await api.post(ENDPOINTS.companyUnsubscribe(companyId), { user_phone: userPhone });
};

// ─── User Profile ─────────────────────────────────────────────────────────────
export const getUserProfile = async (phone) => {
  const res = await api.get(ENDPOINTS.userProfile(phone));
  return res.data;
};

// ─── Payment Cards ────────────────────────────────────────────────────────────
export const getPaymentCards = async (phone) => {
  const res = await api.get(ENDPOINTS.paymentCards(phone));
  return Array.isArray(res.data) ? res.data : (res.data?.cards || []);
};

export const addPaymentCard = async (data) => {
  const res = await api.post(ENDPOINTS.paymentCardsAdd, data);
  return res.data;
};

export const deletePaymentCard = async (id) => {
  await api.delete(ENDPOINTS.paymentCardDelete(id));
};

export const setDefaultCard = async (id) => {
  await api.put(ENDPOINTS.paymentCardDefault(id));
};

// ─── Delivery Addresses ────────────────────────────────────────────────────────
export const getUserAddresses = async (phone) => {
  const res = await api.get(ENDPOINTS.userAddresses(phone));
  return Array.isArray(res.data) ? res.data : [];
};

export const addUserAddress = async (phone, data) => {
  const res = await api.post(ENDPOINTS.userAddresses(phone), data);
  return res.data;
};

export const updateUserAddress = async (phone, id, data) => {
  const res = await api.put(ENDPOINTS.userAddressDetail(phone, id), data);
  return res.data;
};

export const deleteUserAddress = async (phone, id) => {
  await api.delete(ENDPOINTS.userAddressDetail(phone, id));
};

export const setDefaultAddress = async (phone, id) => {
  const res = await api.put(ENDPOINTS.userAddressDefault(phone, id));
  return res.data;
};

export default api;
