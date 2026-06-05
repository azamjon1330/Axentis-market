import { useState, useEffect } from 'react';
import { Ticket, Plus, Trash2, Power } from 'lucide-react';
import api from '../utils/api';

interface PromoCode {
  id: number;
  code: string;
  description?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  perUserLimit: number;
  expiresAt?: string;
  isActive: boolean;
}

interface CompanyPromoCodesPanelProps {
  companyId: number;
}

/**
 * Seller panel for creating and managing promo codes.
 * Backend: /api/promo-codes.
 */
export default function CompanyPromoCodesPanel({ companyId }: CompanyPromoCodesPanelProps) {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discountType: 'percent' as 'percent' | 'fixed',
    discountValue: 10,
    minOrderAmount: 0,
    maxDiscount: '',
    usageLimit: '',
    perUserLimit: 1,
    expiresAt: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.promoCodes.listByCompany(companyId);
      setCodes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Load promo codes failed:', e);
      setCodes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleCreate = async () => {
    if (!form.code.trim()) {
      alert('Введите код промокода');
      return;
    }
    setSaving(true);
    try {
      await api.promoCodes.create({
        companyId,
        code: form.code.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderAmount: Number(form.minOrderAmount) || 0,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perUserLimit: Number(form.perUserLimit) || 1,
        expiresAt: form.expiresAt || null,
      });
      setForm({ ...form, code: '', maxDiscount: '', usageLimit: '' });
      await load();
    } catch (e: any) {
      alert(e?.message || 'Не удалось создать промокод');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (c: PromoCode) => {
    try {
      await api.promoCodes.toggle(c.id, !c.isActive);
      await load();
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить промокод?')) return;
    try {
      await api.promoCodes.delete(id);
      await load();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm';

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Ticket className="w-6 h-6 text-purple-600" />
        <h2 className="text-lg font-bold">Промокоды</h2>
      </div>

      {/* Create form */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
        <h3 className="font-semibold mb-3">Создать промокод</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500">Код</label>
            <input
              className={input}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="SALE20"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Тип скидки</label>
            <select
              className={input}
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as any })}
            >
              <option value="percent">Процент (%)</option>
              <option value="fixed">Фикс. сумма</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Значение</label>
            <input
              type="number"
              className={input}
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Мин. сумма заказа</label>
            <input
              type="number"
              className={input}
              value={form.minOrderAmount}
              onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Макс. скидка (для %)</label>
            <input
              type="number"
              className={input}
              value={form.maxDiscount}
              onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
              placeholder="без ограничения"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Лимит использований</label>
            <input
              type="number"
              className={input}
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              placeholder="без лимита"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">На пользователя</label>
            <input
              type="number"
              className={input}
              value={form.perUserLimit}
              onChange={(e) => setForm({ ...form, perUserLimit: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500">Действует до (необязательно)</label>
            <input
              type="date"
              className={input}
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white font-medium disabled:opacity-50 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          {saving ? 'Сохранение...' : 'Создать'}
        </button>
      </div>

      {/* List */}
      <h3 className="font-semibold mb-3">Мои промокоды</h3>
      {loading ? (
        <p className="text-gray-400">Загрузка...</p>
      ) : codes.length === 0 ? (
        <p className="text-gray-400">Промокодов пока нет</p>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <div key={c.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-purple-700">{c.code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    {c.isActive ? 'активен' : 'выключен'}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {c.discountType === 'percent' ? `${c.discountValue}%` : `${c.discountValue} сум`}
                  {c.minOrderAmount > 0 && ` · от ${c.minOrderAmount} сум`}
                  {c.maxDiscount ? ` · макс. ${c.maxDiscount}` : ''}
                  {` · использован ${c.usedCount}${c.usageLimit ? '/' + c.usageLimit : ''} раз`}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleToggle(c)} className="p-2 rounded-lg hover:bg-gray-100" title="Вкл/выкл">
                  <Power className={`w-4 h-4 ${c.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                </button>
                <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg hover:bg-red-50" title="Удалить">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
