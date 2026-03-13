import { useState, useEffect } from 'react';
import { Building2, LogOut, Package, ShoppingCart, Receipt, BarChart3, Barcode, Megaphone, Menu, X, Globe, Tag, Sun, Moon, MessageSquare, TruckIcon } from 'lucide-react';
import { DigitalWarehouse } from './DigitalWarehouse';
import SalesPanel from './SalesPanel';
import CompanyOrdersPanel from './CompanyOrdersPanel';
import AnalyticsPanel from './AnalyticsPanel';
import BarcodeSearchPanel from './BarcodeSearchPanel';
import CompanySMMPanel from './CompanySMMPanel';
import CompanyDiscountsManager from './CompanyDiscountsManager';
import CompanyInboxPanel from './CompanyInboxPanel';
import ProductPurchasesPanel from './ProductPurchasesPanel';
import { getCurrentLanguage, setCurrentLanguage, type Language, useTranslation } from '../utils/translations';
import { useResponsive, useResponsiveClasses } from '../hooks/useResponsive';
import { useTheme } from '../utils/ThemeContext';

interface CompanyPanelProps {
  onLogout: () => void;
  companyId: number;
  companyName: string;
}

export default function CompanyPanel({ onLogout, companyId, companyName }: CompanyPanelProps) {
  // 🔍 DEBUG: Проверка companyId
  useEffect(() => {
    console.log('🏢 CompanyPanel mounted - companyId:', companyId, 'companyName:', companyName);
    if (!companyId || companyId === 0) {
      console.error('❌ CRITICAL: CompanyPanel received invalid companyId!', companyId);
      alert('❌ Ошибка: Неверный ID компании. Пожалуйста, выйдите и войдите заново.');
    }
  }, [companyId, companyName]);
  
  const [activeTab, setActiveTab] = useState<'warehouse' | 'sales' | 'orders' | 'analytics' | 'barcode' | 'smm' | 'discounts' | 'purchases'>('warehouse');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // 📱 Для мобильной версии
  const [showInbox, setShowInbox] = useState(false); // 📨 Показать входящие сообщения
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0); // 📨 Кол-во непрочитанных
  
  // 📱 Адаптивность
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const responsive = useResponsiveClasses();
  
  // � Темная тема
  const { theme, effectiveTheme, setTheme } = useTheme();
  
  // �🌍 Система локализации для компании (заблокирована на русском)
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const t = useTranslation(language);
  
  // Слушаем изменения языка
  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent) => {
      setLanguage(e.detail);
    };
    
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    
    return () => {
      window.removeEventListener('languageChange', handleLanguageChange as EventListener);
    };
  }, []);
  
  // 📨 Загрузка количества непрочитанных сообщений с звуковым уведомлением
  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    let previousCount = unreadMessagesCount;
    
    // Функция для воспроизведения звука уведомления
    const playNotificationSound = () => {
      try {
        // Создаем аудио с приятным звуком уведомления (используем data URI)
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PVqzn77BdGAg+ltryxnMnBSuBzvLZiTYHGWi77eeeTRAMUKfj8LZjHAY4ktfyzHksBSR2x/DdkUAKE1+06eqnVRQKRp/g8r9sIQUxh9Hz04IzBh5uwO/jmUgND1as5++wXRgIPpba8sZzJwUrgc7y2Yk2BxlpvO3nnk0QDFCn4/C2YxwGOJLX8sx5LAUkdsfw3ZFAChNftOnqp1UUCkaf4PK/bCEFMYfR89OCMwYeacDv45lIDQ9XrOjt8FwYBz64gf17i+sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wwvBnrv7/w==');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('🔇 Звук уведомления заблокирован браузером:', e));
      } catch (error) {
        console.error('Error playing notification sound:', error);
      }
    };
    
    const loadUnreadCount = async () => {
      try {
        const response = await fetch(`${API_URL}/company-messages/company/${companyId}/count`);
        if (response.ok) {
          const data = await response.json();
          const newCount = data.count || 0;
          
          // Если есть новые сообщения - воспроизводим звук
          if (newCount > previousCount && previousCount !== null) {
            console.log('🔔 Новое сообщение от Axis! Воспроизводим звук...');
            playNotificationSound();
          }
          
          previousCount = newCount;
          setUnreadMessagesCount(newCount);
        }
      } catch (error) {
        console.error('Error loading unread messages count:', error);
      }
    };

    loadUnreadCount();
    // Проверяем каждые 5 секунд для быстрого уведомления
    const interval = setInterval(loadUnreadCount, 5000);
    return () => clearInterval(interval);
  }, [companyId]);
  
  // 🔄 HISTORY API HANDLER
  useEffect(() => {
    // ИСПРАВЛЕНИЕ: Проверяем хеш URL при загрузке и восстанавливаем вкладку
    const hash = window.location.hash.replace('#', '');
    const validTabs: Array<typeof activeTab> = ['warehouse', 'sales', 'orders', 'analytics', 'barcode', 'smm', 'discounts'];
    const initialTab = validTabs.includes(hash as any) ? (hash as typeof activeTab) : 'warehouse';
    
    // Initial state setup - preserve page: 'company' context
    const currentState = window.history.state || {};
    window.history.replaceState({ ...currentState, tab: initialTab, page: 'company' }, '', `#${initialTab}`);
    
    // Устанавливаем начальную вкладку
    if (initialTab !== activeTab) {
      setActiveTab(initialTab);
    }

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.tab) {
        setActiveTab(event.state.tab);
        setIsSidebarOpen(false);
      } else {
        // Fallback to default if no tab in state
        setActiveTab('warehouse');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Custom Navigation Handler
  const handleNavigate = (tab: typeof activeTab) => {
    // ИСПРАВЛЕНИЕ: Убрал проверку activeTab === tab чтобы не требовался двойной клик
    // Include page: 'company' so App.tsx knows where we are
    window.history.pushState({ tab: tab, page: 'company' }, '', `#${tab}`);
    setActiveTab(tab);
    setIsSidebarOpen(false);
    window.scrollTo(0, 0);
  };

  console.log('🏢 [CompanyPanel] Rendered with:', { companyId, companyName, type: typeof companyId });

  // 📱 Адаптивная ширина sidebar
  const sidebarWidth = isMobile ? '85vw' : isTablet ? 'w-64' : 'w-56';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-x-hidden">
      {/* 📱 Overlay для мобильных (при открытом sidebar) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ✅ КОМПАКТНЫЙ SIDEBAR СЛЕВА - АДАПТИВНЫЙ */}
      <aside 
        className={`
          ${isMobile ? sidebarWidth : sidebarWidth} 
          bg-white dark:bg-gray-800 shadow-lg flex flex-col fixed h-full z-30 transition-transform duration-300
          lg:translate-x-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={isMobile ? { width: sidebarWidth } : {}}
      >
        {/* Логотип и название компании - АДАПТИВНО */}
        <div className={`bg-gradient-to-br from-purple-600 to-purple-700 text-white ${isMobile ? 'p-3' : 'p-4'}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Building2 className={isMobile ? 'w-5 h-5' : 'w-6 h-6'} />
              <div>
                <h2 className={`font-bold ${isMobile ? 'text-sm' : 'text-base'}`}>{companyName}</h2>
                <p className={`text-purple-100 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>
                  {t.companyPanel}
                </p>
              </div>
            </div>
            {/* Кнопка закрытия для мобильных */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-1 hover:bg-white/20 rounded-lg transition"
            >
              <X className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
          </div>
        </div>

        {/* Навигационные кнопки - АДАПТИВНО */}
        <nav className={`flex-1 overflow-y-auto ${isMobile ? 'py-2' : 'py-3'}`}>
          <button
            onClick={() => handleNavigate('warehouse')}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} transition-all duration-300 ${
              activeTab === 'warehouse'
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-r-4 border-purple-600 dark:border-purple-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-y-105 hover:shadow-lg hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
            }`}
          >
            <Package className={responsive.iconSmall} />
            <span className={`font-medium ${responsive.small}`}>{t.inventory}</span>
          </button>
          
          <button
            onClick={() => handleNavigate('sales')}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} transition-all duration-300 ${
              activeTab === 'sales'
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-r-4 border-purple-600 dark:border-purple-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-y-105 hover:shadow-lg hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
            }`}
          >
            <ShoppingCart className={responsive.iconSmall} />
            <span className={`font-medium ${responsive.small}`}>{t.salesPanel}</span>
          </button>
          
          <button
            onClick={() => handleNavigate('orders')}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} transition-all duration-300 ${
              activeTab === 'orders'
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-r-4 border-purple-600 dark:border-purple-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-y-105 hover:shadow-lg hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
            }`}
          >
            <Receipt className={responsive.iconSmall} />
            <span className={`font-medium ${responsive.small}`}>{t.orders}</span>
          </button>
          
          <button
            onClick={() => handleNavigate('analytics')}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} transition-all duration-300 ${
              activeTab === 'analytics'
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-r-4 border-purple-600 dark:border-purple-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-y-105 hover:shadow-lg hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
            }`}
          >
            <BarChart3 className={responsive.iconSmall} />
            <span className={`font-medium ${responsive.small}`}>{t.statistics}</span>
          </button>
          
          <button
            onClick={() => handleNavigate('barcode')}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} transition-all duration-300 ${
              activeTab === 'barcode'
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-r-4 border-purple-600 dark:border-purple-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-y-105 hover:shadow-lg hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
            }`}
          >
            <Barcode className={responsive.iconSmall} />
            <span className={`font-medium ${responsive.small}`}>{t.searchByBarcode}</span>
          </button>
          
          <button
            onClick={() => handleNavigate('smm')}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} transition-all duration-300 ${
              activeTab === 'smm'
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-r-4 border-purple-600 dark:border-purple-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-y-105 hover:shadow-lg hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
            }`}
          >
            <Megaphone className={responsive.iconSmall} />
            <span className={`font-medium ${responsive.small}`}>{t.smm}</span>
          </button>

          <button
            onClick={() => handleNavigate('discounts')}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} transition-all duration-300 ${
              activeTab === 'discounts'
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-r-4 border-purple-600 dark:border-purple-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-y-105 hover:shadow-lg hover:shadow-purple-200/50 dark:hover:shadow-purple-900/50'
            }`}
          >
            <Tag className={responsive.iconSmall} />
            <span className={`font-medium ${responsive.small}`}>{t.discountsManagement}</span>
          </button>

          <button
            onClick={() => handleNavigate('purchases')}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'} transition-all duration-300 ${
              activeTab === 'purchases'
                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-r-4 border-indigo-600 dark:border-indigo-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 hover:scale-y-105 hover:shadow-lg hover:shadow-indigo-200/50 dark:hover:shadow-indigo-900/50'
            }`}
          >
            <TruckIcon className={responsive.iconSmall} />
            <span className={`font-medium ${responsive.small}`}>{t.purchasesExpense}</span>
          </button>

        </nav>

        {/* Кнопка выхода внизу - АДАПТИВНО */}
        <div className={`border-t border-gray-200 dark:border-gray-700 ${isMobile ? 'p-2' : 'p-3'}`}>
          {/* 🌙 Переключатель темы */}
          <div className={`mb-2 flex items-center justify-center gap-1 ${isMobile ? 'p-1' : 'p-2'} bg-gray-50 dark:bg-gray-800/50 rounded-lg`}>
            <Sun className={`${responsive.iconSmall} text-gray-500 dark:text-gray-400`} />
            <button
              onClick={() => setTheme('light')}
              className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded transition font-medium ${
                effectiveTheme === 'light' 
                  ? 'bg-yellow-500 text-white' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500'
              }`}
            >
              ☀️
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded transition font-medium ${
                effectiveTheme === 'dark' 
                  ? 'bg-gray-800 text-white' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500'
              }`}
            >
              🌙
            </button>
          </div>
          
          {/* �🌐 Выбор языка */}
          <div className={`mb-2 flex items-center justify-center gap-1 ${isMobile ? 'p-1' : 'p-2'} bg-gray-50 dark:bg-gray-800/50 rounded-lg`}>
            <Globe className={`${responsive.iconSmall} text-gray-500 dark:text-gray-400`} />
            <button
              onClick={() => setCurrentLanguage('uz')}
              className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded transition font-medium ${
                language === 'uz' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500'
              }`}
            >
              🇺🇿 O'zb
            </button>
            <button
              onClick={() => setCurrentLanguage('ru')}
              className={`${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded transition font-medium ${
                language === 'ru' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500'
              }`}
            >
              🇷🇺 Рус
            </button>
          </div>
          
          <button
            onClick={onLogout}
            className={`w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 ${isMobile ? 'px-2 py-1.5' : 'px-3 py-2'} rounded-lg transition-colors font-medium ${responsive.small}`}
          >
            <LogOut className={responsive.iconSmall} />
            {t.logout}
          </button>
        </div>
      </aside>

      {/* ✅ ОСНОВНОЙ КОНТЕНТ СПРАВА - АДАПТИВНЫЙ */}
      <main className={`flex-1 w-full overflow-x-hidden ${isDesktop ? 'lg:ml-56' : ''} ${isMobile || isTablet ? 'ml-0' : ''}`}>
        {/* Header с названием активной панели */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          <div className={`${responsive.container} flex items-center justify-between gap-4`}>
            <div className="flex items-center gap-4">
              {/* 📱 Кнопка гамбургера (только на мобильных) */}
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <Menu className={isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-gray-600 dark:text-gray-300 />
              </button>

              <h1 className={`${responsive.heading} font-bold text-gray-800 dark:text-gray-100`}>
                {activeTab === 'warehouse' && t.inventory}
                {activeTab === 'sales' && t.salesPanel}
                {activeTab === 'orders' && t.orders}
                {activeTab === 'analytics' && t.statistics}
                {activeTab === 'barcode' && t.searchByBarcode}
                {activeTab === 'smm' && t.smm}
                {activeTab === 'discounts' && t.discountsManagement}
                {activeTab === 'purchases' && t.purchasesExpense}
              </h1>
            </div>
            
            {/* 📨 Иконка сообщений Axis (перенесена из sidebar) */}
            <button
              onClick={() => {
                setShowInbox(true);
                setUnreadMessagesCount(0);
              }}
              className="relative p-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-all duration-300 group"
              title="Сообщения Axis"
            >
              <MessageSquare 
                className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-gray-600 dark:text-gray-300 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition ${
                  unreadMessagesCount > 0 ? 'fill-purple-100 dark:fill-purple-900 animate-pulse' : ''
                }`} 
              />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-gradient-to-br from-red-500 to-red-600 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-800 animate-bounce">
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Контент панелей */}
        <div className={responsive.container}>
          {activeTab === 'warehouse' && <DigitalWarehouse companyId={companyId} />}
          {activeTab === 'sales' && <SalesPanel companyId={companyId} />}
          {activeTab === 'orders' && <CompanyOrdersPanel companyId={companyId} />}
          {activeTab === 'analytics' && <AnalyticsPanel companyId={companyId} />}
          {activeTab === 'barcode' && <BarcodeSearchPanel companyId={companyId} />}
          {activeTab === 'smm' && <CompanySMMPanel companyId={companyId} companyName={companyName} />}
          {activeTab === 'discounts' && <CompanyDiscountsManager companyId={companyId} products={[]} />}
          {activeTab === 'purchases' && <ProductPurchasesPanel companyId={companyId} />}
        </div>
      </main>

      {/* 📨 Модальное окно входящих сообщений */}
      {showInbox && (
        <CompanyInboxPanel 
          companyId={companyId} 
          onClose={() => setShowInbox(false)} 
        />
      )}
    </div>
  );
}