import React, { useState, useEffect } from 'react';
import { Package, TrendingUp, DollarSign, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import api from '../utils/api';
import CompactPeriodSelector from './CompactPeriodSelector';
import { getCurrentLanguage, type Language } from '../utils/translations';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface PurchaseAnalyticsProps {
  companyId: number;
}

interface ImportDetail {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface Purchase {
  id: number;
  productName: string;
  quantity: number;
  totalCost: number;
  purchaseDate: string;
  notes?: string; // JSON string with import details
}

interface PurchaseStats {
  totalPurchases: number;
  totalQuantity: number;
  totalCost: number;
}

export default function PurchaseAnalytics({ companyId }: PurchaseAnalyticsProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<PurchaseStats>({
    totalPurchases: 0,
    totalQuantity: 0,
    totalCost: 0,
  });
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());

  // Listen for language changes
  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent) => {
      setLanguage(e.detail);
    };
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => window.removeEventListener('languageChange', handleLanguageChange as EventListener);
  }, []);

  // Filter state
  type PeriodType = 'day' | 'yesterday' | 'week' | 'month' | 'year' | 'all';
  const [timePeriod, setTimePeriod] = useState<PeriodType>('month');

  useEffect(() => {
    loadData();
  }, [companyId, timePeriod]);

  const loadData = async () => {
    try {
      setLoading(true);

      const params: any = { companyId };
      
      // Apply time period filter
      if (timePeriod !== 'all') {
        const now = new Date();
        let startDate = new Date();

        switch (timePeriod) {
          case 'day':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'yesterday':
            startDate.setDate(now.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(now.getMonth() - 1);
            break;
          case 'year':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        }

        params.startDate = startDate.toISOString();
        
        if (timePeriod === 'yesterday') {
          const endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          params.endDate = endDate.toISOString();
        }
      }

      // Load purchases and stats
      const [purchasesData, statsData] = await Promise.all([
        api.productPurchases.list(params),
        api.productPurchases.stats(params),
      ]);

      setPurchases(purchasesData?.purchases || []);
      setStats(statsData || { totalPurchases: 0, totalQuantity: 0, totalCost: 0 });
      
    } catch (error) {
      console.error('❌ Error loading purchase analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle row expansion
  const toggleRow = (purchaseId: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(purchaseId)) {
        newSet.delete(purchaseId);
      } else {
        newSet.add(purchaseId);
      }
      return newSet;
    });
  };

  // Parse import details from notes
  const getImportDetails = (purchase: Purchase): ImportDetail[] | null => {
    if (!purchase.notes) return null;
    try {
      return JSON.parse(purchase.notes);
    } catch {
      return null;
    }
  };

  // Format date with time
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU');
    const timeStr = date.toLocaleTimeString(language === 'uz' ? 'uz-UZ' : 'ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    return { dateStr, timeStr };
  };

  // Prepare chart data - group by date
  const chartData = React.useMemo(() => {
    const grouped: Record<string, { date: string; quantity: number; cost: number }> = {};

    purchases.forEach(purchase => {
      const date = new Date(purchase.purchaseDate).toLocaleDateString('uz-UZ');
      if (!grouped[date]) {
        grouped[date] = { date, quantity: 0, cost: 0 };
      }
      grouped[date].quantity += purchase.quantity;
      grouped[date].cost += purchase.totalCost;
    });

    return Object.values(grouped).sort((a, b) => 
      new Date(a.date.split('.').reverse().join('-')).getTime() - 
      new Date(b.date.split('.').reverse().join('-')).getTime()
    );
  }, [purchases]);

  // Top products by purchase quantity
  const topProducts = React.useMemo(() => {
    const productMap: Record<string, { name: string; quantity: number; cost: number }> = {};

    purchases.forEach(purchase => {
      if (!productMap[purchase.productName]) {
        productMap[purchase.productName] = {
          name: purchase.productName,
          quantity: 0,
          cost: 0,
        };
      }
      productMap[purchase.productName].quantity += purchase.quantity;
      productMap[purchase.productName].cost += purchase.totalCost;
    });

    return Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [purchases]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Package className="w-6 h-6 text-blue-600" />
          {language === 'uz' ? 'Xaridlar tahlili' : 'Аналитика закупок'}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {language === 'uz' ? 'Tovar xaridlari statistikasi va trendlari' : 'Статистика и тренды закупок товаров'}
        </p>
      </div>

      {/* Period Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          {language === 'uz' ? '📅 Davr tanlang:' : '📅 Выберите период:'}
        </label>
        <CompactPeriodSelector
          value={timePeriod}
          onChange={setTimePeriod}
          language={language}
        />
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                {language === 'uz' ? 'Xaridlar' : 'Закупок'}
              </p>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                {stats.totalPurchases}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-500 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                {language === 'uz' ? 'Tovarlar' : 'Товаров'}
              </p>
              <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                {stats.totalQuantity}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500 rounded-lg">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                {language === 'uz' ? 'Sarflangan' : 'Потрачено'}
              </p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {stats.totalCost.toLocaleString()} {language === 'uz' ? 'so\'m' : 'сум'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {purchases.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            {language === 'uz' ? 'Tanlangan davr uchun xarid ma\'lumotlari yo\'q' : 'Нет данных о закупках за выбранный период'}
          </p>
        </div>
      ) : (
        <>
            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Purchases Over Time */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {language === 'uz' ? 'Xaridlar dinamikasi' : 'Динамика закупок'}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {language === 'uz' ? 'Xaridlar summasi o\'zgarishi vaqt bo\'yicha' : 'Изменение суммы закупок по времени'}
                </p>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#F9FAFB'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cost" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    name="Сумма (сум)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

              {/* Top Products */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {language === 'uz' ? 'Top 5 tovarlar' : 'Топ товаров по закупкам'}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {language === 'uz' ? 'Eng ko\'p sotib olingan tovarlar' : 'Самые покупаемые товары'}
                </p>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#F9FAFB'
                    }}
                  />
                  <Bar dataKey="quantity" fill="#10B981" name="Количество" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Purchases Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                {language === 'uz' ? 'So\'nggi xaridlar' : 'Последние закупки'}
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-purple-600 to-blue-600">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase">
                      {language === 'uz' ? 'Sana va vaqt' : 'Дата и время'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase">
                      {language === 'uz' ? 'Tovar' : 'Товар'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-white uppercase">
                      {language === 'uz' ? 'Miqdori' : 'Количество'}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-white uppercase">
                      {language === 'uz' ? 'Summa' : 'Сумма'}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase">
                      {language === 'uz' ? 'Batafsil' : 'Подробнее'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {purchases.map((purchase) => {
                    const importDetails = getImportDetails(purchase);
                    const isExpanded = expandedRows.has(purchase.id);
                    const { dateStr, timeStr } = formatDateTime(purchase.purchaseDate);
                    const hasDetails = importDetails && importDetails.length > 0;

                    return (
                      <React.Fragment key={purchase.id}>
                        {/* Main row */}
                        <tr className={`${isExpanded ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                              <Clock className="w-4 h-4 text-gray-500" />
                              <div>
                                <div>{dateStr}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{timeStr}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                            {purchase.productName}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                            {hasDetails ? `${importDetails.length} ${language === 'uz' ? 'tur' : 'видов'}` : purchase.quantity}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                            {purchase.totalCost.toLocaleString()} {language === 'uz' ? 'so\'m' : 'сум'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {hasDetails && (
                              <button
                                onClick={() => toggleRow(purchase.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-4 h-4" />
                                    {language === 'uz' ? 'Yopish' : 'Скрыть'}
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-4 h-4" />
                                    {language === 'uz' ? 'Ko\'rish' : 'Показать'}
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && hasDetails && (
                          <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                            <td colSpan={5} className="px-4 py-4">
                              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                                <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                  {language === 'uz' 
                                    ? `Import tafsilotlari (${importDetails.length} tovar):`
                                    : `Детали импорта (${importDetails.length} товаров):`
                                  }
                                </h5>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-100 dark:bg-gray-700">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">
                                          {language === 'uz' ? 'Tovar nomi' : 'Название товара'}
                                        </th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400">
                                          {language === 'uz' ? 'Miqdori' : 'Количество'}
                                        </th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400">
                                          {language === 'uz' ? 'Narxi' : 'Цена'}
                                        </th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400">
                                          {language === 'uz' ? 'Jami' : 'Сумма'}
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                      {importDetails.map((detail, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                          <td className="px-3 py-2 text-gray-900 dark:text-white">
                                            {detail.name}
                                          </td>
                                          <td className="px-3 py-2 text-right text-gray-900 dark:text-white">
                                            {detail.quantity}
                                          </td>
                                          <td className="px-3 py-2 text-right text-gray-900 dark:text-white">
                                            {detail.price.toLocaleString()} {language === 'uz' ? 'so\'m' : 'сум'}
                                          </td>
                                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">
                                            {detail.total.toLocaleString()} {language === 'uz' ? 'so\'m' : 'сум'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
