import { useState, useEffect, useMemo } from 'react';
import { Receipt, Save, X, TrendingDown, Plus, Trash2, Calendar, Clock, DollarSign, Edit2 } from 'lucide-react';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';

interface CustomExpense {
  id: number;
  company_id: number;
  expense_name: string;
  amount: number;
  monthly_amount: number;
  description: string | null;
  expense_date: string;
  created_at: string;
}

interface ExpensesManagerProps {
  companyId: number;
  onCustomExpensesUpdate?: (totalCustomExpenses: number) => void;
}

export default function ExpensesManager({
  companyId,
  onCustomExpensesUpdate
}: ExpensesManagerProps) {
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

  const [customExpenses, setCustomExpenses] = useState<CustomExpense[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ expense_name: '', monthly_amount: '', description: '' });
  const [newExpenseForm, setNewExpenseForm] = useState({
    expense_name: '',
    monthly_amount: '',
    description: ''
  });

  // Расчёт дней в текущем месяце и текущего дня
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();

  // Расчёт пропорциональных затрат
  const getDailyRate = (monthlyAmount: number) => monthlyAmount / daysInMonth;
  const getAccumulatedThisMonth = (monthlyAmount: number) => getDailyRate(monthlyAmount) * currentDay;

  // Общая накопленная сумма за текущий месяц
  const totalAccumulated = useMemo(() => {
    return customExpenses.reduce((sum, exp) => {
      return sum + getAccumulatedThisMonth(exp.monthly_amount || 0);
    }, 0);
  }, [customExpenses, currentDay, daysInMonth]);

  // Общая месячная сумма
  const totalMonthly = useMemo(() => {
    return customExpenses.reduce((sum, exp) => sum + (exp.monthly_amount || 0), 0);
  }, [customExpenses]);

  useEffect(() => {
    loadCustomExpenses();
  }, [companyId]);

  useEffect(() => {
    if (onCustomExpensesUpdate) {
      onCustomExpensesUpdate(totalAccumulated);
    }
  }, [totalAccumulated, onCustomExpensesUpdate]);

  const loadCustomExpenses = async () => {
    try {
      setLoadingCustom(true);
      const response = await fetch(`/api/custom-expenses?companyId=${companyId}`);
      if (response.ok) {
        const data = await response.json();
        setCustomExpenses(data || []);
        console.log('✅ Loaded custom expenses:', data?.length || 0);
      } else {
        console.error('Failed to load custom expenses');
        setCustomExpenses([]);
      }
    } catch (error) {
      console.error('Ошибка загрузки пользовательских затрат:', error);
      setCustomExpenses([]);
    } finally {
      setLoadingCustom(false);
    }
  };

  const handleAddCustomExpense = async () => {
    try {
      if (!newExpenseForm.expense_name.trim() || !newExpenseForm.monthly_amount) {
        alert(t.fillNameAndAmount);
        return;
      }

      const monthlyAmount = parseFloat(newExpenseForm.monthly_amount);

      const response = await fetch('/api/custom-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          expense_name: newExpenseForm.expense_name,
          amount: 0,
          monthly_amount: monthlyAmount,
          description: newExpenseForm.description || null
        })
      });

      if (response.ok) {
        setNewExpenseForm({ expense_name: '', monthly_amount: '', description: '' });
        setShowAddForm(false);
        await loadCustomExpenses();
        alert(t.expenseAddedSuccess);
      } else {
        alert(t.errorAddingExpense);
      }
    } catch (error) {
      console.error('Ошибка добавления затраты:', error);
      alert(t.errorAddingExpense);
    }
  };

  const handleDeleteCustomExpense = async (id: number) => {
    if (!confirm(t.deleteExpenseConfirm)) return;

    try {
      const response = await fetch(`/api/custom-expenses/${id}`, { method: 'DELETE' });
      if (response.ok) {
        await loadCustomExpenses();
        alert(t.expenseDeletedSuccess);
      } else {
        alert(t.errorDeletingExpense);
      }
    } catch (error) {
      console.error('Ошибка удаления затраты:', error);
      alert(t.errorDeletingExpense);
    }
  };

  const handleStartEdit = (expense: CustomExpense) => {
    setEditingId(expense.id);
    setEditForm({
      expense_name: expense.expense_name,
      monthly_amount: String(expense.monthly_amount || 0),
      description: expense.description || ''
    });
  };

  const handleSaveEdit = async (expenseId: number) => {
    try {
      const monthlyAmount = parseFloat(editForm.monthly_amount) || 0;
      const response = await fetch(`/api/custom-expenses/${expenseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_name: editForm.expense_name,
          amount: 0,
          monthly_amount: monthlyAmount,
          description: editForm.description || null
        })
      });

      if (response.ok) {
        setEditingId(null);
        await loadCustomExpenses();
        alert(t.expensesUpdatedSuccess);
      } else {
        alert(t.errorUpdatingExpenses);
      }
    } catch (error) {
      console.error('Error updating custom expense:', error);
      alert(t.errorUpdatingExpenses);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(Math.round(price)) + ' сум';
  };

  const cardColors = [
    { gradient: 'from-blue-500 to-blue-600', lightBg: 'from-blue-50 to-blue-100', border: 'border-blue-200', text: 'text-blue-900', textLight: 'text-blue-600', darkBg: 'dark:from-blue-900/30 dark:to-blue-800/30', darkBorder: 'dark:border-blue-700', darkText: 'dark:text-blue-300', darkTextLight: 'dark:text-blue-400' },
    { gradient: 'from-emerald-500 to-emerald-600', lightBg: 'from-emerald-50 to-emerald-100', border: 'border-emerald-200', text: 'text-emerald-900', textLight: 'text-emerald-600', darkBg: 'dark:from-emerald-900/30 dark:to-emerald-800/30', darkBorder: 'dark:border-emerald-700', darkText: 'dark:text-emerald-300', darkTextLight: 'dark:text-emerald-400' },
    { gradient: 'from-orange-500 to-orange-600', lightBg: 'from-orange-50 to-orange-100', border: 'border-orange-200', text: 'text-orange-900', textLight: 'text-orange-600', darkBg: 'dark:from-orange-900/30 dark:to-orange-800/30', darkBorder: 'dark:border-orange-700', darkText: 'dark:text-orange-300', darkTextLight: 'dark:text-orange-400' },
    { gradient: 'from-purple-500 to-purple-600', lightBg: 'from-purple-50 to-purple-100', border: 'border-purple-200', text: 'text-purple-900', textLight: 'text-purple-600', darkBg: 'dark:from-purple-900/30 dark:to-purple-800/30', darkBorder: 'dark:border-purple-700', darkText: 'dark:text-purple-300', darkTextLight: 'dark:text-purple-400' },
    { gradient: 'from-pink-500 to-pink-600', lightBg: 'from-pink-50 to-pink-100', border: 'border-pink-200', text: 'text-pink-900', textLight: 'text-pink-600', darkBg: 'dark:from-pink-900/30 dark:to-pink-800/30', darkBorder: 'dark:border-pink-700', darkText: 'dark:text-pink-300', darkTextLight: 'dark:text-pink-400' },
  ];

  // Прогресс-бар: текущий день / дней в месяце
  const progressPercent = (currentDay / daysInMonth) * 100;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TrendingDown className="w-6 h-6 text-red-600 dark:text-red-400" />
          <div>
            <h2 className="text-xl font-bold dark:text-white">{t.companyExpensesTitle || t.companyExpenses}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t.totalExpenses} <strong className="text-red-600 dark:text-red-400">{formatPrice(totalAccumulated)}</strong>
              <span className="ml-2 text-gray-400 dark:text-gray-500">
                / {formatPrice(totalMonthly)} {language === 'uz' ? 'oyiga' : 'в месяц'}
              </span>
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.addExpense}
        </button>
      </div>

      {/* Прогресс-бар месяца */}
      <div className="mb-6 bg-gray-100 dark:bg-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Calendar className="w-4 h-4" />
            <span>{language === 'uz' ? 'Oyning borishi' : 'Прогресс месяца'}</span>
          </div>
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
            {currentDay} / {daysInMonth} {language === 'uz' ? 'kun' : 'дней'}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{language === 'uz' ? 'Oy boshi' : 'Начало'}</span>
          <span>{language === 'uz' ? 'Oy oxiri' : 'Конец месяца'}</span>
        </div>
      </div>

      {/* Форма добавления */}
      {showAddForm && (
        <div className="mb-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded-xl p-6 shadow-lg">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 dark:text-white">
            <Plus className="w-5 h-5 text-green-600 dark:text-green-400" />
            {t.newExpense}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.expenseName}</label>
              <input
                type="text"
                value={newExpenseForm.expense_name}
                onChange={(e: any) => setNewExpenseForm({ ...newExpenseForm, expense_name: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                placeholder={t.expenseNamePlaceholder}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {language === 'uz' ? 'Oylik summa (so\'m)' : 'Сумма в месяц (сум)'}
              </label>
              <input
                type="number"
                value={newExpenseForm.monthly_amount}
                onChange={(e: any) => setNewExpenseForm({ ...newExpenseForm, monthly_amount: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                placeholder="3 000 000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.descriptionOptional}</label>
              <input
                type="text"
                value={newExpenseForm.description}
                onChange={(e: any) => setNewExpenseForm({ ...newExpenseForm, description: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                placeholder={t.additionalInfo}
              />
            </div>
          </div>
          {/* Предварительный расчёт */}
          {newExpenseForm.monthly_amount && parseFloat(newExpenseForm.monthly_amount) > 0 && (
            <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                📊 {language === 'uz' ? 'Hisoblash' : 'Расчёт'}:&nbsp;
                {formatPrice(parseFloat(newExpenseForm.monthly_amount))} ÷ {daysInMonth}&nbsp;
                {language === 'uz' ? 'kun' : 'дней'} = <strong>{formatPrice(getDailyRate(parseFloat(newExpenseForm.monthly_amount)))}</strong>&nbsp;
                {language === 'uz' ? 'kuniga' : 'в день'}
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAddCustomExpense}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Save className="w-4 h-4" />
              {t.saveExpense}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewExpenseForm({ expense_name: '', monthly_amount: '', description: '' });
              }}
              className="flex items-center gap-2 bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium"
            >
              <X className="w-4 h-4" />
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Карточки затрат */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loadingCustom ? (
          <div className="flex items-center justify-center p-12 bg-gray-50 dark:bg-gray-700 rounded-2xl border-2 border-gray-200 dark:border-gray-600">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : customExpenses.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{language === 'uz' ? 'Xarajatlar yo\'q' : 'Нет затрат'}</p>
            <p className="text-sm mt-1">{language === 'uz' ? 'Yangi xarajat qo\'shish uchun yuqoridagi tugmani bosing' : 'Нажмите "Добавить затрату" чтобы начать'}</p>
          </div>
        ) : (
          customExpenses.map((expense, index) => {
            const colors = cardColors[index % cardColors.length];
            const daily = getDailyRate(expense.monthly_amount || 0);
            const accumulated = getAccumulatedThisMonth(expense.monthly_amount || 0);
            const isEditingThis = editingId === expense.id;

            return (
              <div key={expense.id} className={`group bg-gradient-to-br ${colors.lightBg} ${colors.darkBg} border-2 ${colors.border} ${colors.darkBorder} rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all duration-300 relative`}>
                {/* Кнопки действий */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isEditingThis && (
                    <>
                      <button
                        onClick={() => handleStartEdit(expense)}
                        className="p-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
                        title={t.editExpenses}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomExpense(expense.id)}
                        className="p-2 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                        title={t.deleteExpenseTooltip}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

                {isEditingThis ? (
                  /* Форма редактирования */
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editForm.expense_name}
                      onChange={(e: any) => setEditForm({ ...editForm, expense_name: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm font-medium"
                      placeholder={t.expenseName}
                    />
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'uz' ? 'Oylik summa' : 'Сумма в месяц'}
                      </label>
                      <input
                        type="number"
                        value={editForm.monthly_amount}
                        onChange={(e: any) => setEditForm({ ...editForm, monthly_amount: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm"
                      />
                    </div>
                    <input
                      type="text"
                      value={editForm.description}
                      onChange={(e: any) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm"
                      placeholder={t.descriptionOptional}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(expense.id)}
                        className="flex-1 flex items-center justify-center gap-1 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
                      >
                        <Save className="w-3 h-3" /> {t.save}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 flex items-center justify-center gap-1 bg-gray-500 text-white px-3 py-2 rounded-lg hover:bg-gray-600 text-sm font-medium"
                      >
                        <X className="w-3 h-3" /> {t.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Отображение карточки */
                  <>
                    {/* Название и иконка */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`bg-gradient-to-br ${colors.gradient} p-3 rounded-xl shadow-md`}>
                        <Receipt className="w-6 h-6 text-white" />
                      </div>
                      <div className={`text-lg font-semibold ${colors.text} ${colors.darkText} flex-1 truncate`} title={expense.expense_name}>
                        {expense.expense_name}
                      </div>
                    </div>

                    {/* Месячная сумма */}
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <DollarSign className="w-3 h-3" />
                        {language === 'uz' ? 'Oylik summa' : 'Сумма в месяц'}
                      </div>
                      <div className={`text-2xl font-bold ${colors.text} ${colors.darkText}`}>
                        {formatPrice(expense.monthly_amount || 0)}
                      </div>
                    </div>

                    {/* Ежедневная ставка */}
                    <div className="flex items-center gap-2 mb-2 bg-white/60 dark:bg-gray-800/40 rounded-lg px-3 py-2">
                      <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {language === 'uz' ? 'Kuniga' : 'В день'}:
                      </span>
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                        {formatPrice(daily)}
                      </span>
                    </div>

                    {/* Накопилось за текущий месяц */}
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                          {language === 'uz' ? `${currentDay} kunga yig'ildi` : `Накоплено за ${currentDay} дней`}
                        </span>
                        <span className="text-lg font-bold text-red-700 dark:text-red-300">
                          {formatPrice(accumulated)}
                        </span>
                      </div>
                      {/* Мини прогресс-бар */}
                      <div className="w-full bg-red-100 dark:bg-red-900/40 rounded-full h-1.5 mt-1.5">
                        <div
                          className="bg-red-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Описание */}
                    {expense.description && (
                      <div className={`text-sm ${colors.textLight} ${colors.darkTextLight} mt-3 truncate`} title={expense.description}>
                        {expense.description}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Итоговая сводка */}
      {customExpenses.length > 0 && (
        <div className="mt-6 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {language === 'uz' ? 'Oylik jami' : 'Всего в месяц'}
              </div>
              <div className="text-xl font-bold text-gray-800 dark:text-gray-200">
                {formatPrice(totalMonthly)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {language === 'uz' ? 'Kuniga jami' : 'Всего в день'}
              </div>
              <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                {formatPrice(getDailyRate(totalMonthly))}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {language === 'uz' ? `${currentDay} kunga yig'ildi` : `Накоплено за ${currentDay} дней`}
              </div>
              <div className="text-xl font-bold text-red-600 dark:text-red-400">
                {formatPrice(totalAccumulated)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
