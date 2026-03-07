import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, CreditCard, CheckCircle, AlertCircle, X, ChevronDown, TrendingUp } from 'lucide-react';
import api from '../utils/api';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';

interface PaymentHistoryItem {
  orderId: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  cardLastFour: string; // Всегда будет "••••" для компании
  cardType: string;
  amount: number;
  markupProfit?: number; // ✅ НОВОЕ: Прибыль от наценки
  status: string;
  method: string;
  cardSubtype?: string | null;
  items: Array<{
    id: number;
    name: string;
    price: number;
    sellingPrice?: number; // ✅ НОВОЕ: Цена с наценкой
    quantity: number;
    color?: string;
  }>;
  createdAt: string;
}

interface PaymentHistoryForCompanyProps {
  companyId: number;
}

export default function PaymentHistoryForCompany({ companyId }: PaymentHistoryForCompanyProps) {
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
  
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'pending' | 'error'>('all');
  const [filterMethod, setFilterMethod] = useState<'all' | 'card' | 'cash'>('all');
  const [selectedPayment, setSelectedPayment] = useState<PaymentHistoryItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    filterPayments();
  }, [payments, searchQuery, filterStatus, filterMethod, selectedDate]);

  const processAndSetPayments = (allSales: any[]) => {
    console.log('🔄 [COMPANY] Обработка sales данных, количество:', allSales.length);
    
    // Преобразуем sales в формат PaymentHistoryItem
    const paymentsData = allSales.map((sale: any, index: number) => {
      console.log(`\n📦 [COMPANY] Обработка sale #${index + 1}:`, sale);
      
      // Парсим items - поддержка разных форматов
      let items = [];
      try {
        if (Array.isArray(sale.items)) {
          items = sale.items;
          console.log(`  ✅ Items уже массив (${items.length} товаров):`, items);
        } else if (typeof sale.items === 'string' && sale.items.length > 0) {
          const parsed = JSON.parse(sale.items);
          items = Array.isArray(parsed) ? parsed : [];
          console.log(`  ✅ Items распарсены из строки (${items.length} товаров):`, items);
        } else if (sale.items && typeof sale.items === 'object') {
          items = [sale.items];
          console.log(`  ✅ Items преобразованы из объекта:`, items);
        }
      } catch (err) {
        console.error(`  ❌ Ошибка парсинга items:`, err, 'raw items:', sale.items);
        items = [];
      }
      
      // ✅ ИСПРАВЛЕНО: Сначала пробуем взять markupProfit из API ответа
      let markupProfit = sale.markupProfit || sale.markup_profit || 0;
      let totalAmount = sale.totalAmount || sale.total_amount || 0;
      
      // Если markupProfit не пришёл из API, вычисляем из items
      if (markupProfit === 0) {
        items.forEach((item: any) => {
          const markupAmount = item.markupAmount || item.markup_amount || 0;
          const quantity = item.quantity || 1;
          markupProfit += markupAmount * quantity;
        });
      }
      
      // Если totalAmount = 0, вычисляем из items
      if (totalAmount === 0) {
        items.forEach((item: any) => {
          const priceWithMarkup = item.priceWithMarkup || item.price_with_markup || item.sellingPrice || item.price || 0;
          const quantity = item.quantity || 1;
          totalAmount += priceWithMarkup * quantity;
        });
      }
      
      console.log(`  💰 Items: ${items.length}, Прибыль: ${markupProfit}, Сумма: ${totalAmount}`);
      
      // Извлекаем телефон и имя клиента
      const firstItem = items[0] || {};
      const customerPhone = firstItem.customerPhone || firstItem.customer_phone || sale.customerPhone || '';
      const customerName = firstItem.customerName || firstItem.customer_name || sale.customerName || customerPhone || 'Клиент';
      
      const payment = {
        orderId: `#${sale.id}`,
        userId: customerPhone,
        userName: customerName,
        userPhone: customerPhone,
        cardLastFour: '••••',
        cardType: sale.paymentMethod || 'cash',
        amount: totalAmount,
        markupProfit: markupProfit,
        status: 'paid',
        method: sale.paymentMethod || 'cash',
        cardSubtype: sale.cardSubtype || sale.card_subtype || null,
        items: items.map((item: any) => ({
          id: item.productId || item.product_id || item.id || 0,
          name: item.productName || item.product_name || item.name || (item.productId ? `Товар #${item.productId}` : 'Товар'),
          price: item.price || item.purchasePrice || item.purchase_price || 0,
          sellingPrice: item.priceWithMarkup || item.price_with_markup || item.sellingPrice || item.selling_price || item.price || 0,
          quantity: item.quantity || 1,
          color: item.color || undefined,
        })),
        createdAt: sale.createdAt || sale.created_at
      };
      
      console.log(`  ✅ Создан payment:`, payment);
      return payment;
    });
    
    console.log('\n📊 [COMPANY] ============================================');
    console.log('📊 [COMPANY] ИТОГО загружено платежей:', paymentsData.length);
    console.log('📊 [COMPANY] Все платежи:', paymentsData);
    console.log('📊 [COMPANY] ============================================\n');
    
    setPayments(paymentsData);
  };

  const loadPayments = async () => {
    console.log('🚀 [PAYMENT HISTORY] Компонент загружается!');
    console.log('🏢 [PAYMENT HISTORY] Company ID from props:', companyId);
    
    if (!companyId) {
      console.error('❌ [COMPANY] companyId не передан в props!');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      console.log('📊 [COMPANY] Загружаем продажи для companyId:', companyId);
      
      // Используем api.sales.list вместо прямого fetch
      const salesData = await api.sales.list({ companyId: String(companyId) });
      const allSales = Array.isArray(salesData) ? salesData : [];
      
      console.log('📊 [COMPANY] Загружено продаж:', allSales.length);
      console.log('📊 [COMPANY] Сырые данные sales:', allSales);
      
      processAndSetPayments(allSales);
    } catch (error) {
      console.error('❌ [COMPANY] Ошибка при загрузке продаж:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterPayments = () => {
    console.log('\n🔍 [COMPANY] Начинаем фильтрацию платежей...');
    console.log('🔍 [COMPANY] Исходное количество payments:', payments.length);
    console.log('🔍 [COMPANY] payments:', payments);
    
    let filtered = [...payments];
    console.log('🔍 [COMPANY] После копирования:', filtered.length);

    // Поиск
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      console.log('🔍 [COMPANY] Применяем поиск:', query);
      filtered = filtered.filter(p => 
        p.orderId.toLowerCase().includes(query) ||
        p.userName?.toLowerCase().includes(query) ||
        p.userPhone?.includes(query) ||
        p.items.some(item => item.name.toLowerCase().includes(query))
      );
      console.log('🔍 [COMPANY] После поиска:', filtered.length);
    }

    // Фильтр по статусу
    if (filterStatus !== 'all') {
      console.log('🔍 [COMPANY] Применяем фильтр статуса:', filterStatus);
      filtered = filtered.filter(p => p.status === filterStatus);
      console.log('🔍 [COMPANY] После фильтра статуса:', filtered.length);
    }

    // Фильтр по методу оплаты
    if (filterMethod !== 'all') {
      console.log('🔍 [COMPANY] Применяем фильтр метода:', filterMethod);
      filtered = filtered.filter(p => p.method === filterMethod);
      console.log('🔍 [COMPANY] После фильтра метода:', filtered.length);
    }

    // 📅 Фильтр по конкретной дате
    if (selectedDate) {
      const filterDate = new Date(selectedDate);
      filtered = filtered.filter(p => {
        const paymentDate = new Date(p.createdAt);
        return (
          paymentDate.getFullYear() === filterDate.getFullYear() &&
          paymentDate.getMonth() === filterDate.getMonth() &&
          paymentDate.getDate() === filterDate.getDate()
        );
      });
      console.log('🔍 [COMPANY] После фильтра по дате:', filtered.length);
    }

    console.log('🔍 [COMPANY] ============================================');
    console.log('🔍 [COMPANY] ИТОГО после всех фильтров:', filtered.length);
    console.log('🔍 [COMPANY] Отфильтрованные платежи:', filtered);
    console.log('🔍 [COMPANY] ============================================\n');
    
    setFilteredPayments(filtered);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
            <CheckCircle className="w-4 h-4" />
            {t.paid}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-sm">
            <AlertCircle className="w-4 h-4" />
            {t.pending}
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-sm">
            <X className="w-4 h-4" />
            {t.failed}
          </span>
        );
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">{status}</span>;
    }
  };

  const getMethodName = (method: string) => {
    switch (method) {
      case 'card': return 'card';
      case 'cash': return 'cash';
      case 'payme': return 'Payme';
      case 'click': return 'Click';
      case 'uzum': return 'Uzum';
      default: return method;
    }
  };

  const getCardSubtypeName = (subtype: string | null | undefined) => {
    if (!subtype) return '';
    switch (subtype) {
      case 'humo': return '🟢 Humo';
      case 'uzcard': return '🔵 Uzcard';
      case 'visa': return '🟡 Visa';
      case 'other': return '⚪ Другие';
      default: return subtype;
    }
  };

  const getCardTypeIcon = (cardType: string) => {
    switch (cardType?.toLowerCase()) {
      case 'uzcard': return '💳';
      case 'humo': return '💳';
      case 'visa': return '💳';
      case 'mastercard': return '💳';
      default: return '💳';
    }
  };

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
  const paidAmount = filteredPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const totalProfit = filteredPayments.reduce((sum, p) => sum + (p.markupProfit || 0), 0); // ✅ НОВОЕ: Общий прибыль

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Статистика */}
      <div className="grid grid-cols-1 gap-4">
        {/* 1. Всего платежей */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-blue-100 text-sm font-medium mb-1">{t.totalPayments}</p>
              <p className="text-3xl font-bold">{filteredPayments.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Поиск и фильтры */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Поиск */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={t.searchPayments}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Кнопка фильтров */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            <Filter className="w-5 h-5" />
            {t.filters}
          </button>
        </div>

        {/* Развёрнутые фильтры */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <label className="block text-sm mb-2">{t.status}</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t.all}</option>
                <option value="paid">✅ Оплачено</option>
                <option value="pending">⏳ Ожидает</option>
                <option value="error">❌ Ошибка</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-2">{t.paymentMethod}</label>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t.allMethods}</option>
                <option value="card">💳 Пластиковые карты</option>
                <option value="cash">💵 Наличные</option>
              </select>
            </div>

            {/* 📅 Фильтр по конкретному дню */}
            <div>
              <label className="block text-sm mb-2">📅 Выбрать конкретный день</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate('')}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition"
                  >
                    ✖️
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                💡 Выберите дату для фильтрации продаж за конкретный день
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Список платежей */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Платежи не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Дата</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Клиент</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Товары</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">🔒 Карта</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Сумма</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Прибыль</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Метод</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Статус</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPayments.map((payment) => (
                  <tr key={payment.orderId} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div>{payment.userName || 'Гость'}</div>
                        <div className="text-gray-500">+998 {payment.userPhone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm max-w-xs">
                        {payment.items.length > 0 ? (
                          <div className="space-y-1">
                            {payment.items.slice(0, 2).map((item, idx) => (
                              <div key={idx} className="text-gray-700">
                                {item.name} <span className="text-gray-500">×{item.quantity}</span>
                              </div>
                            ))}
                            {payment.items.length > 2 && (
                              <div className="text-gray-500 text-xs">
                                + ещё {payment.items.length - 2} товаров
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">Нет товаров</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{getCardTypeIcon(payment.cardType)}</span>
                        <span className="text-gray-400 text-sm">••• •••</span>
                        <span className="text-xs text-gray-400">🔒 Скрыто</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-green-600 font-medium">{formatPrice(payment.amount)} сум</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-amber-600 font-medium">{formatPrice(payment.markupProfit || 0)} сум</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {getMethodName(payment.method)}
                      {payment.cardSubtype && <span className="ml-1 text-xs font-medium text-purple-600"> ({getCardSubtypeName(payment.cardSubtype)})</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(payment.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedPayment(payment)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Детали
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модальное окно с деталями */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-xl">Детали платежа</h3>
              <button
                onClick={() => setSelectedPayment(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-500">ID заказа</p>
                <p className="font-mono text-sm">{selectedPayment.orderId}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Дата и время</p>
                <p>{formatDate(selectedPayment.createdAt)}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Клиент</p>
                <p>{selectedPayment.userName || 'Гость'}</p>
                <p className="text-sm text-gray-500">+998 {selectedPayment.userPhone}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">🔒 Карта (данные скрыты)</p>
                <div className="flex items-center gap-2 mt-1">
                  <span>{getCardTypeIcon(selectedPayment.cardType)}</span>
                  <span className="text-gray-400">•••• ••••</span>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {selectedPayment.cardType?.toUpperCase() || 'Неизвестно'}
                  </span>
                  <span className="text-xs text-gray-500">🔒 Защищено</span>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Метод оплаты</p>
                <p>{getMethodName(selectedPayment.method)}{selectedPayment.cardSubtype && ` (${getCardSubtypeName(selectedPayment.cardSubtype)})`}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Статус</p>
                <div className="mt-1">{getStatusBadge(selectedPayment.status)}</div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Товары</p>
                <div className="space-y-2">
                  {selectedPayment.items.map((item, index) => {
                    // ✅ ИСПРАВЛЕНО: Используем sellingPrice (цена с наценкой) вместо price
                    const itemPrice = item.sellingPrice || item.price;
                    return (
                      <div key={index} className="flex justify-between items-start p-3 bg-gray-50 rounded">
                        <div className="flex-1">
                          <p>{item.name}</p>
                          {item.color && (
                            <p className="text-sm text-gray-500">Цвет: {item.color}</p>
                          )}
                          <p className="text-sm text-gray-500">Количество: {item.quantity}</p>
                        </div>
                        <p className="text-green-600">{formatPrice(selectedPayment.amount)} сум</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between items-center text-lg">
                  <span>Итого:</span>
                  <span className="text-green-600">{formatPrice(selectedPayment.amount)} сум</span>
                </div>
                <div className="flex justify-between items-center text-lg">
                  <span>Прибыль:</span>
                  <span className="text-amber-600 font-semibold">{formatPrice(selectedPayment.markupProfit || 0)} сум</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

