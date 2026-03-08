import { useState } from 'react';
import { Building2, Phone, Lock, Ticket } from 'lucide-react';
import api from '../utils/api';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';

interface CompanyLoginProps {
  onLogin: (companyData: any) => void;
}

export default function CompanyLogin({ onLogin }: CompanyLoginProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(''); // 👥 Реферальный код (опционально)
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const language = getCurrentLanguage();
  const t = useTranslation(language);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone.trim() || !password.trim()) {
      setError(t.fillAllFields);
      return;
    }

    setLoading(true);
    try {
      // 🔐 Проверка админа ПЕРВЫМ ДЕЛОМ
      if (phone === '914751330' && password === '15051') {
        console.log('✅ Admin login detected');
        setLoading(false);
        onLogin({ 
          id: 0, 
          phone: '914751330', 
          name: 'Admin',
          isAdmin: true 
        });
        return;
      }

      // 👥 Передаём реферальный код при логине (если указан)
      const response = await api.auth.loginCompany(phone, password, undefined, referralCode || undefined);
      console.log('✅ Company login successful:', response);
      
      // Передаём данные компании из response.company
      if (response.company) {
        onLogin(response.company);
      } else {
        throw new Error('Company data not found in response');
      }
    } catch (err) {
      console.error('❌ Company login error:', err);
      setError(err instanceof Error ? err.message : t.invalidPhoneOrPassword);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
              <Building2 className="w-8 h-8 text-purple-600" />
            </div>
          </div>
          
          <h1 className="text-center mb-2 text-2xl font-bold">{t.companyLoginTitle}</h1>
          <p className="text-center text-gray-600 mb-6">{t.enterCompanyData}</p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-700 mb-2 font-medium">{t.phoneNumber}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="901234567"
                  maxLength={9}
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-700 mb-2 font-medium">{t.password}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder={t.enterPassword}
                />
              </div>
            </div>

            {/* 👥 Реферальный код (опционально) */}
            <div>
              <label className="block text-gray-700 mb-2 font-medium">
                {t.referralCodeOptional}
              </label>
              <div className="relative">
                <Ticket className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 7) {
                      setReferralCode(value);
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono tracking-wider"
                  placeholder="1234567"
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                💡 {t.referralCodeHint} ({referralCode.length}/7)
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? t.loading : t.loginButton}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}