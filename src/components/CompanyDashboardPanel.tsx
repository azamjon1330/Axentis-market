import { useState, useEffect } from 'react';
import {
  ShoppingCart, TrendingUp, Clock, RotateCcw, AlertTriangle,
  MessageCircleQuestion, Package, BarChart3,
} from 'lucide-react';
import api from '../utils/api';

interface DashboardData {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  totalRevenue: number;
  pendingReturns: number;
  lowStock: number;
  unansweredQuestions: number;
  totalProducts: number;
  soldUnits: number;
  recentOrders: Array<{
    id: number;
    customerName: string;
    totalAmount: number;
    status: string;
    orderCode: string;
    createdAt: string;
  }>;
}

interface CompanyDashboardPanelProps {
  companyId: number;
  onNavigate?: (tab: string) => void;
}

const fmt = (n: number) => (n || 0).toLocaleString('ru-RU');

/**
 * Unified seller dashboard — one screen with everything that needs attention:
 * today's orders/revenue, pending work (orders, returns, low stock, questions)
 * and the latest orders. Backend: /api/analytics/company/:id/dashboard.
 */
export default function CompanyDashboardPanel({ companyId, onNavigate }: CompanyDashboardPanelProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.analytics
      .dashboard(companyId)
      .then((d) => active && setData(d))
      .catch((e) => console.error('Dashboard load failed:', e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [companyId]);

  if (loading) return <p className="text-gray-400 p-4">Загрузка...</p>;
  if (!data) return <p className="text-gray-400 p-4">Не удалось загрузить дашборд</p>;

  const stat = (icon: React.ReactNode, label: string, value: string, color: string) => (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className={`inline-flex p-2 rounded-xl mb-2 ${color}`}>{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );

  const attentionCard = (
    icon: React.ReactNode, label: string, count: number, color: string, tab?: string,
  ) => {
    if (!count) return null;
    return (
      <button
        onClick={() => tab && onNavigate?.(tab)}
        className={`flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all active:scale-[0.98] ${color}`}
      >
        {icon}
        <span className="flex-1 text-sm font-medium">{label}</span>
        <span className="text-lg font-bold">{count}</span>
      </button>
    );
  };

  const statusLabel: Record<string, string> = {
    pending: 'Новый', confirmed: 'Принят', processing: 'В обработке',
    shipped: 'В пути', delivered: 'Доставлен', completed: 'Завершён', cancelled: 'Отменён',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3">
        {stat(<ShoppingCart className="w-5 h-5 text-blue-600" />, 'Заказы сегодня', fmt(data.todayOrders), 'bg-blue-50')}
        {stat(<TrendingUp className="w-5 h-5 text-green-600" />, 'Выручка сегодня', fmt(data.todayRevenue), 'bg-green-50')}
        {stat(<BarChart3 className="w-5 h-5 text-purple-600" />, 'Выручка всего', fmt(data.totalRevenue), 'bg-purple-50')}
        {stat(<Package className="w-5 h-5 text-orange-600" />, 'Продано единиц', fmt(data.soldUnits), 'bg-orange-50')}
      </div>

      {/* Needs attention */}
      {(data.pendingOrders || data.pendingReturns || data.lowStock || data.unansweredQuestions) ? (
        <div>
          <h3 className="font-semibold mb-2 text-gray-700">Требует внимания</h3>
          <div className="space-y-2">
            {attentionCard(<Clock className="w-5 h-5 text-yellow-600" />, 'Новые заказы', data.pendingOrders, 'bg-yellow-50 text-yellow-800', 'orders')}
            {attentionCard(<RotateCcw className="w-5 h-5 text-orange-600" />, 'Заявки на возврат', data.pendingReturns, 'bg-orange-50 text-orange-800', 'returns')}
            {attentionCard(<AlertTriangle className="w-5 h-5 text-red-600" />, 'Товары заканчиваются', data.lowStock, 'bg-red-50 text-red-800', 'warehouse')}
            {attentionCard(<MessageCircleQuestion className="w-5 h-5 text-blue-600" />, 'Вопросы без ответа', data.unansweredQuestions, 'bg-blue-50 text-blue-800', 'questions')}
          </div>
        </div>
      ) : (
        <div className="bg-green-50 text-green-700 rounded-xl p-3 text-sm text-center">
          Всё под контролем — нет задач, требующих внимания 🎉
        </div>
      )}

      {/* Recent orders */}
      <div>
        <h3 className="font-semibold mb-2 text-gray-700">Последние заказы</h3>
        {data.recentOrders.length === 0 ? (
          <p className="text-gray-400 text-sm">Заказов пока нет</p>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            {data.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium text-sm">{o.customerName || 'Покупатель'}</div>
                  <div className="text-xs text-gray-400">№{o.orderCode}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">{fmt(o.totalAmount)} сум</div>
                  <div className="text-xs text-gray-500">{statusLabel[o.status] || o.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
