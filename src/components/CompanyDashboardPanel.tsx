import { useState, useEffect } from 'react';
import {
  ShoppingCart, TrendingUp, Clock, RotateCcw, AlertTriangle,
  MessageCircleQuestion, Package, BarChart3, ArrowRight, CheckCircle2,
} from 'lucide-react';
import api from '../utils/api';
import { useUiLang } from '../hooks/useUiLang';

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

const STATUS_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  pending:    { bg: 'rgba(251,191,36,0.15)',  text: '#FBBF24', dot: '#FBBF24' },
  confirmed:  { bg: 'rgba(59,130,246,0.15)',  text: '#60A5FA', dot: '#60A5FA' },
  processing: { bg: 'rgba(124,92,240,0.15)',  text: '#A78BFA', dot: '#A78BFA' },
  shipped:    { bg: 'rgba(14,165,233,0.15)',  text: '#38BDF8', dot: '#38BDF8' },
  delivered:  { bg: 'rgba(34,197,94,0.15)',   text: '#4ADE80', dot: '#4ADE80' },
  completed:  { bg: 'rgba(34,197,94,0.15)',   text: '#22C55E', dot: '#22C55E' },
  cancelled:  { bg: 'rgba(248,113,113,0.15)', text: '#F87171', dot: '#F87171' },
};

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
    return () => { active = false; };
  }, [companyId]);

  const lang = useUiLang();
  const L = lang === 'uz' ? {
    loading: 'Yuklanmoqda...', failed: 'Boshqaruv panelini yuklab boʻlmadi',
    todayOrders: 'Bugungi buyurtmalar', todayRevenue: 'Bugungi tushum',
    totalRevenue: 'Jami tushum', soldUnits: 'Sotilgan dona',
    attention: 'Eʼtibor talab qiladi', newOrders: 'Yangi buyurtmalar',
    returns: 'Qaytarish arizalari', lowStock: 'Tugayotgan mahsulotlar',
    questions: 'Javobsiz savollar', allGood: 'Hammasi nazoratda 🎉',
    recent: 'Soʻnggi buyurtmalar', noOrders: 'Hozircha buyurtmalar yoʻq', buyer: 'Xaridor',
    sum: 'soʻm',
  } : {
    loading: 'Загрузка...', failed: 'Не удалось загрузить дашборд',
    todayOrders: 'Заказы сегодня', todayRevenue: 'Выручка сегодня',
    totalRevenue: 'Выручка всего', soldUnits: 'Продано единиц',
    attention: 'Требует внимания', newOrders: 'Новые заказы',
    returns: 'Заявки на возврат', lowStock: 'Товары заканчиваются',
    questions: 'Вопросы без ответа', allGood: 'Всё под контролем 🎉',
    recent: 'Последние заказы', noOrders: 'Заказов пока нет', buyer: 'Покупатель',
    sum: 'сум',
  };

  const statusLabel: Record<string, string> = lang === 'uz' ? {
    pending: 'Yangi', confirmed: 'Qabul qilindi', processing: 'Jarayonda',
    shipped: 'Yoʻlda', delivered: 'Yetkazildi', completed: 'Yakunlandi', cancelled: 'Bekor qilindi',
  } : {
    pending: 'Новый', confirmed: 'Принят', processing: 'В обработке',
    shipped: 'В пути', delivered: 'Доставлен', completed: 'Завершён', cancelled: 'Отменён',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#8B8BAA' }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid rgba(124,92,240,0.3)',
            borderTopColor: '#7C5CF0',
            animation: 'spin 0.8s linear infinite',
          }} />
          {L.loading}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 20, color: '#F87171', textAlign: 'center' }}>
        {L.failed}
      </div>
    );
  }

  const stats = [
    {
      icon: <ShoppingCart size={20} />,
      label: L.todayOrders,
      value: fmt(data.todayOrders),
      accent: '#7C5CF0',
      accentBg: 'rgba(124,92,240,0.15)',
      tab: 'orders',
    },
    {
      icon: <TrendingUp size={20} />,
      label: L.todayRevenue,
      value: `${fmt(data.todayRevenue)} ${L.sum}`,
      accent: '#22C55E',
      accentBg: 'rgba(34,197,94,0.12)',
      tab: 'analytics',
    },
    {
      icon: <BarChart3 size={20} />,
      label: L.totalRevenue,
      value: `${fmt(data.totalRevenue)} ${L.sum}`,
      accent: '#38BDF8',
      accentBg: 'rgba(56,189,248,0.12)',
      tab: 'analytics',
    },
    {
      icon: <Package size={20} />,
      label: L.soldUnits,
      value: fmt(data.soldUnits),
      accent: '#FBBF24',
      accentBg: 'rgba(251,191,36,0.12)',
      tab: 'warehouse',
    },
  ];

  const attentionItems = [
    { icon: <Clock size={16} />, label: L.newOrders,  count: data.pendingOrders,         color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  tab: 'orders' },
    { icon: <RotateCcw size={16} />, label: L.returns, count: data.pendingReturns,        color: '#F87171', bg: 'rgba(248,113,113,0.12)', tab: 'returns' },
    { icon: <AlertTriangle size={16} />, label: L.lowStock, count: data.lowStock,         color: '#FB923C', bg: 'rgba(251,146,60,0.12)',  tab: 'warehouse' },
    { icon: <MessageCircleQuestion size={16} />, label: L.questions, count: data.unansweredQuestions, color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', tab: 'questions' },
  ].filter(i => i.count > 0);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {stats.map((s, i) => (
          <button
            key={i}
            onClick={() => s.tab && onNavigate?.(s.tab)}
            style={{
              background: 'var(--ax-card)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16,
              padding: '18px 20px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = s.accent + '40';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: s.accentBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: s.accent,
            }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: '#8B8BAA', marginTop: 4 }}>{s.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Attention section */}
      {attentionItems.length > 0 ? (
        <div style={{
          background: 'var(--ax-card)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16,
          padding: '18px 20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8B8BAA', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            {L.attention}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {attentionItems.map((item, i) => (
              <button
                key={i}
                onClick={() => onNavigate?.(item.tab)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '12px 14px',
                  borderRadius: 12,
                  background: item.bg,
                  border: `1px solid ${item.color}25`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  color: item.color,
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.8'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.icon}
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                </div>
                <span style={{
                  fontSize: 18, fontWeight: 700,
                  background: item.color,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 14,
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          color: '#22C55E', fontSize: 14,
        }}>
          <CheckCircle2 size={18} />
          {L.allGood}
        </div>
      )}

      {/* Recent orders */}
      <div style={{
        background: 'var(--ax-card)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>{L.recent}</span>
          <button
            onClick={() => onNavigate?.('orders')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: '#7C5CF0', background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {lang === 'uz' ? 'Barchasi' : 'Все заказы'}
            <ArrowRight size={13} />
          </button>
        </div>
        {data.recentOrders.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: '#5A5A78', fontSize: 14 }}>
            {L.noOrders}
          </div>
        ) : (
          <div>
            {data.recentOrders.map((o, idx) => {
              const sc = STATUS_COLOR[o.status] || { bg: 'rgba(139,139,170,0.15)', text: '#8B8BAA', dot: '#8B8BAA' };
              return (
                <div
                  key={o.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '13px 20px',
                    borderBottom: idx < data.recentOrders.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>
                      {o.customerName || L.buyer}
                    </div>
                    <div style={{ fontSize: 12, color: '#5A5A78', marginTop: 2 }}>
                      №{o.orderCode}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', textAlign: 'right' }}>
                      {fmt(o.totalAmount)} <span style={{ color: '#5A5A78', fontWeight: 400, fontSize: 12 }}>{L.sum}</span>
                    </div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 20,
                      background: sc.bg,
                      fontSize: 11, fontWeight: 500, color: sc.text,
                      whiteSpace: 'nowrap',
                    }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot }} />
                      {statusLabel[o.status] || o.status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
