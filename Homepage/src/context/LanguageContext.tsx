import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'ru' | 'uz';

const LANG_KEY = 'app_language';
const LANG_CHOSEN_KEY = 'app_language_chosen';

const translations = {
  ru: {
    // Navigation tabs
    home: 'Главная',
    cart: 'Корзина',
    favorites: 'Избранное',
    profile: 'Профиль',

    // Login screen
    tagline: 'Всё, что нужно — рядом',
    login: 'Войти',
    register: 'Регистрация',
    loginTitle: 'Вход в аккаунт',
    registerTitle: 'Создать аккаунт',
    phoneNumber: 'Номер телефона',
    password: 'Пароль',
    enterPassword: 'Введите пароль',
    firstName: 'Имя',
    lastName: 'Фамилия',
    yourFirstName: 'Ваше имя',
    yourLastName: 'Ваша фамилия',
    minChars: 'Минимум 6 символов',
    confirmPassword: 'Повторите пароль',
    repeatPassword: 'Повторите пароль',
    passwordMismatch: 'Пароли не совпадают',
    noAccount: 'Нет аккаунта?',
    createAccount: 'Зарегистрироваться',
    haveAccount: 'Уже есть аккаунт?',
    signIn: 'Войти',
    terms: 'Продолжая, вы соглашаетесь с',
    termsLink: 'условиями сервиса',
    userNotFound: 'Не найден',
    userNotRegistered: 'Пользователь не зарегистрирован. Создайте аккаунт.',
    error: 'Ошибка',
    loginError: 'Ошибка входа',
    registerError: 'Не удалось создать аккаунт',
    cancel: 'Отмена',

    // Profile screen
    profileTitle: 'Профиль',
    defaultUser: 'Пользователь',
    myOrders: 'Мои заказы',
    deliveryAddresses: 'Адреса доставки',
    paymentMethods: 'Способы оплаты',
    notifications: 'Уведомления',
    support: 'Поддержка',
    settings: 'Настройки',
    language: 'Язык',
    darkTheme: 'Тёмная тема',
    lightTheme: 'Светлая тема',
    logout: 'Выйти из аккаунта',
    logoutConfirmTitle: 'Выйти из аккаунта',
    logoutConfirmMsg: 'Вы уверены, что хотите выйти?',
    logoutBtn: 'Выйти',
    version: 'Версия',
    comingSoon: 'Скоро',
    inDevelopment: 'Функция в разработке',
    supportContact: 'Свяжитесь с нами:\ninfo@axentis.uz',
    noGalleryAccess: 'Нет доступа',
    allowGallery: 'Разрешите доступ к фотогалерее в настройках',
    uploadError: 'Ошибка',
    uploadFail: 'Не удалось загрузить фото',

    // Home screen
    catalogTitle: 'Каталог',
    allProducts: 'Все товары',
    searchPlaceholder: 'Поиск товаров',
    notFound: 'Товары не найдены',
    noProducts: 'Нет товаров',

    // Cart screen
    cartTitle: 'Корзина',
    clearCart: 'Удалить все товары',
    clearCartMsg: 'Все товары будут удалены из корзины. Продолжить?',
    clear: 'Да, удалить',
    no: 'Нет',
    checkout: 'Оформить заказ',
    total: 'Итого',
    emptyCart: 'Корзина пуста',
    emptyCartHint: 'Добавьте товары из каталога',
    sum: 'сум',

    // Favorites screen
    favoritesTitle: 'Избранное',
    items: 'товаров',
    listEmpty: 'Список пуст',
    favoritesHint: 'Нажмите на сердечко на карточке товара, чтобы сохранить его здесь',
    goToHome: 'Перейти в каталог',

    // Orders
    ordersTitle: 'Мои заказы',
    noOrders: 'Заказов нет',
    noOrdersHint: 'Оформите первый заказ',

    // Language selection screen
    langSelectTitle: 'Выберите язык',
    langSelectSubtitle: 'Вы сможете изменить его позже в профиле',
    russian: 'Русский',
    uzbek: "O'zbek",
    continueBtn: 'Продолжить',
    currentLanguage: 'Текущий язык',
  },
  uz: {
    // Navigation tabs
    home: 'Bosh sahifa',
    cart: 'Savat',
    favorites: 'Sevimlilar',
    profile: 'Profil',

    // Login screen
    tagline: 'Kerakli narsa — yaqin atrofda',
    login: 'Kirish',
    register: "Ro'yxatdan o'tish",
    loginTitle: 'Hisobga kirish',
    registerTitle: 'Hisob yaratish',
    phoneNumber: 'Telefon raqami',
    password: 'Parol',
    enterPassword: 'Parolni kiriting',
    firstName: 'Ism',
    lastName: 'Familiya',
    yourFirstName: 'Ismingiz',
    yourLastName: 'Familiyangiz',
    minChars: 'Kamida 6 ta belgi',
    confirmPassword: 'Parolni tasdiqlang',
    repeatPassword: 'Parolni takrorlang',
    passwordMismatch: 'Parollar mos kelmadi',
    noAccount: 'Hisob yo\'qmi?',
    createAccount: "Ro'yxatdan o'tish",
    haveAccount: 'Hisob bormi?',
    signIn: 'Kirish',
    terms: 'Davom etib, siz',
    termsLink: 'xizmat shartlariga rozilik bildirasiz',
    userNotFound: 'Topilmadi',
    userNotRegistered: "Foydalanuvchi ro'yxatdan o'tmagan. Hisob yarating.",
    error: 'Xato',
    loginError: 'Kirish xatosi',
    registerError: 'Hisob yaratolmadi',
    cancel: 'Bekor qilish',

    // Profile screen
    profileTitle: 'Profil',
    defaultUser: 'Foydalanuvchi',
    myOrders: 'Buyurtmalarim',
    deliveryAddresses: 'Yetkazib berish manzillari',
    paymentMethods: "To'lov usullari",
    notifications: 'Bildirishnomalar',
    support: "Qo'llab-quvvatlash",
    settings: 'Sozlamalar',
    language: 'Til',
    darkTheme: "Qorong'i mavzu",
    lightTheme: "Yorug' mavzu",
    logout: 'Hisobdan chiqish',
    logoutConfirmTitle: 'Hisobdan chiqish',
    logoutConfirmMsg: 'Chiqishni xohlaysizmi?',
    logoutBtn: 'Chiqish',
    version: 'Versiya',
    comingSoon: 'Tez kunda',
    inDevelopment: 'Funksiya ishlab chiqilmoqda',
    supportContact: 'Biz bilan bog\'laning:\ninfo@axentis.uz',
    noGalleryAccess: 'Ruxsat yo\'q',
    allowGallery: 'Sozlamalarda foto galereyaga ruxsat bering',
    uploadError: 'Xato',
    uploadFail: 'Fotoni yuklab bo\'lmadi',

    // Home screen
    catalogTitle: 'Katalog',
    allProducts: 'Barcha mahsulotlar',
    searchPlaceholder: 'Mahsulot qidirish',
    notFound: 'Mahsulotlar topilmadi',
    noProducts: 'Mahsulotlar yo\'q',

    // Cart screen
    cartTitle: 'Savat',
    clearCart: "Barcha mahsulotlarni o'chirish",
    clearCartMsg: "Barcha mahsulotlar savatdan o'chiriladi. Davom etasizmi?",
    clear: 'Ha, o\'chirish',
    no: "Yo'q",
    checkout: 'Buyurtma berish',
    total: 'Jami',
    emptyCart: 'Savat bo\'sh',
    emptyCartHint: 'Katalogdan mahsulot qo\'shing',
    sum: 'so\'m',

    // Favorites screen
    favoritesTitle: 'Sevimlilar',
    items: 'ta mahsulot',
    listEmpty: 'Ro\'yxat bo\'sh',
    favoritesHint: 'Mahsulot kartasidagi yurakchani bosing va uni bu yerda saqlang',
    goToHome: 'Katalogga o\'tish',

    // Orders
    ordersTitle: 'Buyurtmalarim',
    noOrders: 'Buyurtmalar yo\'q',
    noOrdersHint: 'Birinchi buyurtmangizni bering',

    // Language selection screen
    langSelectTitle: 'Tilni tanlang',
    langSelectSubtitle: 'Keyinchalik profildan o\'zgartirish mumkin',
    russian: 'Русский',
    uzbek: "O'zbek",
    continueBtn: 'Davom etish',
    currentLanguage: 'Joriy til',
  },
};

type TranslationKeys = keyof typeof translations.ru;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: TranslationKeys) => string;
  hasChosenLanguage: boolean;
  markLanguageChosen: () => Promise<void>;
  isLanguageLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLang] = useState<Language>('uz');
  const [hasChosenLanguage, setHasChosenLanguage] = useState(false);
  const [isLanguageLoading, setIsLanguageLoading] = useState(true);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const [saved, chosen] = await Promise.all([
        AsyncStorage.getItem(LANG_KEY),
        AsyncStorage.getItem(LANG_CHOSEN_KEY),
      ]);
      if (saved === 'ru' || saved === 'uz') setLang(saved);
      if (chosen === 'true') setHasChosenLanguage(true);
    } catch {
      // ignore
    } finally {
      setIsLanguageLoading(false);
    }
  };

  const setLanguage = async (lang: Language) => {
    setLang(lang);
    try {
      await AsyncStorage.setItem(LANG_KEY, lang);
    } catch {}
  };

  const markLanguageChosen = async () => {
    setHasChosenLanguage(true);
    try {
      await AsyncStorage.setItem(LANG_CHOSEN_KEY, 'true');
    } catch {}
  };

  const t = (key: TranslationKeys): string => {
    return translations[language][key] ?? translations.ru[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, hasChosenLanguage, markLanguageChosen, isLanguageLoading }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
