import { useState, useEffect } from 'react';
import { TrendingUp, Package, AlertTriangle, CreditCard, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import api from '../utils/api';
import ExpensesManager from './ExpensesManager';
import PaymentHistoryForCompany from './PaymentHistoryForCompany';
import AdvancedInsightsPanel from './AdvancedInsightsPanel';
import PurchaseAnalytics from './PurchaseAnalytics';
import CompactPeriodSelector from './CompactPeriodSelector';
import { ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, AreaChart, Area, Legend } from 'recharts';
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

  // 💰 Ра��чет общего баланса компании
  // ФОРМУЛА: Выручка от продаж (это просто выручка)
  const getTotalBalance = (period: PeriodType = 'all') => {
    // ✅ ИСПРАВЛЕНО: Используем ОТФИЛЬТРОВАННЫЕ заказы для расчета выручки
    const filteredOrders = getFilteredOrders(period);
    
    // Рассчитываем выручку из отфильтрованных заказов
    const filteredRevenue = filteredOrders.reduce((sum, order) => {
      return sum + (parseFloat(order.total_amount) || 0);
    }, 0);
    
    console.log('💰 [Total Balance]:');
    console.log('   📅 Период:', financialTimePeriod);
    console.log('   📦 Отфильтровано заказов:', filteredOrders.length);
    console.log('   � Выручка за период:', filteredRevenue.toLocaleString(), 'сум');
    
    return filteredRevenue; // ✅ Возвращаем выручку за ВЫБРАННЫЙ период
  };

  // 💸 НОВОЕ: Расчет ЗАТРАТ компании (показывается как МИНУС) БЕЗ фильтрации по периоду
  const getTotalCompanyExpenses = (ignorePeriod: boolean = false) => {
    console.log('\n💸 [getTotalCompanyExpenses] НАЧАЛО РАСЧЕТА:');
    console.log('   📅 Игнорировать период:', ignorePeriod);
    console.log('   📊 Всего заказов в ordersWithItems:', ordersWithItems.length);
    
    // ✅ ВАЖНО: Затраты компании = стоимость товаров на складе
    // Используем ТОЛЬКО price (без наценки) × quantity
    const totalInventoryCost = products.reduce((sum, product) => {
      const basePrice = product.price || 0; // 💰 Цена БЕЗ наценки (закупочная)
      const quantity = product.quantity || 0;
      const cost = basePrice * quantity;
      
      // 🔍 Логируем каждый товар для отладки
      if (quantity > 0) {
        console.log(`   📦 ${product.name}: ${quantity} × ${basePrice.toLocaleString()} = ${cost.toLocaleString()}`);
      }
      
      return sum + cost;
    }, 0);
    
    console.log('   💰 Стоимость цифрового склада:', totalInventoryCost.toLocaleString(), 'сум');
    console.log('   👉 Это себестоимость товаров (БЕЗ наценки)');
    
    // Фиксированные затраты (зарплата, электричество, прочее)
    const fixedExpenses = employeeExpenses + electricityExpenses + customExpenses;
    
    console.log('   📊 Фиксированные расходы:', fixedExpenses.toLocaleString(), 'сум');
    console.log('   ✅ ИТОГО затраты компании:', (totalInventoryCost + fixedExpenses).toLocaleString(), 'сум');
    
    return totalInventoryCost + fixedExpenses;
  };

  // 💎 НОВОЕ: Итоговый баланс компании  
  const getFinalBalance = (period: PeriodType = 'all') => {
    const balance = companyEarnings; // ✅ Используем прибыль от наценок
    const expenses = getTotalCompanyExpenses(true); // Всегда игнорируем период для затрат
    const final = balance - expenses;
    
    console.log('💎 [Final Balance]:');
    console.log('   📅 Период:', period);
    console.log('   💰 Прибыль от наценок:', balance.toLocaleString(), 'сум');
    console.log('   💸 Затраты компании (общие):', expenses.toLocaleString(), 'сум');
    console.log('   💎 ИТОГОВЫЙ БАЛАНС:', final.toLocaleString(), 'сум');
    console.log('   📐 Формула:', `${balance} - ${expenses} = ${final}`);
    
    return final;
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
        } else if (intervalType === 'day') {
          const day = orderDate.getDay(); // 0-6 (Воскресенье-Суббота)
          const dayIndex = day === 0 ? 6 : day - 1; // Конвертируем в Пн=0, Вс=6
          if (dayIndex >= 0 && dayIndex < intervalsCount) {
            grouped[dayIndex] += amount;
          }
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
      // 📅 НЕДЕЛЯ = 7 ДНЕЙ (РЕАЛЬНЫЕ ДАННЫЕ)
      const currentData = groupOrdersByTime(currentOrders, 'day', 7);
      const previousData = groupOrdersByTime(previousOrders, 'day', 7);
      const days = t.daysOfWeek;
      
      for (let day = 0; day < 7; day++) {
        dataPoints.push({
          period: days[day],
          current: currentData[day],
          previous: previousData[day],
        });
      }
    } else if (financialTimePeriod === 'month') {
      // 📆 МЕСЯЦ = 4 НЕДЕЛИ (РЕАЛЬНЫЕ ДАННЫЕ)
      const currentData = groupOrdersByTime(currentOrders, 'week', 4);
      const previousData = groupOrdersByTime(previousOrders, 'week', 4);
      
      for (let week = 1; week <= 4; week++) {
        dataPoints.push({
          period: `${t.weekLabel} ${week}`,
          current: currentData[week - 1],
          previous: previousData[week - 1],
        });
      }
    } else if (financialTimePeriod === 'year') {
      // 📅 ГОД = 12 МЕСЯЦЕВ (РЕАЛЬНЫЕ ДАННЫЕ)
      const currentData = groupOrdersByTime(currentOrders, 'month', 12);
      const previousData = groupOrdersByTime(previousOrders, 'month', 12);
      const months = t.monthsShort;
      
      for (let month = 0; month < 12; month++) {
        dataPoints.push({
          period: months[month],
          current: currentData[month],
          previous: previousData[month],
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
    if (financialTimePeriod === 'all') return [];
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
        else if (type === 'day') { const i = d.getDay() === 0 ? 6 : d.getDay() - 1; if (i < n) arr[i]++; }
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
      const cur = countByTime(currentOrders, 'day', 7);
      const prev = countByTime(previousOrders, 'day', 7);
      return (t.daysOfWeek as string[]).map((p, i) => ({ period: p, current: cur[i], previous: prev[i] }));
    } else if (financialTimePeriod === 'month') {
      const cur = countByTime(currentOrders, 'week', 4);
      const prev = countByTime(previousOrders, 'week', 4);
      return Array.from({ length: 4 }, (_, i) => ({ period: `${t.weekLabel} ${i + 1}`, current: cur[i], previous: prev[i] }));
    } else if (financialTimePeriod === 'year') {
      const cur = countByTime(currentOrders, 'month', 12);
      const prev = countByTime(previousOrders, 'month', 12);
      return (t.monthsShort as string[]).map((p, i) => ({ period: p, current: cur[i], previous: prev[i] }));
    }
    return [];
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


          {/* 🆕 СЕЛЕКТОР ПЕРИОДА ДЛЯ ВСЕЙ АНАЛИТИКИ */}
          <div className="bg-white rounded-lg shadow-md p-4 mb-6 max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-1">📅 {t.periodAnalysis}</h4>
                <p className="text-sm text-gray-600">{t.selectPeriodAnalytics}</p>
              </div>
              <CompactPeriodSelector
                value={financialTimePeriod}
                onChange={setFinancialTimePeriod}
              />
            </div>
          </div>

          {/* ========== 3 ПАНЕЛИ ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-7xl mx-auto mb-6">
            {/* 1️⃣ Общий баланс (Выручка) */}
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-5 text-white">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-6 h-6" />
                <div className="text-green-100 text-base">{t.profit}</div>
              </div>
              <div className="text-3xl font-bold mb-1">
                {formatPrice(companyEarnings)}
              </div>
              <div className="text-green-100 text-xs">
                {t.profitFromMarkups}
              </div>
            </div>

            {/* 2️⃣ Затраты компании (МИНУС) */}
            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-5 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-6 h-6" />
                <div className="text-red-100 text-base">{t.companyExpenses}</div>
              </div>
              <div className="text-3xl font-bold">
                -{formatPrice(getTotalCompanyExpenses())}
              </div>
            </div>

            {/* 3️⃣ Итоговый баланс */}
            <div className={`bg-gradient-to-br ${
              getFinalBalance(financialTimePeriod) >= 0 
                ? 'from-cyan-500 to-cyan-600' 
                : 'from-rose-500 to-rose-600'
            } rounded-lg shadow-lg p-5 text-white`}>
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-6 h-6" />
                <div className={`${
                  getFinalBalance(financialTimePeriod) >= 0 
                    ? 'text-cyan-100' 
                    : 'text-rose-100'
                } text-base`}>{t.finalBalance}</div>
              </div>
              <div className="text-3xl font-bold mb-1">
                {formatPrice(getFinalBalance(financialTimePeriod))}
              </div>
              <div className={`${
                getFinalBalance(financialTimePeriod) >= 0 
                  ? 'text-cyan-100' 
                  : 'text-rose-100'
              } text-xs`}>
                {formatPrice(companyEarnings)} - {formatPrice(getTotalCompanyExpenses())}
              </div>
            </div>
          </div>

          {/* 📊 ДИАГРАММЫ ПРИБЫЛИ И ЗАТРАТ */}
          <div className="space-y-5 mb-6" key={`charts-${financialTimePeriod}`}>
            {/* Chart 1: Orders Count */}
            <div style={{
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #1e3a5f 100%)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(99,102,241,0.28), 0 2px 8px rgba(0,0,0,0.15)',
            }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#e0e7ff', fontSize: '20px', fontWeight: 700, margin: 0 }}>
                  {language === 'uz' ? 'Buyurtmalar' : 'Заказы'}
                </h3>
                <p style={{ color: '#a5b4fc', fontSize: '13px', marginTop: '4px' }}>
                  {language === 'uz' ? "Vaqt bo'yicha buyurtmalar soni" : 'Количество заказов по периоду'}
                </p>
              </div>
              {financialTimePeriod === 'all' ? (
                <div style={{ color: '#818cf8', textAlign: 'center', padding: '48px 0', fontSize: '14px' }}>
                  {t.selectSpecificPeriod}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={270}>
                  <AreaChart data={getOrderCountData()} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="ordCurGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ordPrevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c4b5fd" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#c4b5fd" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="period" tick={{ fill: '#a5b4fc', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#a5b4fc', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                    <Tooltip
                      contentStyle={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '10px', color: '#e0e7ff', fontSize: '13px' }}
                      formatter={(value: number) => [`${value} ${language === 'uz' ? 'ta' : 'шт'}`, '']}
                      labelStyle={{ color: '#a5b4fc' }}
                    />
                    <Legend wrapperStyle={{ color: '#a5b4fc', fontSize: '12px', paddingTop: '12px' }} />
                    <Area type="monotone" dataKey="current" stroke="#818cf8" strokeWidth={2.5} fill="url(#ordCurGrad)"
                      dot={{ fill: '#818cf8', r: 4, strokeWidth: 2, stroke: '#1e1b4b' }}
                      activeDot={{ r: 6, fill: '#818cf8', stroke: '#e0e7ff', strokeWidth: 2 }}
                      animationDuration={1100} animationEasing="ease-out"
                      name={financialTimePeriod === 'day' ? t.periodToday : financialTimePeriod === 'yesterday' ? t.periodYesterday : financialTimePeriod === 'week' ? t.periodThisWeek : financialTimePeriod === 'month' ? t.periodThisMonth : t.periodThisYear}
                    />
                    <Area type="monotone" dataKey="previous" stroke="#c4b5fd" strokeWidth={2} strokeDasharray="6 4" fill="url(#ordPrevGrad)"
                      dot={{ fill: '#c4b5fd', r: 3, strokeWidth: 2, stroke: '#1e1b4b' }}
                      activeDot={{ r: 5, fill: '#c4b5fd' }}
                      animationDuration={1300} animationEasing="ease-out"
                      name={financialTimePeriod === 'day' ? t.periodYesterday : financialTimePeriod === 'yesterday' ? t.periodPrevYesterday : financialTimePeriod === 'week' ? t.periodWeekAgo : financialTimePeriod === 'month' ? t.periodMonthAgo : t.periodYearAgo}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Chart 2: Revenue */}
            <div style={{
              background: 'linear-gradient(135deg, #052e16 0%, #065f46 55%, #0c4a2e 100%)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(16,185,129,0.22), 0 2px 8px rgba(0,0,0,0.15)',
            }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#d1fae5', fontSize: '20px', fontWeight: 700, margin: 0 }}>
                  {language === 'uz' ? 'Daromad' : 'Выручка'}
                </h3>
                <p style={{ color: '#6ee7b7', fontSize: '13px', marginTop: '4px' }}>
                  {language === 'uz' ? "Vaqt bo'yicha daromad" : 'Выручка по периоду'}
                </p>
              </div>
              {financialTimePeriod === 'all' ? (
                <div style={{ color: '#6ee7b7', textAlign: 'center', padding: '48px 0', fontSize: '14px' }}>
                  {t.selectSpecificPeriod}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={270}>
                  <AreaChart data={getRealLineChartData()} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revCurGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="revPrevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="period" tick={{ fill: '#6ee7b7', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6ee7b7', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatShortPrice(v)} width={56} />
                    <Tooltip
                      contentStyle={{ background: '#052e16', border: '1px solid #065f46', borderRadius: '10px', color: '#d1fae5', fontSize: '13px' }}
                      formatter={(value: number) => [formatPrice(value), '']}
                      labelStyle={{ color: '#6ee7b7' }}
                    />
                    <Legend wrapperStyle={{ color: '#6ee7b7', fontSize: '12px', paddingTop: '12px' }} />
                    <Area type="monotone" dataKey="current" stroke="#34d399" strokeWidth={2.5} fill="url(#revCurGrad)"
                      dot={{ fill: '#34d399', r: 4, strokeWidth: 2, stroke: '#052e16' }}
                      activeDot={{ r: 6, fill: '#34d399', stroke: '#d1fae5', strokeWidth: 2 }}
                      animationDuration={1100} animationEasing="ease-out"
                      name={financialTimePeriod === 'day' ? t.periodToday : financialTimePeriod === 'yesterday' ? t.periodYesterday : financialTimePeriod === 'week' ? t.periodThisWeek : financialTimePeriod === 'month' ? t.periodThisMonth : t.periodThisYear}
                    />
                    <Area type="monotone" dataKey="previous" stroke="#6ee7b7" strokeWidth={2} strokeDasharray="6 4" fill="url(#revPrevGrad)"
                      dot={{ fill: '#6ee7b7', r: 3, strokeWidth: 2, stroke: '#052e16' }}
                      activeDot={{ r: 5, fill: '#6ee7b7' }}
                      animationDuration={1300} animationEasing="ease-out"
                      name={financialTimePeriod === 'day' ? t.periodYesterday : financialTimePeriod === 'yesterday' ? t.periodPrevYesterday : financialTimePeriod === 'week' ? t.periodWeekAgo : financialTimePeriod === 'month' ? t.periodMonthAgo : t.periodYearAgo}
                    />
                  </AreaChart>
                </ResponsiveContainer>
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