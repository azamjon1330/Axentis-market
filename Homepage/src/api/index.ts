import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';
import { ENDPOINTS } from '../constants/Api';
import {
  User, Product, ProductVariant, CartItem, Order, Category, Notification,
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
  mode?: 'public' | 'private';
  privateCompanyId?: number;
} = {}): Promise<Product[]> => {
  const res = await api.get(ENDPOINTS.products, { params: { ...params, availableOnly: true } });
  // Backend returns plain array
  return Array.isArray(res.data) ? res.data : (res.data?.products || []);
};

export const getProductDetail = async (id: number): Promise<Product> => {
  const res = await api.get(ENDPOINTS.productDetail(id));
  return res.data;
};

const mapReview = (r: any): Review => ({
  id: r.id,
  productId: r.productId ?? r.product_id,
  userPhone: r.userPhone ?? r.user_phone,
  userName: r.userName ?? r.user_name,
  rating: r.rating,
  comment: r.comment,
  likes: r.likes ?? 0,
  dislikes: r.dislikes ?? 0,
  createdAt: r.createdAt ?? r.created_at,
  userVote: r.user_vote ?? null,
});

export const getProductReviews = async (id: number, userPhone?: string): Promise<Review[]> => {
  const res = await api.get(ENDPOINTS.productReviews(id), { params: userPhone ? { user_phone: userPhone } : undefined });
  const raw = Array.isArray(res.data) ? res.data : (res.data?.reviews || []);
  return raw.map(mapReview);
};

export const getProductReviewStats = async (id: number): Promise<ReviewStats> => {
  const res = await api.get(ENDPOINTS.productReviewStats(id));
  return {
    averageRating: res.data.average_rating ?? res.data.averageRating ?? 0,
    totalReviews: res.data.count ?? res.data.totalReviews ?? 0,
  };
};

export const getProductVariants = async (id: number): Promise<ProductVariant[]> => {
  const res = await api.get(ENDPOINTS.productVariants(id));
  return Array.isArray(res.data) ? res.data : [];
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
  return mapReview(res.data);
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
const mapCartItem = (item: any): CartItem => {
  const productId = item.productId ?? item.product_id ?? 0;
  // base_price = purchase/cost price; product_price = selling price (with markup)
  const basePrice = item.product_base_price ?? item.product_price ?? item.productPrice ?? 0;
  const sellingPrice = item.product_price ?? item.productPrice ?? basePrice;
  const product: any = item.product ?? {
    id: productId,
    companyId: item.companyId ?? item.company_id ?? 0,
    name: item.product_name ?? item.productName ?? '',
    price: basePrice,
    sellingPrice: sellingPrice,
    markupPercent: item.markup_percent ?? 0,
    markupAmount: sellingPrice - basePrice,
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
    product,
  };
};

export const getCart = async (phone: string): Promise<CartItem[]> => {
  const res = await api.get(ENDPOINTS.cart(phone));
  const raw = Array.isArray(res.data) ? res.data : (res.data?.items || []);
  return raw.map(mapCartItem);
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
  selected_size?: string;
}): Promise<CartItem> => {
  const res = await api.post(ENDPOINTS.cartAdd, data);
  return res.data;
};

export const setCartItem = async (data: {
  user_phone: string;
  product_id: number;
  quantity: number;
  selected_color?: string;
  selected_size?: string;
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
  return { added: res.data?.is_favorite ?? res.data?.added ?? false };
};

export const checkFavorite = async (phone: string, productId: number): Promise<boolean> => {
  const res = await api.get(ENDPOINTS.favoritesCheck, { params: { phone, product_id: productId } });
  return res.data?.is_favorite || false;
};

// ─── Orders ──────────────────────────────────────────────────────────────────
export const createOrder = async (data: {
  companyId?: number;
  customerName: string;
  customerPhone: string;
  items: { productId: number; productName?: string; quantity: number; price: number; price_with_markup?: number; imageUrl?: string }[];
  totalAmount: number;
  deliveryType: 'pickup' | 'delivery';
  deliveryAddress?: string;
  deliveryCoordinates?: string;
  deliveryCost?: number;
  paymentMethod: 'cash' | 'card';
  cardSubtype?: string;
  recipientName?: string;
  comment?: string;
}): Promise<{ id: number; orderCode: string; createdAt: string }> => {
  const res = await api.post(ENDPOINTS.orders, data);
  return res.data;
};

const mapOrder = (o: any): Order => ({
  id: o.id,
  companyId: o.companyId ?? o.company_id ?? 0,
  customerName: o.customerName ?? o.customer_name ?? '',
  customerPhone: o.customerPhone ?? o.customer_phone ?? '',
  address: o.address,
  items: Array.isArray(o.items) ? o.items.map((i: any) => ({
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

export const getUserOrders = async (phone: string, status?: string): Promise<Order[]> => {
  const res = await api.get(ENDPOINTS.orders, { params: { customer_phone: phone, status } });
  const raw = Array.isArray(res.data) ? res.data : (res.data?.orders || []);
  return raw.map(mapOrder);
};

export const getOrderDetail = async (id: number): Promise<Order> => {
  const res = await api.get(ENDPOINTS.orderDetail(id));
  return mapOrder(res.data);
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

export const getApprovedAds = async (): Promise<Ad[]> => {
  const res = await api.get(ENDPOINTS.ads, { params: { status: 'approved' } });
  const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.ads || []);
  return raw.map((ad) => ({
    id: ad.id,
    title: ad.title,
    content: ad.content,
    caption: ad.caption,
    imageUrl: ad.image_url || ad.imageUrl,
    linkUrl: ad.link_url || ad.linkUrl,
    companyId: ad.company_id || ad.companyId,
    productId: ad.product_id || ad.productId,
    adType: ad.ad_type || ad.adType,
    status: ad.status,
  }));
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
  const data = res.data || {};
  // Backend may return either camelCase (logoUrl) or snake_case (logo_url) — normalize.
  return { ...data, logoUrl: data.logoUrl ?? data.logo_url } as Company;
};

export const getCompanyStats = async (id: number): Promise<{
  subscribers: number;
  total_products: number;
  total_sales: number;
  views: number;
}> => {
  const res = await api.get(ENDPOINTS.companyStats(id));
  return res.data;
};

// ─── Company Subscribe ────────────────────────────────────────────────────────
export const subscribeToCompany = async (companyId: number, userPhone: string): Promise<void> => {
  await api.post(ENDPOINTS.companySubscribe(companyId), { user_phone: userPhone });
};

export const unsubscribeFromCompany = async (companyId: number, userPhone: string): Promise<void> => {
  await api.post(ENDPOINTS.companyUnsubscribe(companyId), { user_phone: userPhone });
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

export const addPaymentCard = async (data: {
  userPhone: string;
  cardNumber: string;
  cardExpiry: string;
  cardHolderFirstName: string;
  cardHolderLastName: string;
  cardType: 'uzcard' | 'humo' | 'visa' | 'mastercard';
}): Promise<PaymentCard> => {
  const res = await api.post(ENDPOINTS.paymentCardsAdd, data);
  return res.data;
};

export const deletePaymentCard = async (id: number): Promise<void> => {
  await api.delete(ENDPOINTS.paymentCardDelete(id));
};

export const setDefaultCard = async (id: number): Promise<void> => {
  await api.put(ENDPOINTS.paymentCardDefault(id));
};

export default api;
