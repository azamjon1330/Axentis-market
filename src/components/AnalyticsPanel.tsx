import { useState, useEffect } from 'react';
import { TrendingUp, Package, AlertTriangle, CreditCard, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import api from '../utils/api';
import ExpensesManager from './ExpensesManager';
import PaymentHistoryForCompany from './PaymentHistoryForCompany';
import AdvancedInsightsPanel from './AdvancedInsightsPanel';
import PurchaseAnalytics from './PurchaseAnalytics';
import CompactPeriodSelector from './CompactPeriodSelector';
import { ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ComposedChart, Area, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
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
  category?: string;
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
  
  const [allCustomExpenses, setAllCustomExpenses] = useState<any[]>([]);
  const [operatingExpensesList, setOperatingExpensesList] = useState<any[]>([]);
  const [employeeExpenses, setEmployeeExpenses] = useState(0);
  const [electricityExpenses, setElectricityExpenses] = useState(0);
  const [purchaseCosts, setPurchaseCosts] = useState(0);
  const [customExpenses, setCustomExpenses] = useState(0);
  const [inventoryCost, setInventoryCost] = useState(0); // Себестоимость склада из вариантов
  
  // 💰 НОВОЕ: Количество продаж из financial_stats
  const [salesCount, setSalesCount] = useState(0);
  
  type PeriodType = 'day' | 'week' | 'month' | 'year' | 'custom';

  const [financialTimePeriod, setFinancialTimePeriod] = useState<PeriodType>('day');
  
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
      
      // Calculate purchase costs from products inventory (variant-level prices if available)
      const purchaseCost = products.reduce((sum: number, p: any) => {
        return sum + (p.inventoryCost || (p.quantity || 0) * (p.price || 0));
      }, 0);
      
      setProducts(products);
      setSalesHistory(sales);
      setCustomerOrders(orders);
      setOrdersWithItems(financialStatsData.orders || []);
      setTotalRevenue(financialStatsData.totalRevenue);
      setCompanyEarnings(financialStatsData.totalMarkupProfit);
      setSalesCount(financialStatsData.salesCount);
      setEmployeeExpenses(employeeExp);
      setElectricityExpenses(electricityExp);
      setPurchaseCosts(purchaseCost);
      setCustomExpenses(customExp);
      setInventoryCost(financialStatsData.inventoryCost || financialStatsData.inventoryValue || purchaseCost);
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
  // Вернуть диапазон дат для периода
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
      if (financialStartDate) { start.setTime(financialStartDate.getTime()); start.setHours(0,0,0,0); }
      if (financialEndDate)   { end.setTime(financialEndDate.getTime());   end.setHours(23,59,59,999); }
    }
    return { start, end };
  };

  const getFilteredOrders = (period: PeriodType = 'day') => {
    const { start, end } = getPeriodRange(period);
    return ordersWithItems.filter(order => {
      const dateStr = order.created_at || order.createdAt;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      return d >= start && d <= end;
    });
  };

  const getFilteredSales = (period: PeriodType = 'day') => {
    const { start, end } = getPeriodRange(period);
    return salesHistory.filter(sale => {
      const dateStr = sale.createdAt || sale.created_at;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      return d >= start && d <= end;
    });
  };

  const getPreviousPeriodOrders = (period: PeriodType = 'day') => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    if (period === 'day') {
      start.setDate(now.getDate() - 1); start.setHours(0,0,0,0);
      end.setDate(now.getDate() - 1);   end.setHours(23,59,59,999);
    } else if (period === 'week') {
      start.setDate(now.getDate() - 14); start.setHours(0,0,0,0);
      end.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      start.setMonth(now.getMonth() - 2); start.setHours(0,0,0,0);
      end.setMonth(now.getMonth() - 1);
    } else if (period === 'year') {
      start.setFullYear(now.getFullYear() - 2); start.setHours(0,0,0,0);
      end.setFullYear(now.getFullYear() - 1);
    } else {
      return [];
    }
    return ordersWithItems.filter(order => {
      const dateStr = order.created_at || order.createdAt;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      return d >= start && d <= end;
    });
  };

  // ═══════════════════════════════════════════════════════════
  // ПРИБЫЛЬ = наценка с проданных заказов + кассовых продаж
  //   markup_profit = selling_price - purchase_price (per item × qty)
  // ═══════════════════════════════════════════════════════════
  const getPeriodProfit = (period: PeriodType = 'day') => {
    const ordersProfit = getFilteredOrders(period).reduce((sum, o) => sum + (parseFloat(o.markup_profit) || 0), 0);
    const salesProfit = getFilteredSales(period).reduce((sum, s) => sum + (parseFloat(s.markupProfit) || parseFloat(s.markup_profit) || 0), 0);
    return ordersProfit + salesProfit;
  };

  // ═══════════════════════════════════════════════════════════
  // ВЫРУЧКА ЗА ПЕРИОД
  // ═══════════════════════════════════════════════════════════
  const getPeriodRevenue = (period: PeriodType = 'day') => {
    const ordRev = getFilteredOrders(period).reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    const saleRev = getFilteredSales(period).reduce((s, s2) => s + (parseFloat(s2.total_amount || s2.totalAmount) || 0), 0);
    return ordRev + saleRev;
  };

  // ═══════════════════════════════════════════════════════════
  // ЗАТРАТЫ КОМПАНИИ = себестоимость проданных товаров (COGS)
  //   = выручка за период - прибыль (наценка) за период
  // ═══════════════════════════════════════════════════════════
  const getPeriodCOGS = (period: PeriodType = 'day') => {
    return Math.max(getPeriodRevenue(period) - getPeriodProfit(period), 0);
  };

  // ═══════════════════════════════════════════════════════════
  // РАСХОДЫ КОМПАНИИ за период (операционные)
  //   monthly    → пропорционально периоду
  //   percentage → % от выручки периода
  //   one_time   → только если дата расхода попадает в период
  // ═══════════════════════════════════════════════════════════
  const getPeriodOperatingExpenses = (period: PeriodType = 'day', periodRevenue: number = 0) => {
    const { start, end } = getPeriodRange(period);

    let multiplier = 1;
    if (period === 'day') multiplier = 1 / 30;
    else if (period === 'week') multiplier = 7 / 30;
    else if (period === 'month') multiplier = 1;
    else if (period === 'year') multiplier = 12;
    else if (period === 'custom' && financialStartDate && financialEndDate) {
      const days = Math.ceil((financialEndDate.getTime() - financialStartDate.getTime()) / 86400000) + 1;
      multiplier = days / 30;
    }

    return operatingExpensesList.reduce((total, exp) => {
      const type: string = exp.expense_type || 'monthly';
      if (type === 'monthly') {
        return total + (exp.monthly_amount || 0) * multiplier;
      } else if (type === 'percentage') {
        return total + periodRevenue * ((exp.percentage_value || 0) / 100);
      } else if (type === 'one_time') {
        const d = new Date(exp.expense_date || exp.created_at);
        if (!isNaN(d.getTime()) && d >= start && d <= end) {
          return total + (exp.amount || 0);
        }
      }
      return total;
    }, 0);
  };

  // ═══════════════════════════════════════════════════════════
  // ЗАТРАТЫ КОМПАНИИ = стоимость товаров на складе (цифровой склад)
  //   = сумма(вариант.цена_закупки × кол-во на складе) по всем вариантам
  //   + ежемесячные расходы из ExpensesManager (зарплата, аренда, ...)
  //
  // Примечание: inventory автоматически уменьшается по мере продаж,
  // поэтому затраты тоже уменьшаются когда товары продаются.
  // ═══════════════════════════════════════════════════════════
  const getTotalCompanyExpenses = () => {
    return inventoryCost + customExpenses;
  };

  // ═══════════════════════════════════════════════════════════
  // ИТОГОВЫЙ БАЛАНС = Прибыль (наценка) − Расходы компании за период
  //   Расходы = операционные (аренда, зп, налоги, разовые)
  //   COGS уже учтён в самой прибыли (markup = selling - cost)
  // ═══════════════════════════════════════════════════════════
  const getFinalBalance = (period: PeriodType = 'day') => {
    const revenue = getPeriodRevenue(period);
    const opEx = getPeriodOperatingExpenses(period, revenue);
    return getPeriodProfit(period) - opEx;
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
    
    if (financialTimePeriod === 'day') {
      const currentData = groupOrdersByTime(currentOrders, 'hour', 24);
      const previousData = groupOrdersByTime(previousOrders, 'hour', 24);
      for (let hour = 0; hour < 24; hour++) {
        dataPoints.push({ period: `${hour}:00`, current: currentData[hour], previous: previousData[hour] });
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

    if (financialTimePeriod === 'day') {
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

  const getTopProductsData = () => {
    const productRevenue: { [key: string]: number } = {};
    ordersWithItems.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const name = item.name || 'Товар';
          const priceVal = parseFloat(item.price_with_markup) || parseFloat(item.price) || 0;
          const total = priceVal * (item.quantity || 0);
          productRevenue[name] = (productRevenue[name] || 0) + total;
        });
      }
    });
    return Object.entries(productRevenue)
      .map(([name, revenue]) => ({ name: name.length > 16 ? name.slice(0, 16) + '…' : name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 7);
  };

  const getCategoryData = () => {
    const catMap: { [key: string]: number } = {};
    products.forEach(p => {
      const cat = p.category || (language === 'uz' ? 'Boshqa' : 'Прочее');
      catMap[cat] = (catMap[cat] || 0) + 1;
    });
    if (Object.keys(catMap).length === 0) return [];
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  };

  const PIE_COLORS = ['#7C5CF0', '#22C55E', '#F59E0B', '#EF4444', '#06B6D4', '#5B3DD4'];

  if (loading) {
    return <div className="text-center py-12">{t.loadingAnalytics}</div>;
  }

  return (
    <div>
      {/* 📑 Вкладки */}
      <div style={{ background: 'var(--ax-card)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, marginBottom: 24, padding: '8px', display: 'flex', gap: 8 }}>
        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 24px',
            borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            ...(activeTab === 'analytics'
              ? { background: 'linear-gradient(135deg, #7C5CF0, #5B3DD4)', color: '#FFFFFF' }
              : { background: 'rgba(255,255,255,0.05)', color: '#8B8BAA' })
          }}
        >
          <TrendingUp className="w-5 h-5" />
          <span>{t.financesAndAnalytics}</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 24px',
            borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            ...(activeTab === 'payments'
              ? { background: 'linear-gradient(135deg, #7C5CF0, #5B3DD4)', color: '#FFFFFF' }
              : { background: 'rgba(255,255,255,0.05)', color: '#8B8BAA' })
          }}
        >
          <CreditCard className="w-5 h-5" />
          <span>{t.paymentHistory}</span>
        </button>

        <button
          onClick={() => setActiveTab('purchases')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 24px',
            borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            ...(activeTab === 'purchases'
              ? { background: 'linear-gradient(135deg, #7C5CF0, #5B3DD4)', color: '#FFFFFF' }
              : { background: 'rgba(255,255,255,0.05)', color: '#8B8BAA' })
          }}
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
            onCustomExpensesUpdate={(totalCustomExpenses, expensesList) => {
              setCustomExpenses(totalCustomExpenses);
              setOperatingExpensesList(expensesList || []);
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

          {/* ═══════════════════════════════════════════════════════
               3 ПАНЕЛИ: ПРИБЫЛЬ / ЗАТРАТЫ / ИТОГОВЫЙ БАЛАНС
          ═══════════════════════════════════════════════════════ */}
          {(() => {
            const profit   = getPeriodProfit(financialTimePeriod);
            const revenue  = getPeriodRevenue(financialTimePeriod);
            const cogs     = getPeriodCOGS(financialTimePeriod);
            const opEx     = getPeriodOperatingExpenses(financialTimePeriod, revenue);
            const balance  = profit - opEx;
            const isPositive = balance >= 0;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: '80rem', margin: '0 auto 24px auto', background: 'var(--ax-card)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>

                {/* ── 1. ПРИБЫЛЬ (наценка с проданных товаров) ── */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <TrendingUp style={{ width: 24, height: 24, color: '#22C55E' }} />
                    <span style={{ color: '#8B8BAA', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {language === 'uz' ? 'Foyda (ustama)' : 'Прибыль (наценка)'}
                    </span>
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: '#22C55E' }}>
                    +{formatPrice(profit)}
                  </div>
                  <div style={{ color: '#8B8BAA', fontSize: 12, lineHeight: 1.6 }}>
                    {language === 'uz'
                      ? `Buyurtmalar: ${getFilteredOrders(financialTimePeriod).length} ta · Kassa: ${getFilteredSales(financialTimePeriod).length} ta`
                      : `Заказы: ${getFilteredOrders(financialTimePeriod).length} · Касса: ${getFilteredSales(financialTimePeriod).length}`}
                    <br />
                    {language === 'uz'
                      ? `Daromad: ${formatPrice(revenue)} · Tannarx: ${formatPrice(cogs)}`
                      : `Выручка: ${formatPrice(revenue)} · Себест.: ${formatPrice(cogs)}`}
                  </div>
                </div>

                {/* ── 2. ЗАТРАТЫ КОМПАНИИ (себестоимость + операционные) ── */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Package style={{ width: 24, height: 24, color: '#F87171' }} />
                    <span style={{ color: '#8B8BAA', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {language === 'uz' ? 'Kompaniya xarajatlari' : 'Затраты компании'}
                    </span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: '#F87171' }}>
                    {language === 'uz' ? 'Tannarx' : 'Себестоимость'}: -{formatPrice(cogs)}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#F87171' }}>
                    {language === 'uz' ? 'Operatsion' : 'Операционные'}: -{formatPrice(opEx)}
                  </div>
                  <div style={{ color: '#8B8BAA', fontSize: 12, lineHeight: 1.6 }}>
                    {language === 'uz'
                      ? `Ombor qiymati: ${formatPrice(inventoryCost)}`
                      : `Стоимость склада: ${formatPrice(inventoryCost)}`}
                    {operatingExpensesList.length > 0 && (
                      <> · {operatingExpensesList.length} {language === 'uz' ? 'ta xarajat' : 'расходов'}</>
                    )}
                  </div>
                </div>

                {/* ── 3. ИТОГОВЫЙ БАЛАНС = Прибыль − Операционные расходы ── */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <CreditCard style={{ width: 24, height: 24, color: '#7C5CF0' }} />
                    <span style={{ color: '#8B8BAA', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {language === 'uz' ? 'Yakuniy balans' : 'Итоговый баланс'}
                    </span>
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: '#7C5CF0' }}>
                    {isPositive ? '+' : ''}{formatPrice(balance)}
                  </div>
                  <div style={{ color: '#8B8BAA', fontSize: 12, lineHeight: 1.6 }}>
                    {language === 'uz'
                      ? `Foyda (${formatPrice(profit)}) − Xarajatlar (${formatPrice(opEx)})`
                      : `Прибыль (${formatPrice(profit)}) − Расходы (${formatPrice(opEx)})`}
                  </div>
                </div>

              </div>
            );
          })()}

          {/* 📊 ДИАГРАММА — ЗАКАЗЫ & ВЫРУЧКА НА ОДНОМ ГРАФИКЕ */}
          <div className="mb-6" key={`charts-${financialTimePeriod}`}>
            <div style={{
              background: 'var(--ax-card)',
              borderRadius: 16,
              padding: '28px',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}>
              {/* Header + legend + info tooltip */}
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ color: '#FFFFFF', fontSize: '20px', fontWeight: 700, margin: '0 0 12px 0' }}>
                    {language === 'uz' ? 'Buyurtmalar & Daromad' : 'Заказы & Выручка'}
                  </h3>
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8B8BAA', fontSize: '13px' }}>
                      <span style={{ width: 24, height: 3, background: '#7C5CF0', display: 'inline-block', borderRadius: 2 }} />
                      {language === 'uz' ? 'Buyurtmalar — joriy davr' : 'Заказы — текущий период'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8B8BAA', fontSize: '13px' }}>
                      <span style={{ width: 24, height: 3, background: '#5B3DD4', display: 'inline-block', borderRadius: 2, borderTop: '2px dashed #5B3DD4', marginTop: 0 }} />
                      {language === 'uz' ? 'Buyurtmalar — oldingi davr' : 'Заказы — пред. период'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8B8BAA', fontSize: '13px' }}>
                      <span style={{ width: 24, height: 3, background: '#7C5CF0', display: 'inline-block', borderRadius: 2 }} />
                      {language === 'uz' ? "Daromad — joriy davr" : 'Выручка — текущий период'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8B8BAA', fontSize: '13px' }}>
                      <span style={{ width: 24, height: 3, background: '#5B3DD4', display: 'inline-block', borderRadius: 2 }} />
                      {language === 'uz' ? "Daromad — oldingi davr" : 'Выручка — пред. период'}
                    </span>
                  </div>
                </div>
                {/* ℹ️ Hover tooltip */}
                <div style={{ position: 'relative', display: 'inline-block' }} className="group">
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(124,92,240,0.2)', border: '1.5px solid rgba(124,92,240,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#7C5CF0', fontSize: 14, fontWeight: 700, userSelect: 'none',
                  }}>?</div>
                  <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{
                      position: 'absolute', right: 0, top: 36, width: 320, zIndex: 50,
                      background: '#13132A', border: '1px solid rgba(124,92,240,0.4)', borderRadius: 12,
                      padding: '14px 16px', color: '#FFFFFF', fontSize: 12, lineHeight: '1.6',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: '#7C5CF0' }}>
                      {language === 'uz' ? 'Diagramma haqida' : 'О диаграмме'}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ color: '#7C5CF0' }}>━━</span> {language === 'uz' ? 'Joriy davrdagi buyurtmalar soni (chap shkala)' : 'Количество заказов в текущем периоде (левая шкала)'}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ color: '#5B3DD4' }}>╌╌</span> {language === 'uz' ? 'Oldingi davr buyurtmalari (taqqoslash uchun)' : 'Заказы предыдущего периода (для сравнения)'}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ color: '#7C5CF0' }}>━━</span> {language === 'uz' ? 'Joriy davr daromadi (o\'ng shkala)' : 'Выручка текущего периода (правая шкала)'}
                    </div>
                    <div>
                      <span style={{ color: '#5B3DD4' }}>╌╌</span> {language === 'uz' ? 'Oldingi davr daromadi (taqqoslash)' : 'Выручка предыдущего периода (сравнение)'}
                    </div>
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={getCombinedChartData()} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="ordCurGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C5CF0" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#7C5CF0" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ordPrevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5B3DD4" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#5B3DD4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revCurGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C5CF0" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#7C5CF0" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revPrevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5B3DD4" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#5B3DD4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#5A5A78', fontSize: 10 }} axisLine={{ stroke: '#5A5A78' }} tickLine={false} interval="preserveStartEnd" />
                  {/* Left Y-axis: orders */}
                  <YAxis yAxisId="ord" orientation="left" tick={{ fill: '#5A5A78', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  {/* Right Y-axis: revenue */}
                  <YAxis yAxisId="rev" orientation="right" tick={{ fill: '#5A5A78', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatShortPrice(v)} width={58} />
                  <Tooltip
                    contentStyle={{ background: '#13132A', border: '1px solid rgba(124,92,240,0.4)', borderRadius: '12px', color: '#FFFFFF', fontSize: '13px' }}
                    labelStyle={{ color: '#8B8BAA', marginBottom: '6px' }}
                    formatter={(value: number, name: string) => {
                      if (name === 'ordCurrent' || name === 'ordPrevious')
                        return [`${value} ${language === 'uz' ? 'ta' : 'шт'}`, name === 'ordCurrent' ? (language === 'uz' ? 'Buyurtmalar' : 'Заказы') : (language === 'uz' ? 'Oldingi davr' : 'Пред. период')];
                      return [formatPrice(value), name === 'revCurrent' ? (language === 'uz' ? 'Daromad' : 'Выручка') : (language === 'uz' ? 'Oldingi davr' : 'Пред. период')];
                    }}
                  />
                  <Area yAxisId="ord" type="monotone" dataKey="ordCurrent" stroke="#7C5CF0" strokeWidth={2.5} fill="url(#ordCurGrad)"
                    dot={false} activeDot={{ r: 5, fill: '#7C5CF0', stroke: '#FFFFFF', strokeWidth: 2 }}
                    animationDuration={1100} animationEasing="ease-out" legendType="none"
                  />
                  {financialTimePeriod !== 'all' && (
                    <Area yAxisId="ord" type="monotone" dataKey="ordPrevious" stroke="#5B3DD4" strokeWidth={1.5} strokeDasharray="5 4" fill="url(#ordPrevGrad)"
                      dot={false} activeDot={{ r: 3, fill: '#5B3DD4' }}
                      animationDuration={1300} animationEasing="ease-out" legendType="none"
                    />
                  )}
                  <Area yAxisId="rev" type="monotone" dataKey="revCurrent" stroke="#7C5CF0" strokeWidth={2.5} fill="rgba(124,92,240,0.2)"
                    dot={false} activeDot={{ r: 5, fill: '#7C5CF0', stroke: '#FFFFFF', strokeWidth: 2 }}
                    animationDuration={1100} animationEasing="ease-out" legendType="none"
                  />
                  {financialTimePeriod !== 'all' && (
                    <Area yAxisId="rev" type="monotone" dataKey="revPrevious" stroke="#5B3DD4" strokeWidth={1.5} strokeDasharray="5 4" fill="url(#revPrevGrad)"
                      dot={false} activeDot={{ r: 3, fill: '#5B3DD4' }}
                      animationDuration={1300} animationEasing="ease-out" legendType="none"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* BarChart + PieChart row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, marginBottom: 24 }}>
            {/* Bar Chart: Top Products by Revenue */}
            <div style={{ background: 'var(--ax-card)', borderRadius: 16, padding: '24px', border: '1px solid rgba(255,255,255,0.07)' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>
                {language === 'uz' ? "Eng ko'p sotilgan mahsulotlar" : 'Топ продаваемых товаров'}
              </h3>
              {getTopProductsData().length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={getTopProductsData()} margin={{ top: 0, right: 8, left: 0, bottom: 44 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#5A5A78', fontSize: 10 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: '#5A5A78', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatShortPrice(v)} width={54} />
                    <Tooltip
                      contentStyle={{ background: '#13132A', border: '1px solid rgba(124,92,240,0.4)', borderRadius: 12, color: '#FFFFFF', fontSize: 13 }}
                      formatter={(value: number) => [formatPrice(value), language === 'uz' ? 'Daromad' : 'Выручка']}
                    />
                    <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                      {getTopProductsData().map((_, index) => (
                        <Cell key={index} fill={index === 0 ? '#7C5CF0' : index === 1 ? '#5B3DD4' : `rgba(124,92,240,${0.65 - index * 0.08})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#5A5A78' }}>
                  <TrendingUp style={{ width: 36, height: 36, opacity: 0.3 }} />
                  <span style={{ fontSize: 13 }}>{language === 'uz' ? "Maʼlumot yoʼq" : 'Нет данных о продажах'}</span>
                </div>
              )}
            </div>

            {/* Donut Chart: Category Distribution */}
            <div style={{ background: 'var(--ax-card)', borderRadius: 16, padding: '24px', border: '1px solid rgba(255,255,255,0.07)' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                {language === 'uz' ? 'Kategoriyalar' : 'Категории'}
              </h3>
              {getCategoryData().length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={getCategoryData()} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" strokeWidth={0}>
                        {getCategoryData().map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#13132A', border: '1px solid rgba(124,92,240,0.4)', borderRadius: 10, color: '#FFFFFF', fontSize: 12 }}
                        formatter={(value: number, name: string) => [`${value} ${language === 'uz' ? 'ta' : 'шт'}`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {getCategoryData().map((entry, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[index % PIE_COLORS.length], flexShrink: 0 }} />
                        <span style={{ color: '#8B8BAA', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                        <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#5A5A78' }}>
                  <Package style={{ width: 36, height: 36, opacity: 0.3 }} />
                  <span style={{ fontSize: 13 }}>{language === 'uz' ? "Mahsulot yoʼq" : 'Нет товаров'}</span>
                </div>
              )}
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