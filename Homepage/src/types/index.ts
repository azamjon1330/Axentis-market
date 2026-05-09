// API returns camelCase fields — types match exactly what backend sends

export interface User {
  id: number;
  phone: string;
  name: string;
  surname?: string;
  avatarUrl?: string;
  mode?: 'public' | 'private';
  privateCompanyId?: number;
  defaultDeliveryAddress?: string;
  defaultDeliveryCoordinates?: string;
  defaultRecipientName?: string;
  expoPushToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: number;
  name: string;
  phone: string;
  mode: 'public' | 'private';
  status: 'pending' | 'approved' | 'rejected' | 'blocked';
  logoUrl?: string;
  address?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: number;
  companyId: number;
  companyName?: string;
  name: string;
  quantity: number;
  price: number;
  markupPercent: number;
  sellingPrice: number;
  markupAmount: number;
  barcode?: string;
  barid?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  description?: string;
  images: string[];
  hasColorOptions: boolean;
  availableForCustomers: boolean;
  soldCount: number;
  createdAt?: string;
  updatedAt?: string;
  company?: Company;
  // Discount fields (added by backend when discount is applied)
  discountPercent?: number;
  discountedPrice?: number;
  isAggressive?: boolean;
}

export interface CartItem {
  id: number;
  userPhone: string;
  productId: number;
  quantity: number;
  selected_color?: string;
  selected_size?: string;
  product: Product;
}

export interface OrderItem {
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}

export interface Order {
  id: number;
  companyId: number;
  customerName: string;
  customerPhone: string;
  address?: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  comment?: string;
  orderCode: string;
  deliveryCost?: number;
  deliveryType?: 'pickup' | 'delivery';
  recipientName?: string;
  deliveryAddress?: string;
  paymentMethod?: 'cash' | 'card';
  cardSubtype?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  name: string;
  icon?: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Notification {
  id: number;
  userPhone: string;
  type: string;
  title: string;
  message: string;
  companyId?: number;
  productId?: number;
  isRead: boolean;
  createdAt: string;
}

export interface Review {
  id: number;
  productId: number;
  userPhone: string;
  userName: string;
  rating: number;
  comment?: string;
  likes: number;
  dislikes: number;
  createdAt: string;
  userVote?: 'like' | 'dislike' | null;
}

export interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: { [key: string]: number };
}

export interface PaymentCard {
  id: number;
  userPhone: string;
  cardNumberLast4: string;
  cardExpiry: string;
  cardHolderFirstName: string;
  cardHolderLastName: string;
  cardType: 'uzcard' | 'humo' | 'visa' | 'mastercard';
  isDefault: boolean;
}

export interface Ad {
  id: number;
  title: string;
  content?: string;
  caption?: string;
  imageUrl?: string;
  linkUrl?: string;
  companyId?: number;
  productId?: number;
  adType: 'company' | 'product';
  status: string;
}

export interface Discount {
  id: number;
  companyId: number;
  productId: number;
  discountPercent: number;
  title?: string;
  description?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  product?: Product;
}

// Navigation param types
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  ProductDetail: { productId: number };
  CategoryProducts: { category: string; categoryName: string };
  OrderDetail: { orderId: number };
  Checkout: undefined;
  OrderConfirmed: { orderId: number; orderCode: string };
  Search: undefined;
  AllOrders: undefined;
  Notifications: undefined;
  AddressSelect: undefined;
  PaymentCards: undefined;
  CompanyStore: { companyId: number };
  CompanyDetail: { companyId: number };
};

export type MainTabParamList = {
  Home: undefined;
  Catalog: undefined;
  Cart: undefined;
  Favorites: undefined;
  Profile: undefined;
};
