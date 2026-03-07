import React, { useRef, useEffect } from 'react';
import { ArrowLeft, Smartphone, PenTool, Shirt, Baby, Gamepad2, ChevronRight, Search, ShoppingBag } from 'lucide-react';
import ProductCard from './ProductCard';

interface Product {
  id: number;
  name: string;
  quantity: number;
  price: number;
  markupPercent?: number;
  availableForCustomers?: boolean;
  images?: string[]; // 📸 Массив путей к изображениям товара
  hasColorOptions?: boolean; 
}

interface CatalogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isNight: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  products: Product[]; // Need products for search results
  // Props for ProductCard
  cart?: { [key: number]: number };
  likedProductIds?: number[];
  displayMode?: any;
  onAddToCart?: (productId: number) => void;
  onToggleLike?: (productId: number) => void;
  formatPrice?: (price: number) => string;
  getPriceWithMarkup?: (product: Product) => number;
}

export default function CatalogPanel({ 
  isOpen, 
  onClose, 
  isNight, 
  searchQuery, 
  setSearchQuery, 
  products = [],
  cart = {},
  likedProductIds = [],
  displayMode,
  onAddToCart,
  onToggleLike,
  formatPrice,
  getPriceWithMarkup
}: CatalogPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const categories = [
    { id: 'gadgets', name: 'Gadjeti', icon: Smartphone },
    { id: 'stationary', name: 'Konctovar', icon: PenTool },
    { id: 'clothes', name: 'Odejdi', icon: Shirt },
    { id: 'kids', name: 'Detskiy mir', icon: Baby },
    { id: 'toys', name: 'igrushki', icon: Gamepad2 },
  ];

  // Filter products if searching
  const filteredProducts = searchQuery 
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] transition-colors duration-500 flex flex-col ${
      isNight ? 'bg-[#1a0b16]' : 'bg-[#F5F5F5]'
    }`}>
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10 shrink-0"
        style={{ 
          backgroundColor: '#C0BCBC',
          paddingTop: 'calc(0.75rem + env(safe-area-inset-top))'
        }}
      >
        <button 
          onClick={onClose}
          className="p-1 -ml-1 rounded-full hover:bg-black/10 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-black" />
        </button>
        
        {/* Search Input */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products"
            className="w-full bg-transparent text-black placeholder-black/60 text-lg outline-none"
          />
        </div>
        
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')}
            className="p-1"
          >
            <div className="bg-black/20 rounded-full p-0.5">
               <ArrowLeft className="w-4 h-4 text-black rotate-45" /> {/* Close icon lookalike */}
            </div>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {searchQuery ? (
          // Search Results
          <div className="p-4">
             {filteredProducts.length === 0 ? (
                <div className="text-center py-10">
                  <p className={isNight ? 'text-gray-400' : 'text-gray-500'}>Ничего не найдено</p>
                </div>
             ) : (
                <div className="grid grid-cols-2 gap-2 sm:gap-4">
                  {filteredProducts.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      displayMode={displayMode || (isNight ? 'night' : 'day')}
                      colorAnimationEnabled={false}
                      isLiked={likedProductIds.includes(product.id)}
                      cartQuantity={cart[product.id]}
                      formatPrice={formatPrice || ((p) => `${p} сум`)}
                      getPriceWithMarkup={getPriceWithMarkup || ((p) => p.price)}
                      onToggleLike={onToggleLike || (() => {})}
                      // Simple handlers as we are in catalog
                      onViewImage={() => {}}
                      onViewCompany={() => {}}
                      onDoubleClick={() => onAddToCart && onAddToCart(product.id)}
                    />
                  ))}
                </div>
             )}
          </div>
        ) : (
          // Categories & Menu
          <div className="px-4 py-6 space-y-6">
            {categories.map((category) => (
              <button
                key={category.id}
                className="w-full flex items-center gap-4 group active:scale-[0.98] transition-transform"
                onClick={() => {
                  console.log('Selected category:', category.name);
                  // Filter logic could go here
                }}
              >
                <div className={`p-0 ${
                  isNight ? 'text-white' : 'text-black'
                }`}>
                  <category.icon className="w-7 h-7" strokeWidth={2} />
                </div>
                <span className={`text-lg font-medium text-left flex-1 ${
                  isNight ? 'text-white' : 'text-black'
                }`}>
                  {category.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
