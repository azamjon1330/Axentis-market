import { useState, useEffect } from 'react';
import { Search, Check, X, Clock, Package, Phone, User, Receipt, DollarSign, RefreshCw, Calendar, MapPin, Navigation, Truck } from 'lucide-react';
import api from '../utils/api';
import { formatUzbekistanFullDateTime } from '../utils/uzbekTime';
import { toast } from 'sonner@2.0.3';
import { useResponsive, useResponsiveClasses } from '../hooks/useResponsive';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';
import CompactPeriodSelector from './CompactPeriodSelector';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
  color?: string;
  markupAmount?: number;
}

interface Order {
  id: number;
  order_code: string;
  user_name: string;
  user_phone: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'completed' | 'cancelled';
  payment_method?: string;
  created_at?: string;
  order_date?: string;
  confirmed_date?: string;
  items: OrderItem[];
  markup_profit?: number;
  delivery_type?: string;
  delivery_address?: string;
  delivery_coordinates?: string;
  recipient_name?: string;
}

interface CompanyOrdersPanelProps {
  companyId: number;
}

export default function CompanyOrdersPanel({ companyId }: CompanyOrdersPanelProps) {
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const t = useTranslation(language);

  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent) => {
      setLanguage(e.detail);
    };
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => window.removeEventListener('languageChange', handleLanguageChange as EventListener);
  }, []);

  type PeriodType = 'day' | 'week' | 'month' | 'year' | 'custom';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'shipped' | 'completed' | 'cancelled'>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodType>('day');
  const [periodStartDate, setPeriodStartDate] = useState<Date | null>(null);
  const [periodEndDate, setPeriodEndDate] = useState<Date | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedDeliveryCoords, setSelectedDeliveryCoords] = useState<{lat: number, lng: number} | null>(null);
  const [companyCoords, setCompanyCoords] = useState<{lat: number, lng: number} | null>(null);
  const [companyAddress, setCompanyAddress] = useState<string>('');

  const { isMobile } = useResponsive();
  const responsive = useResponsiveClasses();

  useEffect(() => {
    loadOrders();
    loadCompanyData();

    const interval = setInterval(() => {
      loadOrders();
    }, 3000);
    return () => clearInterval(interval);
  }, [companyId]);

  const loadCompanyData = async () => {
    try {
      const data = await api.companies.get(companyId.toString());
      if (data.latitude && data.longitude) {
        setCompanyCoords({ lat: data.latitude, lng: data.longitude });
      }
      if (data.address) {
        setCompanyAddress(data.address);
      }
    } catch (error) {
      console.error('Error loading company data:', error);
    }
  };

  const loadOrders = async () => {
    try {
      const data = await api.orders.list({ companyId });
      const rawOrders = Array.isArray(data) ? data : (data?.orders || []);

      const mapped = rawOrders.map((order: any) => {
        let items = Array.isArray(order.items) ? order.items : [];

        if (typeof order.items === 'string' && order.items.length > 0) {
          try {
            const parsed = JSON.parse(order.items);
            items = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.error('⚠️ Failed to parse items for order', order.id, e);
          }
        }

        const mappedItems = items.map((item: any) => ({
          name: item.productName || item.product_name || item.name || 'Товар',
          quantity: item.quantity || 1,
          price: item.price_with_markup || item.priceWithMarkup || item.price || 0,
          total: item.total || (item.quantity || 1) * (item.price_with_markup || item.priceWithMarkup || item.price || 0),
          color: item.color,
          markupAmount: item.markupAmount || item.markup_amount || 0
        }));

        return {
          ...order,
          order_code: order.orderCode || order.order_code || '',
          user_name: order.customerName || order.user_name || '',
          user_phone: order.customerPhone || order.user_phone || '',
          order_date: order.createdAt || order.created_at || order.order_date,
          total_amount: order.totalAmount || order.total_amount || 0,
          markup_profit: order.markupProfit || order.markup_profit || 0,
          delivery_type: order.deliveryType || order.delivery_type,
          delivery_address: order.deliveryAddress || order.delivery_address,
          delivery_coordinates: order.deliveryCoordinates || order.delivery_coordinates,
          recipient_name: order.recipientName || order.recipient_name,
          items: mappedItems
        };
      });

      const sorted = mapped.sort((a: Order, b: Order) => {
        const dateA = new Date(a.order_date || a.created_at || '').getTime();
        const dateB = new Date(b.order_date || b.created_at || '').getTime();
        return dateB - dateA;
      });
      setOrders(sorted);
    } catch (error) {
      console.error('Error loading orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  // Принять заказ: pending → confirmed (уменьшает склад)
  const handleAcceptOrder = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t.acceptOrderConfirm)) return;

    setProcessingId(orderId);
    try {
      await api.orders.updateStatus(String(orderId), 'confirmed');
      toast.success(t.orderAccepted);
      loadOrders();
    } catch (error) {
      console.error('Error accepting order:', error);
      toast.error(t.acceptOrderError);
    } finally {
      setProcessingId(null);
    }
  };

  // В пути: confirmed → shipped (рассчитывает прибыль)
  const handleMarkAsShipped = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t.markAsShippedConfirm)) return;

    setProcessingId(orderId);
    try {
      await api.orders.confirmPayment(orderId);
      toast.success(t.orderShipped);
      loadOrders();
    } catch (error) {
      console.error('Error marking as shipped:', error);
      toast.error(t.markAsShippedError);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelOrder = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t.cancelOrderConfirm)) return;

    setProcessingId(orderId);
    try {
      await api.orders.cancel(orderId);
      toast.success(t.orderCancelled);
      loadOrders();
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error(t.cancelError);
    } finally {
      setProcessingId(null);
    }
  };

  const handleShowDeliveryMap = (deliveryCoordinates: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const coords = deliveryCoordinates.split(',').map(c => parseFloat(c.trim()));
      if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        setSelectedDeliveryCoords({ lat: coords[0], lng: coords[1] });
        setShowMapModal(true);
      } else {
        toast.error(t.invalidDeliveryCoords);
      }
    } catch (error) {
      console.error('Error parsing delivery coordinates:', error);
      toast.error(t.mapOpenError);
    }
  };

  const toggleExpand = (orderId: number) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(price) + ' сум';
  };

  const getPeriodRange = (period: PeriodType): { start: Date; end: Date } => {
    const now = new Date();
    const start = new Date();
    const end = new Date();
    if (period === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      start.setMonth(now.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
    } else if (period === 'year') {
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
    } else if (period === 'custom') {
      if (periodStartDate) { start.setTime(periodStartDate.getTime()); start.setHours(0, 0, 0, 0); }
      if (periodEndDate) { end.setTime(periodEndDate.getTime()); end.setHours(23, 59, 59, 999); }
    }
    return { start, end };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }}>
            <Check className="w-3 h-3" /> {t.statusConfirmed}
          </span>
        );
      case 'processing':
        return (
          <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(124,92,240,0.15)', color: '#A78BFA' }}>
            <Clock className="w-3 h-3" /> {t.statusConfirmed}
          </span>
        );
      case 'shipped':
        return (
          <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(14,165,233,0.15)', color: '#38BDF8' }}>
            <Truck className="w-3 h-3" /> {t.statusShipped}
          </span>
        );
      case 'completed':
      case 'delivered':
        return (
          <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>
            <Check className="w-3 h-3" /> {t.completed}
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171' }}>
            <X className="w-3 h-3" /> {t.cancelled}
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}>
            <Clock className="w-3 h-3" /> {t.waiting}
          </span>
        );
    }
  };

  const { start: periodStart, end: periodEnd } = getPeriodRange(periodFilter);

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      (order.order_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.user_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.user_phone || '').includes(searchQuery);

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    const dateStr = order.order_date || order.created_at || '';
    const d = dateStr ? new Date(dateStr) : null;
    const matchesPeriod = d && !isNaN(d.getTime()) ? d >= periodStart && d <= periodEnd : true;

    return matchesSearch && matchesStatus && matchesPeriod;
  });

  const periodRevenue = filteredOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const periodProfit = filteredOrders.reduce((sum, o) => sum + (Number(o.markup_profit) || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={responsive.spacing} style={{ background: 'var(--ax-bg)', color: 'var(--ax-text)' }}>
      {/* Header & Filters */}
      <div className={`${responsive.card}`} style={{ background: 'var(--ax-card)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-4">
          <h2 className={`${responsive.subheading} font-bold text-gray-800 flex items-center ${responsive.gap}`}>
            <Receipt className={responsive.icon} />
            {isMobile ? t.orders : t.customerOrders}
            <span className={`bg-blue-100 text-blue-800 ${responsive.small} py-0.5 px-2 rounded-full`}>
              {orders.length}
            </span>
          </h2>

          <button
            onClick={loadOrders}
            className={`${responsive.buttonSmall} hover:bg-gray-100 rounded-lg transition-colors text-gray-600`}
            title={t.refreshList}
          >
            <RefreshCw className={responsive.iconSmall} />
          </button>
        </div>

        {/* Period Selector */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className={`${responsive.small} font-medium text-gray-600`}>
              {language === 'uz' ? 'Davr' : 'Период'}
            </span>
          </div>
          <CompactPeriodSelector value={periodFilter} onChange={setPeriodFilter} />
        </div>

        {/* Period Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-blue-50 rounded-lg p-2 text-center">
            <div className={`font-bold text-blue-700 ${responsive.body}`}>{filteredOrders.length}</div>
            <div className={`${responsive.small} text-blue-500`}>{language === 'uz' ? 'Buyurtma' : 'Заказов'}</div>
          </div>
          <div className="bg-indigo-50 rounded-lg p-2 text-center">
            <div className={`font-bold text-indigo-700 ${responsive.body}`}>{formatPrice(periodRevenue)}</div>
            <div className={`${responsive.small} text-indigo-500`}>{language === 'uz' ? 'Daromad' : 'Выручка'}</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2 text-center">
            <div className={`font-bold text-emerald-700 ${responsive.body}`}>+{formatPrice(periodProfit)}</div>
            <div className={`${responsive.small} text-emerald-500`}>{language === 'uz' ? 'Foyda' : 'Прибыль'}</div>
          </div>
        </div>

        {periodFilter === 'custom' && (
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className={`${responsive.small} text-gray-500 block mb-1`}>{language === 'uz' ? 'Boshidan' : 'С даты'}</label>
              <input
                type="date"
                value={periodStartDate ? periodStartDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setPeriodStartDate(e.target.value ? new Date(e.target.value) : null)}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${responsive.small} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
            <div className="flex-1">
              <label className={`${responsive.small} text-gray-500 block mb-1`}>{language === 'uz' ? 'Gacha' : 'По дату'}</label>
              <input
                type="date"
                value={periodEndDate ? periodEndDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setPeriodEndDate(e.target.value ? new Date(e.target.value) : null)}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg ${responsive.small} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 ${responsive.iconSmall}`} />
            <input
              type="text"
              placeholder={isMobile ? t.searchDots : t.searchByCodeNamePhone}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 ${isMobile ? 'py-2' : 'py-2.5'} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${responsive.body}`}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`${responsive.buttonSmall} font-medium whitespace-nowrap transition-colors`}
              style={{
                borderRadius: 20,
                background: statusFilter === 'all' ? 'linear-gradient(135deg, #7C5CF0, #5B3DD4)' : 'rgba(255,255,255,0.05)',
                color: statusFilter === 'all' ? '#FFFFFF' : '#8B8BAA',
                border: statusFilter === 'all' ? 'none' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {t.all}
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`${responsive.buttonSmall} font-medium whitespace-nowrap transition-colors`}
              style={{
                borderRadius: 20,
                background: statusFilter === 'pending' ? 'linear-gradient(135deg, #7C5CF0, #5B3DD4)' : 'rgba(255,255,255,0.05)',
                color: statusFilter === 'pending' ? '#FFFFFF' : '#8B8BAA',
                border: statusFilter === 'pending' ? 'none' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {t.waitingOrders}
            </button>
            <button
              onClick={() => setStatusFilter('confirmed')}
              className={`${responsive.buttonSmall} font-medium whitespace-nowrap transition-colors`}
              style={{
                borderRadius: 20,
                background: statusFilter === 'confirmed' ? 'linear-gradient(135deg, #7C5CF0, #5B3DD4)' : 'rgba(255,255,255,0.05)',
                color: statusFilter === 'confirmed' ? '#FFFFFF' : '#8B8BAA',
                border: statusFilter === 'confirmed' ? 'none' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {t.confirmedOrders}
            </button>
            <button
              onClick={() => setStatusFilter('shipped')}
              className={`${responsive.buttonSmall} font-medium whitespace-nowrap transition-colors`}
              style={{
                borderRadius: 20,
                background: statusFilter === 'shipped' ? 'linear-gradient(135deg, #7C5CF0, #5B3DD4)' : 'rgba(255,255,255,0.05)',
                color: statusFilter === 'shipped' ? '#FFFFFF' : '#8B8BAA',
                border: statusFilter === 'shipped' ? 'none' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {t.shippedOrders}
            </button>
            <button
              onClick={() => setStatusFilter('cancelled')}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors`}
              style={{
                borderRadius: 20,
                background: statusFilter === 'cancelled' ? 'linear-gradient(135deg, #7C5CF0, #5B3DD4)' : 'rgba(255,255,255,0.05)',
                color: statusFilter === 'cancelled' ? '#FFFFFF' : '#8B8BAA',
                border: statusFilter === 'cancelled' ? 'none' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {t.cancelledOrders}
            </button>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className={responsive.spacing}>
        {filteredOrders.length === 0 ? (
          <div className={`text-center ${isMobile ? 'py-8' : 'py-12'} ${responsive.card}`} style={{ background: 'var(--ax-card)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Package className={`${responsive.iconLarge} mx-auto text-gray-300 mb-4`} />
            <p className={`text-gray-500 ${responsive.body}`}>{t.ordersNotFound}</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div
              key={order.id}
              className={`${responsive.card} transition-all duration-200 overflow-hidden`}
              style={{
                background: 'var(--ax-card)',
                border: expandedOrderId === order.id ? '1px solid rgba(124,92,240,0.5)' : '1px solid rgba(255,255,255,0.07)',
                boxShadow: expandedOrderId === order.id ? '0 0 0 1px rgba(124,92,240,0.2)' : 'none',
              }}
            >
              <div
                onClick={() => toggleExpand(order.id)}
                className={`${isMobile ? 'p-3' : 'p-5'} cursor-pointer flex flex-col ${!isMobile && 'md:flex-row md:items-center'} ${responsive.gap}`}
              >
                {/* Code & Date */}
                <div className={isMobile ? 'min-w-full' : 'min-w-[120px]'}>
                  <div className={`font-mono font-bold ${isMobile ? 'text-base' : 'text-lg'}`} style={{ color: 'var(--ax-text)' }}>
                    #{order.order_code}
                  </div>
                  <div className={`${responsive.small} flex items-center ${responsive.gap} mt-1`} style={{ color: 'var(--ax-text-2)' }}>
                    <Calendar className={responsive.iconSmall} />
                    {new Date(order.order_date || order.created_at || '').toLocaleDateString('ru-RU',
                      isMobile ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'long' }
                    )}
                  </div>
                </div>

                {/* Customer Info */}
                <div className="flex-1">
                  <div className={`flex items-center ${responsive.gap} font-medium`} style={{ color: 'var(--ax-text)' }}>
                    <User className={responsive.iconSmall} />
                    {order.user_name || t.guest}
                  </div>
                  {order.user_phone && (
                    <div className={`flex items-center ${responsive.gap} ${responsive.small} mt-1`} style={{ color: 'var(--ax-text-2)' }}>
                      <Phone className={responsive.iconSmall} />
                      {order.user_phone}
                    </div>
                  )}
                </div>

                {/* Amount & Status */}
                <div className={`flex items-center justify-between ${!isMobile && 'md:justify-end'} gap-4 ${isMobile ? 'min-w-full' : 'min-w-[300px]'}`}>
                  <div className="text-right">
                    <div className={`font-bold ${isMobile ? 'text-base' : 'text-lg'}`} style={{ color: 'var(--ax-primary)' }}>
                      {formatPrice(order.total_amount)}
                    </div>
                    {order.markup_profit > 0 && (
                      <div className={`${responsive.small} font-medium`} style={{ color: '#22C55E' }}>
                        <DollarSign className="inline w-3 h-3 mr-1" />
                        +{formatPrice(order.markup_profit)}
                      </div>
                    )}
                    <div className={`${responsive.small}`} style={{ color: 'var(--ax-text-2)' }}>
                      {order.items?.length || 0} {t.products}
                    </div>
                  </div>

                  <div>
                    {getStatusBadge(order.status)}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedOrderId === order.id && (
                <div className={`${isMobile ? 'p-3' : 'p-5'} animate-in slide-in-from-top-2`} style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
                  <div className={`flex flex-col lg:flex-row ${responsive.gapLarge}`}>
                    {/* Items List */}
                    <div className={`flex-1 ${responsive.spacing}`}>
                      <h4 className={`${responsive.small} font-medium uppercase tracking-wider mb-2`} style={{ color: 'var(--ax-text-2)' }}>{t.orderComposition}</h4>
                      {order.items.map((item, idx) => (
                        <div key={idx} className={`flex items-center justify-between ${responsive.cardCompact}`} style={{ background: 'var(--ax-card)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <div className={`flex items-center ${responsive.gap}`}>
                            <div className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} rounded-md flex items-center justify-center`} style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--ax-text-2)' }}>
                              <Package className={responsive.iconSmall} />
                            </div>
                            <div>
                              <div className={`font-medium ${responsive.body}`} style={{ color: 'var(--ax-text)' }}>{item.name}</div>
                              {item.color && item.color !== 'Любой' && (
                                <div className={`${responsive.small}`} style={{ color: 'var(--ax-text-2)' }}>{t.color}: {item.color}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-medium ${responsive.small}`} style={{ color: 'var(--ax-text)' }}>
                              {item.quantity} {t.pcs}. × {formatPrice(item.price)}
                            </div>
                            <div className={`font-bold ${responsive.body}`} style={{ color: 'var(--ax-primary)' }}>
                              {formatPrice(item.total)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Actions & Info */}
                    <div className={`lg:w-80 ${responsive.spacing}`}>
                      <div className={`${responsive.cardCompact}`} style={{ background: 'var(--ax-card)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <h4 className={`${responsive.small} font-medium mb-3`} style={{ color: 'var(--ax-text-2)' }}>{t.orderDetails}</h4>
                        <div className={`${responsive.spacing} ${responsive.small}`}>
                          <div className="flex justify-between">
                            <span style={{ color: 'var(--ax-text-2)' }}>{t.orderTime}:</span>
                            <span className="font-medium" style={{ color: 'var(--ax-text)' }}>
                              {order.order_date ? formatUzbekistanFullDateTime(order.order_date) : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: 'var(--ax-text-2)' }}>{t.paymentMethod}:</span>
                            <span className="font-medium" style={{ color: 'var(--ax-text)' }}>
                              {order.payment_method === 'demo_online' ? t.demoOnline :
                               order.payment_method === 'real_online' ? t.onlineCard : t.cashCheck}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Delivery Information */}
                      {order.delivery_type === 'delivery' && order.delivery_coordinates && (
                        <div className={`bg-blue-50 ${responsive.cardCompact} border border-blue-200`}>
                          <h4 className={`${responsive.small} font-medium text-blue-700 mb-3 flex items-center gap-2`}>
                            <MapPin className={responsive.iconSmall} />
                            Информация о доставке
                          </h4>
                          <div className={`${responsive.spacing} ${responsive.small}`}>
                            {order.recipient_name && (
                              <div className="flex justify-between">
                                <span className="text-blue-600">{t.deliveryRecipient}</span>
                                <span className="font-medium text-gray-900">{order.recipient_name}</span>
                              </div>
                            )}
                            {order.delivery_address && (
                              <div className="flex flex-col gap-1">
                                <span className="text-blue-600">{t.deliveryAddress}</span>
                                <span className="font-medium text-gray-900 text-xs">{order.delivery_address}</span>
                              </div>
                            )}
                            <button
                              onClick={(e) => handleShowDeliveryMap(order.delivery_coordinates!, e)}
                              className={`w-full mt-2 flex items-center justify-center ${responsive.gap} ${responsive.button} bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm`}
                            >
                              <Navigation className={responsive.iconSmall} />
                              Показать на карте
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action buttons based on status */}
                      {order.status === 'pending' && (
                        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} ${responsive.gap}`}>
                          <button
                            onClick={(e) => handleCancelOrder(order.id, e)}
                            disabled={processingId === order.id}
                            className={`flex items-center justify-center ${responsive.gap} ${responsive.button} bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors disabled:opacity-50`}
                          >
                            <X className={responsive.iconSmall} />
                            {t.cancel}
                          </button>
                          <button
                            onClick={(e) => handleAcceptOrder(order.id, e)}
                            disabled={processingId === order.id}
                            className={`flex items-center justify-center ${responsive.gap} ${responsive.button} bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors shadow-sm disabled:opacity-50`}
                          >
                            <Check className={responsive.iconSmall} />
                            {t.acceptOrder}
                          </button>
                        </div>
                      )}

                      {order.status === 'confirmed' && (
                        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} ${responsive.gap}`}>
                          <button
                            onClick={(e) => handleCancelOrder(order.id, e)}
                            disabled={processingId === order.id}
                            className={`flex items-center justify-center ${responsive.gap} ${responsive.button} bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors disabled:opacity-50`}
                          >
                            <X className={responsive.iconSmall} />
                            {t.cancel}
                          </button>
                          <button
                            onClick={(e) => handleMarkAsShipped(order.id, e)}
                            disabled={processingId === order.id}
                            className={`flex items-center justify-center ${responsive.gap} ${responsive.button} bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm disabled:opacity-50`}
                          >
                            <Truck className={responsive.iconSmall} />
                            {t.markAsShipped}
                          </button>
                        </div>
                      )}

                      {processingId === order.id && (
                        <div className={`text-center ${responsive.small} text-blue-600 animate-pulse`}>
                          {t.processing}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delivery Map Modal */}
      {showMapModal && selectedDeliveryCoords && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center" onClick={() => setShowMapModal(false)}>
          <div className={`bg-white rounded-lg shadow-2xl ${isMobile ? 'w-full h-full' : 'w-[95vw] h-[95vh]'} flex flex-col`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className={`font-bold ${responsive.h3} text-gray-900 flex items-center gap-2`}>
                <MapPin className={responsive.iconMedium} />
                Местоположение доставки
              </h3>
              <button
                onClick={() => setShowMapModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className={responsive.iconMedium} />
              </button>
            </div>

            <div className="flex-1 relative">
              {companyCoords ? (
                <iframe
                  src={`https://www.google.com/maps/embed/v1/directions?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&origin=${companyCoords.lat},${companyCoords.lng}&destination=${selectedDeliveryCoords.lat},${selectedDeliveryCoords.lng}&mode=driving`}
                  className="w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Delivery Map"
                />
              ) : (
                <iframe
                  src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${selectedDeliveryCoords.lat},${selectedDeliveryCoords.lng}&zoom=15`}
                  className="w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Delivery Location"
                />
              )}
            </div>

            <div className={`${isMobile ? 'p-3' : 'p-4'} border-t border-gray-200 bg-gray-50 ${responsive.spacing}`}>
              <div className={`grid ${isMobile ? 'grid-cols-1' : 'md:grid-cols-2'} gap-3`}>
                {companyCoords && (
                  <div className={`flex items-start ${responsive.gap}`}>
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className={`font-medium text-gray-900 ${responsive.small}`}>{t.fromCompany}</div>
                      <div className={`text-gray-500 ${responsive.small}`}>
                        {companyAddress || `${companyCoords.lat.toFixed(6)}, ${companyCoords.lng.toFixed(6)}`}
                      </div>
                    </div>
                  </div>
                )}
                <div className={`flex items-start ${responsive.gap}`}>
                  <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className={`font-medium text-gray-900 ${responsive.small}`}>{t.toDelivery}</div>
                    <div className={`text-gray-500 ${responsive.small}`}>
                      {selectedDeliveryCoords.lat.toFixed(6)}, {selectedDeliveryCoords.lng.toFixed(6)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
