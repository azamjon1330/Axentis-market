import { useState, useEffect } from 'react';
import { TrendingUp, Package, Search, Users, CheckSquare, Square, ShoppingCart, Receipt, DollarSign, FileText, Clock, X, ChevronDown, Pencil } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import api, { getImageUrl } from '../utils/api';
import { getUzbekistanToday, toUzbekistanDate, formatUzbekistanFullDateTime } from '../utils/uzbekTime';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';
import { useResponsive, useResponsiveClasses } from '../hooks/useResponsive';

interface Product {
  id: number;
  name: string;
  quantity: number;
  price: number;
  markupPercent?: number;
  availableForCustomers?: boolean;
  images?: string[]; // 📸 Массив путей к изображениям товара
  description?: string;
  category?: string;
  barcode?: string;
  brand?: string;
}

interface Order {
  id: number;
  order_code: string;
  user_name: string;
  user_phone: string;
  order_date: string;
  confirmed_date?: string;
  total_amount: number;
  status: string;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
}

interface SalesPanelProps {
  companyId: number;
}

export default function SalesPanel({ companyId }: SalesPanelProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ [key: number]: number }>({});
  const [selectedForSale, setSelectedForSale] = useState<Set<number>>(new Set());
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderSearchCode, setOrderSearchCode] = useState('');
  const [foundOrder, setFoundOrder] = useState<Order | null>(null);
  const [showOrderReceipt, setShowOrderReceipt] = useState(false);
  
  // 📱 Адаптивность
  const { isMobile, isTablet } = useResponsive();
  const responsive = useResponsiveClasses();
  
  // Новые состояния для детальной панели
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [showCompanyProfile, setShowCompanyProfile] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [productNotes, setProductNotes] = useState<{[key: number]: string}>({});
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingProductsDescription, setEditingProductsDescription] = useState(false); // 🆕 Режим редактирования описания товаров
  const [productsDescriptionDraft, setProductsDescriptionDraft] = useState(''); // 🆕 Черновик описания
  const [editingProductDescription, setEditingProductDescription] = useState(false); // 🆕 Режим редактирования описания товара
  const [productDescriptionDraft, setProductDescriptionDraft] = useState(''); // 🆕 Черновик описания товара
  
  // 🌍 Переводы
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const t = useTranslation(language);
  
  // 🔄 Слушаем изменения языка
  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent) => {
      setLanguage(e.detail);
    };
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => window.removeEventListener('languageChange', handleLanguageChange as EventListener);
  }, []);

  useEffect(() => {
    loadData();
    
    // 🔄 Auto-refresh every 10 seconds
    console.log('🔄 [Sales Panel] Setting up auto-refresh every 10 seconds');
    const intervalId = setInterval(() => {
      console.log('🔄 [Sales Panel] Auto-refreshing data...');
      loadData();
    }, 10000); // 10 seconds
    
    // Cleanup on unmount
    return () => {
      console.log('🛑 [Sales Panel] Stopping auto-refresh');
      clearInterval(intervalId);
    };
  }, [companyId]);

  const loadData = async () => {
    try {
      const productsData = await api.products.list({ companyId });
      setProducts(Array.isArray(productsData) ? productsData.filter((p: Product) => p.quantity > 0) : []);
      
      // Sales and orders - handle 404 gracefully
      try {
        const salesData = await api.sales.list({ companyId });
        const sales = Array.isArray(salesData) ? salesData : (salesData?.sales || []);
        setSalesHistory(sales);
      } catch (err) {
        console.log('Sales API not ready:', err);
        setSalesHistory([]);
      }
      
      try {
        const customerOrdersData = await api.orders.list({ companyId });
        const orders = Array.isArray(customerOrdersData) ? customerOrdersData : (customerOrdersData?.orders || []);
        setCustomerOrders(orders);
      } catch (err) {
        console.log('Orders API not ready:', err);
        setCustomerOrders([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert(t.dataLoadError);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyInfo = async () => {
    try {
      const data = await api.companies.get(companyId.toString());
      setCompanyInfo(data);
      setProductsDescriptionDraft(data.productsDescription || ''); // 🆕 Загружаем текущее описание
      if (selectedProduct) {
        setProductDescriptionDraft(selectedProduct.description || ''); // 🆕 Загружаем описание товара
      }
    } catch (error) {
      console.error('Error loading company info:', error);
    }
  };

  // 🆕 Сохранение описания товаров
  const saveProductsDescription = async () => {
    try {
      await api.companies.update(companyId.toString(), {
        ...companyInfo,
        productsDescription: productsDescriptionDraft
      });
      
      setCompanyInfo({ ...companyInfo, productsDescription: productsDescriptionDraft });
      setEditingProductsDescription(false);
      
      // Показываем уведомление
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-top';
      notification.textContent = '✅ Описание товаров сохранено!';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    } catch (error) {
      console.error('Failed to save products description:', error);
      alert(t.saveError);
    }
  };

  // 🆕 Сохранение описания товара
  const saveProductDescription = async () => {
    if (!selectedProduct) return;
    try {
      await api.products.update(selectedProduct.id.toString(), {
        ...selectedProduct,
        description: productDescriptionDraft
      });
      // Обновляем локальное состояние
      setSelectedProduct({ ...selectedProduct, description: productDescriptionDraft });
      setEditingProductDescription(false);
      // Перезагружаем список товаров
      await loadData();
      alert(t.productDescSaved);
    } catch (error) {
      console.error('Error saving product description:', error);
      alert(t.saveError);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(price) + ' ' + t.currency;
  };

  const getPriceWithMarkup = (product: Product) => {
    const markupPercent = product.markupPercent || 0;
    return product.price * (1 + markupPercent / 100);
  };

  const getTodaysSales = () => {
    const today = getUzbekistanToday();
    
    // Calculate company sales from sales_history
    const companySales = salesHistory
      .filter(sale => toUzbekistanDate(sale.sale_date)?.toDateString() === today)
      .reduce((sum, sale) => sum + sale.total_amount, 0);
    
    // Calculate customer orders from customer_orders
    const customerSales = customerOrders
      .filter(order => toUzbekistanDate(order.order_date)?.toDateString() === today)
      .reduce((sum, order) => sum + order.total_amount, 0);
    
    // Return total of both
    return companySales + customerSales;
  };

  const filteredProducts = products.filter(product => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase().trim();
    const name = product.name.toLowerCase();
    const price = product.price.toString();
    const quantity = product.quantity.toString();
    
    return name.includes(query) || price.includes(query) || quantity.includes(query);
  });

  const handleToggleCustomerAvailability = async (productId: number) => {
    try {
      const result = await api.products.toggleAvailability(productId);
      // Update local state
      setProducts(products.map(p => 
        p.id === productId 
          ? { ...p, availableForCustomers: result.availableForCustomers }
          : p
      ));
    } catch (error) {
      console.error('Error toggling customer availability:', error);
      alert(t.statusChangeError);
    }
  };

  // Toggle product selection for sale
  const toggleProductSelection = (productId: number) => {
    const newSelected = new Set(selectedForSale);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
      // Also remove from selectedItems
      const newItems = { ...selectedItems };
      delete newItems[productId];
      setSelectedItems(newItems);
    } else {
      newSelected.add(productId);
      // Auto-select full quantity
      const product = products.find(p => p.id === productId);
      if (product) {
        setSelectedItems({ ...selectedItems, [productId]: product.quantity });
      }
    }
    setSelectedForSale(newSelected);
  };

  // Open sale modal with selected products
  const openSaleModal = () => {
    if (selectedForSale.size === 0) {
      alert(t.selectProductsForSale);
      return;
    }
    setShowSaleModal(true);
  };

  // Handle making products available for customers
  const handleConfirmMakeAvailable = async () => {
    try {
      console.log(`🚀 [Sales Panel] Making ${selectedForSale.size} products available for customers...`);
      const startTime = Date.now();
      
      // Toggle availability for all selected products
      const productIds = Array.from(selectedForSale);
      const result = await api.products.bulkToggleAvailability(productIds, true); // true = make available
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log(`✅ [Sales Panel] Completed in ${duration} seconds!`);

      // Reset
      setSelectedForSale(new Set());
      setShowSaleModal(false);
      
      // ✅ НОВАЯ СИСТЕМА: Данные обновлены в Supabase! Перезагружаем!
      console.log('🔄 [Sales Panel] Reloading data from Supabase...');
      await loadData();
      console.log('✅ [Sales Panel] Data reloaded!');

      alert(`${t.successfullyListed}\n\n${productIds.length} ${t.listedProductsAvailable}\n${t.timeSeconds} ${duration} секунд`);
    } catch (error) {
      console.error('Error making products available:', error);
      alert(t.listProductsError);
    }
  };

  // Handle confirming customer payment
  const handleConfirmPayment = async (orderId: number) => {
    if (!confirm(t.confirmPayment)) return;

    try {
      await api.orders.confirmPayment(orderId);
      await loadData();
      alert(t.paymentConfirmed);
    } catch (error) {
      console.error('Error confirming payment:', error);
      alert(t.paymentConfirmError);
    }
  };

  // Handle selecting all products
  const handleSelectAll = () => {
    if (products.length === 0) {
      return;
    }

    // Check if all products are already selected
    const allSelected = selectedForSale.size === products.length;

    if (allSelected) {
      // Deselect all
      setSelectedForSale(new Set());
      setSelectedItems({});
    } else {
      // Select all products
      const allProductIds = new Set(products.map(p => p.id));
      setSelectedForSale(allProductIds);

      // Auto-set full quantity for all products
      const allItems: { [key: number]: number } = {};
      products.forEach(product => {
        allItems[product.id] = product.quantity;
      });
      setSelectedItems(allItems);
    }
  };

  // Get pending customer orders
  const getPendingOrders = () => {
    return customerOrders.filter(order => order.status === 'pending');
  };

  // Search order by code
  const handleSearchOrder = async () => {
    if (!orderSearchCode.trim()) {
      setFoundOrder(null);
      return;
    }

    try {
      const order = await api.orders.searchByCode(orderSearchCode);
      setFoundOrder(order);
    } catch (error) {
      console.error('Error searching order:', error);
      alert(t.orderSearchError);
    }
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <div className="text-gray-600">{t.productsAvailable}</div>
          </div>
          <div className="text-3xl text-blue-600">{products.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <div className="text-gray-600">{t.availableForCustomers}</div>
          </div>
          <div className="text-3xl text-green-600">
            {products.filter(p => p.availableForCustomers).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <ShoppingCart className="w-5 h-5 text-purple-600" />
            <div className="text-gray-600">{t.productsSelected}</div>
          </div>
          <div className="text-3xl text-purple-600">{selectedForSale.size}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex flex-wrap gap-4">
          <button
            onClick={openSaleModal}
            disabled={selectedForSale.size === 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="w-5 h-5" />
            {t.putOnSale} ({selectedForSale.size})
          </button>
          <button
            onClick={async () => {
              if (selectedForSale.size === 0) {
                alert(t.selectProductsToRemove);
                return;
              }
              
              if (!confirm(`${t.delete} ${selectedForSale.size} ${t.removeFromSaleConfirm}`)) {
                return;
              }
              
              try {
                console.log(`🚫 [Sales Panel] Removing ${selectedForSale.size} products from customer view...`);
                const startTime = Date.now();
                
                const productIds = Array.from(selectedForSale);
                await api.products.bulkToggleAvailability(productIds, false); // false = make unavailable
                
                const endTime = Date.now();
                const duration = ((endTime - startTime) / 1000).toFixed(2);
                
                console.log(`✅ [Sales Panel] Removed in ${duration} seconds!`);
                
                setSelectedForSale(new Set());
                
                // ✅ НОВАЯ СИСТЕМА: Данные обновлены в Supabase! Перезагружаем!
                console.log('🔄 [Sales Panel] Reloading data from Supabase...');
                await loadData();
                console.log('✅ [Sales Panel] Data reloaded!');
                
                alert(`${t.successfullyRemoved}\n\n${productIds.length} ${t.removedProductsHidden}\n${t.timeSeconds} ${duration} секунд`);
              } catch (error) {
                console.error('Error removing products from sale:', error);
                alert(t.removeFromSaleError);
              }
            }}
            disabled={selectedForSale.size === 0}
            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
            {t.removeFromSale} ({selectedForSale.size})
          </button>
          <button
            onClick={handleSelectAll}
            disabled={products.length === 0}
            className={`flex items-center gap-2 text-white px-6 py-3 rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${
              selectedForSale.size === products.length && products.length > 0
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {selectedForSale.size === products.length && products.length > 0 ? (
              <>
                <CheckSquare className="w-5 h-5" />
                ✓ {t.deselectAll}
              </>
            ) : (
              <>
                <Square className="w-5 h-5" />
                {t.selectAll}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center gap-4">
          <Search className="w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-gray-300 rounded py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t.searchByName}
          />
          {searchQuery && (
            <div className="text-sm text-gray-600 whitespace-nowrap">
              Найдено: {filteredProducts.length}
            </div>
          )}
        </div>
      </div>

      {/* Found Order Receipt */}
      {foundOrder && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Receipt className="w-6 h-6 text-orange-600" />
            <h2 className="text-orange-600">{t.foundOrder} ({t.receipt} #{foundOrder.id})</h2>
          </div>
          <div className="space-y-4">
            <div key={foundOrder.id} className="bg-orange-50 border-2 border-orange-200 rounded-lg p-6">
              {/* Order Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3>{t.receipt} #{foundOrder.order_code || foundOrder.id}</h3>
                    <span className="bg-orange-600 text-white px-3 py-1 rounded-full text-xs">
                      {t.pendingPayment}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4" />
                      <span>{foundOrder.user_name || t.guest}</span>
                    </div>
                    {foundOrder.user_phone && (
                      <div className="text-sm text-gray-600 flex items-center gap-1 mb-1">
                        📱 {foundOrder.user_phone}
                      </div>
                    )}
                    <div className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatUzbekistanFullDateTime(foundOrder.order_date)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl text-orange-600 mb-2">
                    {formatPrice(foundOrder.total_amount)}
                  </div>
                  <button
                    onClick={() => handleConfirmPayment(foundOrder.id)}
                    className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <DollarSign className="w-5 h-5" />
                    {t.paymentReceived}
                  </button>
                </div>
              </div>

              {/* Order Items */}
              <div className="border-t border-orange-200 pt-4">
                <div className="text-sm text-gray-600 mb-2">{t.orderItems}</div>
                <div className="space-y-2">
                  {foundOrder.items.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between text-sm bg-white rounded p-3">
                      <div>
                        <span className="">{item.name}</span>
                        <span className="text-gray-600 ml-2">× {item.quantity} {t.pcs}</span>
                      </div>
                      <div className="text-gray-700">
                        {formatPrice(item.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center text-gray-500">
          <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>{t.noProductsInStock}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <div 
              key={product.id} 
              className={`bg-white rounded-lg shadow-sm overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-105 cursor-pointer ${
                selectedForSale.has(product.id) ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-200/50' : 'hover:shadow-blue-100'
              }`}
              onClick={(e) => {
                // Если клик не на checkbox или иконку карандаша - открываем детали
                if (!(e.target as HTMLElement).closest('button')) {
                  setSelectedProduct(product);
                  loadCompanyInfo();
                }
              }}
            >
              {/* Product Image */}
              <div className="relative h-48 bg-gray-100">
                {/* Checkbox for selection */}
                <button
                  onClick={() => toggleProductSelection(product.id)}
                  className="absolute top-2 left-2 w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-md hover:bg-gray-50 transition-colors z-10"
                >
                  {selectedForSale.has(product.id) ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                
                {/* Edit Button (Pencil Icon) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProduct(product);
                    setProductDescriptionDraft(product.description || '');
                    setEditingProductDescription(true);
                    loadCompanyInfo(); // Load company info in background
                  }}
                  className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-green-600 rounded-lg shadow-md hover:bg-green-700 transition-colors z-10"
                  title={t.editProductDescTitle}
                >
                  <Pencil className="w-4 h-4 text-white" />
                </button>
                
                {(() => {
                  // Получаем изображения товара
                  const images = Array.isArray(product.images) ? product.images : [];
                  
                  // Если есть изображения - показываем первое
                  if (images.length > 0) {
                    const imageUrl = getImageUrl(images[0]) || images[0];
                    return (
                      <ImageWithFallback
                        src={imageUrl}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    );
                  }

                  // Иначе - дефолтное изображение
                  return (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-16 h-16 text-gray-300" />
                    </div>
                  );
                })()}
              </div>

              {/* Product Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="line-clamp-2 flex-1">{product.name}</h3>
                  {product.availableForCustomers ? (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium whitespace-nowrap">
                      <Users className="w-3 h-3" />
                      <span>{t.onSale}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium whitespace-nowrap">
                      <Users className="w-3 h-3" />
                      <span>{t.notOnSale}</span>
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  {product.markupPercent && product.markupPercent > 0 ? (
                    <>
                      <div className="text-xs text-gray-400 line-through">{formatPrice(product.price)}</div>
                      <div className="text-blue-600 mb-1 text-lg">
                        {formatPrice(getPriceWithMarkup(product))} <span className="text-xs text-orange-600">+{product.markupPercent}%</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-blue-600 mb-1">{formatPrice(product.price)}</div>
                  )}
                  <div className="text-sm text-gray-600">
                    {t.inStock}: <span className="font-medium">{product.quantity} {t.pcs}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sale Confirmation Modal */}
      {showSaleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-blue-600 text-white p-6">
              <h2 className="text-2xl">{t.listForCustomers}</h2>
              <p className="text-blue-100 text-sm mt-1">{t.listForCustomersDesc}</p>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {Array.from(selectedForSale).map(productId => {
                  const product = products.find(p => p.id === productId);
                  if (!product) return null;

                  return (
                    <div key={productId} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <h3 className="mb-1">{product.name}</h3>
                        <div className="text-sm text-gray-600">
                          {product.markupPercent && product.markupPercent > 0 ? (
                            <>
                              {t.price}: <span className="line-through text-gray-400">{formatPrice(product.price)}</span> → <span className="text-blue-600">{formatPrice(getPriceWithMarkup(product))}</span> <span className="text-orange-600">+{product.markupPercent}%</span> | {t.inStock}: {product.quantity} {t.pcs}
                            </>
                          ) : (
                            <>
                              {t.price}: {formatPrice(product.price)} | {t.inStock}: {product.quantity} {t.pcs}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`px-3 py-1 rounded text-sm ${
                          product.availableForCustomers 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {product.availableForCustomers ? t.alreadyOnSale : t.willBeListed}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                  <div className="flex-1">
                    <div className="">{t.productsAvailableForCustomers}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Покупатели смогут увидеть эти товары в магазине и оформить заказ
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-6 flex gap-4">
              <button
                onClick={() => setShowSaleModal(false)}
                className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmMakeAvailable}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Users className="w-5 h-5" />
                Выставить для покупателей
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Details Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedProduct(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">{selectedProduct.name}</h2>
                <p className="text-purple-100 text-sm mt-1">{t.productDetailsDesc}</p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Product Images */}
              <div className="mb-6">
                {(() => {
                  // Получаем изображения товара
                  const images = Array.isArray(selectedProduct.images) ? selectedProduct.images : [];
                  
                  if (images.length > 0) {
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        {images.map((img, idx) => {
                          const imageUrl = getImageUrl(img) || img;
                          return (
                            <div key={idx} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                              <ImageWithFallback
                                src={imageUrl}
                                alt={`${selectedProduct.name} ${idx + 1}`}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  return (
                    <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                      <Package className="w-16 h-16 text-gray-300" />
                    </div>
                  );
                })()}
              </div>

              {/* Price and Stock */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t.sellingPrice}</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {formatPrice(getPriceWithMarkup(selectedProduct))}
                    </div>
                    {selectedProduct.markupPercent && selectedProduct.markupPercent > 0 && (
                      <div className="text-xs text-orange-600 mt-1">
                        +{selectedProduct.markupPercent}% наценка
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t.inStock}</div>
                    <div className="text-2xl font-bold text-green-600">
                      {selectedProduct.quantity} {t.pcs}
                    </div>
                  </div>
                </div>
              </div>

              {/* 🆕 ОПИСАНИЕ КОНКРЕТНОГО ТОВАРА */}
              <div className="mb-6">
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-green-600" />
                      📄 Описание этого товара
                    </h3>
                    <button
                      onClick={() => setEditingProductDescription(!editingProductDescription)}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      {editingProductDescription ? t.cancel : '✏️ ' + t.editButton}
                    </button>
                  </div>
                  
                  {editingProductDescription ? (
                    <div className="space-y-3">
                      <textarea
                        value={productDescriptionDraft}
                        onChange={(e) => setProductDescriptionDraft(e.target.value)}
                        placeholder={t.describeProduct}
                        className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm resize-none h-32 focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveProductDescription}
                          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
                        >
                          💾 Сохранить
                        </button>
                        <button
                          onClick={() => {
                            setEditingProductDescription(false);
                            setProductDescriptionDraft(selectedProduct.description || '');
                          }}
                          className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 text-sm font-medium"
                        >
                          Отмена
                        </button>
                      </div>
                      <div className="text-xs text-gray-500">
                        💡 Это описание будет показано покупателям для ЭТОГО товара
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-green-200 rounded-lg p-3">
                      <p className="text-gray-700 whitespace-pre-wrap text-sm">
                        {selectedProduct.description || t.noDescriptionClickEdit}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Company Profile Section - Collapsible */}
              <div className="border-t border-gray-200 pt-6">
                <button
                  onClick={() => setShowCompanyProfile(!showCompanyProfile)}
                  className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg hover:from-purple-100 hover:to-blue-100 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-600 rounded-lg">
                      <ShoppingCart className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-gray-800">{t.storeInfo}</div>
                      <div className="text-sm text-gray-600">
                        {companyInfo?.name || t.loading}
                      </div>
                    </div>
                  </div>
                  <div className={`transform transition-transform ${showCompanyProfile ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  </div>
                </button>

                {showCompanyProfile && companyInfo && (
                  <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4 animate-in slide-in-from-top duration-200">
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-gray-600">{t.storeName}</div>
                        <div className="font-medium text-gray-900">{companyInfo.name}</div>
                      </div>
                      {companyInfo.phone && (
                        <div>
                          <div className="text-sm text-gray-600">{t.storePhone}</div>
                          <div className="font-medium text-gray-900">{companyInfo.phone}</div>
                        </div>
                      )}
                      {companyInfo.address && (
                        <div>
                          <div className="text-sm text-gray-600">{t.storeAddress}</div>
                          <div className="font-medium text-gray-900">{companyInfo.address}</div>
                        </div>
                      )}
                      <div className="pt-3 border-t border-gray-200">
                        <div className="text-xs text-gray-500">
                          {t.productsAvailable}: {products.reduce((sum, p) => sum + p.quantity, 0)} {t.pcs} ({products.filter(p => p.quantity > 0).length} {t.category})
                        </div>
                      </div>

                      {/* 🆕 Описание товаров компании */}
                      <div className="pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm text-gray-600">📝 Описание товаров</div>
                          <button
                            onClick={() => setEditingProductsDescription(!editingProductsDescription)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {editingProductsDescription ? t.cancel : t.editButton}
                          </button>
                        </div>
                        
                        {editingProductsDescription ? (
                          <div className="space-y-2">
                            <textarea
                              value={productsDescriptionDraft}
                              onChange={(e) => setProductsDescriptionDraft(e.target.value)}
                              placeholder={t.describeProducts}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none h-32"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={saveProductsDescription}
                                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
                              >
                                💾 Сохранить
                              </button>
                              <button
                                onClick={() => {
                                  setEditingProductsDescription(false);
                                  setProductsDescriptionDraft(companyInfo.productsDescription || '');
                                }}
                                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 text-sm font-medium"
                              >
                                Отмена
                              </button>
                            </div>
                            <div className="text-xs text-gray-500">
                              💡 Совет: Ссылки будут автоматически кликабельными в профиле компании
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-700 whitespace-pre-wrap">
                            {companyInfo.productsDescription || t.noDescription}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-6 flex gap-4">
              <button
                onClick={() => setSelectedProduct(null)}
                className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-400 transition-colors font-medium"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}