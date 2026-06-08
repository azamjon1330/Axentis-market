import { useState } from 'react';
import { X, Image as ImageIcon, Loader } from 'lucide-react';
import api, { getImageUrl } from '../utils/api';

interface VariantPhotoUploaderProps {
  productId: number | string;
  variantId: number | string;
  photos: string[]; // existing variant photo paths returned by GetProductVariants
  // Current total number of photos across the whole product (default set + every
  // variant's photos). Used for the client-side ≤20-per-product pre-check.
  productTotalPhotos: number;
  onPhotosChange: () => void; // refresh callback after a successful change
}

// Per-variant photo limits (Requirement 12.1, 12.5, 12.6). Mirrors the backend
// caps so we can surface a friendly message before hitting the network, while
// still relying on the backend's authoritative 400 on violation.
const MAX_VARIANT_PHOTOS = 4;
const MAX_PRODUCT_PHOTOS = 20;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export default function VariantPhotoUploader({
  productId,
  variantId,
  photos,
  productTotalPhotos,
  onPhotosChange,
}: VariantPhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variantSlots = MAX_VARIANT_PHOTOS - photos.length;
  const productSlots = MAX_PRODUCT_PHOTOS - productTotalPhotos;
  const availableSlots = Math.max(0, Math.min(variantSlots, productSlots));

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Client-side pre-check of both caps (Requirement 12.1, 12.5, 12.6).
    if (variantSlots <= 0) {
      setError(`Variant photo limit is ${MAX_VARIANT_PHOTOS} (have ${photos.length})`);
      e.target.value = '';
      return;
    }
    if (productSlots <= 0) {
      setError(`Product photo limit is ${MAX_PRODUCT_PHOTOS} (have ${productTotalPhotos})`);
      e.target.value = '';
      return;
    }

    const selected = Array.from(files);
    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`"${file.name}": unsupported format. JPEG, PNG or WebP only`);
        e.target.value = '';
        return;
      }
    }

    if (selected.length > availableSlots) {
      // Pre-check: refuse the whole batch rather than silently truncating, so the
      // company sees the limit message (Requirement 12.6) and no partial write.
      setError(
        `Can add up to ${availableSlots} more photo(s) ` +
          `(variant ${photos.length}/${MAX_VARIANT_PHOTOS}, product ${productTotalPhotos}/${MAX_PRODUCT_PHOTOS})`,
      );
      e.target.value = '';
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const dt = new DataTransfer();
      selected.forEach((f) => dt.items.add(f));
      await api.products.uploadVariantPhotos(productId, variantId, dt.files);
      onPhotosChange();
      e.target.value = '';
      setError(`✅ Uploaded ${selected.length} photo(s)`);
      setTimeout(() => setError(null), 3000);
    } catch (err: any) {
      // Surface the backend's explicit limit/validation message (Requirement 12.6).
      setError(err?.message || 'Upload failed. Please try again');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('Remove this photo?')) return;
    try {
      await api.products.deleteVariantPhoto(productId, variantId, { url: photos[index] });
      onPhotosChange();
    } catch (err: any) {
      setError(err?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((photoPath, index) => (
            <div key={index} className="relative group">
              <img
                src={getImageUrl(photoPath) || ''}
                alt={`Variant photo ${index + 1}`}
                className="w-full h-16 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-600"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3C/svg%3E';
                }}
              />
              <button
                onClick={() => handleDelete(index)}
                className="absolute top-0.5 right-0.5 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-0.5 left-0.5 bg-black bg-opacity-60 text-white text-[10px] px-1 rounded">
                {index + 1}/{MAX_VARIANT_PHOTOS}
              </div>
            </div>
          ))}
        </div>
      )}

      {photos.length < MAX_VARIANT_PHOTOS && (
        <label
          className={`flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            uploading || availableSlots <= 0
              ? 'border-gray-300 bg-gray-50 dark:bg-gray-700 cursor-not-allowed opacity-60'
              : 'border-purple-300 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20'
          }`}
        >
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileSelect}
            disabled={uploading || availableSlots <= 0}
            className="hidden"
            multiple
          />
          {uploading ? (
            <>
              <Loader className="w-4 h-4 animate-spin text-purple-600" />
              <span className="text-xs text-gray-600 dark:text-gray-300">Uploading...</span>
            </>
          ) : availableSlots <= 0 ? (
            <>
              <ImageIcon className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500">
                Limit reached ({photos.length}/{MAX_VARIANT_PHOTOS})
              </span>
            </>
          ) : (
            <>
              <ImageIcon className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-purple-600">
                Add photo ({photos.length}/{MAX_VARIANT_PHOTOS})
              </span>
            </>
          )}
        </label>
      )}

      {error && (
        <p
          className={`text-xs ${
            error.startsWith('✅') ? 'text-green-600' : 'text-red-500'
          }`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
