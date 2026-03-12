import { useState, useEffect, useRef } from 'react';
import { Heart, Search } from 'lucide-react';
import api from '../utils/api';
import BottomNavigation from './BottomNavigation';
import ProductCard from './ProductCard'; 
import ProductDetails from './ProductDetails'; // ✅ НОВЫЙ: Импорт панели товара
import type { DisplayMode } from './SettingsPage';

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

interface LikesPageProps {
  likedProductIds: number[];
  setLikedProductIds: (ids: number[] | ((prev: number[]) => number[])) => void;
  cart: { [key: number]: number };
  setCart: (cart: { [key: number]: number } | ((prev: { [key: number]: number }) => { [key: number]: number })) => void;
  selectedColors: { [key: number]: string }; 
  setSelectedColors: (colors: { [key: number]: string } | ((prev: { [key: number]: string }) => { [key: number]: string })) => void;
  onBackToHome: () => void;
  onLogout: () => void;
  userName?: string;
  userPhone?: string;
  viewingImage: { url: string; name: string } | null;
  setViewingImage: (image: { url: string; name: string } | null) => void;
  viewingImageIndex: number; 
  setViewingImageIndex: (index: number | ((prev: number) => number)) => void; 
  onNavigateTo?: (page: 'home' | 'cart' | 'settings') => void;
}

export default function LikesPage({ 
  likedProductIds,
  setLikedProductIds,
  cart,
  setCart, // ✅ Принимаем setCart
  onNavigateTo,
  userPhone,
  viewingImage,
  setViewingImage,
  viewingImageIndex,
  setViewingImageIndex
}: LikesPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  // State for like animation
  const [likeAnimation, setLikeAnimation] = useState<number | null>(null);
  const [isTogglingLike, setIsTogglingLike] = useState(false);
  
  // ✅ НОВЫЙ: Состояние для открытия панели товара
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    return (localStorage.getItem('displayMode') as DisplayMode) || 'day';
  });
  
  useEffect(() => {
    loadProducts();
    const interval = setInterval(loadProducts, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleDisplayModeChange = (e: CustomEvent) => {
      setDisplayMode(e.detail);
    };
    window.addEventListener('displayModeChange', handleDisplayModeChange as EventListener);
    return () => {
      window.removeEventListener('displayModeChange', handleDisplayModeChange as EventListener);
    };
  }, []);
  
  useEffect(() => {
    if (userPhone && likedProductIds) {
      const timeoutId = setTimeout(() => {
        api.users.saveLikes(userPhone, likedProductIds).catch(error => {
          console.error('Failed to sync likes to Supabase:', error);
        });
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [likedProductIds, userPhone]);

  const loadProducts = async () => {
    try {
      const productsData = await api.products.list({ limit: 1000 });
      const productsArray = Array.isArray(productsData) ? productsData : (productsData.products || []);
      
      if (!Array.isArray(productsArray)) {
        setProducts([]);
        return;
      }
      
      // Нормализуем данные: парсим images если это строка JSON
      const normalizedProducts = productsArray.map((p: any) => {
        if (p.images && typeof p.images === 'string') {
          try {
            p.images = JSON.parse(p.images);
          } catch (e) {
            console.warn('⚠️ Не удалось парсить images для товара', p.id);
            p.images = [];
          }
        }
        if (!Array.isArray(p.images)) {
          p.images = [];
        }
        return p;
      });
      
      setProducts(normalizedProducts.filter((p: Product) => 
        p.quantity > 0 && p.availableForCustomers === true
      ));
    } catch (error) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const safeLikedIds = Array.isArray(likedProductIds) ? likedProductIds : [];
  const likedProducts = products.filter(product => safeLikedIds.includes(product.id));
  
  // 🔧 ИСПРАВЛЕНИЕ: Очистка "мертвых" ID из лайков (с защитой от бесконечного цикла)
  const cleanedRef = useRef(false);
  useEffect(() => {
    if (products.length > 0 && safeLikedIds.length > 0 && !cleanedRef.current) {
      // Находим ID которые есть в лайках, но товаров уже нет
      const existingProductIds = products.map(p => p.id);
      const validLikedIds = safeLikedIds.filter(id => existingProductIds.includes(id));
      
      // Если есть "мертвые" ID - очищаем их
      if (validLikedIds.length !== safeLikedIds.length) {
        console.log('🧹 Cleaning dead product IDs from likes:', safeLikedIds.length - validLikedIds.length);
        cleanedRef.current = true; // Помечаем что очистили
        setLikedProductIds(validLikedIds);
        // Сбрасываем флаг через 100мс чтобы повторно проверить если нужно
        setTimeout(() => {
          cleanedRef.current = false;
        }, 100);
      }
    }
  }, [products.length, safeLikedIds.length]); // Только длины, не массивы
  
  const filteredProducts = likedProducts.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(price) + ' сум';
  };

  const getPriceWithMarkup = (product: Product) => {
    const markupPercent = product.markupPercent || 0;
    return product.price * (1 + markupPercent / 100);
  };

  const isNight = displayMode === 'night';

  return (
    <div className={`min-h-screen pb-20 relative transition-colors duration-500 ${
      isNight ? 'bg-[#1a0b16]' : 'bg-[#F5F5F5]'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-20 transition-colors duration-500 shadow-sm ${
        isNight ? 'bg-[#1a0b16] border-b border-[#2d1222]' : 'bg-transparent'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className={`p-2 rounded-lg ${
               isNight ? 'bg-[#C0BCBC] text-[#1a0b16]' : 'bg-[#C0BCBC] text-black'
             }`}>
               <Heart className="w-6 h-6 fill-current" />
             </div>
             <h1 className={`text-xl font-bold ${isNight ? 'text-white' : 'text-black'}`}>
               Избранное
             </h1>
          </div>
          
          {likedProducts.length > 0 && (
            <div className={`px-3 py-1 rounded-full text-sm font-bold ${
               isNight ? 'bg-[#C0BCBC]/20 text-[#C0BCBC]' : 'bg-[#C0BCBC]/20 text-gray-600'
            }`}>
              {likedProducts.length}
            </div>
          )}
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 relative z-10">
        {/* Search Bar */}
        {likedProductIds.length > 0 && (
          <div className="mb-6">
            <div className={`flex items-center px-4 py-2.5 rounded-xl transition-colors ${
              isNight ? 'bg-[#C0BCBC]' : 'bg-[#C0BCBC]'
            }`}>
              <Search className={`w-5 h-5 ${isNight ? 'text-[#1a0b16]' : 'text-black'}`} />
              <input 
                type="text" 
                placeholder="Поиск в избранном..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full ml-3 bg-transparent outline-none ${
                  isNight ? 'text-[#1a0b16] placeholder-[#1a0b16]/60' : 'text-black placeholder-black/60'
                }`}
              />
            </div>
          </div>
        )}

        {/* Products Grid */}
        {loading ? (
          <div className="text-center py-12">
            <p className={isNight ? 'text-gray-400' : 'text-gray-500'}>Загрузка...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Heart className={`w-16 h-16 mx-auto mb-4 ${
              isNight ? 'text-gray-600' : 'text-gray-300'
            }`} />
            <p className={`mb-2 ${isNight ? 'text-gray-400' : 'text-gray-500'}`}>
              {searchQuery ? 'Товары не найдены' : 'Нет избранных товаров'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                displayMode={displayMode}
                colorAnimationEnabled={false} // Отключаем анимацию
                highlightedProductId={null}
                isLiked={true}
                cartQuantity={cart[product.id]}
                likeAnimation={likeAnimation === product.id ? { productId: product.id, isLiked: false } : null}
                formatPrice={formatPrice}
                getPriceWithMarkup={getPriceWithMarkup}
                onToggleLike={(productId) => {
                  if (!isTogglingLike) {
                    setIsTogglingLike(true);
                    setLikedProductIds(prev => prev.filter(id => id !== productId));
                    setTimeout(() => setIsTogglingLike(false), 500);
                  }
                }}
                onViewImage={(url, name, index) => {
                  setViewingImage({ url, name });
                  setViewingImageIndex(index);
                }}
                onViewCompany={() => {}} 
                onClick={() => {
                  // ✅ ОДИНАРНЫЙ КЛИК - открываем панель товара
                  setSelectedProduct(product);
                }}
                onDoubleClick={() => {
                  // ✅ ДВОЙНОЙ КЛИК - удаляем из избранного
                  if (!isTogglingLike) {
                    setIsTogglingLike(true);
                    setLikedProductIds(prev => prev.filter(id => id !== product.id));
                    setLikeAnimation(product.id);
                    setTimeout(() => {
                      setLikeAnimation(null);
                      setIsTogglingLike(false);
                    }, 1000);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation 
        currentPage="likes"
        cartItemsCount={Object.values(cart).reduce((acc, val) => acc + val, 0)}
        likesCount={likedProductIds.filter(id => {
          const product = products.find(p => p.id === id);
          return product && product.quantity > 0;
        }).length}
        displayMode={displayMode}
        onNavigate={(page) => {
          if (page === 'likes') return;
          if (onNavigateTo) onNavigateTo(page);
        }}
      />

      {/* Image Viewer Modal */}
      {viewingImage && (() => {
        const product = products.find(p => 
          p.images && p.images.some(img => img.url === viewingImage.url)
        );
        const allImages = product?.images || [viewingImage];
        const currentImage = allImages[viewingImageIndex % allImages.length] || viewingImage;
        
        return (
          <div 
            className="fixed inset-0 bg-black bg-opacity-90 z-[70] flex items-center justify-center p-4"
            onClick={() => {
              setViewingImage(null);
              setViewingImageIndex(0);
            }}
          >
            <div className="relative w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
               <img 
                 src={currentImage.url} 
                 alt={viewingImage.name} 
                 className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
               />
               <button
                 onClick={() => setViewingImage(null)}
                 className="absolute -top-10 right-0 text-white p-2"
               >
                 <span className="text-2xl">&times;</span>
               </button>
            </div>
          </div>
        );
      })()}

      {/* Product Details Modal */}
      {selectedProduct && (
        <ProductDetails
          product={selectedProduct}
          onBack={() => setSelectedProduct(null)}
          onAddToCart={(product) => {
            // Добавляем в корзину
            setCart(prev => ({
              ...prev,
              [product.id]: (prev[product.id] || 0) + 1
            }));
          }}
          onBuyNow={(product) => {
            // Добавляем в корзину и закрываем панель
            setCart(prev => ({
              ...prev,
              [product.id]: (prev[product.id] || 0) + 1
            }));
            setSelectedProduct(null);
            // Переходим в корзину
            if (onNavigateTo) onNavigateTo('cart');
          }}
          isNight={isNight}
          cartQuantity={cart[selectedProduct.id] || 0}
          formatPrice={formatPrice}
          getPriceWithMarkup={getPriceWithMarkup}
          onViewCompany={() => {}} // Пока не реализовано
          userPhone={userPhone}
          isLiked={likedProductIds.includes(selectedProduct.id)}
          onToggleLike={(productId) => {
            if (!isTogglingLike) {
              setIsTogglingLike(true);
              if (likedProductIds.includes(productId)) {
                setLikedProductIds(prev => prev.filter(id => id !== productId));
              } else {
                setLikedProductIds(prev => [...prev, productId]);
              }
              setTimeout(() => setIsTogglingLike(false), 500);
            }
          }}
        />
      )}
    </div>
  );
}