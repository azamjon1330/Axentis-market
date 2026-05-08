/**
 * 📊 РАСШИРЕННАЯ АНАЛИТИКА
 * - TOP 10 самых продаваемых товаров
 * - Товары с низким остатком (умная логика)
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Package } from 'lucide-react';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';

interface Product {
  id: number;
  name: string;
  quantity: number;
  price: number;
  sellingPrice?: number;
}

interface SaleItem {
  product_id: number;
  product_name: string;
  quantity: number;
}

interface AdvancedInsightsPanelProps {
  products: Product[];
  customerOrders: any[];
  salesHistory: any[]; // 🆕 Кассовые продажи из barcode panel
}

export default function AdvancedInsightsPanel({ products, customerOrders, salesHistory }: AdvancedInsightsPanelProps) {
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const t = useTranslation(language);

  useEffect(() => {
    const handleStorage = () => setLanguage(getCurrentLanguage());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [topProducts, setTopProducts] = useState<Array<{ name: string; totalSold: number; revenue: number }>>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Array<{ name: string; quantity: number; price: number; threshold: number }>>([]);
  const [rankingMode, setRankingMode] = useState<'quantity' | 'revenue' | 'expensive' | 'cheap' | 'leastSold'>('quantity'); // 🆕 Режим рейтинга
  const [topCount, setTopCount] = useState(20); // 🆕 TOP-20

  useEffect(() => {
    calculateTopProducts();
    calculateLowStockProducts();
  }, [products, customerOrders, salesHistory, rankingMode]); // 🆕 Пересчитываем при изменении режима и кассовых продаж

  // 🏆 TOP 10 самых продаваемых товаров
  const calculateTopProducts = () => {
    const salesMap = new Map<string, { name: string; totalSold: number; revenue: number }>(); // 🔥 Группируем по НАЗВАНИЮ, а не ID

    console.log('\n' + '🏆'.repeat(40));
    console.log('🏆 [TOP Products] Начало подсчета TOP продаваемых товаров');
    console.log('🏆 Заказов получено:', customerOrders.length);
    console.log('🏆 Кассовых продаж:', salesHistory.length);
    console.log('🏆 Товаров в базе:', products.length);
    console.log('🏆'.repeat(40));

    // 1️⃣ Собираем продажи из обычных заказов (delivered, paid, completed)
    customerOrders.forEach((order, idx) => {
      console.log(`\n📦 Заказ ${idx + 1}/${customerOrders.length}:`, {
        order_code: order.order_code,
        status: order.status,
        has_items: !!order.items,
        items_is_array: Array.isArray(order.items),
        items_length: order.items?.length || 0,
        full_order: order
      });

      // ✅ Учитываем только оплаченные и доставленные заказы
      // ⚠️ 'completed' заказы НЕ учитываем - они уже создали запись в sales и учтены в salesHistory
      if (order.status !== 'delivered' && order.status !== 'paid') {
        console.log(`  ❌ Пропускаем: статус "${order.status}" (нужен "paid" или "delivered")`);
        return;
      }

      console.log(`  ✅ Статус подходит: ${order.status}`);

      if (!order.items) {
        console.log(`  ❌ У заказа НЕТ поля items!`);
        return;
      }

      if (!Array.isArray(order.items)) {
        console.log(`  ❌ items не является массивом! Тип:`, typeof order.items);
        return;
      }

      if (order.items.length === 0) {
        console.log(`  ❌ items пустой массив`);
        return;
      }

      console.log(`  ✅ items массив с ${order.items.length} товарами`);

      order.items.forEach((item: any, itemIdx) => {
        console.log(`    📦 Товар ${itemIdx + 1}:`, item);
        
        // ✅ ИСПРАВЛЕНИЕ: Поддерживаем все возможные варианты полей
        const productId = item.product_id || item.productId || item.id;
        const productName = item.product_name || item.productName || item.name;
        
        // 🔥 НОВОЕ: Если нет названия в items, берем из products по ID
        let finalProductName = productName;
        let product = products.find(p => p.id === productId);
        
        if (!finalProductName && product) {
          finalProductName = product.name;
          console.log(`      ℹ️ Название взято из каталога: ${finalProductName}`);
        }
        
        if (!finalProductName) {
          console.log(`      ❌ Товар без названия (ID: ${productId})`);
          return;
        }
        
        // 🔥 ИСПРАВЛЕНИЕ: Группируем по названию (регистронезависимо)
        const normalizedName = finalProductName.toLowerCase().trim();
        
        const existing = salesMap.get(normalizedName);
        if (!product) {
          product = products.find(p => p.name.toLowerCase().trim() === normalizedName);
        }
        
        // ✅ ИСПРАВЛЕНИЕ: Используем цену из заказа (price_with_markup, price, или из product)
        const itemPrice = item.price_with_markup || item.price || product?.sellingPrice || product?.price || 0;
        const itemRevenue = itemPrice * item.quantity;

        if (existing) {
          existing.totalSold += item.quantity;
          existing.revenue += itemRevenue;
          console.log(`      ➕ ${finalProductName}: +${item.quantity} шт (всего: ${existing.totalSold} шт, выручка: ${existing.revenue.toLocaleString()} сум)`);
        } else {
          const newEntry = {
            name: finalProductName, // Сохраняем оригинальное название (с заглавными буквами)
            totalSold: item.quantity,
            revenue: itemRevenue
          };
          salesMap.set(normalizedName, newEntry);
          console.log(`      🆕 ${finalProductName}: ${item.quantity} шт (новый товар в топе, выручка: ${itemRevenue.toLocaleString()} сум)`);
        }
      });
    });

    // 2️⃣ Собираем продажи из кассовых продаж (barcode panel)
    console.log('\n🏪 Обработка кассовых продаж...');
    salesHistory.forEach((sale, idx) => {
      console.log(`\n💵 Кассовая продажа ${idx + 1}/${salesHistory.length}:`, {
        id: sale.id,
        has_items: !!sale.items,
        items_is_array: Array.isArray(sale.items),
        items_length: sale.items?.length || 0
      });

      if (!sale.items || !Array.isArray(sale.items) || sale.items.length === 0) {
        console.log('  ❌ Нет товаров в кассовой продаже');
        return;
      }

      sale.items.forEach((item: any, itemIdx) => {
        console.log(`    💰 Товар ${itemIdx + 1}:`, item);
        
        const productId = item.productId || item.product_id || item.id;
        const productName = item.name || item.productName || item.product_name;
        
        let finalProductName = productName;
        let product = products.find(p => p.id === productId);
        
        if (!finalProductName && product) {
          finalProductName = product.name;
          console.log(`      ℹ️ Название взято из каталога: ${finalProductName}`);
        }
        
        if (!finalProductName) {
          console.log(`      ❌ Товар без названия (ID: ${productId})`);
          return;
        }
        
        const normalizedName = finalProductName.toLowerCase().trim();
        const existing = salesMap.get(normalizedName);
        
        if (!product) {
          product = products.find(p => p.name.toLowerCase().trim() === normalizedName);
        }
        
        const itemPrice = item.priceWithMarkup || item.price_with_markup || item.price || product?.sellingPrice || product?.price || 0;
        const itemRevenue = itemPrice * item.quantity;

        if (existing) {
          existing.totalSold += item.quantity;
          existing.revenue += itemRevenue;
          console.log(`      ➕ ${finalProductName}: +${item.quantity} шт (всего: ${existing.totalSold} шт, выручка: ${existing.revenue.toLocaleString()} сум)`);
        } else {
          const newEntry = {
            name: finalProductName,
            totalSold: item.quantity,
            revenue: itemRevenue
          };
          salesMap.set(normalizedName, newEntry);
          console.log(`      🆕 ${finalProductName}: ${item.quantity} шт (новый товар в топе, выручка: ${itemRevenue.toLocaleString()} сум)`);
        }
      });
    });

    console.log('\n📊 Всего уникальных товаров в топе:', salesMap.size);

    // ✅ Сортировка по выбранному режиму
    let sorted: Array<{ name: string; totalSold: number; revenue: number }> = [];
    
    if (rankingMode === 'expensive' || rankingMode === 'cheap') {
      // 💰 Сортировка по цене
      const productsWithSales = Array.from(salesMap.entries()).map(([key, value]) => {
        const product = products.find(p => p.name.toLowerCase().trim() === key);
        const price = product?.sellingPrice || product?.price || 0;
        return { ...value, price };
      });
      
      sorted = productsWithSales
        .sort((a, b) => rankingMode === 'expensive' ? b.price - a.price : a.price - b.price)
        .slice(0, topCount);
    } else if (rankingMode === 'leastSold') {
      // 🐌 Наименее продаваемые
      sorted = Array.from(salesMap.values())
        .sort((a, b) => a.totalSold - b.totalSold)
        .slice(0, topCount);
    } else {
      // 🏆 Лидеры продаж / Прибыли
      sorted = Array.from(salesMap.values())
        .sort((a, b) => rankingMode === 'quantity' ? b.totalSold - a.totalSold : b.revenue - a.revenue)
        .slice(0, topCount);
    }

    console.log(`\n🏆 TOP ${topCount} товаров (режим: ${rankingMode}):`);
    sorted.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.name} - ${item.totalSold} шт (выручка: ${item.revenue.toLocaleString()} сум)`);
    });
    console.log('🏆'.repeat(40) + '\n');

    setTopProducts(sorted);
  };

  // ⚠️ Товары с низким остатком (умная логика)
  const calculateLowStockProducts = () => {
    if (products.length === 0) {
      setLowStockProducts([]);
      return;
    }

    // 1. Рассчитываем среднюю цену
    const totalPrice = products.reduce((sum, p) => sum + p.price, 0);
    const averagePrice = totalPrice / products.length;

    console.log('📊 [Low Stock] Средняя цена товаров:', averagePrice.toLocaleString(), 'сум');

    // 2. Фильтруем товары с низким остатком
    // 🔥 УВЕЛИЧЕНЫ ПОРОГИ: Дешевые ≤20 шт, Дорогие ≤10 шт (было 15/7)
    const lowStock = products
      .filter(product => {
        const threshold = product.price < averagePrice ? 20 : 10; // 🔥 ИСПРАВЛЕНО
        const isLowStock = product.quantity <= threshold && product.quantity > 0;
        
        if (isLowStock) {
          console.log(`  ⚠️ "${product.name}": ${product.quantity} шт ≤ ${threshold} (цена: ${product.price.toLocaleString()} сум)`);
        }
        
        return isLowStock;
      })
      .map(product => ({
        name: product.name,
        quantity: product.quantity,
        price: product.price,
        threshold: product.price < averagePrice ? 20 : 10 // 🔥 ИСПРАВЛЕНО
      }))
      .sort((a, b) => a.quantity - b.quantity); // Сортируем по возрастанию количества

    setLowStockProducts(lowStock);
    
    console.log(`⚠️ [Low Stock] Найдено ${lowStock.length} товаров с низким остатком`);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(price) + ' ' + t.currency;
  };

  return (
    <div className="mt-6 max-w-7xl mx-auto">
      {/* Кнопка раскрытия/скрытия */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-6 py-4 rounded-lg shadow-lg transition-all duration-300 ${
          isOpen 
            ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900' 
            : 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6" />
          <span className="text-xl font-bold">
            📊 {t.advancedInsights}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span className="text-sm opacity-90">
              {topProducts.length > 0 ? `${topProducts.length} TOP` : ''}
              {lowStockProducts.length > 0 ? ` • ${lowStockProducts.length} ${t.lowStockProducts}` : ''}
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-6 h-6" />
          ) : (
            <ChevronDown className="w-6 h-6" />
          )}
        </div>
      </button>

      {/* Содержимое панели */}
      {isOpen && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 🏆 TOP 20 самых продаваемых товаров */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  <h3 className="text-lg font-bold">🏆 {t.top20products}</h3>
                </div>
              </div>
              
              {/* 🆕 Кнопки переключения режима рейтинга */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setRankingMode('quantity')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      rankingMode === 'quantity'
                        ? 'bg-white text-purple-600 shadow-md'
                        : 'bg-purple-400 text-white hover:bg-purple-300'
                    }`}
                  >
                    📦 {t.salesLeaders}
                  </button>
                  <button
                    onClick={() => setRankingMode('revenue')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      rankingMode === 'revenue'
                        ? 'bg-white text-purple-600 shadow-md'
                        : 'bg-purple-400 text-white hover:bg-purple-300'
                    }`}
                  >
                    💰 {t.mostProfitable}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRankingMode('expensive')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      rankingMode === 'expensive'
                        ? 'bg-white text-purple-600 shadow-md'
                        : 'bg-purple-400 text-white hover:bg-purple-300'
                    }`}
                  >
                    💎 {t.expensive}
                  </button>
                  <button
                    onClick={() => setRankingMode('cheap')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      rankingMode === 'cheap'
                        ? 'bg-white text-purple-600 shadow-md'
                        : 'bg-purple-400 text-white hover:bg-purple-300'
                    }`}
                  >
                    💵 {t.cheap}
                  </button>
                  <button
                    onClick={() => setRankingMode('leastSold')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      rankingMode === 'leastSold'
                        ? 'bg-white text-purple-600 shadow-md'
                        : 'bg-purple-400 text-white hover:bg-purple-300'
                    }`}
                  >
                    🐌 {t.leastSold}
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4">
              {topProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>{t.noSalesYet}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topProducts.map((product, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-purple-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                          index === 0 ? 'bg-yellow-500' :
                          index === 1 ? 'bg-gray-400' :
                          index === 2 ? 'bg-orange-600' :
                          'bg-purple-500'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-sm text-gray-600">
                            {rankingMode === 'quantity' ? (
                              <>{t.revenue}: {formatPrice(product.revenue)}</>
                            ) : (
                              <>{t.productsSold}: {product.totalSold} {t.pcs}</>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-purple-600">
                          {rankingMode === 'quantity' ? (
                            <>{product.totalSold} {t.pcs}</>
                          ) : (
                            <>{formatPrice(product.revenue)}</>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {rankingMode === 'quantity' ? t.productsSold : t.revenue}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ⚠️ Товары с низким остатком */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-lg font-bold">⚠️ {t.lowStockProducts}</h3>
              </div>
              <p className="text-sm text-orange-100 mt-1">
                {t.lowStockDescription}
              </p>
            </div>
            <div className="p-4">
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>{t.allInStockMessage}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {lowStockProducts.map((product, index) => {
                    const urgencyLevel = 
                      product.quantity <= 3 ? 'critical' :
                      product.quantity <= 5 ? 'warning' :
                      'normal';

                    return (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                          urgencyLevel === 'critical' ? 'bg-red-50 hover:bg-red-100' :
                          urgencyLevel === 'warning' ? 'bg-orange-50 hover:bg-orange-100' :
                          'bg-yellow-50 hover:bg-yellow-100'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-sm text-gray-600">
                            {t.price}: {formatPrice(product.price)} • {t.threshold}: {product.threshold} {t.pcs}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className={`text-2xl font-bold ${
                            urgencyLevel === 'critical' ? 'text-red-600' :
                            urgencyLevel === 'warning' ? 'text-orange-600' :
                            'text-yellow-700'
                          }`}>
                            {product.quantity}
                          </div>
                          <div className="text-xs text-gray-500">{t.remaining}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}