import { useState, useEffect, useRef } from 'react';
import { Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { getImageUrl } from '../utils/api';

interface ProductImage {
  url: string;
  id?: number;
}

interface Product {
  id: number;
  name: string;
  price: number;
  quantity: number;
  markupPercent?: number;
  images?: ProductImage[];
  company_name?: string;
  company_id?: number;
}

interface ProductCardProps {
  product: Product;
  displayMode: string;
  colorAnimationEnabled: boolean;
  highlightedProductId: number | null;
  isLiked: boolean;
  cartQuantity?: number;
  likeAnimation?: { productId: number; isLiked: boolean } | null;
  formatPrice: (price: number) => string;
  getPriceWithMarkup: (product: Product) => number;
  onToggleLike: (productId: number) => void;
  onViewImage: (url: string, name: string, index: number) => void;
  onViewCompany: (companyId: number) => void;
  onDoubleClick: () => void;
  onClick?: () => void; // ✅ НОВЫЙ: Одинарный клик для открытия панели товара
  children?: React.ReactNode;
}

export default function ProductCard({
  product,
  displayMode,
  highlightedProductId,
  isLiked,
  cartQuantity,
  likeAnimation,
  formatPrice,
  getPriceWithMarkup,
  onToggleLike,
  onDoubleClick,
  onClick, // ✅ НОВЫЙ: Принимаем onClick
}: ProductCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  
  // 👆 Swipe/Drag detection
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const minSwipeDistance = 30; // Lower threshold for easier scrolling
  
  // Безопасное извлечение изображений и преобразование путей в URL
  const rawImages = Array.isArray(product.images) 
    ? product.images.map(img => ({
        url: typeof img === 'string' ? (getImageUrl(img) || img) : (img.url || '')
      }))
    : [];
  // Duplicate images if only 2 to ensure smooth infinite loop effect for prev/next/active logic
  const images = rawImages.length === 2 ? [...rawImages, ...rawImages] : rawImages;
  const hasMultipleImages = images.length > 1;

  // 🎯 Автоматическое листание
  useEffect(() => {
    if (!hasMultipleImages) return;

    const startAutoPlay = () => {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
      }
      
      autoPlayTimerRef.current = setInterval(() => {
        if (!isPaused) {
          setCurrentImageIndex((prev) => (prev + 1) % images.length);
        }
      }, 10000); 
    };

    startAutoPlay();

    return () => {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
      }
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
      }
    };
  }, [hasMultipleImages, images.length, isPaused]);

  // 🛑 Функция паузы автоматического листания на 10 секунд (после ручного взаимодействия)
  const pauseAutoPlay = () => {
    setIsPaused(true);
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
    }
    // Resume auto-play after 10 seconds of inactivity
    pauseTimerRef.current = setTimeout(() => {
      setIsPaused(false);
    }, 10000);
  };

  // 🖱️ Ручное листание
  const goToPrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasMultipleImages) return;
    pauseAutoPlay();
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasMultipleImages) return;
    pauseAutoPlay();
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const goToImage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index === currentImageIndex % rawImages.length) return;
    pauseAutoPlay();
    setCurrentImageIndex(index);
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click propagation ONLY when interacting with carousel
    if (!hasMultipleImages) {
      // If single image, allow click to propagate to card (which opens details)
      onDoubleClick(); // Trigger navigation
      return;
    }
    if (isDragging) {
      setIsDragging(false);
      return;
    }
    // Clicking image in carousel should also open details
    onDoubleClick();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!hasMultipleImages) return;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!hasMultipleImages) return;
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!hasMultipleImages || !touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      pauseAutoPlay();
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
      setIsDragging(true);
      setTimeout(() => setIsDragging(false), 100);
    } else if (isRightSwipe) {
      pauseAutoPlay();
      setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
      setIsDragging(true);
      setTimeout(() => setIsDragging(false), 100);
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!hasMultipleImages) return;
    e.preventDefault();
    setTouchEnd(null);
    setTouchStart(e.clientX);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!hasMultipleImages || !touchStart) return;
    setTouchEnd(e.clientX);
  };

  const onMouseUp = () => {
    if (!hasMultipleImages || !touchStart || touchEnd === null) {
      setTouchStart(null);
      setTouchEnd(null);
      return;
    }
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      pauseAutoPlay();
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
      setIsDragging(true);
      setTimeout(() => setIsDragging(false), 100);
    } else if (isRightSwipe) {
      pauseAutoPlay();
      setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
      setIsDragging(true);
      setTimeout(() => setIsDragging(false), 100);
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const onMouseLeave = () => {
    setTouchStart(null);
    setTouchEnd(null);
  };

  const isNight = displayMode === 'night';

  return (
    <div 
      key={product.id}
      id={`product-${product.id}`}
      className={`bg-transparent flex flex-col relative
        ${highlightedProductId === product.id ? 'ring-4 ring-purple-500 ring-opacity-75 animate-pulse' : ''}
      `}
      onClick={onClick || onDoubleClick} // ✅ НОВЫЙ: Используем onClick, если он предоставлен
    >
      {/* 🖼️ Картинка с скругленными углами */}
      <div 
        className={`relative w-full aspect-[4/6] rounded-[2rem] overflow-hidden mb-2 group
          ${isNight ? 'bg-[#dcdcdc]' : 'bg-[#C4C4C4]'}
        `}
      >
        {images.length > 0 ? (
          <>
            <div 
              className="relative w-full h-full overflow-hidden cursor-pointer"
              onClick={handleImageClick}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
            >
              {images.map((image, index) => {
                let position = 'hidden';
                if (index === currentImageIndex) position = 'current';
                else if (index === (currentImageIndex - 1 + images.length) % images.length) position = 'prev';
                else if (index === (currentImageIndex + 1) % images.length) position = 'next';

                let transform = 'translateX(0%)';
                if (position === 'prev') transform = 'translateX(-100%)';
                if (position === 'next') transform = 'translateX(100%)';
                if (position === 'hidden') return null;

                return (
                  <img
                    key={index}
                    src={image.url}
                    alt={product.name}
                    className="absolute top-0 left-0 w-full h-full object-contain"
                    style={{ 
                      transform, 
                      transition: 'transform 500ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                      imageRendering: 'auto',
                      maxWidth: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                    loading="lazy"
                    onError={(e) => {
                      console.error(`Ошибка загрузки изображения товара ${product.id}:`, image.url);
                      const target = e.target as HTMLImageElement;
                      // Fallback на серую заглушку с иконкой
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjxnIG9wYWNpdHk9IjAuMyI+PHBhdGggZD0iTTYwIDYwaDgwdjgwSDYweiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjQiLz48Y2lyY2xlIGN4PSI4NSIgY3k9Ijg1IiByPSI4IiBmaWxsPSIjOTk5Ii8+PHBhdGggZD0iTTYwIDEzMGwyMC0yNSAyMCAyMCAzMC0zNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjQiLz48L2c+PHRleHQgeD0iNTAlIiB5PSIxNzAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTkiIGZvbnQtc2l6ZT0iMTQiIGZvbnQtZmFtaWx5PSJBcmlhbCI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                      target.onerror = null; // Предотвращаем бесконечный цикл
                    }}
                  />
                );
              })}
            </div>
            
            {/* ⬅️➡️ ARROWS (Re-added for manual navigation) */}
            {hasMultipleImages && (
              <>
                <button 
                  onClick={goToPrevImage} 
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button 
                  onClick={goToNextImage} 
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Dots */}
            {rawImages.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                {rawImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => goToImage(index, e)}
                    className={`transition-all duration-300 rounded-full shadow-sm ${index === (currentImageIndex % rawImages.length) ? 'w-2 h-2 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/75'}`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm font-medium">Нет фото</div>
        )}
        
        {/* Like Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike(product.id);
          }}
          className="absolute top-2 left-2 bg-white/90 rounded-full p-2 shadow-sm hover:scale-110 transition-transform z-20"
        >
          <Heart className={`w-5 h-5 ${isLiked ? 'text-pink-500 fill-current' : 'text-gray-400'}`} />
        </button>
        
        {/* Cart Badge */}
        {cartQuantity && (
          <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full px-2 py-0.5 text-xs font-bold z-20 shadow-sm">
            {cartQuantity}
          </div>
        )}
        
        {/* Like Animation */}
        {likeAnimation?.productId === product.id && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <Heart 
              className={`w-20 h-20 animate-ping ${likeAnimation.isLiked ? 'text-pink-500 fill-current' : 'text-gray-400'}`}
              style={{ animation: 'likeScale 1s ease-out' }}
            />
          </div>
        )}
      </div>

      {/* 📝 Текст под картинкой без фона */}
      <div className="px-1 flex flex-col">
        <h3 className={`text-xs font-medium leading-tight line-clamp-2 mb-1 ${isNight ? 'text-white' : 'text-black'}`}>
          {product.name}
        </h3>
        <div className={`text-sm font-bold ${isNight ? 'text-white' : 'text-black'}`}>
          {formatPrice(getPriceWithMarkup(product))}
        </div>
      </div>
    </div>
  );
}