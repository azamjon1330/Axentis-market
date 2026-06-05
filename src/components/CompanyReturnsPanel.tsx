import { useState, useEffect } from 'react';
import { RotateCcw, Check, X, CreditCard } from 'lucide-react';
import api from '../utils/api';

interface ReturnRequest {
  id: number;
  orderId?: number;
  customerPhone: string;
  reason: string;
  refundAmount: number;
  status: 'requested' | 'approved' | 'rejected' | 'refunded';
  comment?: string;
  createdAt: string;
}

interface CompanyReturnsPanelProps {
  companyId: number;
}

const STATUS_LABEL: Record<string, string> = {
  requested: 'Запрошен',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  refunded: 'Возвращены деньги',
};

const STATUS_STYLE: Record<string, string> = {
  requested: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  refunded: 'bg-green-100 text-green-700',
};

/**
 * Seller panel for handling customer return / refund requests.
 * Backend: /api/returns.
 */
export default function CompanyReturnsPanel({ companyId }: CompanyReturnsPanelProps) {
  const [items, setItems] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.returns.listByCompany(companyId);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Load returns failed:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const setStatus = async (id: number, status: string) => {
    try {
      await api.returns.updateStatus(id, status);
      await load();
    } catch (e) {
      console.error('Update return status failed:', e);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <RotateCcw className="w-6 h-6 text-orange-600" />
        <h2 className="text-lg font-bold">Возвраты</h2>
      </div>

      {loading ? (
        <p className="text-gray-400">Загрузка...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400">Заявок на возврат пока нет</p>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">Заявка #{r.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] || ''}`}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </div>
              <p className="text-sm text-gray-600">📞 {r.customerPhone}</p>
              {r.orderId && <p className="text-sm text-gray-600">Заказ #{r.orderId}</p>}
              {r.reason && <p className="text-sm text-gray-700 mt-1">Причина: {r.reason}</p>}
              <p className="text-sm font-medium mt-1">К возврату: {r.refundAmount} сум</p>
              <p className="text-xs text-gray-400 mt-1">
                {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
              </p>

              {r.status === 'requested' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setStatus(r.id, 'approved')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm active:scale-95"
                  >
                    <Check className="w-4 h-4" /> Одобрить
                  </button>
                  <button
                    onClick={() => setStatus(r.id, 'rejected')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm active:scale-95"
                  >
                    <X className="w-4 h-4" /> Отклонить
                  </button>
                </div>
              )}
              {r.status === 'approved' && (
                <button
                  onClick={() => setStatus(r.id, 'refunded')}
                  className="flex items-center gap-1 px-3 py-1.5 mt-3 rounded-lg bg-green-600 text-white text-sm active:scale-95"
                >
                  <CreditCard className="w-4 h-4" /> Деньги возвращены
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
