import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Package,
  Building2,
  DollarSign,
  ShoppingCart,
  Calculator,
  BarChart3,
  History,
  ChevronDown,
  ChevronUp,
  Eye,
  RefreshCw,
  Truck
} from 'lucide-react';
import api from '../utils/api';
import CompactPeriodSelector from './CompactPeriodSelector';
import { getCurrentLanguage, type Language } from '../utils/translations';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

// ============================================================================
// INTERFACES
// ============================================================================

interface Company {
  id: number;
  name: string;
  phone: string;
  mode: 'public' | 'private';
  approved: boolean;
  created_at: string;
}

interface Order {
  id: number;
  order_code: string;
  company_id: number;
  company_name?: string;
  total_amount: number;
  delivery_cost: number;
  delivery_type: string;
  recipient_name?: string;
  delivery_address?: string;
  delivery_coordinates?: string;
  markup_profit: number;
  status: string;
  payment_method: string;
  confirmed_date?: string;
  order_date?: string;
  created_at: string;
  items?: any[];
}

interface Product {
  id: number;
  company_id: number;
  company_name?: string;
  name: string;
  price: number;
  quantity: number;
  markupPercent?: number;
  sellingPrice?: number;
  category?: string;
  available_for_customers: boolean;
  // Для аналитики продаж
  totalSold?: number;
  totalRevenue?: number;
}

interface CompanyStats {
  companyId: number;
  companyName: string;
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  totalProducts: number;
  totalProductQuantity: number;
}

// ============================================================================
// ADMIN ANALYTICS PANEL COMPONENT
// ============================================================================

export default function AdminAnalyticsPanel() {
  // ===================== STATE =====================
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Данные
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  
  // Режим просмотра
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  
  // Фильтры
  type PeriodType = 'day' | 'yesterday' | 'week' | 'month' | 'year' | 'all';
  const [timePeriod, setTimePeriod] = useState<PeriodType>('all');
  
  // Калькулятор процента
  const [percentageInput, setPercentageInput] = useState<string>('');
  
  // UI State
  const [expandedSections, setExpandedSections] = useState({
    orders: true,
    products: false,
    calculator: true,
    topProducts: true,
    purchases: false
  });
  
  // Search and expanded orders
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  
  // Language support
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  
  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent) => {
      setLanguage(e.detail);
    };
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => window.removeEventListener('languageChange', handleLanguageChange as EventListener);
  }, []);

  // ===================== DATA LOADING =====================
  
  useEffect(() => {
    loadAllData();
    
    // Автообновление каждые 30 секунд
    const interval = setInterval(() => {
      console.log('🔄 [Admin Analytics] Auto-refresh');
      loadAllData(true);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  const loadAllData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      console.log('📊 [Admin Analytics] Загрузка данных...');
      
      // Загружаем все компании
      const companiesData = await api.companies.list();
      const companiesList = Array.isArray(companiesData) ? companiesData : (companiesData?.companies || []);
      
      console.log(`✅ Загружено компаний: ${companiesList.length}`);
      
      // Загружаем заказы и товары для каждой компании
      const allOrdersData: Order[] = [];
      const allProductsData: Product[] = [];
      
      for (const company of companiesList) {
        try {
          // Загружаем аналитику компании (включая заказы)
          const analyticsData = await api.analytics.company(company.id.toString());
          
          if (analyticsData.orders && Array.isArray(analyticsData.orders)) {
            const ordersWithCompany = analyticsData.orders.map((order: Order) => ({
              ...order,
              company_id: company.id,
              company_name: company.name
            }));
            allOrdersData.push(...ordersWithCompany);
          }
          
          // Загружаем товары компании
          const productsData = await api.products.list({ companyId: company.id.toString() });
          const productsList = Array.isArray(productsData) ? productsData : (productsData?.products || []);
          
          const productsWithCompany = productsList.map((product: Product) => ({
            ...product,
            company_id: company.id,
            company_name: company.name
          }));
          allProductsData.push(...productsWithCompany);
          
        } catch (error) {
          console.warn(`⚠️ Ошибка загрузки данных компании ${company.name}:`, error);
        }
      }
      
      console.log(`✅ Загружено заказов: ${allOrdersData.length}`);
      console.log(`✅ Загружено товаров: ${allProductsData.length}`);
      
      setCompanies(companiesList);
      setAllOrders(allOrdersData);
      setAllProducts(allProductsData);
      
    } catch (error) {
      console.error('❌ [Admin Analytics] Ошибка загрузки:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ===================== FILTERING =====================
  
  const getFilteredOrders = useMemo(() => {
    let orders = [...allOrders];
    
    // Фильтр по компании
    if (viewMode === 'single' && selectedCompanyId) {
      orders = orders.filter(o => o.company_id === selectedCompanyId);
    }
    
    // Фильтр по периоду
    if (timePeriod !== 'all') {
      const now = new Date();
      let startDate = new Date();
      let endDate = new Date();
      
      if (timePeriod === 'day') {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timePeriod === 'yesterday') {
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else if (timePeriod === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (timePeriod === 'month') {
        startDate.setMonth(now.getMonth() - 1);
      } else if (timePeriod === 'year') {
        startDate.setFullYear(now.getFullYear() - 1);
      }
      
      orders = orders.filter(order => {
        const dateStr = order.confirmed_date || order.order_date || order.created_at;
        if (!dateStr) return false;
        const orderDate = new Date(dateStr);
        return orderDate >= startDate && orderDate <= endDate;
      });
    }
    
    return orders;
  }, [allOrders, viewMode, selectedCompanyId, timePeriod]);
  
  const getFilteredProducts = useMemo(() => {
    if (viewMode === 'single' && selectedCompanyId) {
      return allProducts.filter(p => p.company_id === selectedCompanyId);
    }
    return allProducts;
  }, [allProducts, viewMode, selectedCompanyId]);

  // ===================== CALCULATIONS =====================
  
  // Общая выручка
  const totalRevenue = useMemo(() => {
    return getFilteredOrders.reduce((sum, order) => sum + (parseFloat(String(order.total_amount)) || 0), 0);
  }, [getFilteredOrders]);
  
  // Чистая прибыль (только наценки)
  const totalProfit = useMemo(() => {
    return getFilteredOrders.reduce((sum, order) => sum + (parseFloat(String(order.markup_profit)) || 0), 0);
  }, [getFilteredOrders]);
  
  // Общее количество товаров
  const totalProductsCount = useMemo(() => {
    return getFilteredProducts.length;
  }, [getFilteredProducts]);
  
  // Общее количество единиц товаров (с учетом quantity)
  const totalProductQuantity = useMemo(() => {
    return getFilteredProducts.reduce((sum, p) => sum + (p.quantity || 0), 0);
  }, [getFilteredProducts]);
  
  // Стоимость товаров на складе
  const totalInventoryValue = useMemo(() => {
    return getFilteredProducts.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0);
  }, [getFilteredProducts]);
  
  // 🚚 Общая сумма доставки (для админа, не для компаний)
  const totalDeliveryCost = useMemo(() => {
    return getFilteredOrders.reduce((sum, order) => sum + (parseFloat(String(order.delivery_cost)) || 0), 0);
  }, [getFilteredOrders]);
  
  // Статистика по каждой компании
  const companiesStats = useMemo((): CompanyStats[] => {
    return companies.map(company => {
      const companyOrders = allOrders.filter(o => o.company_id === company.id);
      const companyProducts = allProducts.filter(p => p.company_id === company.id);
      
      return {
        companyId: company.id,
        companyName: company.name,
        totalRevenue: companyOrders.reduce((sum, o) => sum + (parseFloat(String(o.total_amount)) || 0), 0),
        totalProfit: companyOrders.reduce((sum, o) => sum + (parseFloat(String(o.markup_profit)) || 0), 0),
        totalOrders: companyOrders.length,
        totalProducts: companyProducts.length,
        totalProductQuantity: companyProducts.reduce((sum, p) => sum + (p.quantity || 0), 0)
      };
    }).sort((a, b) => b.totalProfit - a.totalProfit); // Сортировка по прибыли
  }, [companies, allOrders, allProducts]);
  
  // 🔥 ИСПРАВЛЕНО: Расчет процента от ВЫРУЧКИ, а не от прибыли
  const calculatedPercentage = useMemo(() => {
    const percent = parseFloat(percentageInput);
    if (isNaN(percent) || percent <= 0) return 0;
    return totalRevenue * (percent / 100);
  }, [percentageInput, totalRevenue]);

  // ===================== PRODUCT ANALYTICS =====================
  
  // Аналитика продаж товаров
  const productSalesAnalytics = useMemo(() => {
    // Собираем данные о продажах из всех заказов
    const salesByProduct: { [key: string]: { 
      name: string; 
      companyName: string; 
      totalSold: number; 
      totalRevenue: number; 
      totalProfit: number;
      price: number; 
      sellingPrice: number;
      markupPercent: number 
    } } = {};
    
    console.log('📊 [ProductAnalytics] Processing orders:', getFilteredOrders.length);
    
    getFilteredOrders.forEach(order => {
      // items может быть строкой JSON или уже массивом
      let items = order.items;
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items);
        } catch (e) {
          console.warn('Failed to parse items:', e);
          return;
        }
      }
      
      if (items && Array.isArray(items)) {
        items.forEach((item: any) => {
          // Используем productName или name
          const itemName = item.productName || item.name;
          if (!itemName) return;
          
          const key = `${itemName}_${order.company_id}`;
          const basePrice = item.price || 0;
          const sellingPrice = item.price_with_markup || item.sellingPrice || item.total || basePrice;
          const quantity = item.quantity || 1;
          const profit = (sellingPrice - basePrice) * quantity;
          const markupPercent = basePrice > 0 ? ((sellingPrice - basePrice) / basePrice) * 100 : 0;
          
          if (!salesByProduct[key]) {
            salesByProduct[key] = {
              name: itemName,
              companyName: order.company_name || 'Неизвестно',
              totalSold: 0,
              totalRevenue: 0,
              totalProfit: 0,
              price: basePrice,
              sellingPrice: sellingPrice,
              markupPercent: markupPercent
            };
          }
          salesByProduct[key].totalSold += quantity;
          salesByProduct[key].totalRevenue += sellingPrice * quantity;
          salesByProduct[key].totalProfit += profit;
        });
      }
    });
    
    const salesArray = Object.values(salesByProduct);
    console.log('📊 [ProductAnalytics] Sales data:', salesArray.length, 'products');
    
    // Самый продаваемый товар (по количеству)
    const bestSeller = salesArray.length > 0 
      ? salesArray.reduce((a, b) => a.totalSold > b.totalSold ? a : b) 
      : null;
    
    // Наименее продаваемый товар (по количеству) - из тех что продавались
    const worstSeller = salesArray.length > 0 
      ? salesArray.reduce((a, b) => a.totalSold < b.totalSold ? a : b) 
      : null;
    
    // Самый прибыльный товар (по прибыли)
    const mostProfitable = salesArray.length > 0 
      ? salesArray.reduce((a, b) => a.totalProfit > b.totalProfit ? a : b) 
      : null;
    
    // Самый дорогой товар из проданных (по цене продажи)
    const mostExpensive = salesArray.length > 0 
      ? salesArray.reduce((a, b) => a.sellingPrice > b.sellingPrice ? a : b) 
      : null;
    
    // Самый дешёвый товар из проданных  
    const cheapest = salesArray.length > 0 
      ? salesArray.reduce((a, b) => a.sellingPrice < b.sellingPrice ? a : b) 
      : null;
    
    // Товары которые не продаются (есть на складе, но нет в заказах)
    const soldProductNames = new Set(
      salesArray
        .filter(s => s.name)
        .map(s => s.name.toLowerCase())
    );
    const unsoldProducts = getFilteredProducts.filter(p => 
      p.name && !soldProductNames.has(p.name.toLowerCase()) && p.quantity > 0
    );
    
    return {
      bestSeller,
      worstSeller,
      mostProfitable,
      mostExpensive,
      cheapest,
      unsoldProducts: unsoldProducts.slice(0, 10), // Топ 10 непроданных
      totalSoldProducts: salesArray.length
    };
  }, [getFilteredOrders, getFilteredProducts]);

  // ===================== HELPERS =====================
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(price) + ' сум';
  };
  
  const formatShortPrice = (price: number) => {
    if (price >= 1_000_000_000) {
      return `${(price / 1_000_000_000).toFixed(1)} ${language === 'uz' ? 'mlrd' : 'млрд'}`;
    } else if (price >= 1_000_000) {
      return `${(price / 1_000_000).toFixed(1)} ${language === 'uz' ? 'mln' : 'млн'}`;
    } else if (price >= 1_000) {
      return `${(price / 1_000).toFixed(1)} ${language === 'uz' ? 'ming' : 'тыс'}`;
    }
    return price.toLocaleString();
  };
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  const selectedCompany = useMemo(() => {
    return companies.find(c => c.id === selectedCompanyId);
  }, [companies, selectedCompanyId]);

  // ===================== CHART DATA =====================
  
  // Данные для круговой диаграммы (прибыль по компаниям)
  const profitByCompanyData = useMemo(() => {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    return companiesStats
      .filter(s => s.totalProfit > 0)
      .slice(0, 8)
      .map((stat, index) => ({
        name: stat.companyName,
        value: stat.totalProfit,
        color: colors[index % colors.length]
      }));
  }, [companiesStats]);
  
  // Данные для столбчатой диаграммы
  const barChartData = useMemo(() => {
    return companiesStats.slice(0, 6).map(stat => ({
      name: stat.companyName.length > 10 ? stat.companyName.slice(0, 10) + '...' : stat.companyName,
      fullName: stat.companyName,
      revenue: stat.totalRevenue,
      profit: stat.totalProfit,
      orders: stat.totalOrders
    }));
  }, [companiesStats]);

  // ===================== RENDER =====================
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Загрузка аналитики...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ========== HEADER WITH CONTROLS ========== */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-blue-600" />
              Аналитика платформы
            </h2>
            <p className="text-gray-500 mt-1">
              {viewMode === 'all' 
                ? 'Общая статистика всех компаний'
                : `Статистика компании: ${selectedCompany?.name || '—'}`
              }
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadAllData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>
        </div>
        
        {/* View Mode Selector */}
        <div className="mt-6 flex flex-col lg:flex-row gap-4">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                setViewMode('all');
                setSelectedCompanyId(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-2 rounded-lg transition ${
                viewMode === 'all'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Все компании
            </button>
            <button
              onClick={() => setViewMode('single')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-2 rounded-lg transition ${
                viewMode === 'single'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Eye className="w-4 h-4" />
              Конкретная компания
            </button>
          </div>
          
          {/* Company Selector */}
          {viewMode === 'single' && (
            <div className="flex-1">
              <select
                value={selectedCompanyId || ''}
                onChange={(e) => setSelectedCompanyId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">Выберите компанию...</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Period Selector */}
          <CompactPeriodSelector
            value={timePeriod}
            onChange={setTimePeriod}
          />
        </div>
      </div>

      {/* ========== MAIN STATS CARDS ========== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Общая выручка */}
        <div className="bg-blue-600 rounded-xl shadow-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-6 h-6 text-white" />
            <span className="text-white/90 font-medium">Общая выручка</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatShortPrice(totalRevenue)}
          </div>
          <div className="text-white/80 text-sm mt-1">
            Заказов: {getFilteredOrders.length}
          </div>
        </div>
        
        {/* Чистая прибыль */}
        <div className="bg-blue-600 rounded-xl shadow-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-6 h-6 text-white" />
            <span className="text-white/90 font-medium">Чистая прибыль</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatShortPrice(totalProfit)}
          </div>
          <div className="text-white/80 text-sm mt-1">
            Прибыль от наценок
          </div>
        </div>
        
        {/* Товаров в базе */}
        <div className="bg-blue-600 rounded-xl shadow-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-6 h-6 text-white" />
            <span className="text-white/90 font-medium">Товаров в базе</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {totalProductsCount.toLocaleString()}
          </div>
          <div className="text-white/80 text-sm mt-1">
            Единиц: {totalProductQuantity.toLocaleString()}
          </div>
        </div>
        
        {/* Стоимость склада */}
        <div className="bg-blue-600 rounded-xl shadow-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-6 h-6 text-white" />
            <span className="text-white/90 font-medium">Стоимость склада</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatShortPrice(totalInventoryValue)}
          </div>
          <div className="text-white/80 text-sm mt-1">
            Закупочная стоимость
          </div>
        </div>
        
        {/* 🚚 Доставка (доход админа) */}
        <div className="bg-green-600 rounded-xl shadow-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-6 h-6 text-white" />
            <span className="text-white/90 font-medium">Доставка</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatShortPrice(totalDeliveryCost)}
          </div>
          <div className="text-white/80 text-sm mt-1">
            Доход от доставок
          </div>
        </div>
      </div>

      {/* ========== PERCENTAGE CALCULATOR ========== */}
      <div className="bg-white rounded-lg shadow-sm">
        <button
          onClick={() => toggleSection('calculator')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <Calculator className="w-6 h-6 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-800">
              Калькулятор доли прибыли
            </h3>
          </div>
          {expandedSections.calculator ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
        
        {expandedSections.calculator && (
          <div className="p-6 border-t border-gray-100">
            <div className="bg-indigo-50 rounded-lg p-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Введите процент для расчета вашей доли:
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={percentageInput}
                      onChange={(e) => setPercentageInput(e.target.value)}
                      placeholder="Например: 5"
                      className="w-32 px-4 py-3 text-xl font-semibold border-2 border-indigo-300 rounded-lg focus:outline-none focus:border-indigo-500 text-center"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                    <span className="text-2xl font-bold text-indigo-600">%</span>
                  </div>
                </div>
                
                <div className="text-center px-6 py-4 bg-white rounded-lg shadow-sm">
                  <div className="text-sm text-gray-500 mb-1">Ваша доля от выручки:</div>
                  <div className="text-3xl font-bold text-indigo-600">
                    {formatPrice(calculatedPercentage)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {percentageInput || 0}% от {formatShortPrice(totalRevenue)}
                  </div>
                </div>
              </div>
              
              {/* Quick percentage buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-sm text-gray-600 mr-2">Быстрый выбор:</span>
                {[1, 2, 3, 5, 10, 15, 20].map(percent => (
                  <button
                    key={percent}
                    onClick={() => setPercentageInput(String(percent))}
                    className={`px-3 py-1 rounded-lg text-sm transition ${
                      percentageInput === String(percent)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-indigo-300 text-indigo-600 hover:bg-indigo-100'
                    }`}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== CHARTS ========== */}
      {viewMode === 'all' && companiesStats.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Аналитика по компаниям
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart - Распределение прибыли */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-md font-medium text-gray-700 mb-4 text-center">
                📊 Распределение прибыли
              </h4>
              {profitByCompanyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={profitByCompanyData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {profitByCompanyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatPrice(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-gray-400">
                  Нет данных о прибыли
                </div>
              )}
            </div>
            
            {/* Bar Chart - Сравнение компаний */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-md font-medium text-gray-700 mb-4 text-center">
                📈 Сравнение компаний
              </h4>
              {barChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => formatShortPrice(value)} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatPrice(value),
                        name === 'revenue' ? 'Выручка' : 'Прибыль'
                      ]}
                      labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.fullName || label}
                    />
                    <Legend formatter={(value) => value === 'revenue' ? 'Выручка' : 'Прибыль'} />
                    <Bar dataKey="revenue" fill="#3b82f6" name="revenue" />
                    <Bar dataKey="profit" fill="#10b981" name="profit" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-gray-400">
                  Нет данных
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== COMPANIES TABLE (All Mode) ========== */}
      {viewMode === 'all' && (
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Статистика по компаниям
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Компания</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Выручка</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Прибыль</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Заказов</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Товаров</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Ед. на складе</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {companiesStats.map((stat) => (
                  <tr key={stat.companyId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{stat.companyName}</td>
                    <td className="px-4 py-3 text-right text-blue-600 font-medium">
                      {formatShortPrice(stat.totalRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 font-medium">
                      {formatShortPrice(stat.totalProfit)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{stat.totalOrders}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{stat.totalProducts}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{stat.totalProductQuantity.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          setViewMode('single');
                          setSelectedCompanyId(stat.companyId);
                        }}
                        className="px-3 py-1 bg-blue-100 text-blue-600 rounded-lg text-sm hover:bg-blue-200 transition"
                      >
                        <Eye className="w-4 h-4 inline mr-1" />
                        Подробнее
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="px-4 py-3 text-gray-800">ИТОГО</td>
                  <td className="px-4 py-3 text-right text-blue-600">
                    {formatShortPrice(companiesStats.reduce((sum, s) => sum + s.totalRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600">
                    {formatShortPrice(companiesStats.reduce((sum, s) => sum + s.totalProfit, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {companiesStats.reduce((sum, s) => sum + s.totalOrders, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {companiesStats.reduce((sum, s) => sum + s.totalProducts, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {companiesStats.reduce((sum, s) => sum + s.totalProductQuantity, 0).toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ========== ORDERS HISTORY ========== */}
      <div className="bg-white rounded-lg shadow-sm">
        <button
          onClick={() => toggleSection('orders')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <History className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-800">
              История заказов
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-600 rounded-full text-sm">
                {getFilteredOrders.filter(o => 
                  !orderSearchQuery || 
                  o.order_code?.toLowerCase().includes(orderSearchQuery.toLowerCase())
                ).length}
              </span>
            </h3>
          </div>
          {expandedSections.orders ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
        
        {expandedSections.orders && (
          <div className="border-t border-gray-100">
            {/* Поиск по коду заказа */}
            <div className="p-4 bg-gray-50 border-b border-gray-100">
              <div className="relative max-w-md">
                <input
                  type="text"
                  placeholder="🔍 Поиск по коду заказа (#285213, #704752...)"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {orderSearchQuery && (
                  <button
                    onClick={() => setOrderSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            
            {getFilteredOrders.filter(o => 
              !orderSearchQuery || 
              o.order_code?.toLowerCase().includes(orderSearchQuery.toLowerCase())
            ).length > 0 ? (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Код</th>
                      {viewMode === 'all' && (
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Компания</th>
                      )}
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Сумма</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Прибыль</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Статус</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Способ оплаты</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Доставка</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Дата</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Детали</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {getFilteredOrders
                      .filter(o => 
                        !orderSearchQuery || 
                        o.order_code?.toLowerCase().includes(orderSearchQuery.toLowerCase())
                      )
                      .slice(0, 100)
                      .map((order) => {
                        // Парсим items
                        let orderItems: any[] = [];
                        if (order.items) {
                          if (typeof order.items === 'string') {
                            try { orderItems = JSON.parse(order.items); } catch (e) { orderItems = []; }
                          } else if (Array.isArray(order.items)) {
                            orderItems = order.items;
                          }
                        }
                        const isExpanded = expandedOrderId === order.id;
                        
                        return (
                          <React.Fragment key={order.id}>
                            <tr className={`hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}>
                              <td className="px-4 py-3 font-mono text-sm text-gray-800">
                                #{order.order_code}
                              </td>
                              {viewMode === 'all' && (
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {order.company_name}
                                </td>
                              )}
                              <td className="px-4 py-3 text-right text-sm font-medium text-blue-600">
                                {formatPrice(parseFloat(String(order.total_amount)) || 0)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                                +{formatPrice(parseFloat(String(order.markup_profit)) || 0)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  order.status === 'completed' 
                                    ? 'bg-green-100 text-green-700'
                                    : order.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : order.status === 'cancelled'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {order.status === 'completed' ? 'Завершен' 
                                    : order.status === 'pending' ? 'Ожидает'
                                    : order.status === 'cancelled' ? 'Отменен'
                                    : order.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-gray-600">
                                {order.payment_method === 'demo_online' ? '💳 Демо'
                                  : order.payment_method === 'real_online' ? '💳 Онлайн'
                                  : order.payment_method === 'checks_codes' ? '🧾 Чек/Код'
                                  : order.payment_method === 'cash' ? '💵 Наличные'
                                  : order.payment_method}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  order.delivery_type === 'delivery'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {order.delivery_type === 'delivery' ? '🚚 Доставка' : '🏪 Самовывоз'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-500">
                                {formatDate(order.confirmed_date || order.order_date || order.created_at)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                                  className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                                    isExpanded 
                                      ? 'bg-blue-600 text-white' 
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {isExpanded ? 'Скрыть' : `📦 ${orderItems.length} тов.`}
                                </button>
                              </td>
                            </tr>
                            {/* Детали заказа - список товаров */}
                            {isExpanded && orderItems.length > 0 && (
                              <tr>
                                <td colSpan={viewMode === 'all' ? 9 : 8} className="px-4 py-4 bg-blue-50">
                                  
                                  {/* Информация о доставке */}
                                  {(order.delivery_type || order.recipient_name || order.delivery_address) && (
                                    <div className="bg-white rounded-lg border border-blue-200 overflow-hidden mb-4">
                                      <div className="px-4 py-2 bg-green-100 border-b border-green-200">
                                        <span className="font-semibold text-green-800">🚚 Информация о доставке</span>
                                      </div>
                                      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                          <div className="text-xs text-gray-500 mb-1">Тип</div>
                                          <div className="text-sm font-medium text-gray-800">
                                            {order.delivery_type === 'delivery' ? '🚚 Доставка' : '🏪 Самовывоз'}
                                          </div>
                                        </div>
                                        {order.recipient_name && (
                                          <div>
                                            <div className="text-xs text-gray-500 mb-1">Получатель</div>
                                            <div className="text-sm font-medium text-gray-800">{order.recipient_name}</div>
                                          </div>
                                        )}
                                        {order.delivery_address && (
                                          <div className="col-span-2">
                                            <div className="text-xs text-gray-500 mb-1">Адрес доставки</div>
                                            <div className="text-sm font-medium text-gray-800">{order.delivery_address}</div>
                                          </div>
                                        )}
                                        {order.delivery_cost > 0 && (
                                          <div>
                                            <div className="text-xs text-gray-500 mb-1">Стоимость доставки</div>
                                            <div className="text-sm font-bold text-green-600">{formatPrice(order.delivery_cost)}</div>
                                          </div>
                                        )}
                                        {order.delivery_coordinates && (
                                          <div>
                                            <div className="text-xs text-gray-500 mb-1">Координаты</div>
                                            <div className="text-xs text-blue-600 font-mono">
                                              <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${order.delivery_coordinates}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:underline"
                                              >
                                                📍 {order.delivery_coordinates}
                                              </a>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                                    <div className="px-4 py-2 bg-blue-100 border-b border-blue-200">
                                      <span className="font-semibold text-blue-800">📦 Товары в заказе #{order.order_code}</span>
                                    </div>
                                    <table className="w-full">
                                      <thead className="bg-gray-50">
                                        <tr>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">№</th>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Название товара</th>
                                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Закуп. цена</th>
                                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Цена продажи</th>
                                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Кол-во</th>
                                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Сумма</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {orderItems.map((item: any, idx: number) => {
                                          const itemName = item.productName || item.name || 'Товар';
                                          const basePrice = item.price || 0;
                                          const sellingPrice = item.price_with_markup || item.sellingPrice || item.total / (item.quantity || 1) || basePrice;
                                          const quantity = item.quantity || 1;
                                          const total = item.total || sellingPrice * quantity;
                                          
                                          return (
                                            <tr key={idx} className="hover:bg-gray-50">
                                              <td className="px-4 py-2 text-sm text-gray-500">{idx + 1}</td>
                                              <td className="px-4 py-2 text-sm font-medium text-gray-800">{itemName}</td>
                                              <td className="px-4 py-2 text-right text-sm text-gray-500">
                                                {formatPrice(basePrice)}
                                              </td>
                                              <td className="px-4 py-2 text-right text-sm text-blue-600 font-medium">
                                                {formatPrice(sellingPrice)}
                                              </td>
                                              <td className="px-4 py-2 text-center text-sm font-semibold text-gray-700">
                                                {quantity} шт.
                                              </td>
                                              <td className="px-4 py-2 text-right text-sm font-bold text-green-600">
                                                {formatPrice(total)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot className="bg-gray-50">
                                        <tr>
                                          <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                                            Итого:
                                          </td>
                                          <td className="px-4 py-2 text-center text-sm font-bold text-gray-700">
                                            {orderItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0)} шт.
                                          </td>
                                          <td className="px-4 py-2 text-right text-sm font-bold text-green-600">
                                            {formatPrice(orderItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0))}
                                          </td>
                                        </tr>
                                        {/* Показываем предупреждение если суммы не совпадают */}
                                        {Math.abs(orderItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0) - (parseFloat(String(order.total_amount)) || 0)) > 1000 && (
                                          <tr>
                                            <td colSpan={6} className="px-4 py-2 text-center text-xs text-orange-600 bg-orange-50">
                                              ⚠️ Сумма в заказе ({formatPrice(parseFloat(String(order.total_amount)) || 0)}) отличается от суммы товаров
                                            </td>
                                          </tr>
                                        )}
                                      </tfoot>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
                {getFilteredOrders.filter(o => 
                  !orderSearchQuery || 
                  o.order_code?.toLowerCase().includes(orderSearchQuery.toLowerCase())
                ).length > 100 && (
                  <div className="text-center py-4 text-gray-500 bg-gray-50">
                    Показано 100 из {getFilteredOrders.filter(o => 
                      !orderSearchQuery || 
                      o.order_code?.toLowerCase().includes(orderSearchQuery.toLowerCase())
                    ).length} заказов
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">
                {orderSearchQuery ? `Заказ #${orderSearchQuery} не найден` : 'Нет заказов за выбранный период'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========== PRODUCTS LIST (Single Company Mode) ========== */}
      {viewMode === 'single' && selectedCompanyId && (
        <div className="bg-white rounded-lg shadow-sm">
          <button
            onClick={() => toggleSection('products')}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-800">
                Товары на цифровом складе
                <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-600 rounded-full text-sm">
                  {getFilteredProducts.length} наименований
                </span>
              </h3>
            </div>
            {expandedSections.products ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </button>
          
          {expandedSections.products && (
            <div className="border-t border-gray-100">
              {getFilteredProducts.length > 0 ? (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Название</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Категория</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Цена (закуп.)</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Наценка</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Цена продажи</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Кол-во</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Доступен</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {getFilteredProducts.slice(0, 100).map((product) => {
                        const markupPercent = product.markupPercent || 0;
                        const sellingPrice = product.sellingPrice || product.price * (1 + markupPercent / 100);
                        
                        return (
                          <tr key={product.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-800">
                              {product.name}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {product.category || '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              {formatPrice(product.price)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-purple-600">
                              +{markupPercent}%
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                              {formatPrice(sellingPrice)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-800 font-medium">
                              {product.quantity}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                product.available_for_customers
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {product.available_for_customers ? 'Да' : 'Нет'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100 font-bold">
                      <tr>
                        <td className="px-4 py-3 text-gray-800" colSpan={5}>ИТОГО</td>
                        <td className="px-4 py-3 text-right text-gray-800">
                          {totalProductQuantity.toLocaleString()} ед.
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                  {getFilteredProducts.length > 100 && (
                    <div className="text-center py-4 text-gray-500 bg-gray-50">
                      Показано 100 из {getFilteredProducts.length} товаров
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-400">
                  Нет товаров
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== TOP PRODUCTS ANALYTICS ========== */}
      {!loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div 
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50"
            onClick={() => toggleSection('topProducts')}
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-800">Аналитика товаров</h2>
              <span className="text-sm text-green-600">
                {productSalesAnalytics.totalSoldProducts} проданных наименований
              </span>
            </div>
            {expandedSections.topProducts ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>

          {expandedSections.topProducts && (
            <div className="border-t border-gray-100 p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {/* Самый продаваемый */}
                {productSalesAnalytics.bestSeller && (
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🏆</span>
                      <span className="text-sm font-medium text-green-700">Лидер продаж</span>
                    </div>
                    <div className="text-lg font-bold text-green-900 truncate" title={productSalesAnalytics.bestSeller.name}>
                      {productSalesAnalytics.bestSeller.name}
                    </div>
                    <div className="text-sm text-green-700 mt-1">
                      Продано: <strong>{productSalesAnalytics.bestSeller.totalSold} шт.</strong>
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      Выручка: {formatPrice(productSalesAnalytics.bestSeller.totalRevenue)} • Прибыль: {formatPrice(productSalesAnalytics.bestSeller.totalProfit)}
                    </div>
                  </div>
                )}

                {/* Самый прибыльный */}
                {productSalesAnalytics.mostProfitable && (
                  <div className="bg-gradient-to-br from-yellow-50 to-amber-100 rounded-xl p-4 border border-yellow-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">💰</span>
                      <span className="text-sm font-medium text-yellow-700">Самый прибыльный</span>
                    </div>
                    <div className="text-lg font-bold text-yellow-900 truncate" title={productSalesAnalytics.mostProfitable.name}>
                      {productSalesAnalytics.mostProfitable.name}
                    </div>
                    <div className="text-sm text-yellow-700 mt-1">
                      Прибыль: <strong>{formatPrice(productSalesAnalytics.mostProfitable.totalProfit)}</strong>
                    </div>
                    <div className="text-xs text-yellow-600 mt-1">
                      Наценка: +{productSalesAnalytics.mostProfitable.markupPercent.toFixed(0)}% • Продано: {productSalesAnalytics.mostProfitable.totalSold} шт.
                    </div>
                  </div>
                )}

                {/* Самый дорогой */}
                {productSalesAnalytics.mostExpensive && (
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">💎</span>
                      <span className="text-sm font-medium text-purple-700">Самый дорогой</span>
                    </div>
                    <div className="text-lg font-bold text-purple-900 truncate" title={productSalesAnalytics.mostExpensive.name}>
                      {productSalesAnalytics.mostExpensive.name}
                    </div>
                    <div className="text-sm text-purple-700 mt-1">
                      Цена продажи: <strong>{formatPrice(productSalesAnalytics.mostExpensive.sellingPrice)}</strong>
                    </div>
                    <div className="text-xs text-purple-600 mt-1">
                      Себестоимость: {formatPrice(productSalesAnalytics.mostExpensive.price)} • Наценка: +{productSalesAnalytics.mostExpensive.markupPercent.toFixed(0)}%
                    </div>
                  </div>
                )}

                {/* Самый дешёвый */}
                {productSalesAnalytics.cheapest && (
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🏷️</span>
                      <span className="text-sm font-medium text-blue-700">Самый дешёвый</span>
                    </div>
                    <div className="text-lg font-bold text-blue-900 truncate" title={productSalesAnalytics.cheapest.name}>
                      {productSalesAnalytics.cheapest.name}
                    </div>
                    <div className="text-sm text-blue-700 mt-1">
                      Цена продажи: <strong>{formatPrice(productSalesAnalytics.cheapest.sellingPrice)}</strong>
                    </div>
                    <div className="text-xs text-blue-600 mt-1">
                      Себестоимость: {formatPrice(productSalesAnalytics.cheapest.price)} • Продано: {productSalesAnalytics.cheapest.totalSold} шт.
                    </div>
                  </div>
                )}

                {/* Наименее продаваемый */}
                {productSalesAnalytics.worstSeller && productSalesAnalytics.totalSoldProducts > 1 && (
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">📉</span>
                      <span className="text-sm font-medium text-orange-700">Меньше всего продаж</span>
                    </div>
                    <div className="text-lg font-bold text-orange-900 truncate" title={productSalesAnalytics.worstSeller.name}>
                      {productSalesAnalytics.worstSeller.name}
                    </div>
                    <div className="text-sm text-orange-700 mt-1">
                      Продано: <strong>{productSalesAnalytics.worstSeller.totalSold} шт.</strong>
                    </div>
                    <div className="text-xs text-orange-600 mt-1">
                      Выручка: {formatPrice(productSalesAnalytics.worstSeller.totalRevenue)}
                    </div>
                  </div>
                )}

                {/* Товары без продаж */}
                {productSalesAnalytics.unsoldProducts.length > 0 && (
                  <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🚫</span>
                      <span className="text-sm font-medium text-red-700">Без продаж</span>
                    </div>
                    <div className="text-lg font-bold text-red-900">
                      {productSalesAnalytics.unsoldProducts.length} товаров
                    </div>
                    <div className="text-xs text-red-600 mt-2 max-h-20 overflow-y-auto">
                      {productSalesAnalytics.unsoldProducts.slice(0, 5).map((p, i) => (
                        <div key={i} className="truncate" title={p.name}>
                          • {p.name}
                        </div>
                      ))}
                      {productSalesAnalytics.unsoldProducts.length > 5 && (
                        <div className="text-red-500 font-medium mt-1">
                          +{productSalesAnalytics.unsoldProducts.length - 5} ещё...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Пустое состояние */}
              {productSalesAnalytics.totalSoldProducts === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Нет данных о продажах за выбранный период</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== СЕКЦИЯ: ЗАКУПКИ ТОВАРОВ ========== */}
      {(viewMode === 'all' || selectedCompanyId) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden mb-6">
          <button
            onClick={() => toggleSection('purchases')}
            className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 hover:from-indigo-100 hover:to-indigo-200 dark:hover:from-indigo-800/30 dark:hover:to-indigo-700/30 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500 rounded-lg">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  📦 Аналитика закупок товаров
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  История и статистика закупок по {viewMode === 'all' ? 'всем компаниям' : 'выбранной компании'}
                </p>
              </div>
            </div>
            {expandedSections.purchases ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </button>

          {expandedSections.purchases && (
            <div className="p-6">
              {viewMode === 'single' && selectedCompanyId ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 mb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <Building2 className="w-6 h-6 text-blue-600" />
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        Аналитика закупок для выбранной компании
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        ID компании: {selectedCompanyId}
                      </p>
                    </div>
                  </div>
                  {/* Используем компонент PurchaseAnalytics для отображения */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <iframe
                      src={`#purchases-analytics-${selectedCompanyId}`}
                      style={{ display: 'none' }}
                    />
                    <p className="text-center text-gray-600 dark:text-gray-400 py-8">
                      Для просмотра детальной аналитики закупок перейдите в панель компании
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Package className="w-5 h-5 text-indigo-600" />
                      Общая статистика закупок
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Всего компаний закупают товары</p>
                        <p className="text-2xl font-bold text-indigo-600">
                          {companies.length}
                        </p>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Примерно закупок</p>
                        <p className="text-2xl font-bold text-purple-600">
                          —
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Требуется агрегация данных
                        </p>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Общая сумма закупок</p>
                        <p className="text-2xl font-bold text-green-600">
                          —
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Требуется агрегация данных
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded-lg">
                        <Eye className="w-5 h-5 text-yellow-600" />
                      </div>
                    </div>
                    <div>
                      <h5 className="font-medium text-gray-900 dark:text-white mb-1">
                        💡 Совет: Используйте режим "Одна компания"
                      </h5>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Для просмотра детальной аналитики закупок выберите конкретную компанию 
                        или перейдите в панель компании.
                      </p>
                    </div>
                  </div>

                  <div className="text-center py-12 text-gray-400">
                    <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">
                      Детальная аналитика закупок доступна для каждой компании
                    </p>
                    <p className="text-sm">
                      Выберите компанию выше, чтобы увидеть сводку по закупкам
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== FOOTER INFO ========== */}
      <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>
          📊 Панель аналитики для администратора • Только просмотр • Обновлено: {new Date().toLocaleTimeString('ru-RU')}
        </p>
      </div>
    </div>
  );
}
