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
      className={`flex flex-col relative cursor-pointer rounded-xl overflow-hidden transition-transform duration-150 active:scale-[0.97]
        ${isNight
          ? 'bg-[#1C1C26] shadow-[0_2px_16px_rgba(0,0,0,0.45)]'
          : 'bg-white shadow-[0_2px_12px_rgba(0,0,0,0.09)]'}
        ${highlightedProductId === product.id ? 'ring-2 ring-purple-500' : ''}
      `}
      onClick={onClick || onDoubleClick}
    >
      {/* Image area */}
      <div
        className={`relative w-full aspect-[3/4] overflow-hidden group
          ${isNight ? 'bg-[#2A2A3A]' : 'bg-[#F4F4F6]'}
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
                    className="absolute top-0 left-0 w-full h-full object-cover"
                    style={{
                      transform,
                      transition: 'transform 400ms cubic-bezier(0.4, 0.0, 0.2, 1)',
                    }}
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.onerror = null;
                    }}
                  />
                );
              })}
            </div>

            {/* Nav arrows */}
            {hasMultipleImages && (
              <>
                <button
                  onClick={goToPrevImage}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goToNextImage}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Image dots */}
            {rawImages.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
                {rawImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => goToImage(index, e)}
                    className={`transition-all duration-300 rounded-full ${
                      index === (currentImageIndex % rawImages.length)
                        ? 'w-3 h-1.5 bg-white'
                        : 'w-1.5 h-1.5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={`w-full h-full flex flex-col items-center justify-center gap-1 ${isNight ? 'text-gray-600' : 'text-gray-300'}`}>
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Like Button — top right */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike(product.id);
          }}
          className={`absolute top-2 right-2 rounded-full p-1.5 shadow-md transition-transform active:scale-90 z-20 ${
            isNight ? 'bg-black/50' : 'bg-white/90'
          }`}
        >
          <Heart className={`w-4 h-4 transition-colors ${isLiked ? 'text-red-500 fill-current' : isNight ? 'text-gray-400' : 'text-gray-400'}`} />
        </button>

        {/* Cart badge */}
        {cartQuantity && (
          <div className="absolute top-2 left-2 bg-[#5B3CF5] text-white rounded-lg px-2 py-0.5 text-xs font-semibold z-20 shadow-sm">
            {cartQuantity}
          </div>
        )}

        {/* Like animation */}
        {likeAnimation?.productId === product.id && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <Heart
              className={`w-16 h-16 ${likeAnimation.isLiked ? 'text-red-500 fill-current' : 'text-gray-400'}`}
              style={{ animation: 'likeScale 0.6s ease-out forwards' }}
            />
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="px-3 py-2.5">
        <h3 className={`text-[11px] leading-snug line-clamp-2 mb-1.5 ${isNight ? 'text-gray-300' : 'text-gray-700'}`}>
          {product.name}
        </h3>
        <div className={`text-[13px] font-bold tracking-tight ${isNight ? 'text-white' : 'text-gray-900'}`}>
          {formatPrice(getPriceWithMarkup(product))}
        </div>
      </div>
    </div>
  );
}