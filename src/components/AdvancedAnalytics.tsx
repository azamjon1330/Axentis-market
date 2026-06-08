import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Package, DollarSign, ShoppingCart, Calendar, Download, Award } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCurrentLanguage, type Language } from '../utils/translations';
import { usePolling } from '../hooks/usePolling';

interface AdvancedAnalyticsProps {
  companyId?: number;
}

// One plotted bucket as returned by the granularity-aware time-series endpoint
// (GET /api/analytics/company/:companyId/timeseries — backend task 9.1).
interface TimeseriesBucket {
  bucket: string; // ISO-8601 UTC bucket start
  orders: number;
  revenue: number;
}

// Full time-series response: a granularity label plus two index-aligned series
// (Current_Period and Previous_Period) of equal length (Req 4.6, 4.7).
interface TimeseriesResponse {
  granularity: string; // "hour" | "12-hour" | "day" | "week"
  current: TimeseriesBucket[];
  previous: TimeseriesBucket[];
}

// Maps the UI's existing time-range selector to the backend `range` param.
// (week→weekly, month→monthly, year→yearly; a daily option would map to daily.)
const RANGE_PARAM: Record<'week' | 'month' | 'year', string> = {
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};

// Window length used to derive [from, to) for the selected range. These match
// the backend's default span per range so buckets tile a natural period.
const RANGE_SPAN_MS: Record<'week' | 'month' | 'year', number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

export default function AdvancedAnalytics({ companyId }: AdvancedAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');
  const [salesData, setSalesData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalProfit: 0,
    totalOrders: 0,
    averageOrderValue: 0
  });
  
  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent) => {
      setLanguage(e.detail);
    };
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => window.removeEventListener('languageChange', handleLanguageChange as EventListener);
  }, []);

  // Stable fetcher for the analytics sales data. `timeRange` is included so that
  // changing the selected period restarts the poll and re-fetches immediately.
  const fetchSales = useCallback(async (): Promise<any[]> => {
    // Загружаем историю продаж через правильный API endpoint
    const response = await fetch(
      `/api/sales?companyId=${companyId || ''}`,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to load analytics: ${response.status}`);
    }
    const sales = await response.json();
    console.log('📊 Loaded sales:', Array.isArray(sales) ? sales.length : 0, 'records');
    return Array.isArray(sales) ? sales : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, timeRange]);

  // Auto-refresh analytics data via the reusable polling hook (Req 2.1–2.3).
  // On fetch failure the last good data is retained; on success it updates in place.
  const sales = usePolling<any[]>(fetchSales, 20000);

  // Stable fetcher for the Orders & Revenue time-series. Keyed by companyId +
  // timeRange so switching the period restarts the poll and refetches the right
  // range. Maps the UI range to the backend `range` param and computes the
  // [from, to) window for the selected period (Req 4.1–4.7).
  const fetchTimeseries = useCallback(async (): Promise<TimeseriesResponse> => {
    const empty: TimeseriesResponse = { granularity: '', current: [], previous: [] };
    if (!companyId) {
      // The endpoint is scoped to a single company; without one there is no series.
      return empty;
    }
    const backendRange = RANGE_PARAM[timeRange];
    const to = new Date();
    const from = new Date(to.getTime() - RANGE_SPAN_MS[timeRange]);
    const params = new URLSearchParams({
      range: backendRange,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const response = await fetch(
      `/api/analytics/company/${companyId}/timeseries?${params.toString()}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (!response.ok) {
      throw new Error(`Failed to load timeseries: ${response.status}`);
    }
    const json = await response.json();
    return {
      granularity: typeof json?.granularity === 'string' ? json.granularity : '',
      current: Array.isArray(json?.current) ? json.current : [],
      previous: Array.isArray(json?.previous) ? json.previous : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, timeRange]);

  // Poll the two-line Orders & Revenue series alongside the rest of the dashboard.
  const timeseries = usePolling<TimeseriesResponse>(fetchTimeseries, 20000);

  // Recompute derived chart/stat state whenever fresh sales data arrives.
  useEffect(() => {
    if (sales === null) return;
    processSalesData(sales);
    processTopProducts(sales);
    processCategoryData(sales);
    calculateStats(sales);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales]);

  const processSalesData = (sales: any[]) => {
    // Группируем продажи по дням
    const grouped: { [key: string]: { revenue: number; profit: number; orders: number } } = {};
    
    sales.forEach(sale => {
      const date = new Date(sale.created_at).toLocaleDateString('ru-RU');
      
      if (!grouped[date]) {
        grouped[date] = { revenue: 0, profit: 0, orders: 0 };
      }
      
      const revenue = sale.total_amount || 0;
      const purchasePrice = (sale.items || []).reduce((sum: number, item: any) => 
        sum + (item.purchase_price || 0) * item.quantity, 0
      );
      const profit = revenue - purchasePrice;
      
      grouped[date].revenue += revenue;
      grouped[date].profit += profit;
      grouped[date].orders += 1;
    });

    const chartData = Object.entries(grouped)
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        profit: data.profit,
        orders: data.orders
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30); // Последние 30 дней

    setSalesData(chartData);
  };

  const processTopProducts = (sales: any[]) => {
    // Считаем продажи по товарам
    const products: { [key: string]: { name: string; quantity: number; revenue: number } } = {};
    
    console.log('🔍 Processing', sales.length, 'sales for top products');
    
    sales.forEach((sale, saleIndex) => {
      (sale.items || []).forEach((item: any) => {
        const productKey = `${item.product_id || item.productId}_${item.name}`;
        
        if (!products[productKey]) {
          products[productKey] = {
            name: item.name,
            quantity: 0,
            revenue: 0
          };
        }
        
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const itemRevenue = price * qty;
        
        products[productKey].quantity += qty;
        products[productKey].revenue += itemRevenue;
        
        console.log(`  Sale #${saleIndex}: ${item.name} x${qty} @ ${price} = ${itemRevenue}`);
      });
    });

    const top = Object.values(products)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    console.log('📊 Top products:', top);
    setTopProducts(top);
  };

  const processCategoryData = (sales: any[]) => {
    // Здесь можно добавить группировку по категориям
    // Пока используем заглушку
    const categories = [
      { name: 'Электроника', value: 0, color: '#3b82f6' },
      { name: 'Одежда', value: 0, color: '#10b981' },
      { name: 'Продукты', value: 0, color: '#f59e0b' },
      { name: 'Аксессуары', value: 0, color: '#8b5cf6' },
      { name: 'Другое', value: 0, color: '#6b7280' }
    ];

    setCategoryData(categories);
  };

  const calculateStats = (sales: any[]) => {
    let totalRevenue = 0;
    let totalProfit = 0;
    const totalOrders = sales.length;

    sales.forEach(sale => {
      const revenue = sale.total_amount || 0;
      const purchasePrice = (sale.items || []).reduce((sum: number, item: any) => 
        sum + (item.purchase_price || 0) * item.quantity, 0
      );
      
      totalRevenue += revenue;
      totalProfit += revenue - purchasePrice;
    });

    setStats({
      totalRevenue,
      totalProfit,
      totalOrders,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
    });
  };

  const exportToExcel = () => {
    // Формируем CSV данные
    const csv = [
      ['Дата', 'Выручка', 'Прибыль', 'Заказы'],
      ...salesData.map(row => [row.date, row.revenue, row.profit, row.orders])
    ].map(row => row.join(',')).join('\n');

    // Скачиваем файл
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analytics_${timeRange}_${new Date().toISOString()}.csv`;
    link.click();
  };

  // Locale used for X-axis tick + tooltip date formatting, reactive to language.
  const dateLocale = language === 'uz' ? 'uz-UZ' : 'ru-RU';

  // Format an ISO bucket start into an axis tick based on the backend-provided
  // `granularity` (hour / 12-hour / day / week) so ticks match the range (Req 4.x).
  const formatTick = (iso: string, granularity: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    switch (granularity) {
      case 'hour':
        return d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
      case '12-hour':
        return d.toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit' });
      case 'day':
        return d.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' });
      case 'week':
        return d.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' });
      default:
        return d.toLocaleDateString(dateLocale);
    }
  };

  // Build the two-line Orders & Revenue dataset: Current_Period and
  // Previous_Period, index-aligned by bucket position (Req 4.6, 4.7). Only
  // in-range buckets returned by the endpoint are plotted (Req 4.1).
  const granularity = timeseries?.granularity ?? '';
  const ordersRevenueData = (timeseries?.current ?? []).map((cur, i) => {
    const prev = timeseries?.previous?.[i];
    return {
      label: formatTick(cur.bucket, granularity),
      current: cur.revenue,
      previous: prev ? prev.revenue : 0,
    };
  });
  const currentPeriodLabel = language === 'uz' ? 'Joriy davr' : 'Текущий период';
  const previousPeriodLabel = language === 'uz' ? 'Oldingi davr' : 'Предыдущий период';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок и фильтры */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">📊 {language === 'uz' ? 'Kengaytirilgan tahlil' : 'Расширенная аналитика'}</h2>
        
        <div className="flex items-center gap-3">
          {/* Выбор периода */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="week">{language === 'uz' ? 'Hafta' : 'Неделя'}</option>
            <option value="month">{language === 'uz' ? 'Oy' : 'Месяц'}</option>
            <option value="year">{language === 'uz' ? 'Yil' : 'Год'}</option>
          </select>

          {/* Кнопка экспорта */}
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            {language === 'uz' ? 'Excel eksport' : 'Экспорт Excel'}
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 opacity-80" />
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-sm opacity-90">{language === 'uz' ? 'Tushum' : 'Выручка'}</p>
          <p className="text-3xl font-bold mt-1">{stats.totalRevenue.toLocaleString()} {language === 'uz' ? "so'm" : '₸'}</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Award className="w-8 h-8 opacity-80" />
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-sm opacity-90">{language === 'uz' ? 'Foyda' : 'Прибыль'}</p>
          <p className="text-3xl font-bold mt-1">{stats.totalProfit.toLocaleString()} {language === 'uz' ? "so'm" : '₸'}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <ShoppingCart className="w-8 h-8 opacity-80" />
            <Calendar className="w-5 h-5" />
          </div>
          <p className="text-sm opacity-90">{language === 'uz' ? 'Buyurtmalar' : 'Заказы'}</p>
          <p className="text-3xl font-bold mt-1">{stats.totalOrders}</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 opacity-80" />
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-sm opacity-90">{language === 'uz' ? 'O\'rtacha chek' : 'Средний чек'}</p>
          <p className="text-3xl font-bold mt-1">{Math.round(stats.averageOrderValue).toLocaleString()} ₸</p>
        </div>
      </div>

      {/* График продаж — Orders & Revenue: two index-aligned lines (Current vs Previous period) */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">{language === 'uz' ? 'Sotish dinamikasi' : 'Динамика продаж'}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={ordersRevenueData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="current" stroke="#3b82f6" name={currentPeriodLabel} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="previous" stroke="#9ca3af" name={previousPeriodLabel} strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ТОП товаров */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">{language === 'uz' ? 'TOP-10 tovarlar (tushum bo\'yicha)' : 'ТОП-10 товаров по выручке'}</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={topProducts}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="revenue" fill="#3b82f6" name={language === 'uz' ? 'Tushum' : 'Выручка'} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Продажи по категориям */}
      {categoryData.some(c => c.value > 0) && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">{language === 'uz' ? 'Kategoriyalar bo\'yicha sotish' : 'Продажи по категориям'}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}


