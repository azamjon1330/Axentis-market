import { useState, useEffect } from 'react';
import { TrendingUp, Package, AlertTriangle, CreditCard, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import api from '../utils/api';
import ExpensesManager from './ExpensesManager';
import PaymentHistoryForCompany from './PaymentHistoryForCompany';
import AdvancedInsightsPanel from './AdvancedInsightsPanel';
import PurchaseAnalytics from './PurchaseAnalytics';
import CompactPeriodSelector from './CompactPeriodSelector';
import { ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ComposedChart, Area } from 'recharts';
import { useResponsive, useResponsiveClasses } from '../hooks/useResponsive';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';

interface Product {
  id: number;
  name: string;
  quantity: number;
  price: number;
  availableForCustomers?: boolean;
  markupPercent?: number;
  markupAmount?: number; // 💰 НОВОЕ: Сумма наценки в деньгах
  sellingPrice?: number; // 💰 НОВОЕ: Цена продажи с наценкой
}

interface AnalyticsPanelProps {
  companyId: number;
}

export default function AnalyticsPanel({ companyId }: AnalyticsPanelProps) {
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
  
  const [products, setProducts] = useState<Product[]>([]);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [ordersWithItems, setOrdersWithItems] = useState<any[]>([]); // 🆕 Заказы с items для аналитики
  const [loading, setLoading] = useState(true);
  const [companyEarnings, setCompanyEarnings] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0); // 💰 НОВОЕ: Общая выручка (вся сумма с наценкой)
  
  // 📱 Адаптивность
  const { isMobile, isTablet } = useResponsive();
  const responsive = useResponsiveClasses();
  
  // ✅ НОВОЕ: Выручка "Оплачено" из истории платежей (касса + онлайн)
  const [paymentHistoryProfit, setPaymentHistoryProfit] = useState(0);
  
  // 📑 Вкладки
  const [activeTab, setActiveTab] = useState<'analytics' | 'payments' | 'purchases'>('analytics');
  
  // 💰 Expenses state - НОВОЕ: хранить все затраты с датами
  const [allCustomExpenses, setAllCustomExpenses] = useState<any[]>([]); // Пользовательские затраты с датами
  const [employeeExpenses, setEmployeeExpenses] = useState(0);
  const [electricityExpenses, setElectricityExpenses] = useState(0);
  const [purchaseCosts, setPurchaseCosts] = useState(0);
  const [customExpenses, setCustomExpenses] = useState(0); // 💰 НОВОЕ: Пользовательские затраты (отфильтрованные)
  
  // 💰 НОВОЕ: Количество продаж из financial_stats
  const [salesCount, setSalesCount] = useState(0);
  
  // 🆕 ОТДЕЛЬНЫЕ ФИЛЬТРЫ ПО ПЕРИОДУ ДЛЯ КАЖДОЙ ПАНЕЛИ/ДИАГРАММЫ
  type PeriodType = 'day' | 'yesterday' | 'week' | 'month' | 'year' | 'all';
  
  const [financialTimePeriod, setFinancialTimePeriod] = useState<PeriodType>('all'); // Главный фильтр для всей аналитики
  
  // 🆕 ZOOM для линейной диаграммы
  const [chartZoom, setChartZoom] = useState(100); // 100% = нормальный размер
  
  // 📅 Dates for custom period (added to fix ReferenceError)
  const [financialStartDate, setFinancialStartDate] = useState<Date | null>(null);
  const [financialEndDate, setFinancialEndDate] = useState<Date | null>(null);
  
  useEffect(() => {
    loadData();
  }, [companyId]);

  // 🔄 НОВОЕ: Автообновление данных каждые 30 секунд для решения AFK проблемы
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 [Analytics Panel] Auto-refresh data (every 30s)');
      loadData();
    }, 30000); // 30 секунд

    return () => clearInterval(interval);
  }, [companyId]);

  const loadData = async () => {
    try {
      console.log('\n' + '='.repeat(80));
      console.log('📊 [Analytics Panel] НАЧАЛО ЗАГРУЗКИ ДАННЫХ');
      console.log('='.repeat(80));
      console.log('🏢 Company ID:', companyId);
      console.log('🕒 Время загрузки:', new Date().toLocaleString('uz-UZ'));
      
      const [
        productsData,
        salesData,
        ordersData,
        financialStatsData,
        expensesData,
        statsData
      ] = await Promise.all([
        api.products.list({ companyId }),
        api.sales.list({ companyId }).catch(() => []),
        api.orders.list({ companyId }).catch(() => []),
        api.analytics.company(companyId).catch(() => ({})),
        api.expenses.list({ companyId }).catch(() => []),
        api.companies.getStats(companyId.toString()).catch(() => ({}))
      ]);

      // Normalize responses
      const products = Array.isArray(productsData) ? productsData : (productsData?.products || []);
      const sales = Array.isArray(salesData) ? salesData : (salesData?.sales || []);
      const orders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || []);
      const expenses = Array.isArray(expensesData) ? expensesData : (expensesData?.expenses || []);
      
      console.log('\n' + '='.repeat(80));
      console.log('📦 [Analytics Panel] ЗАГРУЖЕННЫЕ ДАННЫЕ:');
      console.log('='.repeat(80));
      console.log('📦 Товаров на складе:', products.length);
      console.log('📊 Продаж в истории:', sales.length);
      console.log('📋 Заказов покупателей:', orders.length);
      console.log('💰 Финансовая статистика:', financialStatsData);
      console.log('💸 Данные расходов:', expenses.length);
      
      if (sales.length > 0) {
        console.log('\n🔍 [Analytics Panel] ДЕТАЛЬНЫЙ АНАЛИЗ ПРОДАЖ (онлайн режимы):');
        sales.forEach((sale, index) => {
          console.log(`\n  📦 Продажа ${index + 1}:`, sale);
        });
      } else {
        console.log('\nℹ️ [Analytics Panel] sales_history пустая (это нормально для режима "Чеки/Коды")');
        console.log('   📊 Используются данные из customer_orders вместо sales_history');
      }
      
      console.log('\n' + '='.repeat(80));
      console.log('💰 [Analytics Panel] ФИНАНСОВЫЕ ПОКАЗАТЕЛИ ИЗ customer_orders:');
      console.log('='.repeat(80));
      console.log('💰 Общая выручка (вся сумма с наценкой):', financialStatsData.totalRevenue, 'сум');
      console.log('💵 Прибыль от наценок:', financialStatsData.totalMarkupProfit, 'сум');
      console.log('📊 Количество продаж:', financialStatsData.salesCount);
      
      // 🔍 ДЕТАЛЬНАЯ ПРОВЕРКА КАЖДОГО ЗАКАЗА
      if (financialStatsData.orders && financialStatsData.orders.length > 0) {
        console.log('\n🔍 [Analytics Panel] ПРОВЕРКА КАЖДОГО ЗАКАЗА:');
        financialStatsData.orders.forEach((order: any, idx: number) => {
          const totalAmount = parseFloat(order.total_amount) || 0;
          const markupProfit = parseFloat(order.markup_profit) || 0;
          
          console.log(`\n  ${idx + 1}. Заказ #${order.order_code}:`);
          console.log(`     - total_amount: ${totalAmount.toLocaleString()} сум`);
          console.log(`     - markup_profit: ${markupProfit.toLocaleString()} сум`);
          console.log(`     - status: ${order.status}`);
          
          if (order.items && Array.isArray(order.items)) {
            let calculatedTotal = 0;
            console.log(`     📦 Товары (${order.items.length} шт):`);
            
            order.items.forEach((item: any) => {
              const basePrice = item.price || 0;
              const priceWithMarkup = item.price_with_markup || 0;
              const markupAmount = item.markupAmount || 0;
              const quantity = item.quantity || 0;
              
              // Вычисляем selling_price
              const sellingPrice = priceWithMarkup > 0 ? priceWithMarkup : (basePrice + markupAmount);
              const itemTotal = sellingPrice * quantity;
              calculatedTotal += itemTotal;
              
              console.log(`        - ${item.name}: base=${basePrice}, selling=${sellingPrice.toFixed(0)}, qty=${quantity}, total=${itemTotal.toFixed(0)}`);
            });
            
            console.log(`     ✅ Пересчитанный total: ${calculatedTotal.toLocaleString()} сум`);
            console.log(`     ${calculatedTotal === totalAmount ? '✅ СОВПАДАЕТ' : '❌ НЕ СОВПАДАЕТ!'} с сохраненным: ${totalAmount.toLocaleString()} сум`);
            
            if (Math.abs(calculatedTotal - totalAmount) > 1) {
              console.error(`     ⚠️⚠️⚠️ ПРОБЛЕМА! Разница: ${(totalAmount - calculatedTotal).toLocaleString()} сум`);
              console.error(`     📋 Этот заказ был создан до исправлений. Откройте /FIX_INSTRUCTIONS.md`);
            }
          }
        });
      }
      
      console.log('='.repeat(80) + '\n');
      
      // Get expenses from stats API (company-level fixed expenses)
      const employeeExp = statsData.employeeExpenses || 0;
      const electricityExp = statsData.electricityExpenses || 0;
      
      // Calculate custom expenses from expenses table
      const customExp = expenses.filter((e: any) => e.category === 'custom' || e.category === 'other').reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      
      // Calculate purchase costs from products inventory (товары на складе)
      const purchaseCost = products.reduce((sum: number, p: any) => {
        const quantity = p.quantity || 0;
        const price = p.price || 0;
        return sum + (quantity * price);
      }, 0);
      
      setProducts(products);
      setSalesHistory(sales);
      setCustomerOrders(orders);
      setOrdersWithItems(financialStatsData.orders || []); // 🆕 Заказы с items для аналитики
      setTotalRevenue(financialStatsData.totalRevenue);
      setCompanyEarnings(financialStatsData.totalMarkupProfit);
      setSalesCount(financialStatsData.salesCount);
      setEmployeeExpenses(employeeExp);
      setElectricityExpenses(electricityExp);
      setPurchaseCosts(purchaseCost);
      setCustomExpenses(customExp);
      setAllCustomExpenses(expenses.filter((e: any) => e.category === 'custom' || e.category === 'other'));
      
      console.log('✅ [Analytics Panel] Данные успешно загружены и установлены в state');
      console.log('🔍 [Analytics Panel] ordersWithItems установлено:', financialStatsData.orders?.length || 0, 'заказов');
      console.log('🔍 [Analytics Panel] Первый заказ:', financialStatsData.orders?.[0]);
      console.log('💰 [Analytics Panel] Затраты установлены:');
      console.log('   👥 Зарплата:', employeeExp);
      console.log('   ⚡ Электричество:', electricityExp);
      console.log('   🛒 Закупки (стоимость товаров на складе):', purchaseCost);
      console.log('   🛍️ Пользовательские затраты (всего):', customExp);
      console.log('   📊 Пользовательских затрат с датами:', expenses.filter((e: any) => e.category === 'custom').length);
    } catch (error) {
      console.error('❌❌❌ [Analytics Panel] КРИТИЧЕСКАЯ ОШИБКА:', error);
      alert(t.analyticsLoadError);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(price) + ' ' + t.sum;
  };

  // 🔢 Короткий формат чисел (для больших сумм)
  const formatShortPrice = (price: number) => {
    if (price >= 1_000_000_000) {
      return `${(price / 1_000_000_000).toFixed(1)} ${language === 'uz' ? 'mlrd' : 'м лрд'}`;
    } else if (price >= 1_000_000) {
      return `${(price / 1_000_000).toFixed(1)} ${language === 'uz' ? 'mln' : 'млн'}`;
    } else if (price >= 1_000) {
      return `${(price / 1_000).toFixed(1)} ${language === 'uz' ? 'ming' : 'тыс'}`;
    }
    return price.toString();
  };

  // 🆕 ФИЛЬТРАЦИЯ ЗАКАЗОВ ПО ПЕРИОДУ (с параметром периода)
  const getFilteredOrders = (period: PeriodType = 'all') => {
    console.log('\n🔍 [getFilteredOrders] НАЧАЛО ФИЛЬТРАЦИИ:');
    console.log('   📅 Период:', period);
    console.log('   📦 Всего заказов:', ordersWithItems.length);
    
    // 🔍 ДИАГНОСТИКА: Показать структуру первого заказа
    if (ordersWithItems.length > 0) {
      console.log('   🔬 СТРУКТУРА ПЕРВОГО ЗАКАЗА:', ordersWithItems[0]);
      console.log('   🔬 Все ключи заказа:', Object.keys(ordersWithItems[0]));
    }
    
    if (period === 'all') {
      console.log('   ✅ Возвращаем все заказы (период: all)');
      return ordersWithItems;
    }

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (period === 'day') {
      // Сегодня с 00:00:00
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'yesterday') {
      // Вчера с 00:00:00 до 23:59:59
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(now.getMonth() - 1);
    } else if (period === 'year') {
      startDate.setFullYear(now.getFullYear() - 1);
    }

    console.log('   📅 Диапазон дат:');
    console.log('      От:', startDate.toLocaleString('ru-RU'));
    console.log('      До:', endDate.toLocaleString('ru-RU'));

    const filtered = ordersWithItems.filter(order => {
      // 🔍 Используем ПРАВИЛЬНОЕ поле даты:
      // - confirmed_date - для чековых заказов (когда компания подтвердила)
      // - Для виртуальных заказов это тоже confirmed_date (когда система подтвердила оплату)
      const dateStr = order.confirmed_date || order.order_date || order.created_at || order.createdAt;
      
      if (!dateStr) {
        console.log('      ⚠️ Заказ #' + order.order_code + ' - НЕТ ДАТЫ!');
        return false;
      }
      
      console.log('      🔬 Заказ #' + order.order_code + ' dateStr:', dateStr);
      
      const orderDate = new Date(dateStr);
      
      // Проверка на Invalid Date
      if (isNaN(orderDate.getTime())) {
        console.log('      ⚠️ Заказ #' + order.order_code + ' - НЕКОРРЕКТНАЯ ДАТА:', dateStr);
        return false;
      }
      
      const isInRange = orderDate >= startDate && orderDate <= endDate;
      
      if (!isInRange) {
        console.log('      ❌ Заказ #' + order.order_code + ' (' + orderDate.toLocaleString('ru-RU') + ') - вне периода');
      } else {
        console.log('      ✅ Заказ #' + order.order_code + ' (' + orderDate.toLocaleString('ru-RU') + ') - в периоде');
      }
      
      return isInRange;
    });
    
    console.log('   📊 Результат фильтрации:', filtered.length, 'заказов');
    
    return filtered;
  };

  // 🆕 НОВОЕ: Получить заказы за ПРЕДЫДУЩИЙ период для сравнения
  const getPreviousPeriodOrders = (period: PeriodType = 'all') => {
    console.log('\n🔍 [getPreviousPeriodOrders] ФИЛЬТРАЦИЯ ПРЕДЫДУЩЕГО ПЕРИОДА:');
    console.log('   📅 Период:', period);
    
    if (period === 'all') {
      console.log('   ⚠️ Для "Все время" нет предыдущего периода');
      return [];
    }

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (period === 'day') {
      // Предыдущий период = ВЧЕРА
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'yesterday') {
      // Предыдущий период = ПОЗАВЧЕРА
      startDate.setDate(now.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 2);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      // Предыдущий период = 2 недели назад до недели назад
      startDate.setDate(now.getDate() - 14);
      endDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      // Предыдущий период = 2 месяца назад до месяца назад
      startDate.setMonth(now.getMonth() - 2);
      endDate.setMonth(now.getMonth() - 1);
    } else if (period === 'year') {
      // Предыдущий период = 2 года назад до года назад
      startDate.setFullYear(now.getFullYear() - 2);
      endDate.setFullYear(now.getFullYear() - 1);
    }

    console.log('   📅 Предыдущий период:');
    console.log('      От:', startDate.toLocaleString('ru-RU'));
    console.log('      До:', endDate.toLocaleString('ru-RU'));

    const filtered = ordersWithItems.filter(order => {
      const dateStr = order.confirmed_date || order.order_date || order.created_at || order.createdAt;
      
      if (!dateStr) {
        return false;
      }
      
      const orderDate = new Date(dateStr);
      
      if (isNaN(orderDate.getTime())) {
        return false;
      }
      
      return orderDate >= startDate && orderDate <= endDate;
    });
    
    console.log('   📊 Заказов в предыдущем периоде:', filtered.length);
    
    return filtered;
  };

  // 💰 Прибыль = наценка с проданных товаров за период (markup_profit)
  const getPeriodProfit = (period: PeriodType = 'all') => {
    return getFilteredOrders(period).reduce((sum, o) => sum + (parseFloat(o.markup_profit) || 0), 0);
  };

  // 💸 Затраты компании = себестоимость ПРОДАННЫХ товаров за период
  // Формула: total_amount - markup_profit = закупочная цена × кол-во (затраты на проданные товары)
  const getTotalCompanyExpenses = (period: PeriodType = 'all') => {
    const filtered = getFilteredOrders(period);
    return filtered.reduce((sum, o) => {
      const totalAmt = parseFloat(o.total_amount) || 0;
      const markup = parseFloat(o.markup_profit) || 0;
      return sum + (totalAmt - markup);
    }, 0);
  };

  // 💎 Итоговый баланс = прибыль + затраты (выручка = прибыль + себестоимость)
  const getFinalBalance = (period: PeriodType = 'all') => {
    return getFilteredOrders(period).reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
  };

  // 💳 НОВОЕ: Разбивка виртуальных платежей по методам (demo/real)
  const getVirtualPaymentsByMethod = () => {
    const filteredOrders = getFilteredOrders(financialTimePeriod);
    
    let demoPayments = 0;
    let realPayments = 0;
    
    filteredOrders.forEach(order => {
      const amount = parseFloat(order.total_amount) || 0;
      const method = order.payment_method || 'checks_codes';
      
      if (method === 'demo_online') {
        demoPayments += amount;
      } else if (method === 'real_online') {
        realPayments += amount;
      }
    });
    
    console.log('💳 [Virtual Payments]:');
    console.log('   💳 Демо оплата:', demoPayments);
    console.log('   💳 Реальная оплата:', realPayments);
    
    return { demoPayments, realPayments };
  };

  // 💰 НОВОЕ: Получить пропорциональные затраты для диаграмм
  const getProportionalExpenses = () => {
    // 💰 ПРОПОРЦИОНАЛЬНЫЙ РАСЧЕТ ЗАТРАТ ПО ПЕРИОДУ
    let periodMultiplier = 1;
    
    if (financialTimePeriod === 'day' || financialTimePeriod === 'yesterday') {
      periodMultiplier = 1 / 30;
    } else if (financialTimePeriod === 'week') {
      periodMultiplier = 7 / 30;
    } else if (financialTimePeriod === 'month') {
      periodMultiplier = 1;
    } else if (financialTimePeriod === 'year') {
      periodMultiplier = 12;
    } else if (financialTimePeriod === 'custom') {
      if (financialStartDate && financialEndDate) {
        const start = new Date(financialStartDate);
        const end = new Date(financialEndDate);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        periodMultiplier = days / 30;
      }
    } else if (financialTimePeriod === 'all') {
      periodMultiplier = 1;
    }
    
    return {
      employeeExpenses: employeeExpenses * periodMultiplier,
      electricityExpenses: electricityExpenses * periodMultiplier,
      purchaseCosts: purchaseCosts * periodMultiplier,
    };
  };

  // 💰 Получить затраты из повторяющихся расходов (customExpenses уже содержит накопленную сумму за текущий месяц)
  const getFilteredCustomExpenses = () => {
    // customExpenses теперь содержит автоматически рассчитанную накопленную сумму 
    // (monthly_amount / daysInMonth × currentDay) из ExpensesManager
    return customExpenses;
  };

  // 🆕 НОВОЕ: Получить РЕАЛЬНЫЕ данные для линейной диаграммы (БЕЗ случайности)
  const getRealLineChartData = () => {
    const currentOrders = getFilteredOrders(financialTimePeriod);
    const previousOrders = getPreviousPeriodOrders(financialTimePeriod);
    
    // Функция группировки заказов по временным интервалам
    const groupOrdersByTime = (orders: any[], intervalType: string, intervalsCount: number) => {
      const grouped: number[] = new Array(intervalsCount).fill(0);
      
      orders.forEach(order => {
        const dateStr = order.confirmed_date || order.order_date || order.created_at || order.createdAt;
        if (!dateStr) return;
        
        const orderDate = new Date(dateStr);
        if (isNaN(orderDate.getTime())) return;
        
        const amount = parseFloat(order.total_amount) || 0;
        
        if (intervalType === 'hour') {
          const hour = orderDate.getHours();
          grouped[hour] += amount;
        } else if (intervalType === 'halfDay') {
          // Week view: 7 days × 2 half-days = 14 points
          const dayOfWeek = orderDate.getDay() === 0 ? 6 : orderDate.getDay() - 1; // Mon=0
          const half = orderDate.getHours() < 12 ? 0 : 1;
          const idx = dayOfWeek * 2 + half;
          if (idx >= 0 && idx < intervalsCount) grouped[idx] += amount;
        } else if (intervalType === 'day') {
          const day = orderDate.getDay(); // 0-6 (Воскресенье-Суббота)
          const dayIndex = day === 0 ? 6 : day - 1; // Конвертируем в Пн=0, Вс=6
          if (dayIndex >= 0 && dayIndex < intervalsCount) {
            grouped[dayIndex] += amount;
          }
        } else if (intervalType === 'dayOfMonth') {
          const dayIdx = orderDate.getDate() - 1; // 0-30
          if (dayIdx >= 0 && dayIdx < intervalsCount) grouped[dayIdx] += amount;
        } else if (intervalType === 'weekOfYear') {
          const startOfYear = new Date(orderDate.getFullYear(), 0, 1);
          const weekIdx = Math.floor((orderDate.getTime() - startOfYear.getTime()) / (7 * 24 * 60 * 60 * 1000));
          if (weekIdx >= 0 && weekIdx < intervalsCount) grouped[weekIdx] += amount;
        } else if (intervalType === 'week') {
          // Для недель - определяем номер недели в месяце
          const dayOfMonth = orderDate.getDate();
          const weekIndex = Math.min(Math.floor((dayOfMonth - 1) / 7), intervalsCount - 1);
          grouped[weekIndex] += amount;
        } else if (intervalType === 'month') {
          const month = orderDate.getMonth(); // 0-11
          if (month >= 0 && month < intervalsCount) {
            grouped[month] += amount;
          }
        } else if (intervalType === 'dayNumber') {
          // Для пользовательского периода - по дням
          if (financialStartDate) {
            const startDate = new Date(financialStartDate);
            const daysDiff = Math.floor((orderDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff >= 0 && daysDiff < intervalsCount) {
              grouped[daysDiff] += amount;
            }
          }
        } else if (intervalType === 'weekNumber') {
          // Для пользовательского периода - по неделям
          if (financialStartDate) {
            const startDate = new Date(financialStartDate);
            const daysDiff = Math.floor((orderDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const weekIndex = Math.min(Math.floor(daysDiff / 7), intervalsCount - 1);
            if (weekIndex >= 0) {
              grouped[weekIndex] += amount;
            }
          }
        } else if (intervalType === 'monthNumber') {
          // Для пользовательского периода - по месяцам
          if (financialStartDate) {
            const startDate = new Date(financialStartDate);
            const daysDiff = Math.floor((orderDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const monthIndex = Math.min(Math.floor(daysDiff / 30), intervalsCount - 1);
            if (monthIndex >= 0) {
              grouped[monthIndex] += amount;
            }
          }
        }
      });
      
      return grouped;
    };
    
    let dataPoints: any[] = [];
    
    if (financialTimePeriod === 'day' || financialTimePeriod === 'yesterday') {
      // ⏰ ДЕНЬ = 24 ЧАСА (РЕАЛЬНЫЕ ДАННЫЕ)
      const currentData = groupOrdersByTime(currentOrders, 'hour', 24);
      const previousData = groupOrdersByTime(previousOrders, 'hour', 24);
      
      for (let hour = 0; hour < 24; hour++) {
        dataPoints.push({
          period: `${hour}:00`,
          current: currentData[hour],
          previous: previousData[hour],
        });
      }
    } else if (financialTimePeriod === 'week') {
      // 📅 НЕДЕЛЯ = 14 ТОЧЕК (КАЖДЫЕ 12 ЧАСОВ)
      const currentData = groupOrdersByTime(currentOrders, 'halfDay', 14);
      const previousData = groupOrdersByTime(previousOrders, 'halfDay', 14);
      const days = t.daysOfWeek as string[];

      for (let i = 0; i < 14; i++) {
        const dayIdx = Math.floor(i / 2);
        const half = i % 2;
        dataPoints.push({
          period: `${days[dayIdx]} ${half === 0 ? '00' : '12'}`,
          current: currentData[i],
          previous: previousData[i],
        });
      }
    } else if (financialTimePeriod === 'month') {
      // 📆 МЕСЯЦ = КАЖДЫЙ ДЕНЬ
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const currentData = groupOrdersByTime(currentOrders, 'dayOfMonth', daysInMonth);
      const previousData = groupOrdersByTime(previousOrders, 'dayOfMonth', daysInMonth);

      for (let day = 1; day <= daysInMonth; day++) {
        dataPoints.push({
          period: `${day}`,
          current: currentData[day - 1],
          previous: previousData[day - 1],
        });
      }
    } else if (financialTimePeriod === 'year') {
      // 📅 ГОД = КАЖДАЯ НЕДЕЛЯ (52 ТОЧКИ)
      const currentData = groupOrdersByTime(currentOrders, 'weekOfYear', 52);
      const previousData = groupOrdersByTime(previousOrders, 'weekOfYear', 52);

      for (let week = 1; week <= 52; week++) {
        dataPoints.push({
          period: `W${week}`,
          current: currentData[week - 1],
          previous: previousData[week - 1],
        });
      }
    } else if (financialTimePeriod === 'all') {
      // 📊 ВСЁ ВРЕМЯ = ПО МЕСЯЦАМ
      const grouped = new Array(12).fill(0);
      ordersWithItems.forEach(order => {
        const dateStr = order.confirmed_date || order.order_date || order.created_at || order.createdAt;
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        grouped[d.getMonth()] += parseFloat(order.total_amount) || 0;
      });
      const months = t.monthsShort as string[];
      for (let month = 0; month < 12; month++) {
        dataPoints.push({ period: months[month], current: grouped[month], previous: 0 });
      }
    } else if (financialTimePeriod === 'custom') {
      // 🎯 СВОЙ ПЕРИОД (РЕАЛЬНЫЕ ДАННЫЕ)
      if (financialStartDate && financialEndDate) {
        const start = new Date(financialStartDate);
        const end = new Date(financialEndDate);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        if (days <= 1) {
          // 1 день = 24 часа
          const currentData = groupOrdersByTime(currentOrders, 'hour', 24);
          const previousData = groupOrdersByTime(previousOrders, 'hour', 24);
          
          for (let hour = 0; hour < 24; hour++) {
            dataPoints.push({
              period: `${hour}:00`,
              current: currentData[hour],
              previous: previousData[hour],
            });
          }
        } else if (days <= 7) {
          // До 7 дней = по дням
          const currentData = groupOrdersByTime(currentOrders, 'dayNumber', days);
          const previousData = groupOrdersByTime(previousOrders, 'dayNumber', days);
          
          for (let day = 1; day <= days; day++) {
            dataPoints.push({
              period: `${t.dayLabel} ${day}`,
              current: currentData[day - 1],
              previous: previousData[day - 1],
            });
          }
        } else if (days <= 31) {
          // До 31 дня = по неделям
          const weeks = Math.ceil(days / 7);
          const currentData = groupOrdersByTime(currentOrders, 'weekNumber', weeks);
          const previousData = groupOrdersByTime(previousOrders, 'weekNumber', weeks);
          
          for (let week = 1; week <= weeks; week++) {
            dataPoints.push({
              period: `${t.weekLabel} ${week}`,
              current: currentData[week - 1],
              previous: previousData[week - 1],
            });
          }
        } else {
          // Больше 31 дня = по месяцам
          const months = Math.ceil(days / 30);
          const currentData = groupOrdersByTime(currentOrders, 'monthNumber', months);
          const previousData = groupOrdersByTime(previousOrders, 'monthNumber', months);
          
          for (let month = 1; month <= months; month++) {
            dataPoints.push({
              period: `${t.monthLabel} ${month}`,
              current: currentData[month - 1],
              previous: previousData[month - 1],
            });
          }
        }
      }
    }
    
    console.log('📊 [Real Line Chart Data]:');
    console.log('   📅 Период:', financialTimePeriod);
    console.log('   📈 Точек данных:', dataPoints.length);
    console.log('   ✅ РЕАЛЬНЫЕ ДАННЫЕ (без случайности)');
    
    return dataPoints;
  };

  const getOrderCountData = () => {
    const currentOrders = getFilteredOrders(financialTimePeriod);
    const previousOrders = getPreviousPeriodOrders(financialTimePeriod);

    const countByTime = (orders: any[], type: string, n: number) => {
      const arr = new Array(n).fill(0);
      orders.forEach(o => {
        const ds = o.confirmed_date || o.order_date || o.created_at || o.createdAt;
        if (!ds) return;
        const d = new Date(ds);
        if (isNaN(d.getTime())) return;
        if (type === 'hour') arr[d.getHours()]++;
        else if (type === 'halfDay') {
          const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
          const half = d.getHours() < 12 ? 0 : 1;
          const idx = dayIdx * 2 + half;
          if (idx < n) arr[idx]++;
        }
        else if (type === 'day') { const i = d.getDay() === 0 ? 6 : d.getDay() - 1; if (i < n) arr[i]++; }
        else if (type === 'dayOfMonth') { const i = d.getDate() - 1; if (i >= 0 && i < n) arr[i]++; }
        else if (type === 'weekOfYear') {
          const soy = new Date(d.getFullYear(), 0, 1);
          const wk = Math.floor((d.getTime() - soy.getTime()) / (7 * 24 * 60 * 60 * 1000));
          if (wk >= 0 && wk < n) arr[wk]++;
        }
        else if (type === 'week') arr[Math.min(Math.floor((d.getDate() - 1) / 7), n - 1)]++;
        else if (type === 'month') { if (d.getMonth() < n) arr[d.getMonth()]++; }
      });
      return arr;
    };

    if (financialTimePeriod === 'day' || financialTimePeriod === 'yesterday') {
      const cur = countByTime(currentOrders, 'hour', 24);
      const prev = countByTime(previousOrders, 'hour', 24);
      return Array.from({ length: 24 }, (_, i) => ({ period: `${i}:00`, current: cur[i], previous: prev[i] }));
    } else if (financialTimePeriod === 'week') {
      const cur = countByTime(currentOrders, 'halfDay', 14);
      const prev = countByTime(previousOrders, 'halfDay', 14);
      const days = t.daysOfWeek as string[];
      return Array.from({ length: 14 }, (_, i) => ({
        period: `${days[Math.floor(i / 2)]} ${i % 2 === 0 ? '00' : '12'}`,
        current: cur[i], previous: prev[i],
      }));
    } else if (financialTimePeriod === 'month') {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const cur = countByTime(currentOrders, 'dayOfMonth', daysInMonth);
      const prev = countByTime(previousOrders, 'dayOfMonth', daysInMonth);
      return Array.from({ length: daysInMonth }, (_, i) => ({ period: `${i + 1}`, current: cur[i], previous: prev[i] }));
    } else if (financialTimePeriod === 'year') {
      const cur = countByTime(currentOrders, 'weekOfYear', 52);
      const prev = countByTime(previousOrders, 'weekOfYear', 52);
      return Array.from({ length: 52 }, (_, i) => ({ period: `W${i + 1}`, current: cur[i], previous: prev[i] }));
    } else if (financialTimePeriod === 'all') {
      const grouped = new Array(12).fill(0);
      ordersWithItems.forEach(o => {
        const ds = o.confirmed_date || o.order_date || o.created_at || o.createdAt;
        if (!ds) return;
        const d = new Date(ds);
        if (!isNaN(d.getTime())) grouped[d.getMonth()]++;
      });
      return (t.monthsShort as string[]).map((p, i) => ({ period: p, current: grouped[i], previous: 0 }));
    }
    return [];
  };

  const getCombinedChartData = () => {
    const rev = getRealLineChartData();
    const ord = getOrderCountData();
    const len = Math.max(rev.length, ord.length);
    return Array.from({ length: len }, (_, i) => ({
      period: rev[i]?.period ?? ord[i]?.period ?? '',
      revCurrent: rev[i]?.current ?? 0,
      revPrevious: rev[i]?.previous ?? 0,
      ordCurrent: ord[i]?.current ?? 0,
      ordPrevious: ord[i]?.previous ?? 0,
    }));
  };

  if (loading) {
    return <div className="text-center py-12">{t.loadingAnalytics}</div>;
  }

  return (
    <div>
      {/* 📑 Вкладки */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-6 p-2 flex gap-2">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition ${
            activeTab === 'analytics'
              ? 'bg-blue-600 text-white shadow'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span>{t.financesAndAnalytics}</span>
        </button>
        
        <button
          onClick={() => setActiveTab('payments')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition ${
            activeTab === 'payments'
              ? 'bg-blue-600 text-white shadow'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <CreditCard className="w-5 h-5" />
          <span>{t.paymentHistory}</span>
        </button>

        <button
          onClick={() => setActiveTab('purchases')}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition ${
            activeTab === 'purchases'
              ? 'bg-blue-600 text-white shadow'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <Package className="w-5 h-5" />
          <span>{t.purchasesExpense}</span>
        </button>
      </div>

      {/* 💳 ВКЛАДКА: История платежей */}
      {activeTab === 'payments' && (
        <PaymentHistoryForCompany companyId={companyId} />
      )}

      {/* 📦 ВКЛАДКА: Аналитика закупок */}
      {activeTab === 'purchases' && (
        <PurchaseAnalytics companyId={companyId} />
      )}

      {/* 📊 ВКЛАДКА: Аналитика */}
      {activeTab === 'analytics' && (
        <>
          {/* Expenses Manager */}
          <ExpensesManager
            companyId={companyId}
            onCustomExpensesUpdate={(totalCustomExpenses) => {
              setCustomExpenses(totalCustomExpenses);
            }}
          />


          {/* ========== ЗАГОЛОВОК + СЕЛЕКТОР ПЕРИОДА ========== */}
          <div className="flex flex-wrap items-center justify-between gap-3 max-w-7xl mx-auto mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <h4 className="text-base font-semibold text-gray-800">{t.periodAnalysis}</h4>
            </div>
            <CompactPeriodSelector
              value={financialTimePeriod}
              onChange={setFinancialTimePeriod}
            />
          </div>

          {/* ========== 3 ПАНЕЛИ ========== */}
          {(() => {
            const profit = getPeriodProfit(financialTimePeriod);
            const expenses = getTotalCompanyExpenses(financialTimePeriod);
            const balance = getFinalBalance(financialTimePeriod);
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-7xl mx-auto mb-6">
                {/* 1️⃣ Прибыль = наценка с проданных товаров */}
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-5 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-6 h-6" />
                    <div className="text-green-100 text-base">{t.profit}</div>
                  </div>
                  <div className="text-3xl font-bold mb-1">
                    +{formatPrice(profit)}
                  </div>
                  <div className="text-green-100 text-xs">
                    {t.profitFromMarkups}
                  </div>
                </div>

                {/* 2️⃣ Затраты компании = себестоимость проданных товаров (МИНУС) */}
                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-5 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-6 h-6" />
                    <div className="text-red-100 text-base">{t.companyExpenses}</div>
                  </div>
                  <div className="text-3xl font-bold mb-1">
                    -{formatPrice(expenses)}
                  </div>
                  <div className="text-red-100 text-xs">
                    {language === 'uz' ? 'Sotilgan mahsulotlar tannarxi' : 'Себестоимость проданных товаров'}
                  </div>
                </div>

                {/* 3️⃣ Итоговый баланс = выручка (прибыль + затраты) */}
                <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg shadow-lg p-5 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-6 h-6" />
                    <div className="text-cyan-100 text-base">{t.finalBalance}</div>
                  </div>
                  <div className="text-3xl font-bold mb-1">
                    {formatPrice(balance)}
                  </div>
                  <div className="text-cyan-100 text-xs">
                    +{formatPrice(profit)} - {formatPrice(expenses)}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 📊 ДИАГРАММА — ЗАКАЗЫ & ВЫРУЧКА НА ОДНОМ ГРАФИКЕ */}
          <div className="mb-6" key={`charts-${financialTimePeriod}`}>
            <div style={{
              background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 40%, #0c2340 70%, #052e16 100%)',
              borderRadius: '20px',
              padding: '28px',
              boxShadow: '0 8px 40px rgba(99,102,241,0.22), 0 4px 16px rgba(16,185,129,0.12)',
            }}>
              {/* Header + legend */}
              <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3 style={{ color: '#e0e7ff', fontSize: '20px', fontWeight: 700, margin: 0 }}>
                  {language === 'uz' ? 'Buyurtmalar & Daromad' : 'Заказы & Выручка'}
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a5b4fc', fontSize: '13px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#818cf8', display: 'inline-block' }} />
                  {language === 'uz' ? 'Buyurtmalar (dona)' : 'Заказы (шт)'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7', fontSize: '13px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                  {language === 'uz' ? "Daromad (so'm)" : 'Выручка (сум)'}
                </span>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={getCombinedChartData()} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="ordCurGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ordPrevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c4b5fd" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#c4b5fd" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revCurGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revPrevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  {/* Left Y-axis: orders */}
                  <YAxis yAxisId="ord" orientation="left" tick={{ fill: '#a5b4fc', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  {/* Right Y-axis: revenue */}
                  <YAxis yAxisId="rev" orientation="right" tick={{ fill: '#6ee7b7', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatShortPrice(v)} width={58} />
                  <Tooltip
                    contentStyle={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '12px', color: '#e0e7ff', fontSize: '13px' }}
                    labelStyle={{ color: '#94a3b8', marginBottom: '6px' }}
                    formatter={(value: number, name: string) => {
                      if (name === 'ordCurrent' || name === 'ordPrevious')
                        return [`${value} ${language === 'uz' ? 'ta' : 'шт'}`, name === 'ordCurrent' ? (language === 'uz' ? 'Buyurtmalar' : 'Заказы') : (language === 'uz' ? 'Oldingi davr' : 'Пред. период')];
                      return [formatPrice(value), name === 'revCurrent' ? (language === 'uz' ? 'Daromad' : 'Выручка') : (language === 'uz' ? 'Oldingi davr' : 'Пред. период')];
                    }}
                  />
                  <Area yAxisId="ord" type="monotone" dataKey="ordCurrent" stroke="#818cf8" strokeWidth={2.5} fill="url(#ordCurGrad)"
                    dot={false} activeDot={{ r: 5, fill: '#818cf8', stroke: '#e0e7ff', strokeWidth: 2 }}
                    animationDuration={1100} animationEasing="ease-out" legendType="none"
                  />
                  {financialTimePeriod !== 'all' && (
                    <Area yAxisId="ord" type="monotone" dataKey="ordPrevious" stroke="#c4b5fd" strokeWidth={1.5} strokeDasharray="5 4" fill="url(#ordPrevGrad)"
                      dot={false} activeDot={{ r: 3, fill: '#c4b5fd' }}
                      animationDuration={1300} animationEasing="ease-out" legendType="none"
                    />
                  )}
                  <Area yAxisId="rev" type="monotone" dataKey="revCurrent" stroke="#34d399" strokeWidth={2.5} fill="url(#revCurGrad)"
                    dot={false} activeDot={{ r: 5, fill: '#34d399', stroke: '#d1fae5', strokeWidth: 2 }}
                    animationDuration={1100} animationEasing="ease-out" legendType="none"
                  />
                  {financialTimePeriod !== 'all' && (
                    <Area yAxisId="rev" type="monotone" dataKey="revPrevious" stroke="#6ee7b7" strokeWidth={1.5} strokeDasharray="5 4" fill="url(#revPrevGrad)"
                      dot={false} activeDot={{ r: 3, fill: '#6ee7b7' }}
                      animationDuration={1300} animationEasing="ease-out" legendType="none"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <AdvancedInsightsPanel
            products={products}
            customerOrders={getFilteredOrders(financialTimePeriod)} // 🆕 Заказы с items для аналитики (отфильтрованные)
            salesHistory={salesHistory} // 🆕 Кассовые продажи из barcode panel
          />
        </>
      )}
    </div>
  );
}