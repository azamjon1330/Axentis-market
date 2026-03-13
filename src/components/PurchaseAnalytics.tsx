import React, { useState, useEffect } from 'react';
import { Package, TrendingUp, DollarSign } from 'lucide-react';
import api from '../utils/api';
import CompactPeriodSelector from './CompactPeriodSelector';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface PurchaseAnalyticsProps {
  companyId: number;
}

interface Purchase {
  id: number;
  productName: string;
  quantity: number;
  totalCost: number;
  purchaseDate: string;
}

interface PurchaseStats {
  totalPurchases: number;
  totalQuantity: number;
  totalCost: number;
}

export default function PurchaseAnalytics({ companyId }: PurchaseAnalyticsProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<PurchaseStats>({
    totalPurchases: 0,
    totalQuantity: 0,
    totalCost: 0,
  });
  const [loading, setLoading] = useState(true);

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
          Аналитика закупок
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Статистика и тренды закупок товаров
        </p>
      </div>

      {/* Period Selector */}
      <CompactPeriodSelector
        value={timePeriod}
        onChange={setTimePeriod}
      />

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Закупок</p>
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
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">Товаров</p>
              <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                {stats.totalQuantity}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-500 rounded-lg">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-orange-700 dark:text-orange-300 font-medium">Потрачено</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {stats.totalCost.toLocaleString()} сум
              </p>
            </div>
          </div>
        </div>
      </div>

      {purchases.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Нет данных о закупках за выбранный период
          </p>
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Purchases Over Time */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Динамика закупок
              </h4>
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
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Топ товаров по закупкам
              </h4>
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
                Последние закупки
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Дата
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Товар
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Количество
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Сумма
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {purchases.slice(0, 10).map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {new Date(purchase.purchaseDate).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {purchase.productName}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                        {purchase.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                        {purchase.totalCost.toLocaleString()} сум
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
