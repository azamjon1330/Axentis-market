import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Package, Check } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '../utils/api';

interface Category {
  id: number;
  name: string;
  icon: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminCategoriesPanel() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    icon: '📦',
    description: '',
    sortOrder: 0
  });

  const icons = ['📦', '📱', '💻', '👕', '👟', '🎮', '🎧', '📚', '🏠', '🚗', '🍔', '💄', '⌚', '🎁', '🔧', '💊'];

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await fetch(`${API_BASE.replace('/api', '')}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data || []);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Ошибка загрузки категорий');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Введите название категории');
      return;
    }

    try {
      const url = editingId 
        ? `${API_BASE.replace('/api', '')}/api/categories/${editingId}`
        : `${API_BASE.replace('/api', '')}/api/categories`;
      
      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success(editingId ? 'Категория обновлена!' : 'Категория создана!');
        loadCategories();
        resetForm();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка сохранения');
      }
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Ошибка сохранения категории');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить эту категорию?')) return;

    try {
      const response = await fetch(`${API_BASE.replace('/api', '')}/api/categories/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Категория удалена');
        loadCategories();
      } else {
        toast.error('Ошибка удаления');
      }
    } catch (error) {
      toast.error('Ошибка удаления категории');
    }
  };

  const handleToggleActive = async (category: Category) => {
    try {
      const response = await fetch(`${API_BASE.replace('/api', '')}/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !category.isActive })
      });

      if (response.ok) {
        toast.success(category.isActive ? 'Категория скрыта' : 'Категория активирована');
        loadCategories();
      }
    } catch (error) {
      toast.error('Ошибка изменения статуса');
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      icon: category.icon,
      description: category.description || '',
      sortOrder: category.sortOrder
    });
    setIsAdding(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({ name: '', icon: '📦', description: '', sortOrder: 0 });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-gray-500">Загрузка категорий...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Package className="w-8 h-8" />
          <h2 className="text-xl font-bold">Управление категориями</h2>
        </div>
        <p className="text-blue-100">
          Создавайте категории товаров. Компании смогут выбирать их при добавлении товаров.
        </p>
      </div>

      {/* Форма добавления/редактирования */}
      {isAdding ? (
        <div className="bg-white rounded-lg shadow-sm p-6 border-2 border-blue-500">
          <h3 className="font-semibold mb-4">
            {editingId ? 'Редактирование категории' : 'Новая категория'}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Название *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Например: Смартфоны"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Иконка
              </label>
              <div className="flex flex-wrap gap-2">
                {icons.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setFormData({ ...formData, icon })}
                    className={`w-10 h-10 text-xl rounded-lg border-2 transition ${
                      formData.icon === icon 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Описание
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Краткое описание категории"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Порядок сортировки
              </label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Save className="w-4 h-4" />
              {editingId ? 'Сохранить' : 'Создать'}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-2 px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              <X className="w-4 h-4" />
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full py-4 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 transition flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Добавить категорию
        </button>
      )}

      {/* Список категорий */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-800">
            Все категории ({categories.length})
          </h3>
        </div>

        {categories.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Категорий пока нет</p>
            <p className="text-sm">Создайте первую категорию</p>
          </div>
        ) : (
          <div className="divide-y">
            {categories.map((category) => (
              <div
                key={category.id}
                className={`p-4 flex items-center justify-between hover:bg-gray-50 transition ${
                  !category.isActive ? 'opacity-50 bg-gray-100' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{category.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900">{category.name}</h4>
                      {!category.isActive && (
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                          Скрыта
                        </span>
                      )}
                    </div>
                    {category.description && (
                      <p className="text-sm text-gray-500">{category.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Порядок: {category.sortOrder}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(category)}
                    className={`p-2 rounded-lg transition ${
                      category.isActive
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={category.isActive ? 'Скрыть' : 'Активировать'}
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => startEdit(category)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    title="Редактировать"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Удалить"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
