import { useState, useEffect } from 'react';
import { ArrowLeft, Share2, Star, ChevronDown, ChevronUp, Store, Send, Package, User, CheckCircle, Heart } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import api from '../utils/api';
import { LinkifiedText } from './LinkifiedText'; // 🆕 Компонент для ссылок

interface Product {
  id: number;
  name: string;
  price: number;
  quantity: number;
  markupPercent?: number;
  images?: Array<{ url: string; }>;
  description?: string;
  hasColorOptions?: boolean;
  company_id?: number;
}

interface ProductDetailsProps {
  product: Product;
  onBack: () => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  isNight: boolean;
  cartQuantity: number;
  formatPrice: (price: number) => string;
  getPriceWithMarkup: (product: Product) => number;
  getProductDiscount?: (product: Product) => any; // 🔥 Get discount info
  getOriginalPrice?: (product: Product) => number; // 💰 Get price before discount
  onViewCompany: (companyId: number) => void;
  userPhone?: string;
  userName?: string;
  onUserClick?: (phone: string, name: string) => void;
  isLiked?: boolean; // 💖 Добавляем поддержку лайков
  onToggleLike?: (productId: number) => void; // 💖 Функция переключения лайка
}

interface Review {
  id: number;
  user_name: string;
  user_phone: string; 
  rating: number;
  comment: string;
  created_at: string;
}

export default function ProductDetails({
  product,
  onBack,
  onAddToCart,
  onBuyNow,
  isNight,
  cartQuantity,
  formatPrice,
  getPriceWithMarkup,
  getProductDiscount,
  getOriginalPrice,
  onViewCompany,
  userPhone,
  userName,
  onUserClick,
  isLiked,
  onToggleLike
}: ProductDetailsProps) {
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [companyName, setCompanyName] = useState<string>('Загрузка...'); // Start with explicit loading state but we will handle it fast
  const [isCompanyLoading, setIsCompanyLoading] = useState(true);
  
  const [userRating, setUserRating] = useState(5);
  const [userComment, setUserComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Calculate prices and discount info
  const discount = getProductDiscount ? getProductDiscount(product) : null;
  const finalPrice = getPriceWithMarkup(product);
  const originalPrice = getOriginalPrice ? getOriginalPrice(product) : finalPrice;
  const hasDiscount = discount && discount.discountPercent > 0;
  const isBelowCost = finalPrice < product.price; // 🔥 Check if price is below base cost
  
  // Безопасное получение изображений
  let rawImages = product.images;
  if (typeof rawImages === 'string') {
    try {
      rawImages = JSON.parse(rawImages);
    } catch (e) {
      rawImages = [];
    }
  }
  const images = Array.isArray(rawImages) && rawImages.length > 0 
    ? rawImages 
    : [{ url: '' }];

  const themeColor = '#C0BCBC';
  const textColor = isNight ? 'text-white' : 'text-black';
  const bgColor = isNight ? 'bg-[#1a0b16]' : 'bg-[#F5F5F5]';
  const cardBg = isNight ? 'bg-[#2d1222]' : 'bg-white';
  const secondaryText = isNight ? 'text-gray-400' : 'text-gray-500';

  useEffect(() => {
    let isMounted = true;
    
    // Fetch Company Info
    const fetchCompany = async () => {
      if (!product.company_id) {
        if (isMounted) {
          setCompanyName('Magazin');
          setIsCompanyLoading(false);
        }
        return;
      }
      
      try {
        console.log('🏢 [ProductDetails] Fetching company info for ID:', product.company_id);
        const data = await api.companies.get(product.company_id.toString());
        if (isMounted) {
          if (data && data.name) {
            setCompanyName(data.name);
          } else {
            console.warn('⚠️ [ProductDetails] Company name not found for ID:', product.company_id);
            setCompanyName('Magazin');
          }
        }
      } catch (error) {
        console.error('❌ [ProductDetails] Error fetching company:', error);
        if (isMounted) setCompanyName('Magazin');
      } finally {
        if (isMounted) setIsCompanyLoading(false);
      }
    };

    fetchCompany();
    loadReviews();

    return () => { isMounted = false; };
  }, [product.id, product.company_id]);

  const loadReviews = async () => {
    try {
      const data = await api.products.getReviews(product.id.toString());
      setReviews(data);
    } catch (error) {
      console.error('Error loading reviews:', error);
      setReviews([]);
    }
  };

  const handleSubmitReview = async () => {
    if (!userPhone) {
      alert('Пожалуйста, войдите в систему, чтобы оставить отзыв');
      return;
    }
    if (!userComment.trim()) {
      alert('Напишите комментарий');
      return;
    }

    setSubmitting(true);
    try {
      await api.reviews.create({
        product_id: product.id,
        user_phone: userPhone,
        user_name: userName || 'Пользователь',
        rating: userRating,
        comment: userComment
      });
      
      setUserComment('');
      setUserRating(5);
      await loadReviews();
      alert('Спасибо за ваш отзыв!');
    } catch (error: any) {
      console.error('Error submitting review:', error);
      alert('Ошибка при отправке отзыва');
    } finally {
      setSubmitting(false);
    }
  };

  const averageRating = reviews.length > 0 
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';

  return (
    <div className={`flex flex-col h-full ${bgColor}`}>
      {/* Header - Static at top */}
      <header 
        className={`shrink-0 px-4 py-3 flex items-center justify-between shadow-sm`}
        style={{ backgroundColor: themeColor, paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-black/10 transition-colors">
          <ArrowLeft className="w-6 h-6 text-black" />
        </button>
        <h1 className="text-lg font-bold text-black truncate max-w-[50%] text-center">
          {product.name}
        </h1>
        
        {/* 💖 Лайк и Поделиться на одной линии */}
        <div className="flex items-center gap-1">
          {onToggleLike && (
            <button 
              onClick={() => onToggleLike(product.id)}
              className={`p-2 rounded-full transition-all ${
                isLiked 
                  ? 'bg-red-100/50 hover:bg-red-100' 
                  : 'hover:bg-black/10'
              }`}
            >
              <Heart 
                className={`w-6 h-6 transition-all ${
                  isLiked 
                    ? 'fill-red-500 text-red-500 scale-110' 
                    : 'text-black'
                }`} 
              />
            </button>
          )}
          <button className="p-2 -mr-2 rounded-full hover:bg-black/10 transition-colors">
            <Share2 className="w-6 h-6 text-black" />
          </button>
        </div>
      </header>

      {/* Scrollable Content Area */}
      <div 
        className="flex-1 overflow-y-auto min-h-0 pb-32"
        style={{ 
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="pb-4">
          {/* Photos Carousel - ПОЛНОСТЬЮ ПЕРЕРАБОТАННЫЙ */}
          <div 
            className="w-full overflow-x-scroll snap-x snap-mandatory scrollbar-hide mb-4"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              scrollSnapType: 'x mandatory',
              display: 'flex',
              gap: '12px',
              padding: '0 16px',
              scrollPaddingLeft: '16px',
              scrollPaddingRight: '16px'
            }}
          >
            {images.map((img, idx) => (
              <div 
                key={idx} 
                className="snap-start shrink-0 rounded-2xl overflow-hidden bg-gray-300 relative"
                style={{ 
                  width: 'calc(100vw - 44px)', // 100vw - (16px left + 16px right + 12px gap)
                  aspectRatio: '4/5',
                  scrollSnapAlign: 'start',
                  scrollSnapStop: 'always' // ✅ Останавливаться на каждом фото
                }}
              >
                <ImageWithFallback 
                  src={img.url} 
                  alt={`${product.name} ${idx + 1}`}
                  className="w-full h-full object-cover"
                  style={{ 
                    pointerEvents: 'none',
                    userSelect: 'none',
                    WebkitUserDrag: 'none',
                    imageRendering: 'auto',
                    maxWidth: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                  loading="lazy"
                />
                <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-sm font-medium px-3 py-1.5 rounded-full">
                  {idx + 1} / {images.length}
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 space-y-4">
            {/* Name */}
            <h2 className={`text-2xl font-bold leading-tight ${textColor}`}>
              {product.name}
            </h2>

            {/* Price & Stock */}
            <div className={`p-4 rounded-xl ${cardBg} shadow-sm border border-gray-100 dark:border-gray-800`}>
              <div className="flex justify-between items-start">
                <div className="flex flex-col flex-1">
                   <span className={`text-3xl font-bold ${isNight ? 'text-white' : 'text-black'}`}>
                     {formatPrice(finalPrice)}
                   </span>
                   {hasDiscount && (
                     <span className="text-gray-400 text-sm line-through mt-1">
                       {formatPrice(originalPrice)}
                     </span>
                   )}
                   {/* 🔥 Show discount badge */}
                   {hasDiscount && (
                     <div className="flex items-center gap-2 mt-2 flex-wrap">
                       <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                         discount.isAggressive 
                           ? 'bg-red-100 text-red-700 border border-red-200' 
                           : 'bg-blue-100 text-blue-700 border border-blue-200'
                       }`}>
                         {discount.isAggressive ? '🔥' : '🏷️'} -{discount.discountPercent}%
                       </span>
                       {isBelowCost && (
                         <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                           ⚠️ Цена ниже закупочной
                         </span>
                       )}
                     </div>
                   )}
                   {/* Show discount title/description if available */}
                   {discount && (discount.title || discount.description) && (
                     <div className="mt-3 text-sm">
                       {discount.title && (
                         <div className="font-semibold text-red-600 mb-1">{discount.title}</div>
                       )}
                       {discount.description && (
                         <div className={secondaryText}>{discount.description}</div>
                       )}
                     </div>
                   )}
                </div>
                
                {/* Stock Indicator */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  product.quantity > 0 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  <Package className="w-4 h-4" />
                  <span>
                    {product.quantity > 0 ? `${product.quantity} шт.` : 'Нет в наличии'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description Accordion */}
            <div className={`rounded-xl overflow-hidden ${cardBg} shadow-sm`}>
              <button 
                className="w-full p-4 flex items-center justify-between font-bold"
                onClick={() => setDescriptionOpen(!descriptionOpen)}
              >
                <span className={textColor}>Описание товара</span>
                {descriptionOpen ? (
                  <ChevronUp className={secondaryText} />
                ) : (
                  <ChevronDown className={secondaryText} />
                )}
              </button>
              
              {descriptionOpen && (
                <div className={`px-4 pb-4 text-sm ${isNight ? 'text-gray-300' : 'text-gray-600'} animate-in slide-in-from-top-2 duration-200`}>
                  {product.description ? (
                    <LinkifiedText 
                      text={product.description} 
                      className="mb-4 whitespace-pre-wrap"
                      linkClassName="text-blue-600 hover:text-blue-800 underline font-medium"
                    />
                  ) : (
                    <p className="mb-4 text-gray-400 italic">Описание отсутствует.</p>
                  )}
                  
                  {/* Company Info Integrated Here */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <div className="text-xs font-semibold uppercase opacity-60 mb-2 tracking-wide">Продавец</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('🏢 Company button clicked, company_id:', product.company_id);
                        if (product.company_id) {
                          onViewCompany(product.company_id);
                        } else {
                          console.warn('⚠️ No company_id for this product');
                        }
                      }}
                      disabled={!product.company_id}
                      className={`w-full p-3 rounded-lg flex items-center justify-between ${
                        isNight ? 'bg-black/20 hover:bg-black/30' : 'bg-gray-50 hover:bg-gray-100'
                      } active:scale-[0.98] transition-all ${!product.company_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isNight ? 'bg-purple-900/30' : 'bg-purple-100'}`}>
                          <Store className={`w-4 h-4 ${isNight ? 'text-purple-300' : 'text-purple-600'}`} />
                        </div>
                        <span className={`font-bold ${textColor} flex items-center gap-2`}>
                          {isCompanyLoading ? 'Загрузка...' : companyName}
                          {!isCompanyLoading && <CheckCircle className="w-4 h-4 text-blue-500 fill-current" />}
                        </span>
                      </div>
                      <div className="text-purple-500 font-medium text-xs flex items-center gap-1">
                        Профиль
                        <ArrowLeft className="w-3 h-3 rotate-180" />
                      </div>
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs opacity-50 font-mono">
                    ID товара: {product.id}
                  </div>
                </div>
              )}
            </div>

            {/* Reviews Section */}
            <div className={`rounded-xl overflow-hidden ${cardBg} shadow-sm`}>
              <button 
                className="w-full p-4 flex items-center justify-between"
                onClick={() => setReviewsOpen(!reviewsOpen)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star className="w-5 h-5 fill-current" />
                    <span className={`font-bold text-lg ml-1 ${textColor}`}>{averageRating}</span>
                  </div>
                  <span className={secondaryText}>
                    ({reviews.length} отзывов)
                  </span>
                </div>
                {reviewsOpen ? (
                  <ChevronUp className={secondaryText} />
                ) : (
                  <ChevronDown className={secondaryText} />
                )}
              </button>

              {reviewsOpen && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                  {/* Review Form */}
                  <div className={`mb-6 p-4 rounded-xl ${isNight ? 'bg-black/20' : 'bg-gray-50'}`}>
                    <h3 className={`font-semibold mb-3 ${textColor}`}>Оставить отзыв</h3>
                    <div className="flex gap-2 mb-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setUserRating(star)}
                          className="focus:outline-none transition-transform active:scale-90"
                        >
                          <Star 
                            className={`w-7 h-7 ${star <= userRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} 
                          />
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={userComment}
                        onChange={(e) => setUserComment(e.target.value)}
                        placeholder="Напишите комментарий..."
                        className={`flex-1 px-4 py-2 rounded-lg text-sm outline-none border ${
                          isNight 
                            ? 'bg-[#1a0b16] border-[#2d1222] text-white placeholder-gray-500' 
                            : 'bg-white border-gray-200 text-black'
                        }`}
                      />
                      <button
                        onClick={handleSubmitReview}
                        disabled={submitting || !userComment.trim()}
                        className={`p-2 rounded-lg text-white transition-colors ${
                          submitting || !userComment.trim()
                            ? 'bg-gray-300' 
                            : 'bg-purple-600 hover:bg-purple-700'
                        }`}
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Reviews List */}
                  <div className="space-y-4">
                    {reviews.length > 0 ? (
                      reviews.map((review) => (
                        <div key={review.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 pb-4 last:pb-0">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-full ${isNight ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <User className="w-3 h-3 text-gray-500" />
                              </div>
                              <span className={`font-medium text-sm ${textColor}`}>
                                {review.user_name || 'Пользователь'}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">
                              {new Date(review.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mb-1.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star 
                                key={star}
                                className={`w-3 h-3 ${star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} 
                              />
                            ))}
                          </div>
                          <p className={`text-sm ${secondaryText}`}>
                            {review.comment}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 opacity-60">
                        <p className={textColor}>Пока нет отзывов</p>
                        <p className="text-sm text-gray-400">��удьте ервым!</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions - Fixed at bottom */}
      <div 
        className="fixed bottom-[50px] left-0 right-0 z-40 pt-4 px-4 pb-4 rounded-t-[2.5rem] shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{ backgroundColor: '#C0BCBC' }}
      >
        <div className="flex gap-4 max-w-md mx-auto">
          <button 
            onClick={() => onAddToCart(product)}
            className="flex-1 bg-[#E2E2E2] active:scale-95 text-black font-medium text-lg py-4 rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
             {cartQuantity > 0 && <span className="bg-black text-white text-xs px-2 py-0.5 rounded-full">{cartQuantity}</span>}
             {cartQuantity > 0 ? 'В корзине' : 'В корзину'}
          </button>
          
          <button 
            onClick={() => onBuyNow(product)}
            className="flex-1 bg-[#E2E2E2] active:scale-95 text-black font-medium text-lg py-4 rounded-2xl transition-all shadow-sm"
          >
            Купить
          </button>
        </div>
      </div>
    </div>
  );
}