/// <reference types="vite/client" />

// ============================================================================
// NEW API CLIENT - PostgreSQL Backend (Fastify + Socket.io)
// ============================================================================
// Заменяет все Supabase вызовы на новые API endpoints

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Преобразует путь к изображению в полный URL
 * Поддерживает как Docker/nginx режим (/api), так и локальную разработку (http://localhost:3000/api)
 */
export function getImageUrl(path: string | undefined | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  
  // Remove /api from the base URL to get the server root
  const baseUrl = API_BASE.replace('/api', '');
  
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // If baseUrl is empty (Docker/nginx mode), just return the normalized path
  if (!baseUrl) return normalizedPath;
  
  // For absolute URLs (local dev), combine baseUrl with path
  return `${baseUrl}${normalizedPath}`;
}

// ============================================================================
// Authentication Token Management
// ============================================================================

export function getAuthToken(): string | null {
  return localStorage.getItem('azaton_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('azaton_token', token);
}

export function removeAuthToken(): void {
  localStorage.removeItem('azaton_token');
}

// ============================================================================
// Base API Call Function
// ============================================================================

interface ApiOptions extends RequestInit {
  requiresAuth?: boolean;
}

async function apiCall(
  endpoint: string,
  options: ApiOptions = {}
): Promise<any> {
  const { requiresAuth = true, ...fetchOptions } = options;

  const headers: Record<string, string> = {};

  // Don't set Content-Type for FormData (browser will set it automatically with boundary)
  if (!(fetchOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Add auth token if required
  if (requiresAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const url = `${API_BASE}${endpoint}`;
    console.log(`🌐 [API] ${fetchOptions.method || 'GET'} ${url}`);
    
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    console.log(`✅ [API] Response: ${response.status} ${response.statusText}`);

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (!response.ok) {
      let errorMessage = response.statusText;

      if (isJson) {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } else {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }

      console.error(`❌ [API] Error ${response.status}:`, errorMessage);
      throw new Error(errorMessage);
    }

    return isJson ? response.json() : response.text();
  } catch (error) {
    console.error(`❌ [API] Fetch failed:`, error);
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(`Network error: Unable to connect to ${API_BASE}. Check if backend is running.`);
    }
    throw error;
  }
}

// ============================================================================
// AUTHENTICATION API
// ============================================================================

export const auth = {
  // User login (no SMS verification)
  loginUser: async (phone: string) => {
    const response = await apiCall('/auth/login/user', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      requiresAuth: false,
    });
    if (response.token) {
      setAuthToken(response.token);
    }
    return response;
  },

  // User registration
  registerUser: async (phone: string, name?: string) => {
    const response = await apiCall('/auth/register/user', {
      method: 'POST',
      body: JSON.stringify({ phone, name }),
      requiresAuth: false,
    });
    if (response.token) {
      setAuthToken(response.token);
    }
    return response;
  },

  // Company login
  loginCompany: async (phone: string, password: string, accessKey?: string, referralCode?: string) => {
    const response = await apiCall('/auth/login/company', {
      method: 'POST',
      body: JSON.stringify({ phone, password, accessKey, referralCode }),
      requiresAuth: false,
    });
    if (response.token) {
      setAuthToken(response.token);
    }
    return response;
  },

  // Company registration
  registerCompany: async (data: {
    name: string;
    phone: string;
    password: string;
    mode: 'public' | 'private';
    description?: string;
    accessKey?: string;
  }) => {
    const response = await apiCall('/auth/register/company', {
      method: 'POST',
      body: JSON.stringify(data),
      requiresAuth: false,
    });
    if (response.token) {
      setAuthToken(response.token);
    }
    return response;
  },

  // Admin login
  loginAdmin: async (phone: string, password: string) => {
    const response = await apiCall('/auth/login/admin', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      requiresAuth: false,
    });
    if (response.token) {
      setAuthToken(response.token);
    }
    return response;
  },

  // Get current user
  me: async () => {
    return apiCall('/auth/me');
  },

  // Logout
  logout: async () => {
    removeAuthToken();
    return { success: true };
  },
};

// ============================================================================
// PRODUCTS API
// ============================================================================

export const products = {
  // Get all products with filtering
  list: async (params?: {
    companyId?: string;
    search?: string;
    availableOnly?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/products?${query}`, { requiresAuth: false });
  },

  // Get product by ID
  get: async (id: string) => {
    return apiCall(`/products/${id}`, { requiresAuth: false });
  },

  // Create product (company only)
  create: async (data: {
    companyId: number;
    name: string;
    quantity?: number;
    price: number;
    markupPercent?: number;
    barcode?: string;
    barid?: string;
    category?: string;
    description?: string;
    color?: string;
    size?: string;
    brand?: string;
    hasColorOptions?: boolean;
    availableForCustomers?: boolean;
  }) => {
    return apiCall('/products', {
      method: 'POST',
      body: JSON.stringify({
        companyId: data.companyId,
        name: data.name,
        quantity: data.quantity || 0,
        price: data.price,
        markupPercent: data.markupPercent || 0,
        barcode: data.barcode || '',
        barid: data.barid || '',
        category: data.category || '',
        description: data.description || '',
        color: data.color || '',
        size: data.size || '',
        brand: data.brand || '',
        hasColorOptions: data.hasColorOptions || false,
        availableForCustomers: data.availableForCustomers !== false
      }),
    });
  },

  // Update product
  update: async (id: string, data: Partial<any>) => {
    return apiCall(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete product
  delete: async (id: string) => {
    return apiCall(`/products/${id}`, {
      method: 'DELETE',
    });
  },

  // Upload images
  uploadImages: async (id: string, files: FileList) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });

    // Don't pass headers - let browser set Content-Type with boundary for FormData
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/products/${id}/images`, {
      method: 'POST',
      body: formData,
      headers: headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || response.statusText);
    }

    return response.json();
  },

  // Delete image
  deleteImage: async (id: string, filepath: string) => {
    return apiCall(`/products/${id}/images`, {
      method: 'DELETE',
      body: JSON.stringify({ filepath }),
    });
  },

  // Get product reviews
  getReviews: async (id: string) => {
    return apiCall(`/products/${id}/reviews`, {
      method: 'GET',
    });
  },

  // Get product review stats
  getReviewStats: async (id: string) => {
    return apiCall(`/products/${id}/review-stats`, {
      method: 'GET',
    });
  },

  // Bulk toggle availability
  bulkToggleAvailability: async (productIds: number[], available: boolean) => {
    const promises = productIds.map(id =>
      apiCall(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ availableForCustomers: available }),
      })
    );
    return Promise.all(promises);
  },

  // Bulk import products
  bulkImport: async (companyId: number | string, productsData: any[]) => {
    console.log(`📦 Starting bulk import of ${productsData.length} products for company ${companyId}`);
    
    // Import products in batches to avoid overwhelming the server
    const batchSize = 50;
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < productsData.length; i += batchSize) {
      const batch = productsData.slice(i, i + batchSize);
      console.log(`📤 Importing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(productsData.length/batchSize)}: ${batch.length} products`);
      
      const batchPromises = batch.map((product, index) => 
        apiCall('/products', {
          method: 'POST',
          body: JSON.stringify({
            ...product,
            companyId: companyId,
          }),
        }).then(result => {
          successCount++;
          console.log(`✅ Product ${i + index + 1}/${productsData.length} imported: ${product.name}`);
          return result;
        }).catch(error => {
          errorCount++;
          console.error(`❌ Failed to import product ${i + index + 1}/${productsData.length} (${product.name}):`, error);
          return { error: error.message, product: product.name };
        })
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    console.log(`📊 Import completed: ${successCount} success, ${errorCount} errors`);
    return results;
  },
};

// ============================================================================
// SALES API
// ============================================================================

export const sales = {
  // Create sale
  create: async (data: {
    items: any[];
    totalAmount: number;
    paymentMethod: string;
  }) => {
    return apiCall('/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // List sales
  list: async (params?: {
    companyId?: string;
    startDate?: string;
    endDate?: string;
    paymentMethod?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/sales?${query}`);
  },

  // Get sale by ID
  get: async (id: string) => {
    return apiCall(`/sales/${id}`);
  },

  // Get sales summary
  summary: async (params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/sales/analytics/summary?${query}`);
  },
};

// ============================================================================
// CASH SALES API (для панели штрих-кода)
// ============================================================================

export const cashSales = {
  // Создать кассовую продажу
  create: async (data: {
    companyId: number | string;
    paymentMethod?: 'cash' | 'card';
    cardSubtype?: 'uzcard' | 'humo' | 'visa' | 'other';
    items: Array<{
      id: number;
      product_id?: number;
      name?: string;
      productName?: string;
      quantity: number;
      price: number;
      price_with_markup: number;
      priceWithMarkup?: number;
      image_url?: string;
    }>;
  }) => {
    return apiCall('/cash-sales', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Получить список кассовых продаж
  list: async (params?: {
    companyId?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/cash-sales?${query}`);
  },
};

// ============================================================================
// ORDERS API
// ============================================================================

export const orders = {
  // Create order
  create: async (data: {
    companyId: string;
    items: any[];
    totalAmount: number;
    customerName: string;
    customerPhone: string;
    deliveryAddress?: string;
    notes?: string;
  }) => {
    return apiCall('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // List orders
  list: async (params?: {
    companyId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/orders?${query}`);
  },

  // Get order by ID
  get: async (id: string) => {
    return apiCall(`/orders/${id}`);
  },

  // Update order status (company only)
  updateStatus: async (id: string, status: string) => {
    return apiCall(`/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  // Confirm payment - mark order as completed and create sale record
  confirmPayment: async (id: number) => {
    return apiCall(`/orders/${id}/confirm`, {
      method: 'POST',
    });
  },

  // Cancel order
  cancel: async (id: number) => {
    return apiCall(`/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    });
  },

  // Delete order (company only)
  delete: async (id: string) => {
    return apiCall(`/orders/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// COMPANIES API
// ============================================================================

export const companies = {
  // List companies
  list: async (params?: {
    approved?: boolean;
    mode?: 'public' | 'private';
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/companies?${query}`, { requiresAuth: false });
  },

  // Get company by ID
  get: async (id: string) => {
    return apiCall(`/companies/${id}`, { requiresAuth: false });
  },

  // Verify access key
  verifyAccess: async (id: string, accessKey: string) => {
    return apiCall(`/companies/${id}/verify-access`, {
      method: 'POST',
      body: JSON.stringify({ accessKey }),
      requiresAuth: false,
    });
  },

  // Update company (own company only)
  update: async (id: string, data: Partial<any>) => {
    return apiCall(`/companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Upload logo
  uploadLogo: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    return apiCall(`/companies/${id}/upload-logo`, {
      method: 'POST',
      body: formData,
    });
  },

  // Approve company (admin only)
  approve: async (id: string, approved: boolean) => {
    return apiCall(`/companies/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ approved }),
    });
  },

  // Delete company (admin only)
  delete: async (id: string) => {
    return apiCall(`/companies/${id}`, {
      method: 'DELETE',
    });
  },

  // Get company stats (views, subscribers, expenses)
  getStats: async (id: string) => {
    return apiCall(`/companies/${id}/stats`, { requiresAuth: false });
  },

  // Update company expenses
  updateExpenses: async (id: string, expenses: {
    employeeExpenses: number;
    electricityExpenses: number;
    purchaseCosts: number;
  }) => {
    return apiCall(`/companies/${id}/expenses`, {
      method: 'PUT',
      body: JSON.stringify(expenses),
    });
  },
};

// ============================================================================
// USERS API
// ============================================================================

export const users = {
  // Check if user is unique
  checkUnique: async (firstName: string, lastName: string, phone: string) => {
    return apiCall('/users/check-unique', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, phone }),
      requiresAuth: false,
    });
  },

  // Get own profile
  me: async () => {
    return apiCall('/users/me');
  },

  // Update own profile
  updateProfile: async (data: { name?: string; phone?: string; address?: string }) => {
    return apiCall('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Like product
  likeProduct: async (productId: string) => {
    return apiCall(`/users/likes/${productId}`, {
      method: 'POST',
    });
  },

  // Unlike product
  unlikeProduct: async (productId: string) => {
    return apiCall(`/users/likes/${productId}`, {
      method: 'DELETE',
    });
  },

  // Get liked products
  getLikes: async (phone?: string) => {
    if (phone) {
      const items = await apiCall(`/favorites/${phone}`, { requiresAuth: false });
      if (!Array.isArray(items)) return [];
      return items.map((item: any) => Number(item.product_id));
    }
    return apiCall('/users/likes');
  },

  // Sync likes: diff-based — only add missing, remove extra. No GET needed for individual ops.
  saveLikes: async (phone: string, likes: number[]) => {
    // NOTE: this is used for bulk restores only. For individual toggle use toggleLike/removeLike.
    // Get current state from backend
    let current: number[] = [];
    try {
      const items = await apiCall(`/favorites/${phone}`, { requiresAuth: false });
      if (Array.isArray(items)) {
        current = items.map((item: any) => Number(item.product_id));
      }
    } catch (_) {}

    const toAdd = likes.filter(id => !current.includes(id));
    const toRemove = current.filter(id => !likes.includes(id));

    await Promise.all([
      ...toAdd.map(productId =>
        apiCall('/favorites/toggle', {
          method: 'POST',
          body: JSON.stringify({ user_phone: phone, product_id: productId }),
          requiresAuth: false,
        }).catch(() => {})
      ),
      ...toRemove.map(productId =>
        apiCall('/favorites', {
          method: 'DELETE',
          body: JSON.stringify({ user_phone: phone, product_id: productId }),
          requiresAuth: false,
        }).catch(() => {})
      ),
    ]);
  },

  // Direct like toggle — single API call, no GET needed
  addLike: async (phone: string, productId: number) => {
    return apiCall('/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ user_phone: phone, product_id: productId }),
      requiresAuth: false,
    });
  },

  // Direct like remove — single API call, no GET needed
  removeLike: async (phone: string, productId: number) => {
    return apiCall('/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ user_phone: phone, product_id: productId }),
      requiresAuth: false,
    });
  },

  // Get user cart
  getCart: async (phone: string) => {
    const items = await apiCall(`/cart/${phone}`, { requiresAuth: false });
    if (!Array.isArray(items)) return {};
    const cart: { [key: number]: number } = {};
    items.forEach((item: any) => {
      cart[Number(item.product_id)] = item.quantity;
    });
    return cart;
  },

  // Sync cart — direct per-item calls, no GET, no race condition.
  saveCart: async (phone: string, cart: any) => {
    // NOTE: this is used for bulk restores only. For individual actions use setCartQty/removeCartItem.
    // Get current state from backend once for bulk sync
    let currentItems: Array<{ id: number; product_id: number; quantity: number }> = [];
    try {
      const items = await apiCall(`/cart/${phone}`, { requiresAuth: false });
      if (Array.isArray(items)) {
        currentItems = items.map((item: any) => ({
          id: Number(item.id),
          product_id: Number(item.product_id),
          quantity: item.quantity,
        }));
      }
    } catch (_) {}

    const desiredEntries = Object.entries(cart) as [string, number][];
    const desiredMap: { [productId: number]: number } = {};
    desiredEntries.forEach(([pid, qty]) => { desiredMap[Number(pid)] = Number(qty); });

    const ops: Promise<any>[] = [];

    for (const cur of currentItems) {
      if (!(cur.product_id in desiredMap)) {
        ops.push(
          apiCall(`/cart/item/${cur.id}`, { method: 'DELETE', requiresAuth: false }).catch(() => {})
        );
      }
    }

    for (const [pidStr, qty] of desiredEntries) {
      const pid = Number(pidStr);
      const existing = currentItems.find(c => c.product_id === pid);
      if (existing) {
        if (existing.quantity !== qty) {
          ops.push(
            apiCall(`/cart/item/${existing.id}`, {
              method: 'PUT',
              body: JSON.stringify({ quantity: qty }),
              requiresAuth: false,
            }).catch(() => {})
          );
        }
      } else {
        ops.push(
          apiCall('/cart', {
            method: 'POST',
            body: JSON.stringify({ user_phone: phone, product_id: pid, quantity: qty }),
            requiresAuth: false,
          }).catch(() => {})
        );
      }
    }

    await Promise.all(ops);
  },

  // Set exact quantity for a cart item (upsert). quantity=0 removes the item. Single API call, no GET.
  setCartQty: async (phone: string, productId: number, quantity: number) => {
    return apiCall('/cart/set', {
      method: 'POST',
      body: JSON.stringify({ user_phone: phone, product_id: productId, quantity }),
      requiresAuth: false,
    });
  },

  // Remove a specific item from cart by product_id. Single API call, no GET.
  removeCartItem: async (phone: string, productId: number) => {
    return apiCall('/cart/item', {
      method: 'DELETE',
      body: JSON.stringify({ user_phone: phone, product_id: productId }),
      requiresAuth: false,
    });
  },

  // Get user receipts
  getReceipts: async (phone: string) => {
    return apiCall(`/users/${phone}/receipts`, { requiresAuth: false });
  },

  // List all users (admin only)
  list: async (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/users?${query}`);
  },

  // Get user by ID (admin only)
  get: async (id: string) => {
    return apiCall(`/users/${id}`);
  },

  // Delete user (admin only)
  delete: async (id: string) => {
    return apiCall(`/users/${id}`, {
      method: 'DELETE',
    });
  },

  // Get users count (admin only)
  count: async () => {
    return apiCall('/users/count');
  },
};

// ============================================================================
// EXPENSES API
// ============================================================================

export const expenses = {
  // Create expense
  create: async (data: {
    amount: number;
    category: string;
    description?: string;
    date?: string;
  }) => {
    return apiCall('/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // List expenses
  list: async (params?: {
    companyId?: string;
    startDate?: string;
    endDate?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/expenses?${query}`);
  },

  // Get expense by ID
  get: async (id: string) => {
    return apiCall(`/expenses/${id}`);
  },

  // Update expense
  update: async (id: string, data: Partial<any>) => {
    return apiCall(`/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete expense
  delete: async (id: string) => {
    return apiCall(`/expenses/${id}`, {
      method: 'DELETE',
    });
  },

  // Get expenses summary
  summary: async (params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/expenses/analytics/summary?${query}`);
  },
};

// ============================================================================
// ADS API
// ============================================================================

export const ads = {
  // Upload ad image
  uploadImage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    return apiCall('/ads/upload-image', {
      method: 'POST',
      body: formData,
    });
  },

  // Create ad
  create: async (data: {
    title: string;
    content: string;
    linkUrl?: string;
    imageUrl?: string;
    adType: 'company' | 'product'; // 🆕 Тип рекламы
    companyId?: number;
    productId?: number; // 🆕 ID товара для рекламы товара
  }) => {
    // Преобразуем camelCase в snake_case для бэкенда
    const backendData = {
      title: data.title,
      content: data.content,
      caption: data.content, // Дублируем в caption для отображения
      link_url: data.linkUrl || '',
      image_url: data.imageUrl || '', // ✅ Преобразуем imageUrl -> image_url
      ad_type: data.adType, // ✅ Преобразуем adType -> ad_type
      company_id: data.companyId,
      product_id: data.productId
    };
    
    console.log('📤 [API] Sending ad data to backend:', backendData);
    
    return apiCall('/ads', {
      method: 'POST',
      body: JSON.stringify(backendData),
    });
  },

  // List ads
  list: async (params?: {
    status?: 'pending' | 'approved' | 'rejected' | 'deleted';
    companyId?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/ads?${query}`, { requiresAuth: false });
  },

  // Get ad by ID
  get: async (id: string) => {
    return apiCall(`/ads/${id}`, { requiresAuth: false });
  },

  // Update ad
  update: async (id: string, data: Partial<any>) => {
    return apiCall(`/ads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete ad (soft delete - sets status to 'deleted')
  delete: async (id: string) => {
    return apiCall(`/ads/${id}`, {
      method: 'DELETE',
    });
  },

  // Delete all company ads
  deleteAll: async (companyId: string) => {
    return apiCall(`/ads/company/${companyId}/all`, {
      method: 'DELETE',
    });
  },

  // Moderate ad (admin only)
  moderate: async (id: string, status: 'approved' | 'rejected', reason?: string, adminMessage?: string) => {
    return apiCall(`/ads/${id}/moderate`, {
      method: 'PUT',
      body: JSON.stringify({ 
        status, 
        reason: reason || null,
        admin_message: adminMessage || null,
      }),
    });
  },
};

// ============================================================================
// MESSAGES API
// ============================================================================

export const messages = {
  // Send message to company
  sendToCompany: async (data: {
    companyId: string;
    message: string;
    mediaUrl?: string;
  }) => {
    return apiCall('/messages/company', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Reply to user (company only)
  replyToUser: async (data: {
    userId: string;
    message: string;
    mediaUrl?: string;
  }) => {
    return apiCall('/messages/company/reply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get messages with company
  getCompanyMessages: async (companyId: string, params?: {
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/messages/company/${companyId}?${query}`);
  },

  // Send message to admin (company only)
  sendToAdmin: async (data: { message: string; mediaUrl?: string }) => {
    return apiCall('/messages/admin', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Reply to company (admin only)
  replyToCompany: async (data: {
    companyId: string;
    message: string;
    mediaUrl?: string;
  }) => {
    return apiCall('/messages/admin/reply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get admin messages
  getAdminMessages: async (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/messages/admin?${query}`);
  },

  // Upload media
  uploadMedia: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    return apiCall('/messages/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  // Delete message
  delete: async (id: string, type: 'company' | 'admin') => {
    return apiCall(`/messages/${id}?type=${type}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// ANALYTICS API
// ============================================================================

export const analytics = {
  // Get company statistics
  company: async (companyId: string, params?: {
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/analytics/company/${companyId}?${query}`);
  },

  // Get top products
  topProducts: async (params?: { companyId?: string; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/analytics/products/top?${query}`, { requiresAuth: false });
  },

  // Get revenue analytics
  revenue: async (params?: {
    startDate?: string;
    endDate?: string;
    groupBy?: 'day' | 'week' | 'month';
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/analytics/revenue?${query}`);
  },

  // Get ROI
  roi: async (params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/analytics/roi?${query}`);
  },

  // Get inventory analytics
  inventory: async () => {
    return apiCall('/analytics/inventory');
  },

  // Get order statistics
  orders: async (params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiCall(`/analytics/orders?${query}`);
  },

  // Get admin overview (admin only)
  adminOverview: async () => {
    return apiCall('/analytics/admin/overview');
  },
};

// ============================================================================
// Health Check
// ============================================================================

export async function checkServerHealth(): Promise<boolean> {
  try {
    await fetch(`${API_BASE.replace('/api', '')}/health`, { requiresAuth: false } as any);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Export all APIs as default
// ============================================================================

// Reviews API
export const reviews = {
  create: async (data: {
    product_id: number;
    user_phone: string;
    user_name: string;
    rating: number;
    comment: string;
  }) => {
    return apiCall('/reviews', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ============================================================================
// Discounts API
// ============================================================================

export const discounts = {
  // Create discount (company)
  create: async (data: {
    companyId: number;
    productId: number;
    discountPercent: number;
    title?: string;
    description?: string;
  }) => {
    return apiCall('/discounts', {
      method: 'POST',
      body: JSON.stringify({
        companyId: data.companyId,
        productId: data.productId,
        discountPercent: data.discountPercent,
        title: data.title || null,
        description: data.description || null
      }),
    });
  },

  // Get company discounts
  listByCompany: async (companyId: number) => {
    return apiCall(`/discounts/company/${companyId}`);
  },

  // Get all discounts (admin)
  listAll: async () => {
    return apiCall('/discounts/all');
  },

  // Get approved discounts (public)
  listApproved: async () => {
    return apiCall('/discounts/approved', { requiresAuth: false });
  },

  // Update discount status (admin)
  updateStatus: async (id: number, status: 'approved' | 'rejected') => {
    return apiCall(`/discounts/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  // Delete discount
  delete: async (id: number) => {
    return apiCall(`/discounts/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// Aggressive Discounts API
// ============================================================================

export const aggressiveDiscounts = {
  // Get approved aggressive discounts (public)
  listApproved: async () => {
    return apiCall('/aggressive-discounts/approved', { requiresAuth: false });
  },
};

// ============================================================================
// REFERRALS API - Реферальная система
// ============================================================================

export const referrals = {
  // Создать реферального агента (админ)
  createAgent: async (data: { phone: string; password: string; name?: string }) => {
    return apiCall('/referrals/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Вход реферального агента
  loginAgent: async (phone: string, password: string) => {
    const response = await apiCall('/referrals/agents/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      requiresAuth: false,
    });
    if (response.token) {
      setAuthToken(response.token);
    }
    return response;
  },

  // Получить всех агентов (админ)
  listAgents: async () => {
    return apiCall('/referrals/agents');
  },

  // Получить статистику агента
  getAgentStats: async (agentId: number | string) => {
    return apiCall(`/referrals/agents/${agentId}/stats`);
  },

  // 💰 Получить финансовую аналитику агента
  getAgentAnalytics: async (agentId: number | string) => {
    return apiCall(`/referrals/agents/${agentId}/analytics`);
  },

  // Обновить пароль агента
  updateAgentPassword: async (agentId: number | string, oldPassword: string, newPassword: string) => {
    return apiCall(`/referrals/agents/${agentId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },

  // Удалить агента (админ)
  deleteAgent: async (agentId: number | string) => {
    return apiCall(`/referrals/agents/${agentId}`, {
      method: 'DELETE',
    });
  },

  // Получить компании агента
  getMyCompanies: async (agentId: number | string) => {
    return apiCall(`/referrals/agents/${agentId}/companies`);
  },

  // Проверить реферальный код
  validateCode: async (code: string) => {
    return apiCall(`/referrals/validate/${code}`, {
      requiresAuth: false,
    });
  },

  // Включить/выключить компанию (админ)
  toggleCompanyStatus: async (companyId: number | string, isEnabled: boolean) => {
    return apiCall(`/referrals/companies/${companyId}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ isEnabled }),
    });
  },

  // Получить все компании с реферальной информацией (админ)
  getAllCompaniesWithReferralInfo: async () => {
    return apiCall('/referrals/companies/all');
  },
};

export default {
  baseURL: API_BASE.replace('/api', ''), // 🔗 Base URL для прямых fetch запросов
  auth,
  products,
  sales,
  cashSales,
  orders,
  companies,
  users,
  expenses,
  ads,
  aggressiveDiscounts,
  messages,
  analytics,
  reviews,
  discounts,
  referrals, // 👥 Реферальная система
  checkServerHealth,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
};

// ============================================================================
// Legacy API function aliases (for backward compatibility with cache.tsx)
// ============================================================================

export const getProducts = (companyId?: number | string) => 
  products.list({ companyId: companyId ? String(companyId) : undefined });
export const getProductsPaginated = (params: any) => products.list(params);
export const addProduct = (data: any) => products.create(data);
export const updateProduct = (id: string, data: any) => products.update(id, data);
export const deleteProduct = (id: string) => products.delete(id);
export const bulkToggleCustomerAvailability = (productIds: number[], setAvailable: boolean) => 
  products.bulkToggleAvailability(productIds, setAvailable);

export const getSalesHistory = (companyId: string) => sales.list({ companyId });
export const getCustomerOrders = (companyId: string) => orders.list({ companyId });
export const addCustomerOrder = (data: any) => orders.create(data);

export const getCompanies = () => companies.list();
export const addUser = (data: { first_name?: string; last_name?: string; phone_number: string; company_id?: string | null }) => {
  const fullName = data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : data.first_name || '';
  return auth.registerUser(data.phone_number, fullName);
};
export const getCompanyRevenue = () => analytics.revenue();
export const getCompanyProfile = (companyId: string) => companies.get(companyId);

export const getUserCart = (phone: string) => users.getCart(phone);
export const saveUserCart = (phone: string, cart: any) => users.saveCart(phone, cart);
export const getUserLikes = (phone: string) => users.getLikes(phone);
export const saveUserLikes = (phone: string, likes: any) => users.saveLikes(phone, likes);
export const getUserReceipts = (phone: string) => users.getReceipts(phone);
