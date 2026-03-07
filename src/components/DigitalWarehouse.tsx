import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCache } from '../utils/productsCache';
import { Upload, Edit2, Trash2, Package, Plus, X, Check, Search, Download, Image as ImageIcon } from 'lucide-react';
import api, { API_BASE } from '../utils/api';
import { useCompanyProducts, ramCache } from '../utils/cache';
import ImageUploader from './ImageUploader';
import ExcelColumnMapper, { ColumnMapping } from './ExcelColumnMapper';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';

// 📋 СИСТЕМА УПРАВЛЕНИЯ КАТЕГОРИЯМИ:
// ✅ Категории могут создаваться независимо от товаров
// ✅ Для хранения пустых категорий используются скрытые товары-маркеры: "__CATEGORY_MARKER__[название_категории]"
// ✅ Маркеры автоматически удаляются при добавлении первого реального товара в категорию
// ✅ Маркеры автоматически создаются при удалении последнего товара из категории
// ✅ Маркеры скрыты от пользователей (available_to_customers: false)
// ✅ Маркеры фильтруются во всех списках, статистике, экспорте и импорте

// Локальный кэш для продуктов (упрощенная версия)
const localCache = {
  data: null as any,
  timestamp: 0,
  ttl: 3000, // 3 секунды
  get() {
    if (Date.now() - this.timestamp > this.ttl) return null;
    return this.data;
  },
  set(data: any) {
    this.data = data;
    this.timestamp = Date.now();
  },
  clear() {
    this.data = null;
    this.timestamp = 0;
  }
};

interface DigitalWarehouseProps {
  companyId: number;
}

export const DigitalWarehouse: React.FC<DigitalWarehouseProps> = ({ companyId }) => {
  // 🔍 DEBUG: Проверка companyId при монтировании
  useEffect(() => {
    console.log('🏢 DigitalWarehouse mounted with companyId:', companyId);
    if (!companyId || companyId === 0) {
      console.error('❌ CRITICAL ERROR: companyId is missing or invalid!', companyId);
      alert(t.companyIdNotFound);
    }
  }, [companyId]);
  
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
  
  const queryClient = useQueryClient();
  const { data: products = [], isLoading, error, refetch } = useCompanyProducts(companyId);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', quantity: 0, price: 0, markupPercent: 0, barcode: '', category: '', barid: '', description: '', color: '', size: '', brand: '', hasColorOptions: false, availableForCustomers: true });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', quantity: 0, price: 0, markupPercent: 0, barcode: '', category: '', barid: '', description: '', color: '', size: '', brand: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showImageUploader, setShowImageUploader] = useState<string | null>(null); // ID товара для которого показываем загрузчик фото
  
  // 🔄 Real-time обновления каждые 3 секунды
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (!importing && !editingId) {
        console.log('🔄 Auto-refresh товаров...');
        ramCache.delete(`company_products_${companyId}`);
        localCache.clear();
        refetch();
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, [companyId, importing, editingId, refetch]);
  
  // 🆕 Состояние для гибкого импорта Excel с выбором колонок
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [excelPreviewData, setExcelPreviewData] = useState<{ columns: string[], sampleData: string[][], fullData: any[][] } | null>(null);

  // 🆕 ГЛОБАЛЬНЫЕ КАТЕГОРИИ из админки
  const [globalCategories, setGlobalCategories] = useState<{id: number, name: string, icon: string}[]>([]);
  
  // Загружаем глобальные категории из API
  useEffect(() => {
    const loadGlobalCategories = async () => {
      try {
        const response = await fetch(`${API_BASE.replace('/api', '')}/api/categories?activeOnly=true`);
        if (response.ok) {
          const data = await response.json();
          setGlobalCategories(data || []);
        }
      } catch (error) {
        console.error('Error loading global categories:', error);
      }
    };
    loadGlobalCategories();
  }, []);

  // Получаем уникальные категории из товаров (для фильтрации)
  const categories = useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    const cats = new Set(products.map((p: any) => p.category || 'Без категории'));
    return Array.from(cats).sort();
  }, [products]);

  // Фильтрация товаров
  const filteredProducts = useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    return products.filter((product: any) => {
      // 🚫 Скрываем товары-маркеры категорий из списка
      if (product.name && product.name.startsWith('__CATEGORY_MARKER__')) {
        return false;
      }
      
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.barcode && product.barcode.includes(searchTerm)) ||
        (product.barid && product.barid.includes(searchTerm));
      const matchesCategory = selectedCategory === 'all' || 
        (product.category || 'Без категории') === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  // Статистика склада
  const warehouseStats = useMemo(() => {
    if (!products || !Array.isArray(products)) return { totalProducts: 0, totalQuantity: 0, totalValue: 0, lowStockCount: 0 };
    // 🚫 Исключаем товары-маркеры категорий из статистики
    const realProducts = products.filter((p: any) => !p.name || !p.name.startsWith('__CATEGORY_MARKER__'));
    
    return {
      totalProducts: realProducts.length,
      totalQuantity: realProducts.reduce((sum: number, p: any) => sum + (p.quantity || 0), 0),
      totalValue: realProducts.reduce((sum: number, p: any) => sum + ((p.price || 0) * (p.quantity || 0)), 0),
      categories: categories.length
    };
  }, [products, categories]);

  const handleEdit = (product: any) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      quantity: product.quantity,
      price: product.price,
      markupPercent: product.markupPercent || 0,
      barcode: product.barcode || '',
      category: product.category || '',
      barid: product.barid || '',
      description: product.description || '',
      color: product.color || '',
      size: product.size || '',
      brand: product.brand || '',
      hasColorOptions: product.hasColorOptions || false,
      availableForCustomers: product.availableForCustomers !== false
    });
  };

  const handleSave = async (id: string) => {
    try {
      // ✅ Валидация markup_percent перед отправкой
      const validatedMarkup = Math.min(Math.max(0, editForm.markupPercent), 999.99);
      
      if (validatedMarkup !== editForm.markupPercent) {
        alert(`⚠️ Процент наценки исправлен с ${editForm.markupPercent}% на ${validatedMarkup}%. Диапазон: 0-999.99%.`);
      }
      
      // 🎯 Подготовка данных в формате camelCase для backend
      const updateData = {
        name: editForm.name,
        quantity: editForm.quantity,
        price: editForm.price,
        markupPercent: validatedMarkup,
        barcode: editForm.barcode || '',
        barid: editForm.barid || '',
        category: editForm.category || '',
        description: editForm.description || '',
        color: editForm.color || '',
        size: editForm.size || '',
        brand: editForm.brand || '',
        hasColorOptions: editForm.hasColorOptions || false,
        availableForCustomers: editForm.availableForCustomers !== false
      };
      
      // 🎯 Проверяем изменение категории
      const originalProduct = products.find((p: any) => p.id === id);
      const oldCategory = originalProduct?.category;
      const newCategory = updateData.category;
      
      // 🎯 Если товар переносится в новую категорию, удаляем маркер новой категории
      if (newCategory && newCategory !== oldCategory) {
        const newCategoryMarker = products.find((p: any) => 
          p.name === `__CATEGORY_MARKER__${newCategory}` && p.category === newCategory
        );
        if (newCategoryMarker) {
          await api.products.delete(newCategoryMarker.id);
        }
      }
      
      await api.products.update(id, updateData);
      
      // 🎯 Если это был последний реальный товар в старой категории, создаем маркер
      if (oldCategory && oldCategory !== newCategory) {
        const oldCategoryProducts = products.filter((p: any) => 
          p.category === oldCategory && !p.name?.startsWith('__CATEGORY_MARKER__')
        );
        
        if (oldCategoryProducts.length === 1 && oldCategoryProducts[0].id === id) {
          await api.products.create({
            companyId: companyId,
            name: `__CATEGORY_MARKER__${oldCategory}`,
            quantity: 0,
            price: 0,
            markupPercent: 0,
            barcode: '',
            hasColorOptions: false,
            availableForCustomers: false
          });
        }
      }
      
      setEditingId(null);
      // 🔥 Принудительно перезагружаем данные БЕЗ КЭША
      console.log('🔄 Очистка кэша после редактирования...');
      ramCache.delete(`company_products_${companyId}`);
      localCache.clear();
      queryClient.removeQueries({ queryKey: ['company-products', companyId] });
      queryClient.removeQueries({ queryKey: ['products'] });
      invalidateCache();
      await refetch();
      console.log('✅ Товар успешно обновлен!');
    } catch (error) {
      console.error('Error updating product:', error);
      alert(t.updateError);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.deleteProductConfirm)) return;
    
    try {
      // 🎯 Проверяем, был ли это последний реальный товар в категории
      const productToDelete = products.find((p: any) => p.id === id);
      const productCategory = productToDelete?.category;
      
      await api.products.delete(id);
      
      // 🎯 Если это был последний реальный товар в категории, создаем маркер
      if (productCategory) {
        const categoryProducts = products.filter((p: any) => 
          p.category === productCategory && !p.name?.startsWith('__CATEGORY_MARKER__')
        );
        
        // Если удаляемый товар был последним реальным товаром в категории
        if (categoryProducts.length === 1 && categoryProducts[0].id === id) {
          // Создаем товар-маркер для сохранения категории
          await api.products.create({
            companyId: companyId,
            name: `__CATEGORY_MARKER__${productCategory}`,
            quantity: 0,
            price: 0,
            markupPercent: 0,
            barcode: '',
            hasColorOptions: false,
            availableForCustomers: false
          });
        }
      }
      
      // Перезагружаем данные сразу после удаления БЕЗ КЭША
      console.log('🔄 Очистка кэша после удаления товара...');
      ramCache.delete(`company_products_${companyId}`);
      localCache.clear();
      queryClient.removeQueries({ queryKey: ['company-products', companyId] });
      queryClient.removeQueries({ queryKey: ['products'] });
      invalidateCache();
      await refetch();
      console.log('✅ Товар успешно удален и данные обновлены!');
    } catch (error) {
      console.error('Error deleting product:', error);
      alert(t.deleteError);
      await refetch(); // Rollback on error
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || newProduct.price <= 0) {
      alert(t.fillNameAndPrice);
      return;
    }
    
    // 🔍 ПРОВЕРКА: Убедимся что companyId существует
    if (!companyId) {
      console.error('❌ ERROR: companyId is missing!');
      alert(t.companyIdNotFound);
      return;
    }
    
    console.log('🔍 Adding product with companyId:', companyId);
    
    // 🆕 Категория из глобального списка
    const finalCategory = newProduct.category;
    
    // ✅ Валидация markupPercent перед отправкой
    const validatedProduct = {
      ...newProduct,
      category: finalCategory,
      markupPercent: Math.min(Math.max(0, newProduct.markupPercent), 999.99)
    };
    
    if (newProduct.markupPercent > 999.99) {
      alert(`⚠️ Процент наценки слишком большой (${newProduct.markupPercent}%). Максимум: 999.99%. Будет установлено максимальное значение.`);
    }
    
    try {
      // 🛡️ ЗАЩИТА: Проверяем companyId перед созданием товара
      if (!companyId || companyId === 0) {
        console.error('❌ Cannot create product: Invalid companyId', companyId);
        alert(t.companyIdNotFound);
        return;
      }
      
      // 🎯 Если добавляем товар в категорию, удаляем товар-маркер этой категории
      if (finalCategory) {
        const categoryMarker = products.find((p: any) => 
          p.name === `__CATEGORY_MARKER__${finalCategory}` && p.category === finalCategory
        );
        if (categoryMarker) {
          await api.products.delete(categoryMarker.id);
        }
      }
      
      const productData = {
        companyId: companyId,
        name: validatedProduct.name,
        quantity: validatedProduct.quantity || 0,
        price: validatedProduct.price,
        markupPercent: validatedProduct.markupPercent || 0,
        barcode: validatedProduct.barcode || '',
        barid: validatedProduct.barid || '',
        category: finalCategory || '',
        description: validatedProduct.description || '',
        color: validatedProduct.color || '',
        size: validatedProduct.size || '',
        brand: validatedProduct.brand || '',
        hasColorOptions: false,
        availableForCustomers: true
      };
      
      console.log('📦 Product data to create:', productData);
      await api.products.create(productData);
      
      // Перезагружаем данные сразу после добавления БЕЗ КЭША
      console.log('🔄 Очистка кэша после добавления товара...');
      ramCache.delete(`company_products_${companyId}`);
      localCache.clear();
      queryClient.removeQueries({ queryKey: ['company-products', companyId] });
      queryClient.removeQueries({ queryKey: ['products'] });
      invalidateCache();
      await refetch();
      console.log('✅ Товар успешно добавлен и данные обновлены!');
      
      // Очищаем форму после успешного добавления
      setNewProduct({ name: '', quantity: 0, price: 0, markupPercent: 0, barcode: '', category: '', barid: '', description: '', color: '', size: '', brand: '' });
      setShowAddForm(false);
    } catch (error: any) {
      console.error('Error adding product:', error);
      // Показываем понятное сообщение об ошибке
      const errorMessage = error?.message || 'Ошибка при добавлении товара';
      alert(`❌ ${errorMessage}`);
      await refetch(); // Rollback
    }
  };

  // 🗑️ Массовое удаление ВСЕХ товаров
  const handleDeleteAllProducts = async () => {
    // 🚫 Считаем только реальные товары
    const realProducts = products.filter((p: any) => !p.name || !p.name.startsWith('__CATEGORY_MARKER__'));
    const confirmMessage = `⚠️ ВНИМАНИЕ! Вы собираетесь удалить ВСЕ ${realProducts.length} товаров!\n\nЭто действие НЕЛЬЗЯ отменить!\n\nВведите "УДАЛИТЬ" для подтверждения:`;
    const userInput = prompt(confirmMessage);
    
    if (userInput !== 'УДАЛИТЬ') {
      alert(t.deleteCancelled);
      return;
    }

    try {
      console.log('🗑️ Starting mass deletion of all products...');
      
      // Удаляем все товары по одному
      for (const product of realProducts) {
        await api.products.delete(product.id);
      }
      
      localCache.clear();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      invalidateCache();
      await refetch();
      
      alert(`✅ Успешно удалено ${realProducts.length} товаров!`);
    } catch (error) {
      console.error('Error deleting all products:', error);
      alert(t.errorMassDelete);
    }
  };

  // 📸 Обработчик обновления фотографий
  const handleImagesChange = async () => {
    // Очищаем все кэши для обновления данных
    localCache.clear();
    queryClient.invalidateQueries({ queryKey: ['products'] });
    invalidateCache();
    await refetch(); // Обновляем список товаров после загрузки/удаления фото
  };

  // 🔄 Переключение доступности товара для покупателей (не используется)
  /*
  const handleToggleAvailability = async (productId: number) => {
    try {
      console.log('🔄 Toggling availability for product:', productId);
      await api.products.bulkToggleAvailability([productId], true);
      
      localCache.clear();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      invalidateCache();
      await refetch();
    } catch (error) {
      console.error('Error toggling product availability:', error);
      alert(t.availabilityError);
    }
  };
  */

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();

    if (isExcel) {
      // 📊 Шаг 1: Парсим Excel и показываем маппер колонок
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          
          // ⚡ ВАЖНО: Ограничиваем размер файла (максимум 5MB)
          if (data.byteLength > 5 * 1024 * 1024) {
            alert(t.fileTooLarge);
            e.target.value = '';
            return;
          }
          
          // ⚡ Оптимизация: используем минимальные настройки для XLSX
          const workbook = XLSX.read(data, { 
            type: 'array',
            cellDates: false,
            cellNF: false,
            cellStyles: false,
            sheetStubs: false
          });
          
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { 
            header: 1,
            defval: '',
            blankrows: false
          }) as any[][];
          
          // ⚡ ВАЖНО: Очищаем workbook из памяти
          (workbook as any).Sheets = null;
          (workbook as any).SheetNames = null;
          
          // ⚡ Ограничиваем количество строк (максимум 10000)
          if (jsonData.length > 10000) {
            alert(`❌ ${t.tooManyRows.replace('{count}', jsonData.length.toString() )}\n\nМаксимум: 10000 строк.\nРазбейте файл на несколько частей.`);
            e.target.value = '';
            return;
          }
          
          if (jsonData.length === 0) {
            alert(t.fileEmpty);
            e.target.value = '';
            return;
          }
          
          // 📋 Извлекаем заголовки (первая строка) и данные для preview
          const firstRow = jsonData[0];
          const hasHeader = firstRow && firstRow.some((cell: any) => 
            typeof cell === 'string' && isNaN(parseFloat(cell))
          );
          
          const columns = hasHeader 
            ? firstRow.map((cell: any, idx: number) => String(cell || `Колонка ${idx + 1}`))
            : firstRow.map((_: any, idx: number) => `Колонка ${idx + 1}`);
          
          const dataStartRow = hasHeader ? 1 : 0;
          const sampleData = jsonData.slice(dataStartRow, dataStartRow + 5); // Первые 5 строк данных
          
          // 🎯 Показываем маппер колонок
          setExcelPreviewData({
            columns,
            sampleData,
            fullData: jsonData
          });
          setShowColumnMapper(true);
          
        } catch (error) {
          console.error('Error parsing Excel:', error);
          alert(t.excelReadError + (error instanceof Error ? error.message : String(error)));
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle CSV/TXT files - пока оставляем старую логику
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          
          const importedProducts: any[] = [];
          const startLine = lines[0] && lines[0].toLowerCase().includes('название') ? 1 : 0;
          
          for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            const parts = line.split(/[,;\t|]/).map(p => p.trim());
            
            if (parts.length >= 2) {
              const name = parts[0];
              const price = parseFloat(parts[1]);
              const quantity = parts[2] ? parseInt(parts[2]) : 0;
              let markupPercent = parts[3] && !isNaN(parseFloat(parts[3])) ? parseFloat(parts[3]) : undefined;
              const barcode = parts[4] || undefined;
              
              // ✅ Валидация markup_percent
              if (markupPercent !== undefined) {
                if (markupPercent > 999.99) {
                  console.warn(`⚠️ Строка ${i + 1}: markup_percent ограничен до 999.99%`);
                  markupPercent = 999.99;
                }
                if (markupPercent < 0) {
                  console.warn(`⚠️ Строка ${i + 1}: markup_percent установлен в 0%`);
                  markupPercent = 0;
                }
              }
              
              if (name && !isNaN(price) && price >= 0) {
                // 🚫 Игнорируем попытки импорта товаров-маркеров
                if (name.startsWith('__CATEGORY_MARKER__')) {
                  console.warn(`⚠️ Строка ${i + 1} пропущена (служебное название): ${name}`);
                  continue;
                }
                
                const product: any = { name, quantity, price };
                if (markupPercent !== undefined && !isNaN(markupPercent) && markupPercent >= 0) {
                  product.markupPercent = markupPercent;
                }
                if (barcode) product.barcode = barcode;
                importedProducts.push(product);
              }
            }
          }

          if (importedProducts.length > 0) {
            setImporting(true);
            setImportProgress(`Импорт ${importedProducts.length} товаров из CSV/TXT...`);
            try {
              const startTime = Date.now();
              await api.products.bulkImport(companyId, importedProducts);
              
              const duration = ((Date.now() - startTime) / 1000).toFixed(2);
              
              setImportProgress('Обновление данных...');
              localCache.clear();
              queryClient.invalidateQueries({ queryKey: ['products'] });
              invalidateCache();
              
              await refetch();
              
              // 🎯 Удаляем товары-маркеры для категорий, в которые были добавлены реальные товары
              const importedCategories = new Set(importedProducts.map(p => p.category).filter(Boolean));
              for (const category of importedCategories) {
                const categoryMarker = products.find((p: any) => 
                  p.name === `__CATEGORY_MARKER__${category}` && p.category === category
                );
                if (categoryMarker) {
                  try {
                    await api.products.delete(categoryMarker.id);
                  } catch (error) {
                    console.warn(`⚠️ Не удалось удалить маркер категории "${category}":`, error);
                  }
                }
              }
              
              // Финальное обновление после удаления маркеров
              if (importedCategories.size > 0) {
                localCache.clear();
                queryClient.invalidateQueries({ queryKey: ['products'] });
                invalidateCache();
                await refetch();
              }
              
              alert(`✅ ${t.importSuccess} за ${duration} секунд!\n\nВсего товаров: ${importedProducts.length}`);
            } finally {
              setImporting(false);
              setImportProgress('');
            }
          } else {
            alert(t.importError);
          }
        } catch (error) {
          console.error('Error importing text file:', error);
          alert(t.importFileError + (error instanceof Error ? error.message : String(error)));
          setImporting(false);
          setImportProgress('');
        }
      };
      reader.readAsText(file);
    }
    
    e.target.value = '';
  };

  const exportToExcel = () => {
    // 🚫 Исключаем товары-маркеры из экспорта
    const realProducts = products.filter((p: any) => !p.name || !p.name.startsWith('__CATEGORY_MARKER__'));
    
    const exportData = realProducts.map((p: any) => ({
      'Название': p.name,
      'Количество': p.quantity,
      'Цена': p.price,
      'Процент наценки': p.markupPercent || 0,
      'Штрих-код': p.barcode || '',
      'Barid': p.barid || '',
      'Категория': p.category || 'Без категории'
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Товары');
    XLSX.writeFile(workbook, `warehouse_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // 🎯 Обработчик подтверждения маппинга колонок
  const handleColumnMappingConfirm = async (mapping: ColumnMapping) => {
    if (!excelPreviewData) return;
    
    setShowColumnMapper(false);
    setImporting(true);
    setImportProgress('Обработка данных из Excel...');
    
    try {
      const { fullData } = excelPreviewData;
      const importedProducts: any[] = [];
      
      // Определяем с какой строки начинаются данные (пропускаем заголовок если есть)
      const firstRow = fullData[0];
      const hasHeader = firstRow && firstRow.some((cell: any) => 
        typeof cell === 'string' && isNaN(parseFloat(cell))
      );
      const startRow = hasHeader ? 1 : 0;
      
      // 📋 Обрабатываем данные с выбранным маппингом
      for (let i = startRow; i < fullData.length; i++) {
        const row = fullData[i];
        if (!row || row.length === 0) continue;
        
        // Извлекаем данные согласно маппингу
        const name = mapping.name !== null ? String(row[mapping.name] || '').trim() : '';
        const price = mapping.price !== null ? parseFloat(String(row[mapping.price] || '0')) : 0;
        const quantity = mapping.quantity !== null && row[mapping.quantity] !== undefined 
          ? parseInt(String(row[mapping.quantity] || '0')) 
          : 0;
        let markupPercent = mapping.markupPercent !== null && row[mapping.markupPercent] !== undefined 
          ? parseFloat(String(row[mapping.markupPercent] || '0')) 
          : undefined;
        const barcode = mapping.barcode !== null && row[mapping.barcode] !== undefined 
          ? String(row[mapping.barcode]).trim() 
          : undefined;
        const barid = mapping.barid !== null && row[mapping.barid] !== undefined 
          ? String(row[mapping.barid]).replace(/\D/g, '').slice(0, 6) // Только цифры, макс 6
          : undefined;
        
        // ✅ Валидация markup_percent - ограничиваем до 999.99%
        if (markupPercent !== undefined && !isNaN(markupPercent)) {
          if (markupPercent > 999.99) {
            console.warn(`⚠️ Строка ${i + 1}: markup_percent слишком большой (${markupPercent}%), ограничен до 999.99%`);
            markupPercent = 999.99;
          }
          if (markupPercent < 0) {
            console.warn(`⚠️ Строка ${i + 1}: markup_percent отрицательный (${markupPercent}%), установлен в 0%`);
            markupPercent = 0;
          }
        }
        
        console.log(`📦 Строка ${i + 1}:`, { name, quantity, price, markupPercent, barcode, barid });
        
        // ✅ Проверяем обязательные поля: только название и цена
        if (name && !isNaN(price) && price >= 0) {
          // 🚫 Игнорируем попытки импорта товаров-маркеров
          if (name.startsWith('__CATEGORY_MARKER__')) {
            console.warn(`⚠️ Строка ${i + 1} пропущена (служебное название): ${name}`);
            continue;
          }
          
          const product: any = { name, quantity, price };
          if (markupPercent !== undefined && !isNaN(markupPercent) && markupPercent >= 0) {
            product.markupPercent = markupPercent;
          }
          if (barcode) product.barcode = barcode;
          if (barid) product.barid = barid;
          importedProducts.push(product);
          console.log(`✅ Товар ${importedProducts.length} добавлен:`, product);
        } else {
          console.warn(`⚠️ Строка ${i + 1} пропущена (невалидные данные):`, { name, price, isValidName: !!name, isValidPrice: !isNaN(price) && price >= 0 });
        }
      }
      
      console.log(`📊 Итого распарсено товаров: ${importedProducts.length} из ${fullData.length - startRow} строк`);

      if (importedProducts.length > 0) {
        setImportProgress(`Импорт ${importedProducts.length} товаров в базу данных...`);
        const startTime = Date.now();
        const results = await api.products.bulkImport(companyId, importedProducts);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('✅ Импорт завершен, результаты:', results);
        
        // ⚡ ВАЖНО: Полностью очищаем ВСЕ кэши!
        setImportProgress('Обновление данных...');
        
        // Очищаем локальные кэши
        localCache.clear();
        
        // Удаляем из RAM кэша
        ramCache.delete(`company_products_${companyId}`);
        ramCache.delete(`products_${companyId}`);
        ramCache.delete('products_all');
        
        // Инвалидируем QueryClient
        queryClient.removeQueries({ queryKey: ['products'] });
        queryClient.removeQueries({ queryKey: ['company-products', companyId] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['company-products'] });
        
        invalidateCache();
        
        // Перезагружаем данные несколько раз с задержкой
        console.log('🔄 Перезагрузка данных после импорта...');
        await refetch();
        
        // Ждем 500мс и загружаем еще раз
        setTimeout(async () => {
          ramCache.delete(`company_products_${companyId}`);
          await refetch();
          console.log('🔄 Вторая перезагрузка выполнена');
        }, 500);
        
        // 🎯 Удаляем товары-маркеры для категорий, в которые были добавлены реальные товары
        const importedCategories = new Set(importedProducts.map(p => p.category).filter(Boolean));
        for (const category of importedCategories) {
          const categoryMarker = products.find((p: any) => 
            p.name === `__CATEGORY_MARKER__${category}` && p.category === category
          );
          if (categoryMarker) {
            try {
              await api.products.delete(categoryMarker.id);
              console.log(`🗑️ Удален маркер категории "${category}"`);
            } catch (error) {
              console.warn(`⚠️ Не удалось удалить маркер категории "${category}":`, error);
            }
          }
        }
        
        // Финальное обновление после удаления маркеров
        if (importedCategories.size > 0) {
          ramCache.delete(`company_products_${companyId}`);
          localCache.clear();
          queryClient.removeQueries({ queryKey: ['company-products', companyId] });
          invalidateCache();
          await refetch();
          console.log('🔄 Финальная перезагрузка после удаления маркеров');
        }
        
        alert(`✅ ${t.importSuccess} за ${duration} секунд!\n\nВсего строк в файле: ${fullData.length - startRow}\nУспешно импортировано: ${importedProducts.length} товаров\n\nОбновление данных может занять несколько секунд...`);
      } else {
        alert(t.importCheckFormat);
      }
    } catch (error) {
      console.error('Error importing with mapping:', error);
      alert(t.importErrorGeneric + (error instanceof Error ? error.message : String(error)));
    } finally {
      setImporting(false);
      setImportProgress('');
      setExcelPreviewData(null);
    }
  };

  // 🚫 Обработчик отмены маппинга
  const handleColumnMappingCancel = () => {
    setShowColumnMapper(false);
    setExcelPreviewData(null);
  };

  if (isLoading) return <div className="p-8 text-center">{t.loadingWarehouse}</div>;
  if (error) return <div className="p-8 text-center text-red-600">{t.errorLoadingWarehouse} {(error as Error).message}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <h1 className="text-xl sm:text-2xl lg:text-3xl mb-3 sm:mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2 sm:gap-3">
            <Package className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-purple-600" />
            {t.digitalWarehouse}
          </h1>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm">
              <div className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">{t.productsCount}</div>
              <div className="text-lg sm:text-xl lg:text-2xl text-purple-600">{warehouseStats.totalProducts}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm">
              <div className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">{t.totalInStock}</div>
              <div className="text-lg sm:text-xl lg:text-2xl text-blue-600">{warehouseStats.totalQuantity.toLocaleString()}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm">
              <div className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">{t.cost}</div>
              <div className="text-lg sm:text-xl lg:text-2xl text-green-600">{warehouseStats.totalValue.toLocaleString()} {t.sum}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-sm">
              <div className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">{t.categoriesCount}</div>
              <div className="text-lg sm:text-xl lg:text-2xl text-orange-600">{warehouseStats.categories}</div>
            </div>
          </div>

          {/* Search and filters */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:border-purple-500 outline-none"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:border-purple-500 outline-none"
            >
              <option value="all">{t.allCategories}</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 bg-green-600 text-white rounded-lg sm:rounded-xl hover:bg-green-700 transition-colors shadow-lg text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{t.addProduct}</span>
              <span className="sm:hidden">{t.addProductShort}</span>
            </button>

            <label className="flex items-center gap-2 px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 bg-purple-600 text-white rounded-lg sm:rounded-xl hover:bg-purple-700 transition-colors cursor-pointer shadow-lg text-sm sm:text-base">
              <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden lg:inline">{importing ? importProgress : t.importFromExcelCSV}</span>
              <span className="lg:hidden">{importing ? importProgress : t.importShort}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                onChange={handleFileImport}
                disabled={importing}
                className="hidden"
              />
            </label>

            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 bg-blue-600 text-white rounded-lg sm:rounded-xl hover:bg-blue-700 transition-colors shadow-lg text-sm sm:text-base"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{t.exportToExcel}</span>
              <span className="sm:hidden">{t.exportShort}</span>
            </button>

            <button
              onClick={handleDeleteAllProducts}
              className="flex items-center gap-2 px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 bg-red-600 text-white rounded-lg sm:rounded-xl hover:bg-red-700 transition-colors shadow-lg text-sm sm:text-base"
            >
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{t.deleteAllProducts}</span>
              <span className="sm:hidden">{t.deleteAll}</span>
            </button>
          </div>
        </div>

        {/* 🎯 Модальное окно управления товарами и категориями */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddForm(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header с вкладками */}
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold">{t.addProduct}</h3>
                  <button 
                    onClick={() => {
                      setShowAddForm(false);
                      setNewProduct({ name: '', quantity: 0, price: 0, markupPercent: 0, barcode: '', category: '', barid: '', description: '', color: '', size: '', brand: '' });
                    }}
                    className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                {/* Заголовок */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Plus className="w-6 h-6 text-white" />
                    <span className="text-xl font-semibold text-white">{t.fillProductInfo}</span>
                  </div>
                  <p className="text-purple-100 text-sm">
                    {t.categoriesAdminOnly}
                  </p>
                </div>
              </div>
              
              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                {/* Форма добавления товара */}
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <input
                        type="text"
                        placeholder={t.productNamePlaceholder}
                        value={newProduct.name}
                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                        className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                      />
                      <select
                        value={newProduct.category}
                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                        className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                      >
                        <option value="">{t.selectCategory}</option>
                        {globalCategories.map(cat => (
                          <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder={t.quantityPlaceholder}
                        value={newProduct.quantity || ''}
                        onChange={(e) => setNewProduct({ ...newProduct, quantity: parseInt(e.target.value) || 0 })}
                        className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                      />
                      <input
                        type="number"
                        placeholder={t.pricePlaceholder}
                        value={newProduct.price || ''}
                        onChange={(e) => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })}
                        className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                      />
                      <input
                        type="number"
                        placeholder={t.markupPercentPlaceholder}
                        value={newProduct.markupPercent || ''}
                        onChange={(e) => setNewProduct({ ...newProduct, markupPercent: parseFloat(e.target.value) || 0 })}
                        className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                      />
                      <input
                        type="text"
                        placeholder={t.barcodePlaceholder} value={newProduct.barcode}
                        onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                        className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                      />
                      <input
                        type="text"
                        placeholder={t.baridPlaceholder}
                        value={newProduct.barid}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, ''); // Только цифры
                          setNewProduct({ ...newProduct, barid: value });
                        }}
                        maxLength={6}
                        className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                      />
                    </div>

                    {/* Поле описания */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t.productDescription} (опционально)
                      </label>
                      <textarea
                        placeholder={t.descriptionPlaceholder}
                        value={newProduct.description}
                        onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors resize-none"
                      />
                    </div>

                    {/* Цвет, Размер и Бренд */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      {/* 🎨 Цвет */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.productColor} (опционально)</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {['Красный','Синий','Зелёный','Жёлтый','Чёрный','Белый','Серый','Коричневый','Розовый','Фиолетовый','Оранжевый','Бежевый'].map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setNewProduct({ ...newProduct, color: newProduct.color === c ? '' : c })}
                              className={`px-2 py-1 text-xs rounded-full border-2 transition-all ${newProduct.color === c ? 'border-purple-600 bg-purple-100 font-semibold' : 'border-gray-300 bg-white hover:border-purple-400'}`}
                            >{c}</button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder={t.colorPlaceholder}
                          value={newProduct.color}
                          onChange={(e) => setNewProduct({ ...newProduct, color: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                        />
                      </div>
                      {/* 📐 Размер */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.productSize} (опционально)</label>
                        <input
                          type="text"
                          placeholder={t.sizePlaceholder}
                          value={newProduct.size}
                          onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                        />
                      </div>
                      {/* 🏢 Бренд/Производитель */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">🏢 Бренд/Производитель (опционально)</label>
                        <input
                          type="text"
                          placeholder={t.brandPlaceholder}
                          value={newProduct.brand}
                          onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition-colors"
                        />
                      </div>
                    </div>
                    
                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={handleAddProduct}
                        className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 font-medium"
                      >
                        <Check className="w-5 h-5" />
                        Добавить товар
                      </button>
                      <button
                        onClick={() => {
                          setShowAddForm(false);
                          setNewProduct({ name: '', quantity: 0, price: 0, markupPercent: 0, barcode: '', category: '', barid: '', description: '', color: '', size: '', brand: '' });
                        }}
                        className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                <tr>
                  <th className="px-6 py-4 text-left">{t.productName}</th>
                  <th className="px-6 py-4 text-left">{t.categoryHeader}</th>
                  <th className="px-6 py-4 text-left">{t.quantityHeader}</th>
                  <th className="px-6 py-4 text-left">{t.basePriceHeader}</th>
                  <th className="px-6 py-4 text-left">{t.markupHeader}</th>
                  <th className="px-6 py-4 text-left">{t.sellingPriceHeader}</th>
                  <th className="px-6 py-4 text-left">{t.barcodeHeader}</th>
                  <th className="px-6 py-4 text-left">Barid</th>
                  <th className="px-6 py-4 text-right">{t.actionsHeader}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      {searchTerm || selectedCategory !== 'all' 
                        ? t.productsNotFound
                        : t.noProducts}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product: any) => (
                    <React.Fragment key={product.id}>
                      <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-6 py-4">
                          {editingId === product.id ? (
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full px-3 py-2 border-2 border-purple-300 dark:border-purple-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:border-purple-500 outline-none"
                            />
                          ) : (
                            <span className="text-gray-800 dark:text-gray-200">{product.name}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {editingId === product.id ? (
                            <select
                              value={editForm.category}
                              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              className="w-full px-3 py-2 border-2 border-purple-300 dark:border-purple-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:border-purple-500 outline-none"
                            >
                              <option value="">{t.noCategory}</option>
                              {globalCategories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="category-badge text-sm text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg font-medium">
                              {product.category || t.noCategory}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {editingId === product.id ? (
                            <input
                              type="number"
                              value={editForm.quantity}
                              onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) })}
                              className="w-24 px-3 py-2 border-2 border-purple-300 dark:border-purple-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:border-purple-500 outline-none"
                            />
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">{product.quantity}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {editingId === product.id ? (
                            <input
                              type="number"
                              value={editForm.price}
                              onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) })}
                              className="w-32 px-3 py-2 border-2 border-purple-300 dark:border-purple-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:border-purple-500 outline-none"
                            />
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">{product.price.toLocaleString()} сум</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {editingId === product.id ? (
                            <input
                              type="number"
                              value={editForm.markupPercent}
                              onChange={(e) => setEditForm({ ...editForm, markupPercent: parseFloat(e.target.value) })}
                              className="w-20 px-3 py-2 border-2 border-purple-300 dark:border-purple-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:border-purple-500 outline-none"
                            />
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">{product.markupPercent || 0}%</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-green-700 dark:text-green-400">{(product.sellingPrice || product.price).toLocaleString()} сум</span>
                        </td>
                        <td className="px-6 py-4">
                          {editingId === product.id ? (
                            <input
                              type="text"
                              value={editForm.barcode}
                              onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                              className="w-full px-3 py-2 border-2 border-purple-300 dark:border-purple-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:border-purple-500 outline-none"
                            />
                          ) : (
                            <span className="text-gray-600 dark:text-gray-400 text-sm">{product.barcode || '—'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {editingId === product.id ? (
                            <input
                              type="text"
                              value={editForm.barid}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                setEditForm({ ...editForm, barid: value });
                              }}
                              maxLength={6}
                              placeholder={t.baridDigits}
                              className="w-24 px-3 py-2 border-2 border-purple-300 dark:border-purple-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:border-purple-500 outline-none"
                            />
                          ) : (
                            <span className="text-purple-600 dark:text-purple-400 font-medium text-sm">{product.barid || '—'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            {editingId === product.id ? (
                              <>
                                <button
                                  onClick={() => handleSave(product.id)}
                                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setShowImageUploader(showImageUploader === product.id ? null : product.id)}
                                  className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                  title={t.addPhotoTitle}
                                >
                                  <ImageIcon className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleEdit(product)}
                                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(product.id)}
                                  className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* � Description Row - показывается только в режиме редактирования */}
                      {editingId === product.id && (
                        <tr className="border-b border-gray-100 bg-purple-50">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="max-w-6xl mx-auto space-y-4">
                              {/* Описание товара */}
                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-700">
                                  {t.productDescription}
                                </label>
                                <textarea
                                  value={editForm.description}
                                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                  className="w-full px-3 py-2 text-sm border-2 border-purple-300 rounded-lg focus:border-purple-500 outline-none resize-vertical"
                                  rows={2}
                                  placeholder={t.descriptionVisibleToCustomers}
                                />
                              </div>
                              
                              {/* Цвет товара - убрали кнопки, оставили только input для компактности */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-gray-700">{t.productColor}</label>
                                  <input
                                    type="text"
                                    value={editForm.color}
                                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border-2 border-purple-300 rounded-lg focus:border-purple-500 outline-none"
                                    placeholder={t.colorExamples}
                                  />
                                </div>
                                
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-gray-700">{t.productSize}</label>
                                  <input
                                    type="text"
                                    value={editForm.size}
                                    onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border-2 border-purple-300 rounded-lg focus:border-purple-500 outline-none"
                                    placeholder={t.sizeExamples}
                                  />
                                </div>
                                
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-gray-700">🏢 Бренд/Производитель</label>
                                  <input
                                    type="text"
                                    value={editForm.brand}
                                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border-2 border-purple-300 rounded-lg focus:border-purple-500 outline-none"
                                    placeholder={t.brandExamples}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {/* �📸 Image Uploader Row */}
                      {showImageUploader === product.id && (
                        <tr>
                          <td colSpan={9} className="px-6 py-4 bg-purple-50">
                            <div className="max-w-2xl">
                              <h4 className="text-lg mb-3 text-purple-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5" />
                                Фотографии товара: {product.name}
                              </h4>
                              <ImageUploader
                                productId={product.id}
                                images={product.images || []}
                                onImagesChange={handleImagesChange}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Help text */}
        <div className="import-help-panel rounded-xl p-4 mb-6 border border-gray-200 dark:border-gray-700">
          <p className="mb-2 text-gray-800 dark:text-gray-200">
            <strong>{t.exampleLabel}</strong><br />
            <code className="import-help-code text-gray-800 dark:text-gray-200 px-2 py-1 rounded">iPhone 14 | 5000000 | 10 | 15 | 1234567890 | 12345</code>
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            {t.maxQuantityInfo}<br />
            {t.markupInfo}<br />
            {t.baridInfo}<br />
            {t.consoleDetails}
          </p>
        </div>
      </div>

      {/* 🎯 Модальное окно для выбора соответствия колонок Excel */}
      {showColumnMapper && excelPreviewData && (
        <ExcelColumnMapper
          columns={excelPreviewData.columns}
          sampleData={excelPreviewData.sampleData}
          onConfirm={handleColumnMappingConfirm}
          onCancel={handleColumnMappingCancel}
        />
      )}
    </div>
  );
};