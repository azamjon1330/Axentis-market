import { useState, useEffect } from 'react';
import { Lock, Unlock, Copy, Check, RefreshCw, AlertCircle, Globe, Shield, Truck, RotateCcw } from 'lucide-react';
import api from '../utils/api';
import { useTranslation, getCurrentLanguage } from '../utils/translations';

interface CompanySettingsPanelProps {
  companyId: number;
  companyName: string;
}

export default function CompanySettingsPanel({ companyId }: CompanySettingsPanelProps) {
  const language = getCurrentLanguage();
  const t = useTranslation(language);
  
  const [companyMode, setCompanyMode] = useState<'public' | 'private'>('public');
  const [privateCode, setPrivateCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);

  // 🚚 Доставка и ↩️ возвраты
  const [freeRadiusKm, setFreeRadiusKm] = useState('2');
  const [costPerKm, setCostPerKm] = useState('1500');
  const [returnEnabled, setReturnEnabled] = useState(true);
  const [returnWindowHours, setReturnWindowHours] = useState('24');
  const [savingDelivery, setSavingDelivery] = useState(false);

  useEffect(() => {
    loadCompanyData();
  }, [companyId]);

  const loadCompanyData = async () => {
    try {
      setLoading(true);
      const companies = await api.companies.list();
      const company = companies.find((c: any) => c.id === companyId);

      if (company) {
        setCompanyMode(company.mode || 'public');
        setPrivateCode(company.privateCode || null);
      }

      // Полные настройки доставки/возвратов берём из детального эндпоинта
      try {
        const full = await api.companies.get(String(companyId));
        if (full) {
          if (full.deliveryRadiusKm != null) setFreeRadiusKm(String(full.deliveryRadiusKm));
          if (full.deliveryCostPerKm != null) setCostPerKm(String(full.deliveryCostPerKm));
          if (full.returnEnabled != null) setReturnEnabled(!!full.returnEnabled);
          if (full.returnWindowHours != null) setReturnWindowHours(String(full.returnWindowHours));
        }
      } catch { /* ignore */ }
    } catch (error) {
      console.error('Error loading company data:', error);
      alert(t.errorLoadingCompanyData);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDelivery = async () => {
    try {
      setSavingDelivery(true);
      await api.companies.update(String(companyId), {
        deliveryRadiusKm: parseFloat(freeRadiusKm) || 0,
        deliveryCostPerKm: parseFloat(costPerKm) || 0,
        returnEnabled,
        returnWindowHours: parseInt(returnWindowHours, 10) || 0,
      });
      alert('Настройки доставки и возвратов сохранены');
    } catch (error) {
      console.error('Error saving delivery settings:', error);
      alert('Не удалось сохранить настройки');
    } finally {
      setSavingDelivery(false);
    }
  };

  const handleTogglePrivacy = async () => {
    const newMode = companyMode === 'public' ? 'private' : 'public';
    
    const confirmMessage = newMode === 'private'
      ? t.switchToPrivateConfirm
      : t.switchToPublicConfirm;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setSwitchingMode(true);
      
      const response = await fetch(`${api.baseURL}/api/companies/${companyId}/privacy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });

      if (!response.ok) {
        throw new Error('Failed to update privacy mode');
      }

      const data = await response.json();
      
      setCompanyMode(newMode);
      setPrivateCode(data.privateCode || null);
      
      const successMessage = newMode === 'private'
        ? `${t.switchedToPrivate}\n${t.yourAccessCode}: ${data.privateCode}`
        : t.switchedToPublic;
      
      alert(successMessage);
    } catch (error) {
      console.error('Error toggling privacy:', error);
      alert(t.errorChangingPrivacy);
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleCopyCode = async () => {
    if (!privateCode) return;
    
    try {
      await navigator.clipboard.writeText(privateCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
      alert(t.errorCopyingCode);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Заголовок */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8" />
          <h2 className="text-2xl font-bold">
            {t.privacyTitle}
          </h2>
        </div>
        <p className="text-purple-100 text-sm">
          {t.privacyDescription}
        </p>
      </div>

      {/* Текущий режим */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {companyMode === 'private' ? (
              <Lock className="w-6 h-6 text-purple-600" />
            ) : (
              <Globe className="w-6 h-6 text-blue-600" />
            )}
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {t.currentMode}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {companyMode === 'private' ? t.privateCompany : t.publicCompany}
              </p>
            </div>
          </div>
          
          <div className={`px-4 py-2 rounded-lg font-medium ${
            companyMode === 'private' 
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' 
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
          }`}>
            {companyMode === 'private' ? t.privateMode : t.publicMode}
          </div>
        </div>

        {/* Описание режимов */}
        <div className="space-y-4 mb-6">
          <div className={`p-4 rounded-lg border-2 ${
            companyMode === 'public' 
              ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20' 
              : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
          }`}>
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-blue-600 mt-1" />
              <div>
                <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-1">
                  {t.publicModeTitle}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t.publicModeDescription}
                </p>
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-lg border-2 ${
            companyMode === 'private' 
              ? 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-900/20' 
              : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
          }`}>
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-purple-600 mt-1" />
              <div>
                <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-1">
                  {t.privateModeTitle}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t.privateModeDescription}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Код доступа (если приватный режим) */}
        {companyMode === 'private' && privateCode && (
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 border-2 border-purple-300 dark:border-purple-700 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-purple-600" />
              <h4 className="font-bold text-gray-800 dark:text-gray-100">
                {t.yourAccessCode}
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-purple-400 dark:border-purple-600">
                <div className="text-center">
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 tracking-wider font-mono">
                    {privateCode}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t.shareCodeWithCustomers}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCopyCode}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg transition-colors flex items-center gap-2 font-medium"
              >
                {copiedCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copiedCode ? t.copied : t.copyCode}
              </button>
            </div>
          </div>
        )}

        {/* Кнопка переключения */}
        <button
          onClick={handleTogglePrivacy}
          disabled={switchingMode}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
            switchingMode
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
              : companyMode === 'private'
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          {switchingMode ? (
            <>
              <RefreshCw className="w-6 h-6 animate-spin" />
              {t.switching}
            </>
          ) : companyMode === 'private' ? (
            <>
              <Unlock className="w-6 h-6" />
              {t.switchToPublicMode}
            </>
          ) : (
            <>
              <Lock className="w-6 h-6" />
              {t.switchToPrivateMode}
            </>
          )}
        </button>
      </div>

      {/* 🚚 Доставка */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-5">
          <Truck className="w-6 h-6 text-emerald-600" />
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Доставка</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Бесплатно в радиусе, далее — фиксированный тариф за каждый километр
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Бесплатный радиус (км)
            </label>
            <input
              type="number" min="0" step="0.5"
              value={freeRadiusKm}
              onChange={(e) => setFreeRadiusKm(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Цена за км сверх радиуса (сум)
            </label>
            <input
              type="number" min="0" step="500"
              value={costPerKm}
              onChange={(e) => setCostPerKm(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Пример: радиус 3 км и 1500 сум/км → заказ за 5 км = (5−3)×1500 = 3000 сум.
        </p>
      </div>

      {/* ↩️ Возвраты */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-5">
          <RotateCcw className="w-6 h-6 text-orange-600" />
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Возвраты</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Эти правила управляются вами, а не администратором платформы
            </p>
          </div>
        </div>
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={returnEnabled}
            onChange={(e) => setReturnEnabled(e.target.checked)}
            className="w-5 h-5 accent-orange-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Принимать возвраты от покупателей</span>
        </label>
        <div className={returnEnabled ? '' : 'opacity-50 pointer-events-none'}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Срок возврата (часов с момента заказа)
          </label>
          <input
            type="number" min="0" step="1"
            value={returnWindowHours}
            onChange={(e) => setReturnWindowHours(e.target.value)}
            className="w-full sm:w-1/2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      <button
        onClick={handleSaveDelivery}
        disabled={savingDelivery}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
          savingDelivery
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl'
        }`}
      >
        {savingDelivery ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
        Сохранить доставку и возвраты
      </button>

      {/* Информация */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
          <div className="text-sm text-yellow-800 dark:text-yellow-300">
            <p className="font-bold mb-2">
              {t.importantNote}
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t.privacyImportantNote1}</li>
              <li>{t.privacyImportantNote2}</li>
              <li>{t.privacyImportantNote3}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
