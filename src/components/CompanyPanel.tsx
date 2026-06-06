import { useState, useEffect } from 'react';
import { Building2, LogOut, Package, ShoppingCart, Receipt, BarChart3, Barcode, Megaphone, Menu, X, Globe, Tag, Sun, Moon, MessageSquare, RotateCcw, LayoutDashboard, MessageCircleQuestion } from 'lucide-react';
import CompanyDashboardPanel from './CompanyDashboardPanel';
import CompanyQuestionsPanel from './CompanyQuestionsPanel';
import { DigitalWarehouse } from './DigitalWarehouse';
import SalesPanel from './SalesPanel';
import CompanyOrdersPanel from './CompanyOrdersPanel';
import AnalyticsPanel from './AnalyticsPanel';
import BarcodeSearchPanel from './BarcodeSearchPanel';
import CompanySMMPanel from './CompanySMMPanel';
import CompanyDiscountsManager from './CompanyDiscountsManager';
import CompanyReturnsPanel from './CompanyReturnsPanel';
import CompanyInboxPanel from './CompanyInboxPanel';
import { getCurrentLanguage, setCurrentLanguage, type Language, useTranslation } from '../utils/translations';
import { useResponsive, useResponsiveClasses } from '../hooks/useResponsive';
import { useTheme } from '../utils/ThemeContext';

interface CompanyPanelProps {
  onLogout: () => void;
  companyId: number;
  companyName: string;
}

export default function CompanyPanel({ onLogout, companyId, companyName }: CompanyPanelProps) {
  useEffect(() => {
    console.log('CompanyPanel mounted - companyId:', companyId, 'companyName:', companyName);
    if (!companyId || companyId === 0) {
      console.error('CRITICAL: CompanyPanel received invalid companyId!', companyId);
      alert('Ошибка: Неверный ID компании. Пожалуйста, выйдите и войдите заново.');
    }
  }, [companyId, companyName]);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'warehouse' | 'sales' | 'orders' | 'analytics' | 'barcode' | 'smm' | 'discounts' | 'returns' | 'questions'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const { isMobile, isDesktop } = useResponsive();
  const responsive = useResponsiveClasses();

  const { effectiveTheme, setTheme } = useTheme();

  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const t = useTranslation(language);

  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent) => {
      setLanguage(e.detail);
    };
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => {
      window.removeEventListener('languageChange', handleLanguageChange as EventListener);
    };
  }, []);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    let previousCount = unreadMessagesCount;

    const playNotificationSound = () => {
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PVqzn77BdGAg+ltryxnMnBSuBzvLZiTYHGWi77eeeTRAMUKfj8LZjHAY4ktfyzHksBSR2x/DdkUAKE1+06eqnVRQKRp/g8r9sIQUxh9Hz04IzBh5uwO/jmUgND1as5++wXRgIPpba8sZzJwUrgc7y2Yk2BxlpvO3nnk0QDFCn4/C2YxwGOJLX8sx5LAUkdsfw3ZFAChNftOnqp1UUCkaf4PK/bCEFMYfR89OCMwYeacDv45lIDQ9XrOjt8FwYBz64gf17i+sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wwvBnrv7/w==');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Notification sound blocked:', e));
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
          if (newCount > previousCount && previousCount !== null) {
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
    const interval = setInterval(loadUnreadCount, 5000);
    return () => clearInterval(interval);
  }, [companyId]);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    const validTabs: Array<typeof activeTab> = ['dashboard', 'warehouse', 'sales', 'orders', 'analytics', 'barcode', 'smm', 'discounts', 'returns', 'questions'];
    const initialTab = validTabs.includes(hash as any) ? (hash as typeof activeTab) : 'dashboard';

    const currentState = window.history.state || {};
    window.history.replaceState({ ...currentState, tab: initialTab, page: 'company' }, '', `#${initialTab}`);

    if (initialTab !== activeTab) {
      setActiveTab(initialTab);
    }

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.tab) {
        setActiveTab(event.state.tab);
        setIsSidebarOpen(false);
      } else {
        setActiveTab('warehouse');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (tab: typeof activeTab) => {
    window.history.pushState({ tab: tab, page: 'company' }, '', `#${tab}`);
    setActiveTab(tab);
    setIsSidebarOpen(false);
    window.scrollTo(0, 0);
  };

  console.log('[CompanyPanel] Rendered with:', { companyId, companyName, type: typeof companyId });

  const navItems = [
    { key: 'dashboard' as const,  icon: LayoutDashboard, label: 'Дашборд' },
    { key: 'warehouse' as const,  icon: Package,      label: t.inventory },
    { key: 'sales' as const,      icon: ShoppingCart, label: t.salesPanel },
    { key: 'orders' as const,     icon: Receipt,      label: t.orders },
    { key: 'analytics' as const,  icon: BarChart3,    label: t.statistics },
    { key: 'barcode' as const,    icon: Barcode,      label: t.searchByBarcode },
    { key: 'smm' as const,        icon: Megaphone,    label: t.smm },
    { key: 'discounts' as const,  icon: Tag,          label: t.discountsManagement },
    { key: 'returns' as const,    icon: RotateCcw,    label: 'Возвраты' },
    { key: 'questions' as const,  icon: MessageCircleQuestion, label: 'Вопросы' },
  ];

  return (
    <div
      className="min-h-screen flex overflow-x-hidden"
      style={{ background: 'var(--ax-bg)', color: 'var(--ax-text)' }}
    >
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className={`flex flex-col fixed h-full z-30 transition-transform duration-300 lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{
          width: isMobile ? '82vw' : '220px',
          background: 'var(--ax-sidebar)',
          borderRight: '1px solid var(--ax-border)',
          boxShadow: 'var(--ax-shadow)',
        }}
      >
        {/* Brand header */}
        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{
            padding: isMobile ? '14px' : '16px',
            borderBottom: '1px solid rgba(255,255,255,0.15)',
            background: 'var(--ax-primary)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.2)' }}
            >
              <Building2 className="w-5 h-5" style={{ color: '#fff' }} />
            </div>
            <div className="min-w-0">
              <h2
                className="font-semibold truncate"
                style={{ fontSize: isMobile ? 13 : 14, color: '#fff', lineHeight: 1.25 }}
              >
                {companyName}
              </h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{t.companyPanel}</p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden rounded-lg transition-colors"
            style={{ padding: 5, color: 'rgba(255,255,255,0.8)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto" style={{ padding: '10px 8px' }}>
          {navItems.map(({ key, icon: Icon, label }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => handleNavigate(key)}
                className="w-full flex items-center gap-2.5 transition-all duration-200"
                style={{
                  padding: isMobile ? '9px 12px' : '10px 14px',
                  marginBottom: 2,
                  borderRadius: 10,
                  background: active ? 'var(--ax-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--ax-text-2)',
                  fontWeight: active ? 600 : 500,
                  fontSize: isMobile ? 13 : 14,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--ax-sidebar-hover)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <Icon className={responsive.iconSmall} style={{ flexShrink: 0 }} />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div style={{ borderTop: '1px solid var(--ax-border)', padding: isMobile ? 10 : 12, flexShrink: 0 }}>
          {/* Theme toggle */}
          <div
            className="flex items-center justify-between rounded-xl mb-2"
            style={{ padding: '6px 10px', background: 'var(--ax-primary-pale)' }}
          >
            <Sun className="w-3.5 h-3.5" style={{ color: 'var(--ax-text-3)', flexShrink: 0 }} />
            <div className="flex gap-1">
              <button
                onClick={() => setTheme('light')}
                className="rounded-lg font-medium transition-all"
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  background: effectiveTheme === 'light' ? 'var(--ax-primary)' : 'transparent',
                  color: effectiveTheme === 'light' ? '#fff' : 'var(--ax-text-2)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ☀️
              </button>
              <button
                onClick={() => setTheme('dark')}
                className="rounded-lg font-medium transition-all"
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  background: effectiveTheme === 'dark' ? 'var(--ax-primary)' : 'transparent',
                  color: effectiveTheme === 'dark' ? '#fff' : 'var(--ax-text-2)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🌙
              </button>
            </div>
            <Moon className="w-3.5 h-3.5" style={{ color: 'var(--ax-text-3)', flexShrink: 0 }} />
          </div>

          {/* Language toggle */}
          <div
            className="flex items-center justify-between rounded-xl mb-2"
            style={{ padding: '6px 10px', background: 'var(--ax-primary-pale)' }}
          >
            <Globe className="w-3.5 h-3.5" style={{ color: 'var(--ax-text-3)', flexShrink: 0 }} />
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentLanguage('uz')}
                className="rounded-lg font-medium transition-all"
                style={{
                  padding: '4px 9px',
                  fontSize: 11,
                  background: language === 'uz' ? 'var(--ax-primary)' : 'transparent',
                  color: language === 'uz' ? '#fff' : 'var(--ax-text-2)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🇺🇿 O'zb
              </button>
              <button
                onClick={() => setCurrentLanguage('ru')}
                className="rounded-lg font-medium transition-all"
                style={{
                  padding: '4px 9px',
                  fontSize: 11,
                  background: language === 'ru' ? 'var(--ax-primary)' : 'transparent',
                  color: language === 'ru' ? '#fff' : 'var(--ax-text-2)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🇷🇺 Рус
              </button>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl font-medium transition-all"
            style={{
              padding: isMobile ? '8px' : '9px',
              fontSize: 13,
              background: 'rgba(220,38,38,0.08)',
              color: 'var(--ax-danger)',
              border: '1px solid transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.15)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.08)'; }}
          >
            <LogOut className={responsive.iconSmall} />
            {t.logout}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main
        className="flex-1 w-full overflow-x-hidden"
        style={{ marginLeft: isDesktop ? 220 : 0 }}
      >
        {/* Sticky header */}
        <header
          className="sticky top-0 z-10"
          style={{
            background: 'var(--ax-surface)',
            borderBottom: '1px solid var(--ax-border)',
          }}
        >
          <div
            className="flex items-center justify-between gap-4"
            style={{ padding: isMobile ? '10px 14px' : '12px 20px' }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden rounded-xl transition"
                style={{
                  padding: 8,
                  background: 'var(--ax-primary-pale)',
                  color: 'var(--ax-primary)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Menu className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
              </button>

              <h1
                className="font-bold"
                style={{ fontSize: isMobile ? 16 : 18, color: 'var(--ax-text)' }}
              >
                {activeTab === 'warehouse' && t.inventory}
                {activeTab === 'sales' && t.salesPanel}
                {activeTab === 'orders' && t.orders}
                {activeTab === 'analytics' && t.statistics}
                {activeTab === 'barcode' && t.searchByBarcode}
                {activeTab === 'smm' && t.smm}
                {activeTab === 'discounts' && t.discountsManagement}
                {activeTab === 'dashboard' && 'Дашборд'}
                {activeTab === 'returns' && 'Возвраты'}
                {activeTab === 'questions' && 'Вопросы'}
              </h1>
            </div>

            {/* Inbox button */}
            <button
              onClick={() => { setShowInbox(true); setUnreadMessagesCount(0); }}
              className="relative rounded-xl transition-all"
              style={{
                padding: isMobile ? 8 : 9,
                background: 'var(--ax-primary-pale)',
                color: 'var(--ax-primary)',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Axis Messages"
            >
              <MessageSquare className="w-5 h-5" />
              {unreadMessagesCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 text-white font-bold rounded-full flex items-center justify-center animate-bounce"
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: '0 4px',
                    background: 'var(--ax-danger)',
                    fontSize: 10,
                  }}
                >
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Panel content */}
        <div style={{ padding: isMobile ? '12px 8px' : '16px' }}>
          {activeTab === 'warehouse' && <DigitalWarehouse companyId={companyId} />}
          {activeTab === 'sales' && <SalesPanel companyId={companyId} />}
          {activeTab === 'orders' && <CompanyOrdersPanel companyId={companyId} />}
          {activeTab === 'analytics' && <AnalyticsPanel companyId={companyId} />}
          {activeTab === 'barcode' && <BarcodeSearchPanel companyId={companyId} />}
          {activeTab === 'smm' && <CompanySMMPanel companyId={companyId} companyName={companyName} />}
          {activeTab === 'discounts' && <CompanyDiscountsManager companyId={companyId} products={[]} />}
          {activeTab === 'dashboard' && <CompanyDashboardPanel companyId={companyId} onNavigate={(tab) => handleNavigate(tab as typeof activeTab)} />}
          {activeTab === 'returns' && <CompanyReturnsPanel companyId={companyId} />}
          {activeTab === 'questions' && <CompanyQuestionsPanel companyId={companyId} companyName={companyName} />}
        </div>
      </main>

      {/* Inbox modal */}
      {showInbox && (
        <CompanyInboxPanel
          companyId={companyId}
          onClose={() => setShowInbox(false)}
        />
      )}
    </div>
  );
}
