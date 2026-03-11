import React, { useState, useEffect } from 'react';
import CompanyDiscountsPanel from './CompanyDiscountsPanel';
import CompanyAggressiveDiscountsPanel from './CompanyAggressiveDiscountsPanel';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';

interface CompanyDiscountsManagerProps {
  companyId: number;
  products?: any[];
}

export default function CompanyDiscountsManager({ companyId, products = [] }: CompanyDiscountsManagerProps) {
  const [activeTab, setActiveTab] = useState<'regular' | 'aggressive'>('regular');
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const t = useTranslation(language);

  useEffect(() => {
    const handleStorage = () => setLanguage(getCurrentLanguage());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <div className="discounts-panel-container" style={{ width: '100%', height: '100%' }}>
      {/* Tabs */}
      <div className="discounts-tabs" style={{
        display: 'flex',
        gap: '10px',
        padding: '20px 20px 0 20px',
        borderBottom: '2px solid #e5e7eb',
      }}>
        <button
          className={`discounts-tab ${activeTab === 'regular' ? 'discounts-tab-active' : 'discounts-tab-inactive'}`}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
            ...(activeTab === 'regular'
              ? { borderBottom: '3px solid #3b82f6', marginBottom: '-2px' }
              : {})
          }}
          onClick={() => setActiveTab('regular')}
        >
          🏷️ {t.regularDiscounts}
        </button>
        <button
          className={`discounts-tab ${activeTab === 'aggressive' ? 'discounts-tab-active' : 'discounts-tab-inactive'}`}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
            ...(activeTab === 'aggressive'
              ? { borderBottom: '3px solid #3b82f6', marginBottom: '-2px' }
              : {})
          }}
          onClick={() => setActiveTab('aggressive')}
        >
          🔥 {t.aggressiveDiscounts}
        </button>
      </div>

      {/* Content */}
      <div className="discounts-content" style={{ minHeight: 'calc(100vh - 120px)' }}>
        {activeTab === 'regular' && (
          <CompanyDiscountsPanel companyId={companyId} products={products} />
        )}
        {activeTab === 'aggressive' && (
          <CompanyAggressiveDiscountsPanel companyId={companyId} products={products} />
        )}
      </div>
    </div>
  );
}
