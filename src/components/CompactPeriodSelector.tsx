import { useState } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { getCurrentLanguage } from '../utils/translations';

type PeriodType = 'day' | 'yesterday' | 'week' | 'month' | 'year' | 'all';

interface CompactPeriodSelectorProps {
  value: PeriodType;
  onChange: (period: PeriodType) => void;
  label?: string;
  language?: string;
}

const periodLabelsRu: Record<PeriodType, string> = {
  day: 'Сегодня',
  yesterday: 'Вчера',
  week: 'Неделя',
  month: 'Месяц',
  year: 'Год',
  all: 'Все время'
};

const periodLabelsUz: Record<PeriodType, string> = {
  day: 'Bugun',
  yesterday: 'Kecha',
  week: 'Hafta',
  month: 'Oy',
  year: 'Yil',
  all: 'Barcha vaqt'
};

const periodEmojis: Record<PeriodType, string> = {
  day: '📅',
  yesterday: '📆',
  week: '📊',
  month: '📈',
  year: '🗓️',
  all: '🌐'
};

export default function CompactPeriodSelector({ value, onChange, label, language }: CompactPeriodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const lang = language || getCurrentLanguage();
  const periodLabels = lang === 'uz' ? periodLabelsUz : periodLabelsRu;

  return (
    <div className="relative inline-block">
      {label && (
        <div className="text-xs text-gray-600 mb-1 font-medium">{label}</div>
      )}
      
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border-0 rounded-lg transition-all duration-200 text-sm font-semibold text-white shadow-md hover:shadow-lg active:scale-95"
      >
        <Calendar className="w-4 h-4" />
        <span>{periodLabels[value]}</span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-1">
              {(Object.keys(periodLabels) as PeriodType[]).map((period) => (
                <button
                  key={period}
                  onClick={() => {
                    onChange(period);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 flex items-center justify-between group ${
                    value === period
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">{periodEmojis[period]}</span>
                    <span>{periodLabels[period]}</span>
                  </span>
                  {value === period && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}