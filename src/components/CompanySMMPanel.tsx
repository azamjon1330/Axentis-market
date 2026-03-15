import { useState, useEffect } from 'react';
import { Star, Upload, Video, Megaphone, MapPin, Package, TrendingUp, X, Navigation, Users, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import MapLocationPicker from './MapLocationPicker';
import api, { getImageUrl } from '../utils/api';
import { useResponsive, useResponsiveClasses } from '../hooks/useResponsive';
import { getCurrentLanguage, useTranslation, type Language } from '../utils/translations';
import { UZBEKISTAN_REGIONS, getDistrictsByRegion } from '../utils/uzbekistanRegions';

interface CompanySMMPanelProps {
  companyId: number;
  companyName: string;
}

interface CompanyProfile {
  id: number;
  name: string;
  phone: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  rating: number;
  total_ratings: number;
  total_products: number;
  total_sales: number;
  logo_image?: string;
}

interface MediaItem {
  id: string;
  type: 'photo' | 'video' | 'ad';
  url: string;
  title: string;
  description?: string;
  created_at: string;
  status?: 'pending' | 'approved' | 'rejected';
  admin_message?: string; // 🆕 Сообщение от админа при отклонении
  rejection_reason?: string; // Краткая причина отклонения
}

export default function CompanySMMPanel({ companyId, companyName }: CompanySMMPanelProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'photos'>('profile');
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  // 📱 Адаптивность
  const { isMobile } = useResponsive();
  const responsive = useResponsiveClasses();
  
  // � Переводы
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const t = useTranslation(language);
  
  // �🆕 Статистика подписчиков
  const [subscribersCount, setSubscribersCount] = useState(0);

  // Временные данные профиля
  const [formData, setFormData] = useState({
    location: '',
    latitude: 0,
    longitude: 0,
    description: '',
    logo_image: '',
    region: '',
    district: ''
  });
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  useEffect(() => {
    loadCompanyProfile();
    loadMediaItems();
    loadSubscriberStats();
    
    // ⚠️ Realtime подписки отключены - Supabase удален
    // TODO: Реализовать через WebSocket или polling если нужно
    
    return () => {
      // Cleanup - ничего не делаем
    };
  }, [companyId]);
  
  // � Слушаем изменения языка
  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent<Language>) => setLanguage(e.detail);
    window.addEventListener('languageChange', handleLanguageChange as EventListener);
    return () => window.removeEventListener('languageChange', handleLanguageChange as EventListener);
  }, []);
  
  // �🆕 Загрузка статистики подписчиков
  const loadSubscriberStats = async () => {
    try {
      const stats = await api.companies.getStats(companyId.toString());
      console.log('📊 Stats loaded:', stats);
      setSubscribersCount(stats.subscribers || 0);
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
      setSubscribersCount(0);
    }
  };

  const loadCompanyProfile = async () => {
    try {
      console.log('📡 Loading company profile for SMM panel...');
      const data = await api.companies.get(companyId.toString());
      console.log('✅ Company profile loaded:', data);
      
      // Get stats as well
      let statsData = { total_products: 0, total_sales: 0, views: 0, subscribers: 0 };
      try {
        statsData = await api.companies.getStats(companyId.toString());
      } catch (e) {
        console.warn('Could not load stats:', e);
      }
      
      // Строим полный URL для логотипа
      const logoUrl = data.logoUrl || '';
      console.log('🖼️ Logo URL from API:', logoUrl);
      const fullLogoUrl = getImageUrl(logoUrl) || '';
      console.log('🖼️ Full Logo URL:', fullLogoUrl);
      
      setProfile({
        id: data.id,
        name: data.name,
        phone: data.phone,
        location: data.address || '',
        latitude: 0,
        longitude: 0,
        description: data.description || '',
        rating: data.averageRating || 0,
        total_ratings: data.ratingCount || 0,
        total_products: statsData.total_products || 0,
        total_sales: statsData.total_sales || 0,
        logo_image: fullLogoUrl
      });
      
      setFormData({
        location: data.address || '',
        latitude: 0,
        longitude: 0,
        description: data.description || '',
        logo_image: fullLogoUrl
      });
      
      setLoading(false);
    } catch (error) {
      console.error('❌ Ошибка загрузки профиля компании:', error);
      // Создаем базовый профиль если не загрузился
      setProfile({
        id: companyId,
        name: companyName,
        phone: '',
        location: '',
        latitude: 41.2995,
        longitude: 69.2401,
        description: '',
        rating: 0,
        total_ratings: 0,
        total_products: 0,
        total_sales: 0,
        logo_image: ''
      });
      setFormData({
        location: '',
        latitude: 41.2995,
        longitude: 69.2401,
        description: '',
        logo_image: ''
      });
      setLoading(false);
    }
  };

  const loadMediaItems = async () => {
    try {
      console.log('📸 [Media] Loading company advertisements...');
      const response = await api.ads.list({ companyId: companyId.toString() });
      console.log('✅ [Media] Loaded advertisements:', response);
      
      // Конвертируем рекламу в MediaItem формат, отфильтровываем deleted
      const items: MediaItem[] = (response.ads || [])
        .filter((ad: any) => ad.status !== 'deleted') // 🆕 Фильтруем удаленные рекламы
        .map((ad: any) => ({
          id: ad.id.toString(),
          type: 'ad' as const,
          url: ad.image_url || '',
          title: ad.title,
          description: ad.caption || ad.content,
          created_at: ad.created_at,
          status: ad.status,
          admin_message: ad.admin_message,
          rejection_reason: ad.rejection_reason
        }));
      
      setMediaItems(items);
    } catch (error) {
      console.error('❌ [Media] Error loading media:', error);
      setMediaItems([]);
    }
  };

  const handleSaveProfile = async () => {
    try {
      console.log('💾 Сохранение профиля компании:', companyId);
      console.log('📝 Данные для сохранения:', formData);
      
      toast.loading(t.saving, { id: 'save-profile' });
      
      // Отправляем данные на backend
      await api.companies.update(companyId.toString(), {
        description: formData.description,
        address: formData.location,
        latitude: formData.latitude,
        longitude: formData.longitude,
        region: formData.region,
        district: formData.district,
        locationAddress: formData.location
      });
      
      toast.success(t.profileSaved, { id: 'save-profile' });
      setEditMode(false);
      loadCompanyProfile();
    } catch (error) {
      console.error('❌ Ошибка сохранения профиля:', error);
      toast.error(`${t.saveProfileError} ${error instanceof Error ? error.message : 'Unknown error'}`, { id: 'save-profile' });
    }
  };

  const handleMediaUpload = async (imageUrl: string, title: string, description: string, adType: 'company' | 'product', productId?: number, file?: File) => {
    try {
      console.log('📸 [UPLOAD] Creating advertisement...', { title, adType, productId, companyId });
      
      // Показываем прогресс
      toast.loading(t.creatingAd, { id: 'media-upload' });
      
      let finalImageUrl = imageUrl;
      
      // Если есть файл - загружаем его
      if (file) {
        console.log('📤 [UPLOAD] Uploading image file...');
        const uploadResult = await api.ads.uploadImage(file);
        finalImageUrl = uploadResult.image_url;
        console.log('✅ [UPLOAD] Image uploaded:', finalImageUrl);
      }
      
      // Создаем рекламу с указанием типа
      const result = await api.ads.create({
        title: title,
        content: description || title,
        imageUrl: finalImageUrl,
        linkUrl: '',
        adType: adType, // 🆕 Тип рекламы
        companyId: companyId,
        productId: productId // 🆕 ID товара (если тип product)
      });
      
      console.log('✅ [UPLOAD] Advertisement created:', result);
      
      if (result && result.id) {
        const adTypeText = adType === 'company' ? t.companyGenitive : t.productGenitive;
        toast.success(`${t.adCreated} ${adTypeText} ${t.adCreatedStatus}`, { id: 'media-upload' });
        setUploadModalOpen(false);
        // Перезагружаем список рекламы
        await loadMediaItems();
      } else {
        throw new Error('Failed to create advertisement');
      }
    } catch (error) {
      console.error('❌ [UPLOAD] Error:', error);
      toast.error(error instanceof Error ? error.message : t.adDeleteError, { id: 'media-upload' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">{t.loading}</div>
      </div>
    );
  }

  return (
    <div className={responsive.spacing}>
      {/* Навигация */}
      <div className={`bg-white ${responsive.card} shadow-sm`}>
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center ${responsive.gap} ${isMobile ? 'px-4 py-3' : 'px-6 py-4'} transition-colors whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-b-2 border-purple-600 text-purple-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Star className={responsive.iconSmall} />
            {isMobile ? t.profileTab : t.companyProfileTab}
          </button>
          <button
            onClick={() => setActiveTab('photos')}
            className={`flex items-center ${responsive.gap} ${isMobile ? 'px-4 py-3' : 'px-6 py-4'} transition-colors whitespace-nowrap ${
              activeTab === 'photos'
                ? 'border-b-2 border-purple-600 text-purple-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Megaphone className={responsive.iconSmall} />
            {t.adsTab}
          </button>
        </div>
      </div>

      {/* Профиль компании */}
      {activeTab === 'profile' && (
        <div className={responsive.spacing}>
          {/* Профиль компании с логотипом */}
          <div className={`bg-white ${responsive.card} shadow-sm overflow-hidden`}>
            {/* Логотип и основная информация */}
            <div className={`flex ${isMobile ? 'flex-col' : 'items-start'} ${responsive.gapLarge} mb-6`}>
              <div className={`relative ${isMobile ? 'mx-auto' : ''}`}>
                <div className={`${isMobile ? 'w-24 h-24' : 'w-32 h-32'} rounded-full bg-white border-4 border-[#141B2A]/30 shadow-lg overflow-hidden`}>
                  {formData.logo_image ? (
                    <img src={formData.logo_image} alt="Логотип" className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-b from-white to-[#141B2A] flex items-center justify-center text-[#141B2A] ${isMobile ? 'text-base' : 'text-lg'} font-bold`}>
                      {companyName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                {editMode && (
                  <label className={`absolute bottom-0 right-0 bg-[#141B2A] text-white ${isMobile ? 'p-1.5' : 'p-2'} rounded-full cursor-pointer hover:bg-[#141B2A]/90 transition-colors shadow-lg`}>
                    <Upload className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            setUploadingLogo(true);
                            toast.loading(t.uploadingLogo, { id: 'upload-logo' });
                            await api.companies.uploadLogo(companyId.toString(), file);
                            toast.success(t.logoUploaded, { id: 'upload-logo' });
                            // Перезагружаем профиль чтобы получить обновленный логотип
                            await loadCompanyProfile();
                          } catch (error) {
                            console.error('❌ Ошибка загрузки логотипа:', error);
                            toast.error(t.logoUploadError, { id: 'upload-logo' });
                          } finally {
                            setUploadingLogo(false);
                          }
                        }
                      }}
                      disabled={uploadingLogo}
                    />
                  </label>
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{companyName}</h2>
                    {profile && (
                      <div className="flex items-center gap-4 text-gray-600">
                        <div className="flex items-center gap-1">
                          <Star
                            key={1}
                            className={`w-5 h-5 ${
                              1 <= Math.round(profile.rating)
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-300'
                            }`}
                          />
                          <span className="ml-2">
                            {profile.rating.toFixed(1)} ({profile.total_ratings} {t.ratings})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => editMode ? handleSaveProfile() : setEditMode(true)}
                    className="bg-[#141B2A] text-white px-6 py-2 rounded-lg hover:bg-[#141B2A]/90 transition-colors"
                  >
                    {editMode ? t.saveButton : t.editButton}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Статистика */}
            <div className="grid grid-cols-4 gap-4 mt-6">
              <div className="bg-[#141B2A]/5 rounded-lg p-4">
                <div className="flex items-center gap-2 text-[#141B2A] mb-2">
                  <Package className="w-5 h-5" />
                  <span className="text-sm">{t.productsCount}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{profile?.total_products || 0}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-600 mb-2">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm">{t.salesCount}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{profile?.total_sales || 0}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-orange-600 mb-2">
                  <Users className="w-5 h-5" />
                  <span className="text-sm">{t.subscribersCount}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{subscribersCount}</p>
              </div>
            </div>

            {/* Информация о компании */}
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  <MapPin className="w-4 h-4 inline mr-1" />
                  {t.locationLabel}
                </label>
                {editMode ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => setLocationModalOpen(true)}
                      className="w-full px-4 py-3 border-2 border-[#141B2A]/30 rounded-lg hover:border-[#141B2A] transition-colors text-left bg-[#141B2A]/5 hover:bg-[#141B2A]/10 flex items-center justify-between"
                    >
                      <span>{formData.location || t.selectLocation}</span>
                      <Navigation className="w-5 h-5 text-[#141B2A]" />
                    </button>
                    {formData.latitude && formData.longitude && (
                      <p className="text-xs text-gray-500">
                        📍 {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-900">{formData.location || t.notSpecified}</p>
                    {formData.latitude && formData.longitude && (
                      <p className="text-xs text-gray-500 mt-1">
                        📍 {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">{t.companyDescription}</label>
                {editMode ? (
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#141B2A] focus:border-transparent"
                    rows={4}
                    placeholder={t.companyDescPlaceholder}
                  />
                ) : (
                  <p className="text-gray-900">{formData.description || t.noDescription}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Реклама */}
      {activeTab === 'photos' && (
        <div className="space-y-6">
          {/* Инструкция по загрузке рекламы */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="bg-purple-600 rounded-full p-2 flex-shrink-0">
                <Megaphone className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-gray-900 mb-2">{t.adsInstruction}</h4>
                <div className="text-sm text-gray-700 space-y-2">
                  <p><strong>{t.recommendedSizes}</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>{t.aspectRatio} <strong>16:9</strong> или <strong>21:9</strong> (как на фото в примере)</li>
                    <li>{t.minWidth} <strong>1200 пикселей</strong></li>
                    <li>{t.maxFileSize} <strong>5 МБ</strong></li>
                    <li>{t.formats} <strong>JPG, PNG, WebP</strong></li>
                  </ul>
                  <p className="mt-3 text-purple-700">
                    <strong>{t.adsTip}</strong> {t.adsTipText}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <h3 className="text-gray-900 text-xl font-semibold">{t.adBanners}</h3>
            <div className="flex gap-2">
              {mediaItems.filter(item => item.status !== 'cancelled').length > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm(t.deleteAllAdsConfirm)) return;
                    try {
                      toast.loading(t.deletingAllAds, { id: 'delete-all-ads' });
                      const result = await api.ads.deleteAll(companyId.toString());
                      toast.success(`${t.adsDeleted} ${result.deleted || 0} реклам(ы)`, { id: 'delete-all-ads' });
                      await loadMediaItems();
                    } catch (error) {
                      console.error('❌ Error deleting all ads:', error);
                      toast.error(t.adsDeleteError, { id: 'delete-all-ads' });
                    }
                  }}
                  className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors shadow-md hover:shadow-lg"
                >
                  <Trash2 className="w-5 h-5" />
                  {t.deleteAllButton}
                </button>
              )}
              <button
                onClick={() => setUploadModalOpen(true)}
                className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors shadow-md hover:shadow-lg"
              >
                <Upload className="w-5 h-5" />
                {t.uploadAd}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {mediaItems
              .filter((item) => item.type === 'ad')
              .map((item) => (
                <MediaCard key={item.id} item={item} companyId={companyId} companyName={companyName} onReload={loadMediaItems} />
              ))}
            {mediaItems.filter((item) => item.type === 'ad').length === 0 && (
              <div className="col-span-3 bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
                <Megaphone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">{t.noAdBannersYet}</p>
                <p className="text-sm text-gray-500 mb-4">{t.uploadImageForModeration}</p>
                <button
                  onClick={() => setUploadModalOpen(true)}
                  className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {t.uploadFirstAd}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модальное окно загрузки */}
      {uploadModalOpen && (
        <UploadModal
          onClose={() => setUploadModalOpen(false)}
          onUpload={handleMediaUpload}
          companyId={companyId}
        />
      )}

      {/* Модальное окно выбора локации */}
      {locationModalOpen && (
        <MapLocationPicker
          currentLocation={formData.location}
          currentLatitude={formData.latitude}
          currentLongitude={formData.longitude}
          onClose={() => setLocationModalOpen(false)}
          onSelect={(location, lat, lng) => {
            setFormData({ ...formData, location, latitude: lat, longitude: lng });
            setLocationModalOpen(false);
            toast.success(t.locationSelected);
          }}
        />
      )}
    </div>
  );
}

// Карточка медиа
function MediaCard({ item, companyId: _companyId, companyName: _companyName, onReload }: { 
  item: MediaItem; 
  companyId?: number; 
  companyName?: string;
  onReload?: () => void;
}) {
  const t = useTranslation(getCurrentLanguage());
  
  const handleDelete = async () => {
    if (!confirm(t.deleteAdConfirm)) return;
    
    try {
      toast.loading(t.deletingAd, { id: 'delete-ad' });
      await api.ads.delete(item.id);
      toast.success(t.adDeleted, { id: 'delete-ad' });
      
      // Перезагружаем список
      if (onReload) {
        onReload();
      }
    } catch (error) {
      console.error('❌ Error deleting ad:', error);
      toast.error(t.adDeleteError, { id: 'delete-ad' });
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    const badges = {
      pending: { text: t.statusPending, color: 'bg-yellow-500' },
      approved: { text: t.statusApproved, color: 'bg-green-500' },
      rejected: { text: t.statusRejected, color: 'bg-red-500' },
      cancelled: { text: t.statusRejected, color: 'bg-gray-500' } // 🆕 Добавлен cancelled
    };
    
    const badge = badges[status as keyof typeof badges];
    return (
      <div className={`absolute top-2 right-2 ${badge.color} text-white px-3 py-1 rounded-full text-xs font-medium shadow`}>
        {badge.text}
      </div>
    );
  };

  // Формируем полный URL для изображения
  const imageUrl = item.url ? (getImageUrl(item.url) || null) : null;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative aspect-video bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-xs">Нет изображения</p>
          </div>
        )}
        {item.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/50 rounded-full p-4">
              <Video className="w-8 h-8 text-white" />
            </div>
          </div>
        )}
        {getStatusBadge(item.status)}
      </div>
      <div className="p-4">
        <h4 className="text-gray-900 mb-2 font-medium">{item.title}</h4>
        
        {/* Показываем причину отклонения для rejected реклам */}
        {item.status === 'rejected' && (item.admin_message || item.rejection_reason) ? (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-semibold text-red-900 mb-1">{t.rejectionReason}</p>
            <p className="text-sm text-red-800">
              {item.admin_message || item.rejection_reason}
            </p>
          </div>
        ) : null}
        
        {/* Кнопка удаления */}
        <div className="flex justify-end">
          {item.status !== 'deleted' && (
            <button
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 transition-colors p-2 rounded-lg hover:bg-red-50"
              title="Удалить рекламу"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Модальное окно загрузки
function UploadModal({
  onClose,
  onUpload,
  companyId
}: {
  onClose: () => void;
  onUpload: (imageUrl: string, title: string, description: string, adType: 'company' | 'product', productId?: number, file?: File) => void;
  companyId: number;
}) {
  const t = useTranslation(getCurrentLanguage());
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'url' | 'file'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [adType, setAdType] = useState<'company' | 'product'>('company'); // 🆕 Тип рекламы
  const [selectedProductId, setSelectedProductId] = useState<number>();
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // 🆕 Загрузка товаров компании
  useEffect(() => {
    if (adType === 'product') {
      loadCompanyProducts();
    }
  }, [adType]);

  const loadCompanyProducts = async () => {
    try {
      setLoadingProducts(true);
      const result = await api.products.list({ companyId: companyId.toString() });
      setProducts(result.products || []);
    } catch (error) {
      console.error('❌ Error loading products:', error);
      toast.error(t.productsLoadError);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    
    // Создаем превью
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreview(result);
    };
    reader.readAsDataURL(selectedFile);
    
    // Автоматически заполняем название
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      handleFileSelect(droppedFile);
    } else {
      toast.error(t.pleaseUploadImage);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleUploadClick = () => {
    if (uploadMode === 'file' && !file && !preview) {
      toast.error(t.selectFileToUpload);
      return;
    }
    if (uploadMode === 'url' && !imageUrl.trim()) {
      toast.error(t.enterImageURL);
      return;
    }
    if (!title.trim()) {
      toast.error(t.enterTitle);
      return;
    }
    // 🆕 Проверка выбора товара для product рекламы
    if (adType === 'product' && !selectedProductId) {
      toast.error(t.selectProductForAd);
      return;
    }
    // Передаем файл если режим загрузки файла
    onUpload(uploadMode === 'url' ? imageUrl : '', title, description, adType, selectedProductId, uploadMode === 'file' ? file || undefined : undefined);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 className="text-gray-900 text-base sm:text-lg font-semibold">
            {t.uploadAdTitle}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* 🆕 Выбор типа рекламы */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">{t.adType}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAdType('company')}
                className={`px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                  adType === 'company'
                    ? 'border-purple-600 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <span className="flex flex-col items-center gap-1">
                  <span className="text-2xl">🏢</span>
                  <span>{t.companyAd}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAdType('product')}
                className={`px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                  adType === 'product'
                    ? 'border-purple-600 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <span className="flex flex-col items-center gap-1">
                  <span className="text-2xl">📦</span>
                  <span>{t.productAd}</span>
                </span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {adType === 'company' 
                ? t.companyAdDescription
                : t.productAdDescription}
            </p>
          </div>

          {/* 🆕 Выбор товара (только для product рекламы) */}
          {adType === 'product' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.selectProductRequired}</label>
              {loadingProducts ? (
                <div className="text-sm text-gray-500 py-2">{t.loadingProducts}</div>
              ) : products.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">{t.noProductsAddFirst}</div>
              ) : (
                <select
                  value={selectedProductId || ''}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                  <option value="">{t.selectProductOption}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({new Intl.NumberFormat('uz-UZ').format(product.price)} сум)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-2">{t.nameRequired}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              placeholder={t.enterNamePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">{t.descriptionLabel}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              rows={3}
              placeholder={t.addDescriptionPlaceholder}
            />
          </div>

          {/* Переключатель режимов */}
          <div>
            <label className="block text-sm text-gray-600 mb-3">{t.uploadMethod}</label>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <button
                type="button"
                onClick={() => setUploadMode('file')}
                className={`flex-1 px-3 py-2.5 rounded-lg border-2 transition-colors text-sm font-medium ${
                  uploadMode === 'file'
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <span>📁</span>
                  <span>{t.uploadFile.replace('📁 ', '')}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('url')}
                className={`flex-1 px-3 py-2.5 rounded-lg border-2 transition-colors text-sm font-medium ${
                  uploadMode === 'url'
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <span>🔗</span>
                  <span>{t.insertURL.replace('🔗 ', '')}</span>
                </span>
              </button>
            </div>
          </div>

          {/* Загрузка файла */}
          {uploadMode === 'file' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging ? 'border-purple-600 bg-purple-50' : 'border-gray-300'
              }`}
            >
              {preview ? (
                <div className="space-y-3">
                  <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg shadow" />
                  <p className="text-sm text-gray-600">{file?.name}</p>
                  <p className="text-xs text-gray-500">{file ? (file.size / 1024 / 1024).toFixed(2) : 0} MB</p>
                  <button
                    type="button"
                    onClick={() => { setFile(null); setPreview(null); setImageUrl(''); }}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    {t.removeFile}
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">{t.dragImageHere}</p>
                  <p className="text-gray-500 text-sm mb-4">{t.or}</p>
                  <label className="inline-block cursor-pointer">
                    <span className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                      {t.selectFile}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileInput}
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-4">
                    {t.recommendedTip}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Ввод URL */}
          {uploadMode === 'url' && (
            <div>
              <label className="block text-sm text-gray-600 mb-2">
                {t.imageURL}
                <span className="text-xs text-gray-500 ml-2">{t.imageURLExample}</span>
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                placeholder={t.imageURLPlaceholder}
              />
              <p className="text-xs text-gray-500 mt-2">
                {t.urlTip}
              </p>
              
              {imageUrl && (
                <div className="mt-4 border-2 border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">{t.previewLabel}</p>
                  <img 
                    src={imageUrl} 
                    alt="Preview" 
                    className="max-h-40 mx-auto rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 p-4 sm:p-6 border-t border-gray-200 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t.cancelButton}
          </button>
          <button
            onClick={handleUploadClick}
            disabled={(uploadMode === 'file' && !preview) || (uploadMode === 'url' && !imageUrl.trim()) || !title.trim()}
            className="flex-1 px-4 py-2.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t.createAdButton}
          </button>
        </div>
      </div>
    </div>
  );
}

