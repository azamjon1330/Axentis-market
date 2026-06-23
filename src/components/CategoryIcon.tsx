import {
  Smartphone, Laptop, Shirt, Footprints, Gamepad2, Headphones, BookOpen,
  Home, Car, UtensilsCrossed, Sparkles, Watch, Gift, Wrench, Pill, Tv,
  Baby, Dumbbell, ShoppingBag, Sofa, Bike, Camera, Package,
  type LucideIcon,
} from 'lucide-react';
import { getImageUrl } from '../utils/api';

// ============================================================================
// Профессиональные ВЕКТОРНЫЕ иконки категорий (вместо детских эмодзи).
// В поле `icon` категории может храниться:
//   • путь к загруженной картинке  → "/uploads/categories/...png"
//   • ключ векторной иконки         → "smartphone", "laptop", ...
//   • (legacy) эмодзи               → отрисуем профессиональный fallback
// ============================================================================

export const CATEGORY_ICON_OPTIONS: { key: string; Icon: LucideIcon; label: string }[] = [
  { key: 'package', Icon: Package, label: 'Общее' },
  { key: 'smartphone', Icon: Smartphone, label: 'Телефоны' },
  { key: 'laptop', Icon: Laptop, label: 'Ноутбуки' },
  { key: 'tv', Icon: Tv, label: 'Техника' },
  { key: 'shirt', Icon: Shirt, label: 'Одежда' },
  { key: 'footprints', Icon: Footprints, label: 'Обувь' },
  { key: 'gamepad', Icon: Gamepad2, label: 'Игры' },
  { key: 'headphones', Icon: Headphones, label: 'Аудио' },
  { key: 'book', Icon: BookOpen, label: 'Книги' },
  { key: 'home', Icon: Home, label: 'Для дома' },
  { key: 'sofa', Icon: Sofa, label: 'Мебель' },
  { key: 'car', Icon: Car, label: 'Авто' },
  { key: 'bike', Icon: Bike, label: 'Спорт' },
  { key: 'dumbbell', Icon: Dumbbell, label: 'Фитнес' },
  { key: 'food', Icon: UtensilsCrossed, label: 'Продукты' },
  { key: 'beauty', Icon: Sparkles, label: 'Красота' },
  { key: 'watch', Icon: Watch, label: 'Часы' },
  { key: 'gift', Icon: Gift, label: 'Подарки' },
  { key: 'tools', Icon: Wrench, label: 'Инструменты' },
  { key: 'pharmacy', Icon: Pill, label: 'Аптека' },
  { key: 'baby', Icon: Baby, label: 'Детям' },
  { key: 'camera', Icon: Camera, label: 'Фото' },
  { key: 'bag', Icon: ShoppingBag, label: 'Аксессуары' },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((o) => [o.key, o.Icon]),
);

export const isImageIcon = (icon?: string) =>
  !!icon && (icon.startsWith('/') || icon.startsWith('http'));

export const DEFAULT_CATEGORY_ICON = 'package';

interface Props {
  icon?: string;
  className?: string; // размеры: например "w-6 h-6"
}

// Единый рендер иконки категории — только картинка или векторная иконка, без эмодзи.
export default function CategoryIcon({ icon, className = 'w-6 h-6' }: Props) {
  if (isImageIcon(icon)) {
    return <img src={getImageUrl(icon as string) || ''} alt="" className={`object-contain ${className}`} />;
  }
  const Icon = (icon && ICON_MAP[icon]) || Package;
  return <Icon className={className} />;
}
