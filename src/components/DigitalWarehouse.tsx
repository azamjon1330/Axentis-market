import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCache } from '../utils/productsCache';
import { Upload, Edit2, Trash2, Package, Plus, X, Check, Search, Download, Image as ImageIcon, ShoppingCart } from 'lucide-react';
import api, { API_BASE } from '../utils/api';
import { useCompanyProducts, ramCache } from '../utils/cache';
import ImageUploader from './ImageUploader';
import VariantPhotoUploader from './VariantPhotoUploader';
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
  const [newProduct, setNewProduct] = useState({ name: '', category: '', price: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showImageUploader, setShowImageUploader] = useState<string | null>(null); // ID товара для которого показываем загрузчик фото
  
  // 🆕 Состояние для модального окна покупки товара
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchasingProduct, setPurchasingProduct] = useState<any>(null);
  const [purchaseForm, setPurchaseForm] = useState({
    quantity: '',
    purchasePrice: '',
  });
  
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
  
  // ── Variants state ─────────────────────────────────────────────────────────
  const loadedVariantIds = React.useRef<Set<string>>(new Set());
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());
  const [productVariants, setProductVariants] = useState<Record<string, any[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Set<string>>(new Set());
  const [newVariantForms, setNewVariantForms] = useState<Record<string, {
    color: string; size: string; price: string; markupPercent: string;
    stockQuantity: string; barcode: string; sku: string; barid: string; description: string;
  }>>({});
  const [editingVariant, setEditingVariant] = useState<{productId: string; variantId: string} | null>(null);
  const [editVariantForm, setEditVariantForm] = useState<{
    color: string; size: string; price: string; markupPercent: string;
    stockQuantity: string; barcode: string; sku: string; barid: string; description: string;
  }>({ color: '', size: '', price: '', markupPercent: '', stockQuantity: '', barcode: '', sku: '', barid: '', description: '' });

  // Variants inside Add Product modal
  const [addModalVariants, setAddModalVariants] = useState<{
    color: string; size: string; price: string; markupPercent: string;
    stockQuantity: string; barcode: string; sku: string; barid: string; description: string;
  }[]>([]);

  // SKU matrix: per-color qty + sizes
  const [smartColors, setSmartColors] = useState<{color: string; qty: string; sizes: string}[]>([]);
  const [smartBasePrice, setSmartBasePrice] = useState('');
  const [smartMarkup, setSmartMarkup] = useState('0');

  // Variant purchase state
  const [showVariantPurchaseModal, setShowVariantPurchaseModal] = useState(false);
  const [purchasingVariant, setPurchasingVariant] = useState<{variant: any; product: any} | null>(null);
  const [variantPurchaseForm, setVariantPurchaseForm] = useState({ quantity: '', purchasePrice: '' });
  // Optimistic per-product default-variant override (Requirement 18.1).
  // Keyed by productId; undefined means "use the value from the product object".
  const [defaultVariantByProduct, setDefaultVariantByProduct] = useState<Record<string, number | null>>({});
  // ── End variants state ─────────────────────────────────────────────────────

  // Auto-load variants for SKU-only products so max price appears in main table
  useEffect(() => {
    if (!products || !Array.isArray(products)) return;
    products.forEach((p: any) => {
      const id = String(p.id);
      if (!p.name?.startsWith('__CATEGORY_MARKER__') &&
          (!p.price || p.price === 0) &&
          !loadedVariantIds.current.has(id)) {
        loadedVariantIds.current.add(id);
        loadVariants(id);
      }
    });
  }, [products]);

  // 🆕 Состояние для гибкого импорта Excel с выбором колонок
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [excelPreviewData, setExcelPreviewData] = useState<{ columns: string[], sampleData: string[][], fullData: any[][] } | null>(null);

  // 🆕 ГЛОБАЛЬНЫЕ КАТЕГОРИИ из админки
  const [globalCategories, setGlobalCategories] = useState<{id: number, name: string, icon: string}[]>([]);
  const [changingCategoryId, setChangingCategoryId] = useState<string | null>(null);
  
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
      totalValue: realProducts.reduce((sum: number, p: any) => sum + (p.inventoryCost || (p.price || 0) * (p.quantity || 0)), 0),
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
      // ⚠️ Количество (quantity) больше не редактируется напрямую - только через покупку товара
      const updateData = {
        name: editForm.name,
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

  // 🛒 Обработчик покупки товара
  const handlePurchase = async () => {
    if (!purchasingProduct) return;
    
    const quantity = parseFloat(purchaseForm.quantity);
    const purchasePrice = parseFloat(purchaseForm.purchasePrice);
    
    if (!quantity || quantity <= 0) {
      alert(language === 'uz' ? 'Iltimos, miqdorni kiriting' : 'Пожалуйста, введите количество');
      return;
    }
    
    if (!purchasePrice || purchasePrice <= 0) {
      alert(language === 'uz' ? 'Iltimos, sotib olish narxini kiriting' : 'Пожалуйста, введите цену закупки');
      return;
    }
    
    try {
      const totalCost = quantity * purchasePrice;
      
      // 1️⃣ Создаем запись о закупке для аналитики
      await api.productPurchases.create({
        companyId: companyId,
        productId: purchasingProduct.id,
        productName: purchasingProduct.name,
        quantity: quantity,
        purchasePrice: purchasePrice,
        totalCost: totalCost,
      });
      
      // 2️⃣ Обновляем товар: увеличиваем количество и устанавливаем цену закупки
      const newQuantity = purchasingProduct.quantity + quantity;
      await api.products.update(purchasingProduct.id, {
        quantity: newQuantity,
        price: purchasePrice, // Цена без наценки
      });
      
      // 3️⃣ Закрываем модальное окно
      setShowPurchaseModal(false);
      setPurchasingProduct(null);
      setPurchaseForm({ quantity: '', purchasePrice: '' });
      
      // 4️⃣ Обновляем данные
      console.log('🔄 Обновление данных после закупки...');
      ramCache.delete(`company_products_${companyId}`);
      localCache.clear();
      queryClient.removeQueries({ queryKey: ['company-products', companyId] });
      queryClient.removeQueries({ queryKey: ['products'] });
      queryClient.removeQueries({ queryKey: ['product-purchases'] });
      invalidateCache();
      await refetch();
      
      console.log('✅ Покупка успешно записана!');
      alert(language === 'uz' 
        ? `Tovar muvaffaqiyatli sotib olindi!\nMiqdor: ${quantity}\nNarx: ${purchasePrice} so'm\nJami: ${totalCost.toLocaleString()} so'm` 
        : `Товар успешно закуплен!\nКоличество: ${quantity}\nЦена: ${purchasePrice} сўм\nВсего: ${totalCost.toLocaleString()} сўм`
      );
    } catch (error) {
      console.error('Error recording purchase:', error);
      alert(language === 'uz' ? 'Xatolik yuz berdi' : 'Произошла ошибка');
    }
  };

  // Variant purchase handler
  const handleVariantPurchase = async () => {
    if (!purchasingVariant) return;

    const quantity = parseFloat(variantPurchaseForm.quantity);
    const purchasePrice = parseFloat(variantPurchaseForm.purchasePrice);

    if (!quantity || quantity <= 0) {
      alert(language === 'uz' ? 'Iltimos, miqdorni kiriting' : 'Пожалуйста, введите количество');
      return;
    }
    if (!purchasePrice || purchasePrice <= 0) {
      alert(language === 'uz' ? 'Iltimos, sotib olish narxini kiriting' : 'Пожалуйста, введите цену закупки');
      return;
    }

    try {
      const { variant, product } = purchasingVariant;
      const newStockQuantity = (variant.stockQuantity || 0) + quantity;
      const totalCost = quantity * purchasePrice;

      await api.products.updateVariant(String(product.id), String(variant.id), {
        stockQuantity: Math.round(newStockQuantity),
        price: purchasePrice,
      });

      const variantLabel = [variant.color, variant.size].filter(Boolean).join(', ');
      await api.productPurchases.create({
        companyId: companyId,
        productId: product.id,
        productName: variantLabel ? `${product.name} (${variantLabel})` : product.name,
        quantity: quantity,
        purchasePrice: purchasePrice,
        totalCost: totalCost,
      });

      setShowVariantPurchaseModal(false);
      setPurchasingVariant(null);
      setVariantPurchaseForm({ quantity: '', purchasePrice: '' });

      await loadVariants(String(product.id));
      ramCache.delete(`company_products_${companyId}`);
      localCache.clear();
      queryClient.removeQueries({ queryKey: ['company-products', companyId] });
      queryClient.removeQueries({ queryKey: ['product-purchases'] });
      invalidateCache();
      await refetch();

      alert(language === 'uz'
        ? `Variant muvaffaqiyatli sotib olindi!\nMiqdor: ${quantity}\nJami: ${totalCost.toLocaleString()} so'm`
        : `Вариант успешно закуплен!\nКоличество: ${quantity}\nВсего: ${totalCost.toLocaleString()} сўм`
      );
    } catch (error) {
      console.error('Error recording variant purchase:', error);
      alert(language === 'uz' ? 'Xatolik yuz berdi' : 'Произошла ошибка');
    }
  };

  // ── Variant handlers ───────────────────────────────────────────────────────
  const loadVariants = async (productId: string) => {
    setLoadingVariants(prev => new Set(prev).add(productId));
    try {
      const data = await api.products.getVariants(productId);
      setProductVariants(prev => ({ ...prev, [productId]: data || [] }));
    } catch (err) {
      console.error('Failed to load variants', err);
    } finally {
      setLoadingVariants(prev => { const s = new Set(prev); s.delete(productId); return s; });
    }
  };

  const toggleVariants = async (productId: string) => {
    const next = new Set(expandedVariants);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
      if (!productVariants[productId]) await loadVariants(productId);
    }
    setExpandedVariants(next);
    if (!newVariantForms[productId]) {
      setNewVariantForms(prev => ({
        ...prev,
        [productId]: { color: '', size: '', price: '', markupPercent: '0', stockQuantity: '0', barcode: '', sku: '', barid: '', description: '' }
      }));
    }
  };

  const handleAddVariant = async (productId: string) => {
    const form = newVariantForms[productId];
    if (!form || !form.price || parseFloat(form.price) < 0) {
      alert(language === 'uz' ? "Narxni kiriting" : "Укажите цену варианта");
      return;
    }
    try {
      await api.products.createVariant(productId, {
        color: form.color || undefined,
        size: form.size || undefined,
        price: parseFloat(form.price) || 0,
        markupPercent: parseFloat(form.markupPercent) || 0,
        stockQuantity: parseInt(form.stockQuantity) || 0,
        barcode: form.barcode || undefined,
        sku: form.sku || undefined,
        barid: form.barid || undefined,
        description: form.description || undefined,
      });
      await loadVariants(productId);
      await updateProductMinPrice(productId);
      setNewVariantForms(prev => ({
        ...prev,
        [productId]: { color: '', size: '', price: '', markupPercent: '0', stockQuantity: '0', barcode: '', sku: '', barid: '', description: '' }
      }));
      ramCache.delete(`company_products_${companyId}`);
      await refetch();
    } catch (err: any) {
      alert(err?.message || 'Ошибка при добавлении варианта');
    }
  };

  const startEditVariant = (productId: string, variant: any) => {
    setEditingVariant({ productId, variantId: String(variant.id) });
    setEditVariantForm({
      color: variant.color || '',
      size: variant.size || '',
      price: String(variant.price || ''),
      markupPercent: String(variant.markupPercent || '0'),
      stockQuantity: String(variant.stockQuantity || '0'),
      barcode: variant.barcode || '',
      sku: variant.sku || '',
      barid: variant.barid || '',
      description: variant.description || '',
    });
  };

  const handleSaveVariant = async () => {
    if (!editingVariant) return;
    const { productId, variantId } = editingVariant;
    try {
      await api.products.updateVariant(productId, variantId, {
        color: editVariantForm.color || undefined,
        size: editVariantForm.size || undefined,
        price: parseFloat(editVariantForm.price) || 0,
        markupPercent: parseFloat(editVariantForm.markupPercent) || 0,
        barcode: editVariantForm.barcode || undefined,
        sku: editVariantForm.sku || undefined,
        barid: editVariantForm.barid || undefined,
        description: editVariantForm.description || undefined,
      });
      setEditingVariant(null);
      await loadVariants(productId);
      await updateProductMinPrice(productId);
      ramCache.delete(`company_products_${companyId}`);
      await refetch();
    } catch (err: any) {
      alert(err?.message || 'Ошибка при обновлении варианта');
    }
  };

  const handleDeleteVariant = async (productId: string, variantId: string) => {
    if (!confirm(language === 'uz' ? 'Variantni o\'chirish?' : 'Удалить вариант?')) return;
    try {
      await api.products.deleteVariant(productId, variantId);
      await loadVariants(productId);
      await updateProductMinPrice(productId);
      ramCache.delete(`company_products_${companyId}`);
      await refetch();
    } catch (err: any) {
      alert(err?.message || 'Ошибка при удалении варианта');
    }
  };

  // Designate (or clear, with null) the product's default variant (Requirement 18.1/18.4).
  const handleSetDefaultVariant = async (productId: string, variantId: number | null) => {
    // Optimistic update so the selector reflects the choice immediately.
    setDefaultVariantByProduct(prev => ({ ...prev, [productId]: variantId }));
    try {
      await api.products.setDefaultVariant(productId, variantId);
      ramCache.delete(`company_products_${companyId}`);
      await refetch();
    } catch (err: any) {
      alert(err?.message || (language === 'uz' ? 'Standart variantni o\'rnatishda xatolik' : 'Ошибка при установке варианта по умолчанию'));
      // Revert optimistic override on failure.
      setDefaultVariantByProduct(prev => {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      });
    }
  };

  // Refresh variants (and product images) after a variant photo upload/delete.
  const handleVariantPhotosChange = async (productId: string) => {
    await loadVariants(productId);
    ramCache.delete(`company_products_${companyId}`);
    await refetch();
  };
  const handleInlineCategoryChange = async (productId: string, newCategory: string) => {
    const originalProduct = products.find((p: any) => String(p.id) === productId);
    const oldCategory = originalProduct?.category;
    try {
      if (newCategory && newCategory !== oldCategory) {
        const marker = products.find((p: any) =>
          p.name === `__CATEGORY_MARKER__${newCategory}` && p.category === newCategory
        );
        if (marker) await api.products.delete(marker.id);
      }
      await api.products.update(productId, { category: newCategory });
      if (oldCategory && oldCategory !== newCategory) {
        const oldCatProducts = products.filter((p: any) =>
          p.category === oldCategory && !p.name?.startsWith('__CATEGORY_MARKER__')
        );
        if (oldCatProducts.length === 1 && String(oldCatProducts[0].id) === productId) {
          await api.products.create({
            companyId,
            name: `__CATEGORY_MARKER__${oldCategory}`,
            quantity: 0,
            price: 0,
            markupPercent: 0,
            barcode: '',
            hasColorOptions: false,
            availableForCustomers: false,
          });
        }
      }
      ramCache.delete(`company_products_${companyId}`);
      setChangingCategoryId(null);
      await refetch();
    } catch (err: any) {
      alert(err?.message || 'Ошибка при смене категории');
    }
  };

  const updateProductMinPrice = async (productId: string) => {
    const variants = productVariants[productId] || [];
    if (variants.length === 0) return;
    const withPrice = variants.filter((v: any) => (v.price || 0) > 0);
    if (withPrice.length === 0) return;
    const minVariant = withPrice.reduce((min: any, v: any) =>
      (v.sellingPrice || v.price) < (min.sellingPrice || min.price) ? v : min
    );
    try {
      await api.products.update(productId, {
        price: minVariant.price,
        markupPercent: minVariant.markupPercent || 0,
      });
      ramCache.delete(`company_products_${companyId}`);
    } catch {
      // non-critical, silently ignore
    }
  };

  // ── End variant handlers ───────────────────────────────────────────────────

  // Generates SKU variants: each color has its own qty + optional sizes
  const generateVariantsFromSmartMatrix = () => {
    if (smartColors.length === 0) {
      alert(language === 'uz' ? 'Kamida bitta rang kiriting' : 'Введите хотя бы один цвет');
      return;
    }
    const rows: typeof addModalVariants = [];
    for (const entry of smartColors) {
      const color = entry.color.trim();
      if (!color) continue;
      const sizes = entry.sizes.split(',').map(s => s.trim()).filter(Boolean);
      const qty = entry.qty || '';
      if (sizes.length > 0) {
        const perSizeQty = qty && parseInt(qty) > 0
          ? String(Math.floor(parseInt(qty) / sizes.length))
          : '';
        for (const size of sizes) {
          rows.push({ color, size, price: smartBasePrice, markupPercent: smartMarkup, stockQuantity: perSizeQty, barcode: '', sku: '', barid: '', description: '' });
        }
      } else {
        rows.push({ color, size: '', price: smartBasePrice, markupPercent: smartMarkup, stockQuantity: qty, barcode: '', sku: '', barid: '', description: '' });
      }
    }
    if (rows.length === 0) {
      alert(language === 'uz' ? 'Rang nomlarini to\'ldiring' : 'Заполните названия цветов');
      return;
    }
    setAddModalVariants(prev => [...prev, ...rows]);
    setSmartColors([]);
    setSmartMode(false);
  };

  const handleAddProduct = async () => {
    if (!newProduct.name) {
      alert(language === 'uz' ? 'Tovar nomini kiriting' : 'Введите название товара');
      return;
    }
    if (addModalVariants.length === 0 && newProduct.price <= 0) {
      alert(language === 'uz' ? 'Kamida bitta tur qo\'shing yoki asosiy narx kiriting' : 'Добавьте хотя бы один вариант или укажите базовую цену');
      return;
    }
    if (addModalVariants.length > 0) {
      const badVariant = addModalVariants.find(v => !v.price || parseFloat(v.price) <= 0);
      if (badVariant) {
        alert(language === 'uz' ? 'Har bir turga narx kiriting' : 'Укажите цену для каждого варианта');
        return;
      }
    }
    
    // 🔍 ПРОВЕРКА: Убедимся что companyId существует
    if (!companyId) {
      console.error('❌ ERROR: companyId is missing!');
      alert(t.companyIdNotFound);
      return;
    }
    
    console.log('🔍 Adding product with companyId:', companyId);
    
    const finalCategory = newProduct.category;
    const validatedProduct = { ...newProduct, category: finalCategory };
    
    try {
      // 🛡️ ЗАЩИТА: Проверяем companyId перед созданием товара
      if (!companyId || companyId === 0) {
        console.error('❌ Cannot create product: Invalid companyId', companyId);
        alert(t.companyIdNotFound);
        return;
      }
      
      // Проверяем, существует ли товар с таким же названием
      const existingProduct = products.find((p: any) => {
        if (p.name?.startsWith('__CATEGORY_MARKER__')) return false;
        const nameMatch = p.name?.trim().toLowerCase() === validatedProduct.name?.trim().toLowerCase();
        if (!nameMatch) return false;
        // Если используем варианты, ищем только по названию
        if (addModalVariants.length > 0) return nameMatch;
        // Иначе проверяем и цену
        return Math.abs(p.price - validatedProduct.price) < 0.01;
      });
      
      if (existingProduct) {
        const message = language === 'uz'
          ? `⚠️ Bu nomli tovar allaqachon mavjud: ${existingProduct.name}`
          : `⚠️ Товар с таким названием уже существует: ${existingProduct.name}`;
        alert(message);
        return;
      } else {
        // 🆕 Создаем новый товар
        console.log('🆕 Создаем новый товар');

        // Удаляем маркер категории если есть
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
          quantity: 0,
          price: validatedProduct.price || 0,
          markupPercent: 0,
          barcode: '',
          barid: '',
          category: finalCategory || '',
          description: '',
          color: '',
          size: '',
          brand: '',
          hasColorOptions: addModalVariants.length > 0,
          availableForCustomers: true
        };

        console.log('📦 Product data to create:', productData);
        const createdProduct = await api.products.create(productData);

        // Создаем варианты из модального окна
        if (addModalVariants.length > 0) {
          for (const v of addModalVariants) {
            try {
              await api.products.createVariant(createdProduct.id, {
                color: v.color || undefined,
                size: v.size || undefined,
                price: parseFloat(v.price) || 0,
                markupPercent: parseFloat(v.markupPercent) || 0,
                stockQuantity: parseInt(v.stockQuantity) || 0,
                barcode: v.barcode || undefined,
                sku: v.sku || undefined,
                barid: v.barid || undefined,
                description: v.description || undefined,
              });
            } catch (e) {
              console.warn('⚠️ Не удалось создать вариант:', e);
            }
          }
        }

        const message = language === 'uz'
          ? `✅ Yangi tovar qo'shildi!\n${validatedProduct.name}`
          : `✅ Новый товар добавлен!\n${validatedProduct.name}`;
        alert(message);
      }

      // Перезагружаем данные сразу после добавления БЕЗ КЭША
      console.log('🔄 Очистка кэша после добавления товара...');
      ramCache.delete(`company_products_${companyId}`);
      localCache.clear();
      queryClient.removeQueries({ queryKey: ['company-products', companyId] });
      queryClient.removeQueries({ queryKey: ['products'] });
      invalidateCache();
      await refetch();
      console.log('✅ Товар успешно добавлен и данные обновлены!');

      setNewProduct({ name: '', category: '', price: 0 });
      setAddModalVariants([]);
      setSmartColors([]); setSmartBasePrice(''); setSmartMarkup('0');
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
            setImportProgress(t.importingFromCSV.replace('{count}', importedProducts.length.toString()));
            try {
              const startTime = Date.now();
              
              // 🔍 НОВАЯ ЛОГИКА: Проверяем дубликаты и разделяем на обновления и новые товары
              const productsToCreate: any[] = [];
              const productsToUpdate: { id: number; quantity: number }[] = [];
              
              for (const importedProduct of importedProducts) {
                const existingProduct = products.find((p: any) => {
                  if (p.name?.startsWith('__CATEGORY_MARKER__')) return false;
                  
                  const nameMatch = p.name?.trim().toLowerCase() === importedProduct.name?.trim().toLowerCase();
                  const priceMatch = Math.abs(p.price - importedProduct.price) < 0.01;
                  const barcodeMatch = (p.barcode || '') === (importedProduct.barcode || '');
                  
                  const hasBarcode = importedProduct.barcode;
                  
                  if (hasBarcode) {
                    return nameMatch && priceMatch && barcodeMatch;
                  } else {
                    return nameMatch && priceMatch;
                  }
                });
                
                if (existingProduct) {
                  const newQuantity = (existingProduct.quantity || 0) + (importedProduct.quantity || 0);
                  productsToUpdate.push({
                    id: existingProduct.id,
                    quantity: newQuantity
                  });
                  console.log(`🔄 CSV обновление: ${existingProduct.name}, ${existingProduct.quantity} → ${newQuantity}`);
                } else {
                  productsToCreate.push(importedProduct);
                  console.log(`🆕 CSV новый товар: ${importedProduct.name}`);
                }
              }
              
              console.log(`📊 CSV: Обновлений: ${productsToUpdate.length}, Новых: ${productsToCreate.length}`);
              
              // Обновляем существующие товары
              for (const update of productsToUpdate) {
                await api.products.update(update.id, { quantity: update.quantity });
              }
              
              // Создаем новые товары
              if (productsToCreate.length > 0) {
                await api.products.bulkImport(companyId, productsToCreate);
              }
              
              const duration = ((Date.now() - startTime) / 1000).toFixed(2);
              
              setImportProgress(t.updatingData);
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
              
              // 🆕 Создаем ОДНУ групповую запись о закупке для всего импорта (CSV)
              if (importedProducts.length > 0) {
                try {
                  const totalCost = importedProducts.reduce((sum, p) => sum + (p.quantity * p.price), 0);
                  const totalQuantity = importedProducts.reduce((sum, p) => sum + (p.quantity || 0), 0);
                  
                  const importDetails = importedProducts.map(p => ({
                    name: p.name,
                    quantity: p.quantity,
                    price: p.price,
                    total: p.quantity * p.price
                  }));
                  
                  await api.productPurchases.create({
                    companyId: companyId,
                    productId: null,
                    productName: language === 'uz' 
                      ? `Import: ${importedProducts.length} turdagi tovar (CSV)` 
                      : `Импорт: ${importedProducts.length} видов товара (CSV)`,
                    quantity: totalQuantity,
                    purchasePrice: totalCost / totalQuantity,
                    totalCost: totalCost,
                    notes: JSON.stringify(importDetails),
                    supplier: language === 'uz' ? 'CSV import' : 'Импорт из CSV'
                  });
                  console.log('✅ Групповая запись о закупке создана для CSV импорта');
                } catch (error) {
                  console.warn('⚠️ Не удалось создать запись о закупке для CSV импорта:', error);
                }
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
    setImportProgress(t.processingExcelData);
    
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
        setImportProgress(t.importingToDatabase.replace('{count}', importedProducts.length.toString()));
        const startTime = Date.now();
        
        // 🔍 НОВАЯ ЛОГИКА: Проверяем дубликаты и разделяем на обновления и новые товары
        const productsToCreate: any[] = [];
        const productsToUpdate: { id: number; quantity: number }[] = [];
        
        for (const importedProduct of importedProducts) {
          const existingProduct = products.find((p: any) => {
            // Игнорируем маркеры категорий
            if (p.name?.startsWith('__CATEGORY_MARKER__')) return false;
            
            // Проверяем совпадение по ключевым характеристикам
            const nameMatch = p.name?.trim().toLowerCase() === importedProduct.name?.trim().toLowerCase();
            const priceMatch = Math.abs(p.price - importedProduct.price) < 0.01;
            const barcodeMatch = (p.barcode || '') === (importedProduct.barcode || '');
            const baridMatch = (p.barid || '') === (importedProduct.barid || '');
            
            const hasBarcodeOrBarid = importedProduct.barcode || importedProduct.barid;
            
            if (hasBarcodeOrBarid) {
              return nameMatch && priceMatch && barcodeMatch && baridMatch;
            } else {
              return nameMatch && priceMatch;
            }
          });
          
          if (existingProduct) {
            // Товар найден - добавляем к обновлениям
            const newQuantity = (existingProduct.quantity || 0) + (importedProduct.quantity || 0);
            productsToUpdate.push({
              id: existingProduct.id,
              quantity: newQuantity
            });
            console.log(`🔄 Обновление: ${existingProduct.name}, ${existingProduct.quantity} → ${newQuantity}`);
          } else {
            // Товар новый - добавляем к созданию
            productsToCreate.push(importedProduct);
            console.log(`🆕 Новый товар: ${importedProduct.name}`);
          }
        }
        
        console.log(`📊 Обновлений: ${productsToUpdate.length}, Новых: ${productsToCreate.length}`);
        
        // Обновляем существующие товары
        for (const update of productsToUpdate) {
          await api.products.update(update.id, { quantity: update.quantity });
        }
        
        // Создаем новые товары
        let results = null;
        if (productsToCreate.length > 0) {
          results = await api.products.bulkImport(companyId, productsToCreate);
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('✅ Импорт завершен:', { updated: productsToUpdate.length, created: productsToCreate.length });
        
        // ⚡ ВАЖНО: Полностью очищаем ВСЕ кэши!
        setImportProgress(t.updatingData);
        
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
        
        // 🆕 Создаем ОДНУ групповую запись о закупке для всего импорта
        if (importedProducts.length > 0) {
          try {
            const totalCost = importedProducts.reduce((sum, p) => sum + (p.quantity * p.price), 0);
            const totalQuantity = importedProducts.reduce((sum, p) => sum + (p.quantity || 0), 0);
            
            // Формируем детали импорта в JSON
            const importDetails = importedProducts.map(p => ({
              name: p.name,
              quantity: p.quantity,
              price: p.price,
              total: p.quantity * p.price
            }));
            
            await api.productPurchases.create({
              companyId: companyId,
              productId: null, // Групповая закупка без привязки к конкретному товару
              productName: language === 'uz' 
                ? `Import: ${importedProducts.length} turdagi tovar` 
                : `Импорт: ${importedProducts.length} видов товара`,
              quantity: totalQuantity,
              purchasePrice: totalCost / totalQuantity, // Средняя цена
              totalCost: totalCost,
              notes: JSON.stringify(importDetails), // Детали в JSON
              supplier: language === 'uz' ? 'Excel import' : 'Импорт из Excel'
            });
            console.log('✅ Групповая запись о закупке создана для импорта');
          } catch (error) {
            console.warn('⚠️ Не удалось создать запись о закупке для импорта:', error);
          }
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
              onClick={() => { setShowAddForm(true); if (smartColors.length === 0) setSmartColors([{ color: '', qty: '', sizes: '' }]); }}
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

        {/* 🎯 Модальное окно добавления товара */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddForm(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Plus className="w-6 h-6" />
                  <h3 className="text-xl font-bold">{language === 'uz' ? 'Tovar qo\'shish' : 'Добавить товар'}</h3>
                </div>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewProduct({ name: '', category: '', price: 0 });
                    setAddModalVariants([]);
                    setSmartColors([]); setSmartBasePrice(''); setSmartMarkup('0');
                  }}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="overflow-y-auto flex-1 min-h-0 p-6 space-y-6 dark:bg-gray-800">

                {/* ── Шаг 1: Основная информация ── */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-3">
                    {language === 'uz' ? '1. Asosiy ma\'lumotlar' : '1. Основная информация'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        {language === 'uz' ? 'Tovar nomi *' : 'Название товара *'}
                      </label>
                      <input
                        type="text"
                        placeholder={language === 'uz' ? 'Masalan: Futbolka' : 'Например: Футболка'}
                        value={newProduct.name}
                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:border-purple-500 outline-none transition-colors"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        {language === 'uz' ? 'Kategoriya' : 'Категория'}
                      </label>
                      <select
                        value={newProduct.category}
                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:border-purple-500 outline-none transition-colors"
                      >
                        <option value="">{language === 'uz' ? 'Kategoriyani tanlang' : 'Выберите категорию'}</option>
                        {globalCategories.map(cat => (
                          <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        {language === 'uz' ? 'Asosiy narx (variantsiz)' : 'Базовая цена (без вариантов)'}
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={newProduct.price || ''}
                        onChange={(e) => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:border-purple-500 outline-none transition-colors"
                        min="0"
                      />
                    </div>
                  </div>
                  {addModalVariants.length > 0 && (
                    <p className="mt-2 text-xs text-purple-600 dark:text-purple-400">
                      {language === 'uz'
                        ? 'ℹ️ Variantlar qo\'shilganda asosiy narx avtomatik hisoblanadi'
                        : 'ℹ️ При наличии вариантов базовая цена вычисляется автоматически'}
                    </p>
                  )}
                </div>

                {/* ── Шаг 2: Варианты (цвета + размеры) ── */}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    {language === 'uz' ? '2. SKU — Variantlar' : '2. SKU — Варианты'}
                    {addModalVariants.length > 0 && (
                      <span className="ml-2 bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">{addModalVariants.length}</span>
                    )}
                  </h4>

                  {/* SKU Matrix */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 mb-3 border border-purple-200 dark:border-purple-700">
                      <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-2">
                        🎨 {language === 'uz' ? 'Har bir rang uchun miqdor va razmerlar' : 'Количество и размеры для каждого цвета'}
                      </p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{language === 'uz' ? 'Asosiy narx' : 'Базовая цена'}</label>
                          <input
                            type="number" placeholder="0" value={smartBasePrice}
                            onChange={e => setSmartBasePrice(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:border-purple-400 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{language === 'uz' ? 'Naценка %' : 'Наценка %'}</label>
                          <input
                            type="number" placeholder="0" value={smartMarkup}
                            onChange={e => {
                              setSmartMarkup(e.target.value);
                              if (addModalVariants.length > 0) {
                                setAddModalVariants(prev => prev.map(row => ({ ...row, markupPercent: e.target.value })));
                              }
                            }}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:border-purple-400 outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-2 mb-3">
                        {smartColors.map((entry, idx) => (
                          <div key={idx} className="flex gap-2 items-center bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2">
                            <div className="flex-1 min-w-0">
                              <label className="block text-xs text-gray-500 mb-0.5">{language === 'uz' ? 'Rang' : 'Цвет'}</label>
                              <input
                                type="text"
                                placeholder={language === 'uz' ? 'Masalan: Qora' : 'Например: Чёрный'}
                                value={entry.color}
                                onChange={e => setSmartColors(prev => prev.map((c, i) => i === idx ? { ...c, color: e.target.value } : c))}
                                className="w-full px-2 py-1 text-xs border border-purple-200 dark:border-purple-700 dark:bg-gray-700 dark:text-white rounded focus:border-purple-500 outline-none"
                              />
                            </div>
                            <div className="w-16">
                              <label className="block text-xs text-gray-500 mb-0.5">{language === 'uz' ? 'Miqdor' : 'Кол-во'}</label>
                              <input
                                type="number" placeholder="0" min="0" value={entry.qty}
                                onChange={e => setSmartColors(prev => prev.map((c, i) => i === idx ? { ...c, qty: e.target.value } : c))}
                                className="w-full px-2 py-1 text-xs border border-purple-200 dark:border-purple-700 dark:bg-gray-700 dark:text-white rounded focus:border-purple-500 outline-none"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <label className="block text-xs text-gray-500 mb-0.5">{language === 'uz' ? 'Razmerlar (vergul)' : 'Размеры (через запятую)'}</label>
                              <input
                                type="text" placeholder="S, M, L, XL" value={entry.sizes}
                                onChange={e => setSmartColors(prev => prev.map((c, i) => i === idx ? { ...c, sizes: e.target.value } : c))}
                                className="w-full px-2 py-1 text-xs border border-purple-200 dark:border-purple-700 dark:bg-gray-700 dark:text-white rounded focus:border-purple-500 outline-none"
                              />
                            </div>
                            <button
                              onClick={() => setSmartColors(prev => prev.filter((_, i) => i !== idx))}
                              className="mt-4 p-1 text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSmartColors(prev => [...prev, { color: '', qty: '', sizes: '' }])}
                          className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs rounded-lg hover:bg-purple-200 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          {language === 'uz' ? 'Rang qo\'shish' : 'Добавить цвет'}
                        </button>
                        <button
                          onClick={generateVariantsFromSmartMatrix}
                          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          {language === 'uz' ? 'Variantlar yaratish' : 'Создать варианты'}
                        </button>
                      </div>
                  </div>

                  {/* Variants Table */}
                  {addModalVariants.length > 0 && (
                    <div className="overflow-x-auto mb-3">
                      <table className="w-full text-xs border border-indigo-200 dark:border-indigo-700 rounded-lg overflow-hidden">
                        <thead className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white">
                          <tr>
                            <th className="px-2 py-2 text-left">{language === 'uz' ? 'Rang' : 'Цвет'}</th>
                            <th className="px-2 py-2 text-left">{language === 'uz' ? 'Razmer' : 'Размер'}</th>
                            <th className="px-2 py-2 text-left">{language === 'uz' ? 'Narx *' : 'Цена *'}</th>
                            <th className="px-2 py-2 text-left">{language === 'uz' ? 'Naценка %' : 'Наценка %'}</th>
                            <th className="px-2 py-2 text-left">{language === 'uz' ? 'Miqdor' : 'Кол-во'}</th>
                            <th className="px-2 py-2 text-left">{language === 'uz' ? 'Barcode' : 'Штрих-код'}</th>
                            <th className="px-2 py-2 text-left">Barid</th>
                            <th className="px-2 py-2 text-left">{language === 'uz' ? 'Tavsif' : 'Описание'}</th>
                            <th className="px-2 py-2 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-indigo-100 dark:divide-indigo-800">
                          {addModalVariants.map((v, idx) => (
                            <tr key={idx} className="bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={v.color}
                                  onChange={e => setAddModalVariants(prev => prev.map((row, i) => i === idx ? { ...row, color: e.target.value } : row))}
                                  className="w-20 px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:border-indigo-400 outline-none"
                                  placeholder="—"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={v.size}
                                  onChange={e => setAddModalVariants(prev => prev.map((row, i) => i === idx ? { ...row, size: e.target.value } : row))}
                                  className="w-16 px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:border-indigo-400 outline-none"
                                  placeholder="—"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  value={v.price}
                                  onChange={e => setAddModalVariants(prev => prev.map((row, i) => i === idx ? { ...row, price: e.target.value } : row))}
                                  className="w-24 px-2 py-1 border-2 border-indigo-300 dark:border-indigo-600 dark:bg-gray-700 dark:text-white rounded focus:border-indigo-500 outline-none"
                                  placeholder="0"
                                  min="0"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  value={v.markupPercent}
                                  onChange={e => setAddModalVariants(prev => prev.map((row, i) => i === idx ? { ...row, markupPercent: e.target.value } : row))}
                                  className="w-16 px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:border-indigo-400 outline-none"
                                  placeholder="0"
                                  min="0"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  value={v.stockQuantity}
                                  onChange={e => setAddModalVariants(prev => prev.map((row, i) => i === idx ? { ...row, stockQuantity: e.target.value } : row))}
                                  className="w-16 px-2 py-1 border-2 border-indigo-300 dark:border-indigo-600 dark:bg-gray-700 dark:text-white rounded focus:border-indigo-500 outline-none"
                                  placeholder="0"
                                  min="0"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={v.barcode}
                                  onChange={e => setAddModalVariants(prev => prev.map((row, i) => i === idx ? { ...row, barcode: e.target.value } : row))}
                                  className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:border-indigo-400 outline-none"
                                  placeholder="—"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={v.barid}
                                  onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    setAddModalVariants(prev => prev.map((row, i) => i === idx ? { ...row, barid: val } : row));
                                  }}
                                  className="w-16 px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:border-indigo-400 outline-none"
                                  placeholder="—"
                                  maxLength={6}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={v.description}
                                  onChange={e => setAddModalVariants(prev => prev.map((row, i) => i === idx ? { ...row, description: e.target.value } : row))}
                                  className="w-28 px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:border-indigo-400 outline-none"
                                  placeholder="—"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  onClick={() => setAddModalVariants(prev => prev.filter((_, i) => i !== idx))}
                                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add single variant button */}
                  <button
                    onClick={() => setAddModalVariants(prev => [...prev, { color: '', size: '', price: smartBasePrice || String(newProduct.price || ''), markupPercent: smartMarkup || '0', stockQuantity: '', barcode: '', sku: '', barid: '', description: '' }])}
                    className="flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {language === 'uz' ? 'Variant qo\'shish' : 'Добавить вариант'}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 shrink-0 dark:bg-gray-800">
                <button
                  onClick={handleAddProduct}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  <Check className="w-5 h-5" />
                  {language === 'uz' ? 'Tovar qo\'shish' : 'Добавить товар'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewProduct({ name: '', category: '', price: 0 });
                    setAddModalVariants([]);
                    setSmartColors([]); setSmartBasePrice(''); setSmartMarkup('0');
                  }}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-600 to-blue-600">
                <tr>
                  <th className="px-6 py-4 text-left text-white font-semibold">{t.productName}</th>
                  <th className="px-6 py-4 text-left text-white font-semibold">{t.categoryHeader}</th>
                  <th className="px-6 py-4 text-left text-white font-semibold">{t.quantityHeader}</th>
                  <th className="px-6 py-4 text-left text-white font-semibold">{t.basePriceHeader}</th>
                  <th className="px-6 py-4 text-left text-white font-semibold">{t.sellingPriceHeader}</th>
                  <th className="px-6 py-4 text-right text-white font-semibold">{t.actionsHeader}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      {searchTerm || selectedCategory !== 'all' 
                        ? t.productsNotFound
                        : t.noProducts}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product: any) => (
                    <React.Fragment key={product.id}>
                      <tr className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4">
                          <span className="text-gray-800 dark:text-gray-200">{product.name}</span>
                        </td>
                        <td className="px-6 py-4">
                          {changingCategoryId === String(product.id) ? (
                            <select
                              autoFocus
                              value={product.category || ''}
                              onChange={(e) => handleInlineCategoryChange(String(product.id), e.target.value)}
                              onBlur={() => setChangingCategoryId(null)}
                              className="text-sm border border-indigo-400 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                              <option value="">{t.noCategory}</option>
                              {globalCategories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className="category-badge text-sm text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg font-medium cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
                              title={language === 'uz' ? 'Kategoriyani o\'zgartirish' : 'Изменить категорию'}
                              onClick={() => setChangingCategoryId(String(product.id))}
                            >
                              {product.category || t.noCategory}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-700 dark:text-gray-300">{product.quantity}</span>
                        </td>
                        <td className="px-6 py-4">
                          {product.price > 0 ? (
                            <span className="text-gray-700 dark:text-gray-300">{product.price.toLocaleString()} сум</span>
                          ) : (
                            <span className="text-indigo-500 text-xs italic">{language === 'uz' ? 'Turlarda' : 'В вариантах'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {(() => {
                            const variants = productVariants[String(product.id)] || [];
                            const skuPrices = variants.map((v: any) => v.sellingPrice || v.price || 0).filter((p: number) => p > 0);
                            if (skuPrices.length > 0) {
                              const minPrice = Math.min(...skuPrices);
                              return <span className="text-green-700 dark:text-green-400 font-semibold">{minPrice.toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</span>;
                            }
                            if ((product.sellingPrice || 0) > 0) {
                              return <span className="text-green-700 dark:text-green-400">{product.sellingPrice.toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</span>;
                            }
                            if ((product.price || 0) > 0) {
                              return <span className="text-green-700 dark:text-green-400">{product.price.toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</span>;
                            }
                            return <span className="text-indigo-400 text-xs italic">SKU</span>;
                          })()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => toggleVariants(String(product.id))}
                              style={{
                                backgroundColor: expandedVariants.has(String(product.id)) ? '#4338ca' : '#4f46e5',
                                color: '#ffffff',
                              }}
                              className="px-3 py-2 rounded-lg transition-all duration-200 font-bold text-xs hover:opacity-90 shadow-sm"
                              title={language === 'uz' ? 'Variantlar' : 'Варианты'}
                            >
                              SKU
                            </button>
                            <button
                              onClick={() => setShowImageUploader(showImageUploader === product.id ? null : product.id)}
                              className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                              title={t.addPhotoTitle}
                            >
                              <ImageIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Variants Tree Panel */}
                      {expandedVariants.has(String(product.id)) && (
                        <tr>
                          <td colSpan={7} className="px-4 py-4 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900">
                            <div className="max-w-5xl mx-auto">
                              <h4 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-3 flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                {language === 'uz' ? 'Tovar turlari' : 'Виды товара'}: {product.name}
                              </h4>

                              {loadingVariants.has(String(product.id)) ? (
                                <p className="text-sm text-indigo-500 italic">
                                  {language === 'uz' ? 'Yuklanmoqda...' : 'Загрузка...'}
                                </p>
                              ) : (
                                <>
                                  {/* Tree variant table */}
                                  {(productVariants[String(product.id)] || []).length > 0 && (
                                    <div className="overflow-x-auto mb-4">
                                      <table className="w-full text-sm border border-indigo-200 dark:border-indigo-800 rounded-lg overflow-hidden">
                                        <thead className="bg-gradient-to-r from-[#1a3a4a] to-[#1e5478] text-white">
                                          <tr>
                                            <th className="px-3 py-2.5 text-left font-semibold">{language === 'uz' ? 'Rang' : 'Цвет'}</th>
                                            <th className="px-3 py-2.5 text-left font-semibold">{language === 'uz' ? 'Razmer' : 'Размер'}</th>
                                            <th className="px-3 py-2.5 text-left font-semibold">{language === 'uz' ? 'Narx' : 'Цена'}</th>
                                            <th className="px-3 py-2.5 text-left font-semibold">{language === 'uz' ? 'Naцen %' : 'Наценка %'}</th>
                                            <th className="px-3 py-2.5 text-left font-semibold">{language === 'uz' ? 'Sotish narxi' : 'Цена продажи'}</th>
                                            <th className="px-3 py-2.5 text-left font-semibold">{language === 'uz' ? 'Miqdor' : 'Кол-во'}</th>
                                            <th className="px-3 py-2.5 text-left font-semibold">{language === 'uz' ? 'Barcode' : 'Штрих-код'}</th>
                                            <th className="px-3 py-2.5 text-left font-semibold">Barid</th>
                                            <th className="px-3 py-2.5 text-left font-semibold">{language === 'uz' ? 'Tavsif' : 'Описание'}</th>
                                            <th className="px-3 py-2.5 text-right font-semibold">{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(() => {
                                            const allVariants: any[] = productVariants[String(product.id)] || [];
                                            const isEditing = editingVariant?.productId === String(product.id);

                                            // Flat display when any variant is being edited
                                            if (isEditing) {
                                              return allVariants.map((variant: any) => (
                                                <tr key={variant.id} className="border-t border-indigo-100 dark:border-indigo-800 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                                                  {editingVariant?.variantId === String(variant.id) ? (
                                                    <>
                                                      <td className="px-2 py-1.5"><input value={editVariantForm.color} onChange={e => setEditVariantForm({...editVariantForm, color: e.target.value})} className="w-20 px-2 py-1 text-xs border-2 border-indigo-300 rounded focus:outline-none dark:bg-gray-700 dark:text-white" placeholder={language === 'uz' ? 'rang' : 'цвет'} /></td>
                                                      <td className="px-2 py-1.5"><input value={editVariantForm.size} onChange={e => setEditVariantForm({...editVariantForm, size: e.target.value})} className="w-20 px-2 py-1 text-xs border-2 border-indigo-300 rounded focus:outline-none dark:bg-gray-700 dark:text-white" placeholder={language === 'uz' ? 'razmer' : 'размер'} /></td>
                                                      <td className="px-2 py-1.5"><input type="number" value={editVariantForm.price} onChange={e => setEditVariantForm({...editVariantForm, price: e.target.value})} className="w-24 px-2 py-1 text-xs border-2 border-indigo-300 rounded focus:outline-none dark:bg-gray-700 dark:text-white" /></td>
                                                      <td className="px-2 py-1.5"><input type="number" value={editVariantForm.markupPercent} onChange={e => setEditVariantForm({...editVariantForm, markupPercent: e.target.value})} className="w-16 px-2 py-1 text-xs border-2 border-indigo-300 rounded focus:outline-none dark:bg-gray-700 dark:text-white" /></td>
                                                      <td className="px-2 py-1.5 text-green-600 text-xs font-medium">
                                                        {((parseFloat(editVariantForm.price)||0) * (1 + (parseFloat(editVariantForm.markupPercent)||0)/100)).toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}
                                                      </td>
                                                      <td className="px-2 py-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-bold">{editVariantForm.stockQuantity}</td>
                                                      <td className="px-2 py-1.5"><input value={editVariantForm.barcode} onChange={e => setEditVariantForm({...editVariantForm, barcode: e.target.value})} className="w-24 px-2 py-1 text-xs border-2 border-indigo-300 rounded focus:outline-none dark:bg-gray-700 dark:text-white" placeholder="—" /></td>
                                                      <td className="px-2 py-1.5"><input value={editVariantForm.barid} onChange={e => setEditVariantForm({...editVariantForm, barid: e.target.value.replace(/\D/g,'')})} maxLength={6} className="w-16 px-2 py-1 text-xs border-2 border-indigo-300 rounded focus:outline-none dark:bg-gray-700 dark:text-white" placeholder="—" /></td>
                                                      <td className="px-2 py-1.5"><input value={editVariantForm.description} onChange={e => setEditVariantForm({...editVariantForm, description: e.target.value})} className="w-28 px-2 py-1 text-xs border-2 border-indigo-300 rounded focus:outline-none dark:bg-gray-700 dark:text-white" placeholder="—" /></td>
                                                      <td className="px-2 py-1.5">
                                                        <div className="flex justify-end gap-1">
                                                          <button onClick={handleSaveVariant} className="p-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"><Check className="w-3 h-3" /></button>
                                                          <button onClick={() => setEditingVariant(null)} className="p-1 bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors"><X className="w-3 h-3" /></button>
                                                        </div>
                                                      </td>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{variant.color || '—'}</td>
                                                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{variant.size || '—'}</td>
                                                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{(variant.price||0).toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</td>
                                                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{variant.markupPercent || 0}%</td>
                                                      <td className="px-3 py-2 text-green-600 dark:text-green-400 font-medium">{(variant.sellingPrice||variant.price||0).toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</td>
                                                      <td className="px-3 py-2"><span className={`font-bold ${(variant.stockQuantity||0) === 0 ? 'text-red-500' : 'text-indigo-700 dark:text-indigo-300'}`}>{variant.stockQuantity || 0}</span></td>
                                                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{variant.barcode || '—'}</td>
                                                      <td className="px-3 py-2 text-purple-600 dark:text-purple-400 font-medium text-xs">{variant.barid || '—'}</td>
                                                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs max-w-[100px] truncate" title={variant.description || ''}>{variant.description || '—'}</td>
                                                      <td className="px-3 py-2">
                                                        <div className="flex justify-end gap-1">
                                                          <button onClick={() => { setPurchasingVariant({ variant, product }); setShowVariantPurchaseModal(true); }} className="p-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors" title={language === 'uz' ? 'Sotib olish' : 'Закупить'}><ShoppingCart className="w-3 h-3" /></button>
                                                          <button onClick={() => startEditVariant(String(product.id), variant)} className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"><Edit2 className="w-3 h-3" /></button>
                                                          <button onClick={() => handleDeleteVariant(String(product.id), String(variant.id))} className="p-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"><Trash2 className="w-3 h-3" /></button>
                                                        </div>
                                                      </td>
                                                    </>
                                                  )}
                                                </tr>
                                              ));
                                            }

                                            // Tree display: group by color → size
                                            const colorGroups = new Map<string, any[]>();
                                            allVariants.forEach((v: any) => {
                                              const key = v.color || '';
                                              if (!colorGroups.has(key)) colorGroups.set(key, []);
                                              colorGroups.get(key)!.push(v);
                                            });

                                            const rows: React.ReactElement[] = [];
                                            colorGroups.forEach((colorVars, color) => {
                                              const sizeGroups = new Map<string, any[]>();
                                              colorVars.forEach((v: any) => {
                                                const key = v.size || '';
                                                if (!sizeGroups.has(key)) sizeGroups.set(key, []);
                                                sizeGroups.get(key)!.push(v);
                                              });

                                              let sizeIdx = 0;
                                              sizeGroups.forEach((sizeVars, size) => {
                                                sizeVars.forEach((variant: any, varIdx: number) => {
                                                  const isFirstInColor = sizeIdx === 0 && varIdx === 0;
                                                  const isFirstInSize = varIdx === 0;
                                                  rows.push(
                                                    <tr key={variant.id} className="border-t border-indigo-100 dark:border-indigo-800 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-indigo-900/20 transition-colors">
                                                      {isFirstInColor && (
                                                        <td rowSpan={colorVars.length} className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/30 border-r-2 border-indigo-200 dark:border-indigo-700 text-center align-middle text-sm">
                                                          {color || '—'}
                                                        </td>
                                                      )}
                                                      {isFirstInSize && (
                                                        <td rowSpan={sizeVars.length} className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 bg-indigo-50 dark:bg-indigo-900/20 border-r border-indigo-200 dark:border-indigo-700 text-center align-middle text-sm">
                                                          {size || '—'}
                                                        </td>
                                                      )}
                                                      <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200">{(variant.price||0).toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</td>
                                                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{variant.markupPercent || 0}%</td>
                                                      <td className="px-3 py-2.5 text-green-600 dark:text-green-400 font-semibold">{(variant.sellingPrice||variant.price||0).toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</td>
                                                      <td className="px-3 py-2.5">
                                                        <span className={`font-bold text-sm ${(variant.stockQuantity||0) === 0 ? 'text-red-500' : 'text-indigo-700 dark:text-indigo-300'}`}>
                                                          {variant.stockQuantity || 0}
                                                        </span>
                                                      </td>
                                                      <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 text-xs">{variant.barcode || '—'}</td>
                                                      <td className="px-3 py-2.5 text-purple-600 dark:text-purple-400 font-medium text-xs">{variant.barid || '—'}</td>
                                                      <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 text-xs max-w-[100px] truncate" title={variant.description || ''}>{variant.description || '—'}</td>
                                                      <td className="px-3 py-2.5">
                                                        <div className="flex justify-end gap-1">
                                                          <button onClick={() => { setPurchasingVariant({ variant, product }); setShowVariantPurchaseModal(true); }} className="p-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors" title={language === 'uz' ? 'Sotib olish' : 'Закупить'}><ShoppingCart className="w-3 h-3" /></button>
                                                          <button onClick={() => startEditVariant(String(product.id), variant)} className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"><Edit2 className="w-3 h-3" /></button>
                                                          <button onClick={() => handleDeleteVariant(String(product.id), String(variant.id))} className="p-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"><Trash2 className="w-3 h-3" /></button>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  );
                                                });
                                                sizeIdx++;
                                              });
                                            });
                                            return rows;
                                          })()}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}

                                  {/* Default-variant selector + per-variant photos (Requirements 18.1, 12.1, 12.3, 12.6) */}
                                  {(productVariants[String(product.id)] || []).length > 0 && (() => {
                                    const variants: any[] = productVariants[String(product.id)] || [];
                                    const currentDefault =
                                      defaultVariantByProduct[String(product.id)] !== undefined
                                        ? defaultVariantByProduct[String(product.id)]
                                        : (product.defaultVariantId ?? null);
                                    const variantPhotoTotal = variants.reduce(
                                      (sum: number, v: any) => sum + ((v.photos?.length) || 0), 0,
                                    );
                                    const defaultSetCount = (product.images?.length) || 0;
                                    const productTotalPhotos = defaultSetCount + variantPhotoTotal;
                                    const variantLabel = (v: any) =>
                                      [v.color, v.size].filter(Boolean).join(' / ') ||
                                      (language === 'uz' ? `Variant #${v.id}` : `Вариант #${v.id}`);
                                    return (
                                      <div className="mb-4 space-y-4">
                                        {/* Default-variant selector (Requirement 18.1) */}
                                        <div className="bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
                                          <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
                                            {language === 'uz' ? 'Standart variant' : 'Вариант по умолчанию'}
                                          </label>
                                          <select
                                            value={currentDefault == null ? '' : String(currentDefault)}
                                            onChange={(e) =>
                                              handleSetDefaultVariant(
                                                String(product.id),
                                                e.target.value === '' ? null : Number(e.target.value),
                                              )
                                            }
                                            className="w-full sm:w-72 px-3 py-2 text-sm border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:border-indigo-400 outline-none bg-white dark:bg-gray-700 dark:text-white"
                                          >
                                            <option value="">
                                              {language === 'uz' ? '— Tanlanmagan —' : '— Не выбран —'}
                                            </option>
                                            {variants.map((v: any) => (
                                              <option key={v.id} value={String(v.id)}>
                                                {variantLabel(v)}
                                              </option>
                                            ))}
                                          </select>
                                          <p className="text-xs text-gray-500 mt-1">
                                            {language === 'uz'
                                              ? 'Xaridorlar tezroq qo\'shishlari uchun bitta variantni standart qiling.'
                                              : 'Сделайте один вариант стандартным для быстрого добавления покупателями.'}
                                          </p>
                                        </div>

                                        {/* Per-variant photo uploaders (Requirements 12.1, 12.6) */}
                                        <div className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                                          <div className="flex items-center justify-between mb-3">
                                            <h5 className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                                              <ImageIcon className="w-4 h-4" />
                                              {language === 'uz' ? 'Variant rasmlari' : 'Фото вариантов'}
                                            </h5>
                                            <span className="text-xs text-gray-500">
                                              {language === 'uz' ? 'Jami' : 'Всего'}: {productTotalPhotos}/20
                                            </span>
                                          </div>
                                          <div className="space-y-3">
                                            {variants.map((v: any) => (
                                              <div
                                                key={v.id}
                                                className="border border-gray-100 dark:border-gray-700 rounded-lg p-3"
                                              >
                                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                  {variantLabel(v)}
                                                </p>
                                                <VariantPhotoUploader
                                                  productId={product.id}
                                                  variantId={v.id}
                                                  photos={v.photos || []}
                                                  productTotalPhotos={productTotalPhotos}
                                                  onPhotosChange={() => handleVariantPhotosChange(String(product.id))}
                                                />
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Add new variant form */}
                                  {newVariantForms[String(product.id)] && (
                                    <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl p-4">
                                      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-3">
                                        + {language === 'uz' ? 'Yangi tur qo\'shish' : 'Добавить новый вид'}
                                      </p>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-3">
                                        {[
                                          { key: 'color', label: language === 'uz' ? 'Rang' : 'Цвет', type: 'text', placeholder: language === 'uz' ? 'Qora...' : 'Чёрный...' },
                                          { key: 'size', label: language === 'uz' ? 'Razmer' : 'Размер', type: 'text', placeholder: 'XL, L...' },
                                          { key: 'price', label: language === 'uz' ? 'Narx *' : 'Цена *', type: 'number', placeholder: '0' },
                                          { key: 'markupPercent', label: language === 'uz' ? 'Naцen %' : 'Наценка %', type: 'number', placeholder: '0' },
                                          { key: 'stockQuantity', label: language === 'uz' ? 'Miqdor' : 'Кол-во', type: 'number', placeholder: '0' },
                                          { key: 'barcode', label: language === 'uz' ? 'Barcode' : 'Штрих-код', type: 'text', placeholder: '—' },
                                          { key: 'barid', label: 'Barid', type: 'text', placeholder: '—' },
                                          { key: 'description', label: language === 'uz' ? 'Tavsif' : 'Описание', type: 'text', placeholder: '—' },
                                        ].map(({ key, label, type, placeholder }) => (
                                          <div key={key}>
                                            <label className="block text-xs text-gray-500 mb-1">{label}</label>
                                            <input
                                              type={type}
                                              placeholder={placeholder}
                                              value={(newVariantForms[String(product.id)] as any)[key]}
                                              onChange={e => {
                                                let val = e.target.value;
                                                if (key === 'barid') val = val.replace(/\D/g, '').slice(0, 6);
                                                setNewVariantForms(prev => ({
                                                  ...prev,
                                                  [String(product.id)]: { ...prev[String(product.id)], [key]: val }
                                                }));
                                              }}
                                              className="w-full px-2 py-1.5 text-xs border-2 border-gray-200 dark:border-gray-600 rounded focus:border-indigo-400 outline-none bg-white dark:bg-gray-700 dark:text-white"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                      <button
                                        onClick={() => handleAddVariant(String(product.id))}
                                        className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                                      >
                                        <Plus className="w-4 h-4" />
                                        {language === 'uz' ? 'Tur qo\'shish' : 'Добавить вид'}
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      {/* 📸 Image Uploader Row */}
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

      {/* 🛒 Модальное окно покупки товара */}
      {showPurchaseModal && purchasingProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-green-600" />
                {language === 'uz' ? 'Tovar sotib olish' : 'Закупка товара'}
              </h3>
              <button
                onClick={() => {
                  setShowPurchaseModal(false);
                  setPurchasingProduct(null);
                  setPurchaseForm({ quantity: '', purchasePrice: '' });
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>{language === 'uz' ? 'Tovar:' : 'Товар:'}</strong> {purchasingProduct.name}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                <strong>{language === 'uz' ? 'Joriy miqdor:' : 'Текущее количество:'}</strong> {purchasingProduct.quantity}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {language === 'uz' ? 'Sotib olingan miqdor' : 'Количество для закупки'}
                </label>
                <input
                  type="number"
                  value={purchaseForm.quantity}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-green-500 dark:focus:border-green-400 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={language === 'uz' ? 'Miqdorni kiriting' : 'Введите количество'}
                  min="0.01"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {language === 'uz' ? 'Sotib olish narxi (bitta uchun)' : 'Цена закупки (за единицу)'}
                </label>
                <input
                  type="number"
                  value={purchaseForm.purchasePrice}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, purchasePrice: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-green-500 dark:focus:border-green-400 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={language === 'uz' ? 'Narxni kiriting' : 'Введите цену'}
                  min="0.01"
                  step="0.01"
                />
              </div>

              {purchaseForm.quantity && purchaseForm.purchasePrice && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                    {language === 'uz' ? 'Jami summa:' : 'Общая сумма:'} {(parseFloat(purchaseForm.quantity) * parseFloat(purchaseForm.purchasePrice)).toLocaleString()} {language === 'uz' ? "so'm" : 'сўм'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPurchaseModal(false);
                  setPurchasingProduct(null);
                  setPurchaseForm({ quantity: '', purchasePrice: '' });
                }}
                className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                onClick={handlePurchase}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-5 h-5" />
                {language === 'uz' ? 'Sotib olish' : 'Купить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant purchase modal */}
      {showVariantPurchaseModal && purchasingVariant && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-green-600" />
                {language === 'uz' ? 'Variant sotib olish' : 'Закупка варианта'}
              </h3>
              <button
                onClick={() => { setShowVariantPurchaseModal(false); setPurchasingVariant(null); setVariantPurchaseForm({ quantity: '', purchasePrice: '' }); }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{purchasingVariant.product.name}</p>
              {(purchasingVariant.variant.color || purchasingVariant.variant.size) && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  {[purchasingVariant.variant.color, purchasingVariant.variant.size].filter(Boolean).join(' / ')}
                </p>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                <strong>{language === 'uz' ? 'Mavjud miqdor:' : 'Текущий остаток:'}</strong> {purchasingVariant.variant.stockQuantity || 0}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {language === 'uz' ? 'Sotib olingan miqdor' : 'Количество для закупки'}
                </label>
                <input
                  type="number"
                  value={variantPurchaseForm.quantity}
                  onChange={(e) => setVariantPurchaseForm({ ...variantPurchaseForm, quantity: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={language === 'uz' ? 'Miqdorni kiriting' : 'Введите количество'}
                  min="1"
                  step="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {language === 'uz' ? 'Sotib olish narxi (bitta uchun)' : 'Цена закупки (за единицу)'}
                </label>
                <input
                  type="number"
                  value={variantPurchaseForm.purchasePrice}
                  onChange={(e) => setVariantPurchaseForm({ ...variantPurchaseForm, purchasePrice: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={language === 'uz' ? 'Narxni kiriting' : 'Введите цену'}
                  min="0.01"
                  step="0.01"
                />
              </div>
              {variantPurchaseForm.quantity && variantPurchaseForm.purchasePrice && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                    {language === 'uz' ? 'Jami summa:' : 'Общая сумма:'} {(parseFloat(variantPurchaseForm.quantity) * parseFloat(variantPurchaseForm.purchasePrice)).toLocaleString()} {language === 'uz' ? "so'm" : 'сўм'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowVariantPurchaseModal(false); setPurchasingVariant(null); setVariantPurchaseForm({ quantity: '', purchasePrice: '' }); }}
                className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl hover:bg-gray-300 transition-colors font-medium"
              >
                {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
              <button
                onClick={handleVariantPurchase}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-5 h-5" />
                {language === 'uz' ? 'Sotib olish' : 'Закупить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};