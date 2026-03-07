import React, { useState } from 'react';
import { Check, X, ChevronDown } from 'lucide-react';

interface ExcelColumnMapperProps {
  columns: string[]; // Названия колонок из Excel (первая строка)
  sampleData: string[][]; // Первые 3-5 строк данных для preview
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}

export interface ColumnMapping {
  name: number | null; // Индекс колонки для названия
  quantity: number | null; // Индекс колонки для количества
  price: number | null; // Индекс колонки для цены
  markupPercent: number | null; // Индекс колонки для наценки (опционально)
  barcode: number | null; // Индекс колонки для штрих-кода (опционально)
  barid: number | null; // Индекс колонки для barid (опционально)
}

const fieldLabels = {
  name: 'Название товара',
  quantity: 'Количество',
  price: 'Базовая цена',
  markupPercent: 'Процент наценки (%)',
  barcode: 'Штрих-код',
  barid: 'Barid (5-6 цифр)'
};

const fieldRequired = {
  name: true,
  quantity: false,
  price: true,
  markupPercent: false,
  barcode: false,
  barid: false
};

export default function ExcelColumnMapper({ columns, sampleData, onConfirm, onCancel }: ExcelColumnMapperProps) {
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: 0,
    quantity: 1,
    price: 2,
    markupPercent: columns.length > 3 ? 3 : null,
    barcode: columns.length > 4 ? 4 : null,
    barid: columns.length > 5 ? 5 : null
  });

  const handleMapping = (field: keyof ColumnMapping, columnIndex: number | null) => {
    setMapping(prev => ({ ...prev, [field]: columnIndex }));
  };

  const isValid = () => {
    // Проверяем что все обязательные поля заполнены (только название и цена)
    return mapping.name !== null && mapping.price !== null;
  };

  const handleConfirm = () => {
    if (!isValid()) {
      alert('Заполните обязательные поля: Название и Цена');
      return;
    }
    onConfirm(mapping);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
          <h2 className="text-xl font-bold">Сопоставление колонок Excel</h2>
          <p className="text-sm text-blue-100 mt-1">Укажите какая колонка соответствует какому полю</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Mapping Controls */}
          <div className="space-y-4 mb-6">
            {(Object.keys(fieldLabels) as Array<keyof ColumnMapping>).map((field) => (
              <div key={field} className="border border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-medium text-gray-700">
                    {fieldLabels[field]}
                    {fieldRequired[field] && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <div className="relative">
                    <select
                      value={mapping[field] ?? ''}
                      onChange={(e) => handleMapping(field, e.target.value === '' ? null : Number(e.target.value))}
                      className="appearance-none border border-gray-300 rounded-lg px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">-- Не выбрано --</option>
                      {columns.map((col, idx) => (
                        <option key={idx} value={idx}>
                          Колонка {idx + 1}: {col || `(пустое название)`}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                
                {/* Preview данных для выбранной колонки */}
                {mapping[field] !== null && (
                  <div className="mt-2 p-3 bg-gray-50 rounded text-sm">
                    <div className="font-medium text-gray-600 mb-1">Предпросмотр данных:</div>
                    <div className="space-y-1">
                      {sampleData.slice(0, 3).map((row, idx) => (
                        <div key={idx} className="text-gray-700">
                          • {row[mapping[field]!] || '(пусто)'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Preview Table */}
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 font-medium text-gray-700">
              Предпросмотр первых строк файла
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {columns.map((col, idx) => (
                      <th key={idx} className="px-4 py-2 text-left font-medium text-gray-700 border-b">
                        {col || `Колонка ${idx + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleData.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b hover:bg-gray-50">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-4 py-2 text-gray-600">
                          {cell || '(пусто)'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Info */}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm text-blue-800">
              <div className="font-medium mb-2">ℹ️ Важная информация:</div>
              <ul className="list-disc list-inside space-y-1">
                <li><span className="font-medium">Обязательные поля:</span> Название, Цена</li>
                <li><span className="font-medium">Опциональные поля:</span> Количество, Процент наценки, Штрих-код</li>
                <li>Если количество не указано, будет установлено значение 0</li>
                <li>Если наценка не указана, товар будет продаваться по базовой цене</li>
                <li>Если штрих-код не указан, товар можно будет добавить позже</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            Подтвердить и импортировать
          </button>
        </div>
      </div>
    </div>
  );
}