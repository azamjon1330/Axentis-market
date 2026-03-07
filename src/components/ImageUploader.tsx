import { useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader } from 'lucide-react';
import api from '../utils/api';

interface ImageUploaderProps {
  productId: number;
  images: string[]; // Массив путей к файлам из бэкенда
  onImagesChange: () => void;
}

export default function ImageUploader({ productId, images, onImagesChange }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Проверяем сколько файлов можно добавить
    const availableSlots = 6 - images.length;
    if (availableSlots === 0) {
      setError('Можно загрузить до 6 фотографий на товар');
      return;
    }

    // Берем только доступное количество файлов
    const filesToUpload = Array.from(files).slice(0, availableSlots);
    
    // Validate all files
    for (const file of filesToUpload) {
      if (file.size > 5 * 1024 * 1024) {
        setError(`Файл "${file.name}" слишком большой. Максимум 5MB`);
        return;
      }

      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
        setError(`Файл "${file.name}" неподдерживаемый формат. Только JPEG, PNG и WebP`);
        return;
      }
    }

    setError(null);
    setUploading(true);

    try {
      // ⚠️ ВАЖНО: Загружаем файлы ПОСЛЕДОВАТЕЛЬНО для надежности
      // Но убираем искусственную задержку для скорости
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        // Показываем прогресс
        setError(`Загрузка ${i + 1} из ${filesToUpload.length}...`);
        
        // Create FileList-like object for single file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        await api.products.uploadImages(productId.toString(), dataTransfer.files);
      }
      
      onImagesChange(); // Refresh images
      
      // Clear input
      e.target.value = '';
      
      // Показываем успешное сообщение
      setError(`✅ Успешно загружено ${filesToUpload.length} фото`);
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error('Error uploading images:', err);
      setError('Ошибка загрузки. Попробуйте снова');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('Удалить это изображение?')) return;

    try {
      const imageToDelete = images[index]; // Это строка-путь к файлу
      await api.products.deleteImage(productId.toString(), imageToDelete);
      onImagesChange(); // Refresh images
    } catch (err) {
      console.error('Error deleting image:', err);
      setError('Ошибка удаления');
    }
  };

  return (
    <div className="space-y-3">
      {/* Images Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {images.map((imagePath, index) => (
            <div key={index} className="relative group">
              <img
                src={`${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000'}/${imagePath}`}
                alt={`Product ${index + 1}`}
                className="w-full h-24 object-cover rounded-lg border-2 border-gray-200"
                onError={(e) => {
                  // Fallback для битых ссылок
                  e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y3ZjdmNyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gaW1hZ2U8L3RleHQ+PC9zdmc+';
                }}
              />
              <button
                onClick={() => handleDelete(index)}
                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="Удалить"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white text-xs px-2 py-0.5 rounded">
                {index + 1}/6
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Button */}
      {images.length < 6 && (() => {
        const availableSlots = 6 - images.length;
        return (
        <div>
          <label
            className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              uploading || images.length >= 6
                ? 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60'
                : 'border-purple-300 hover:border-purple-500 hover:bg-purple-50'
            }`}
          >
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleFileSelect}
              disabled={uploading || images.length >= 6}
              className="hidden"
              multiple
            />
            {uploading ? (
              <>
                <Loader className="w-5 h-5 animate-spin text-purple-600" />
                <span className="text-sm text-gray-600">Загрузка...</span>
              </>
            ) : images.length >= 6 ? (
              <>
                <ImageIcon className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-500">
                  Максимум фото ({images.length}/6)
                </span>
              </>
            ) : (
              <>
                <ImageIcon className="w-5 h-5 text-purple-600" />
                <span className="text-sm text-purple-600">
                  Добавить фото ({images.length}/6)
                </span>
              </>
            )}
          </label>

          {/* Info */}
          <p className="text-xs text-gray-500 mt-1 text-center">
            JPEG, PNG, WebP • Макс 5MB • Можно выбрать до {availableSlots} фото
          </p>
        </div>
        );
      })()}

      {/* Error Message */}
      {error && (
        <div className={`${
          error.startsWith('✅') 
            ? 'bg-green-50 border-green-200 text-green-700' 
            : 'bg-red-50 border-red-200 text-red-700'
        } border px-3 py-2 rounded-lg text-sm`}>
          {error}
        </div>
      )}
    </div>
  );
}