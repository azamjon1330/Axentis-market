import { useState, useEffect } from 'react';
import { ArrowLeft, Search, Star, BadgeCheck, UserPlus, UserCheck, Eye, TrendingUp, MapPin, Package, Heart, ShoppingCart } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import api, { getImageUrl } from '../utils/api';
// TODO: Company rating/subscriptions not yet in new API
// import { rateCompany } from '../utils/api-old-supabase.tsx.backup';

import { useCompanyProfile, useCompanyProducts } from '../utils/cache';
import ProductCardSimple from './ProductCardSimple';
import { toast } from 'sonner@2.0.3';
import { LinkifiedText } from './LinkifiedText'; // 🆕 Компонент для ссылок

interface Product {
  id: number;
  name: string;
  quantity: number;
  price: number;
  markupPercent?: number;
  availableForCustomers?: boolean;
  images?: string[]; // 📸 Массив путей к изображениям товара
  hasColorOptions?: boolean;
  company_id?: number;
  category?: string;
  sellingPrice?: number;
}

interface CompanyProfilePageProps {
  companyId: number;
  onBack: () => void;
  onProductClick: (product: Product) => void;
  isNight: boolean;
  likedProductIds: number[];
  cart: { [key: number]: number };
  customerId?: string;
}

// 🎨 Компонент карточки товара со скроллом фотографий
function ProductCardWithScroll({
  product,
  onClick,
  isLiked,
  cartQuantity,
  formatPrice,
  getPriceWithMarkup,
  isNight,
  textColor,
  cardBg,
  secondaryText
}: {
  product: Product;
  onClick: () => void;
  isLiked: boolean;
  cartQuantity: number;
  formatPrice: (price: number) => string;
  getPriceWithMarkup: (product: Product) => number;
  isNight: boolean;
  textColor: string;
  cardBg: string;
  secondaryText: string;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = product.images && product.images.length > 0 
    ? product.images.map(img => getImageUrl(img) || img) 
    : [];

  const handleImageScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const width = e.currentTarget.offsetWidth;
    const index = Math.round(scrollLeft / width);
    setCurrentImageIndex(index);
  };

  return (
    <div
      className={`${cardBg} rounded-xl overflow-hidden border ${isNight ? 'border-gray-800' : 'border-gray-200'} cursor-pointer active:scale-95 transition-transform`}
    >
      {/* Контейнер для фото со скроллом */}
      <div className="relative">
        <div 
          className={`aspect-square ${isNight ? 'bg-gray-800' : 'bg-gray-100'} overflow-x-auto no-scrollbar flex snap-x snap-mandatory`}
          onScroll={handleImageScroll}
        >
          {images.length > 0 ? (
            images.map((imageUrl, idx) => (
              <div 
                key={idx} 
                className="w-full h-full flex-shrink-0 snap-center"
                onClick={onClick}
              >
                <img
                  src={imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ))
          ) : (
            <div className="w-full h-full flex items-center justify-center flex-shrink-0" onClick={onClick}>
              <Package className={`w-12 h-12 ${secondaryText}`} />
            </div>
          )}
        </div>

        {/* Индикаторы точек */}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={`w-1.5 h-1.5 rounded-full transition ${
                  idx === currentImageIndex 
                    ? 'bg-white' 
                    : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        )}

        {/* Лайк */}
        {isLiked && (
          <div className="absolute top-2 right-2">
            <Heart className="w-4 h-4 fill-red-500 text-red-500" />
          </div>
        )}

        {/* Корзина */}
        {cartQuantity > 0 && (
          <div className="absolute top-2 left-2 bg-[#C0BCBC] text-white px-2 py-0.5 rounded-md text-xs font-medium">
            {cartQuantity}
          </div>
        )}
      </div>
      
      {/* Информация */}
      <div className="p-3" onClick={onClick}>
        <h4 className={`text-sm font-medium ${textColor} line-clamp-2 mb-1 min-h-[2.5rem]`}>
          {product.name}
        </h4>
        <p className={`text-sm font-semibold ${textColor}`}>
          {formatPrice(getPriceWithMarkup(product))}
        </p>
      </div>
    </div>
  );
}

export default function CompanyProfilePage({
  companyId,
  onBack,
  onProductClick,
  isNight,
  likedProductIds,
  cart,
  customerId
}: CompanyProfilePageProps) {
  const { data: profileData, isLoading: profileLoading } = useCompanyProfile(companyId);
  const { data: cachedProducts = [], isLoading: productsLoading } = useCompanyProducts(companyId);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [profileViews, setProfileViews] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);

  const company = profileData?.company;
  const loading = profileLoading;

  const categories = ['Все', ...Array.from(new Set(cachedProducts.map((p: Product) => p.category).filter(Boolean)))];

  useEffect(() => {
    if (customerId) {
      // ⚠️ Временно отключено - backend endpoint'ы не реализованы
      // loadUserRating();
      // loadSubscriptionStatus();
      // loadProfileViews();
      // incrementProfileViews();
    }
  }, [companyId, customerId]);

  const getPriceWithMarkup = (product: Product): number => {
    if (product.sellingPrice && product.sellingPrice > 0) {
      return product.sellingPrice;
    }
    const basePrice = product.price || 0;
    const markupPercent = product.markupPercent || 0;
    if (markupPercent > 0) {
      const markupAmount = Math.round((basePrice * markupPercent) / 100);
      return basePrice + markupAmount;
    }
    return basePrice;
  };

  const loadUserRating = async () => {
    if (!customerId) return;
    try {
      const response = await fetch(
        `/api/companies/${companyId}/my-rating?customer_id=${customerId}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      const data = await response.json();
      if (data.success && data.rating > 0) {
        setSelectedRating(data.rating);
      }
    } catch (error) {
      console.error('Ошибка загрузки оценки:', error);
    }
  };

  const loadSubscriptionStatus = async () => {
    if (!customerId) return;
    try {
      const response = await fetch(
        `/api/companies/${companyId}/subscription?customer_id=${customerId}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      const data = await response.json();
      if (data.success) {
        setIsSubscribed(data.isSubscribed);
        setSubscribersCount(data.subscribersCount);
      }
    } catch (error) {
      console.error('Ошибка загрузки подписки:', error);
    }
  };

  const loadProfileViews = async () => {
    try {
      const response = await fetch(
        `/api/companies/${companyId}/profile-views`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      const data = await response.json();
      if (data.success) {
        setProfileViews(data.views);
      }
    } catch (error) {
      console.error('Ошибка загрузки просмотров:', error);
    }
  };

  const incrementProfileViews = async () => {
    if (!customerId) return;
    try {
      const response = await fetch(
        `/api/companies/${companyId}/profile-view`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customer_id: customerId })
        }
      );
      const data = await response.json();
      if (data.success) {
        setProfileViews(data.views);
      }
    } catch (error) {
      console.error('Ошибка при увеличении просмотров профиля:', error);
    }
  };

  const handleSubscribe = async () => {
    if (!customerId) {
      toast.error('Требуется авторизация');
      return;
    }
    try {
      const action = isSubscribed ? 'unsubscribe' : 'subscribe';
      const response = await fetch(
        `/api/companies/${companyId}/subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ customer_id: customerId, action })
        }
      );
      
      const data = await response.json();
      if (data.success) {
        setIsSubscribed(!isSubscribed);
        setSubscribersCount(prev => isSubscribed ? prev - 1 : prev + 1);
        toast.success(isSubscribed ? 'Вы отписались' : 'Вы подписались');
      }
    } catch (error) {
      console.error('Ошибка при подписке:', error);
      toast.error('Ошибка при подписке');
    }
  };

  const handleRate = async (rating: number) => {
    if (!customerId) {
      toast.error('Требуется авторизация');
      return;
    }
    try {
      await rateCompany(companyId, customerId, rating);
      setSelectedRating(rating);
      toast.success('Спасибо за вашу оценку');
    } catch (error) {
      console.error('Ошибка при оценке:', error);
      toast.error('Ошибка при сохранении оценки');
    }
  };

  const handleOpenMap = () => {
    if (company?.latitude && company?.longitude) {
      const url = `https://www.google.com/maps?q=${company.latitude},${company.longitude}`;
      window.open(url, '_blank');
    } else {
      toast.error('Локация компании не указана');
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('uz-UZ').format(price) + ' сум';
  };

  const filteredByCategory = selectedCategory === 'Все'
    ? cachedProducts
    : cachedProducts.filter((p: Product) => p.category === selectedCategory);

  const filteredProducts = filteredByCategory.filter((product: Product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const topProducts = cachedProducts.slice(0, 4);

  if (loading || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-[#C0BCBC] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  const averageRating = company.rating || 0;
  const totalRatings = company.total_ratings || 0;

  const themeColor = '#C0BCBC';
  const textColor = isNight ? 'text-white' : 'text-black';
  const bgColor = isNight ? 'bg-[#1a0b16]' : 'bg-[#F5F5F5]';
  const cardBg = isNight ? 'bg-[#2d1222]' : 'bg-white';
  const secondaryText = isNight ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`h-screen ${bgColor} flex flex-col`}>
      {/* HEADER - минималистичный */}
      <header 
        className={`flex-shrink-0 ${cardBg} border-b ${isNight ? 'border-gray-800' : 'border-gray-200'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between max-w-2xl mx-auto">
          <button
            onClick={onBack}
            className={`p-2 ${isNight ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} rounded-lg transition`}
          >
            <ArrowLeft className={`w-5 h-5 ${textColor}`} />
          </button>
          
          <h1 className={`text-base font-semibold ${textColor}`}>Профиль компании</h1>
          
          <button
            onClick={handleSubscribe}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              isSubscribed
                ? `${isNight ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`
                : 'bg-[#C0BCBC] text-white'
            }`}
          >
            {isSubscribed ? 'Подписан' : 'Подписаться'}
          </button>
        </div>
      </header>

      {/* КОНТЕНТ с вертикальным скроллом */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto pb-6">
          {/* ИНФОРМАЦИЯ О КОМПАНИИ */}
          <div className={`${cardBg} mx-4 mt-4 rounded-xl p-5 border ${isNight ? 'border-gray-800' : 'border-gray-200'}`}>
            <div className="flex items-start gap-4 mb-4">
              {/* Иконка */}
              <div className={`w-16 h-16 ${isNight ? 'bg-gray-800' : 'bg-gray-100'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <span className="text-3xl">🏢</span>
              </div>
              
              {/* Название и верификация */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className={`text-lg font-semibold ${textColor} truncate`}>
                    {company.name}
                  </h2>
                  {company.verified && (
                    <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-500 flex-shrink-0" />
                  )}
                </div>
                
                {/* Описание */}
                {company.description && (
                  <p className={`text-sm ${secondaryText} line-clamp-2`}>
                    {company.description}
                  </p>
                )}
              </div>
            </div>

            {/* 🆕 Описание товаров компании */}
            {company.productsDescription && (
              <div className={`mt-4 p-4 ${isNight ? 'bg-gray-800/50' : 'bg-blue-50'} rounded-lg border ${isNight ? 'border-gray-700' : 'border-blue-200'}`}>
                <div className={`text-xs font-semibold ${isNight ? 'text-gray-400' : 'text-blue-600'} mb-2`}>
                  📝 О ТОВАРАХ
                </div>
                <LinkifiedText 
                  text={company.productsDescription} 
                  className={`text-sm ${textColor} whitespace-pre-wrap`}
                  linkClassName="text-blue-600 hover:text-blue-800 underline font-medium"
                />
              </div>
            )}

            {/* Рейтинг */}
            <div className="flex items-center gap-1 mb-4 flex-wrap">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`w-6 h-6 cursor-pointer transition-all hover:scale-110 ${
                    star <= (hoveredRating || selectedRating)
                      ? 'text-[#C0BCBC]'
                      : `${isNight ? 'text-gray-700' : 'text-gray-300'}`
                  }`}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRate(star);
                  }}
                >
                  <Star
                    className={`w-full h-full ${
                      star <= (hoveredRating || selectedRating)
                        ? 'fill-[#C0BCBC]'
                        : 'fill-none'
                    }`}
                  />
                </button>
              ))}
              <span className={`text-sm ${secondaryText} ml-2`}>
                {averageRating.toFixed(1)} ({totalRatings})
              </span>
            </div>

            {/* Статистика */}
            <div className={`grid grid-cols-3 gap-4 pt-4 border-t ${isNight ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className="text-center">
                <p className={`text-xl font-bold ${textColor}`}>{profileViews}</p>
                <p className={`text-xs ${secondaryText} mt-1`}>Ko'rishlar</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-bold ${textColor}`}>{subscribersCount}</p>
                <p className={`text-xs ${secondaryText} mt-1`}>Obunachi</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-bold ${textColor}`}>{cachedProducts.length}</p>
                <p className={`text-xs ${secondaryText} mt-1`}>Tovarlar</p>
              </div>
            </div>
          </div>

          {/* ПОИСК - ПЕРЕМЕЩЁН ВВЕРХ */}
          <div className="px-4 mt-4">
            <div className={`${cardBg} rounded-xl px-4 py-3 flex items-center gap-3 border ${isNight ? 'border-gray-800' : 'border-gray-200'}`}>
              <Search className={`w-5 h-5 ${secondaryText} flex-shrink-0`} />
              <input
                type="text"
                placeholder="Поиск товаров"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`flex-1 outline-none ${textColor} ${cardBg} placeholder-gray-400 min-w-0`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`${secondaryText} hover:text-gray-600 flex-shrink-0`}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* КАТЕГОРИИ */}
          {categories.length > 1 && (
            <div className="px-4 mt-4">
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition flex-shrink-0 ${
                      selectedCategory === category
                        ? 'bg-[#C0BCBC] text-white'
                        : `${isNight ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700'} border ${isNight ? 'border-gray-700' : 'border-gray-200'}`
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TOP ТОВАРЫ */}
          {topProducts.length > 0 && (
            <div className="px-4 mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-semibold ${textColor}`}>Популярные товары</h3>
                <TrendingUp className={`w-4 h-4 ${secondaryText}`} />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {topProducts.map((product) => (
                  <ProductCardWithScroll
                    key={product.id}
                    product={product}
                    onClick={() => onProductClick(product)}
                    isLiked={likedProductIds.includes(product.id)}
                    cartQuantity={cart[product.id] || 0}
                    formatPrice={formatPrice}
                    getPriceWithMarkup={getPriceWithMarkup}
                    isNight={isNight}
                    textColor={textColor}
                    cardBg={cardBg}
                    secondaryText={secondaryText}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ВСЕ ТОВАРЫ */}
          <div className="px-4 mt-6 pb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-semibold ${textColor}`}>Все товары</h3>
              <span className={`text-xs ${secondaryText}`}>{filteredProducts.length}</span>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <Search className={`w-12 h-12 ${secondaryText} mx-auto mb-3`} />
                <p className={`${secondaryText} text-sm`}>Товары не найдены</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => (
                  <ProductCardWithScroll
                    key={product.id}
                    product={product}
                    onClick={() => onProductClick(product)}
                    isLiked={likedProductIds.includes(product.id)}
                    cartQuantity={cart[product.id] || 0}
                    formatPrice={formatPrice}
                    getPriceWithMarkup={getPriceWithMarkup}
                    isNight={isNight}
                    textColor={textColor}
                    cardBg={cardBg}
                    secondaryText={secondaryText}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSS для скрытия scrollbar */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}


