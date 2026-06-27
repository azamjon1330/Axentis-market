import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANG_KEY = 'app_language';
const LANG_CHOSEN_KEY = 'app_language_chosen';

const translations = {
  ru: {
    home: 'Главная',
    cart: 'Корзина',
    favorites: 'Избранное',
    profile: 'Профиль',
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
    catalogTitle: 'Каталог',
    allProducts: 'Все товары',
    searchPlaceholder: 'Поиск товаров',
    notFound: 'Товары не найдены',
    noProducts: 'Нет товаров',
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
    favoritesTitle: 'Избранное',
    items: 'товаров',
    listEmpty: 'Список пуст',
    favoritesHint: 'Нажмите на сердечко на карточке товара, чтобы сохранить его здесь',
    goToHome: 'Перейти в каталог',
    ordersTitle: 'Мои заказы',
    noOrders: 'Заказов нет',
    noOrdersHint: 'Оформите первый заказ',
    langSelectTitle: 'Выберите язык',
    langSelectSubtitle: 'Вы сможете изменить его позже в профиле',
    russian: 'Русский',
    uzbek: "O'zbek",
    continueBtn: 'Продолжить',
    currentLanguage: 'Текущий язык',

    // ─── Orders ──────────────────────────────────────────────
    orderLabel: 'Заказ',
    orderFrom: 'Заказ от',
    tabAll: 'Все',
    tabActive: 'Активные',
    tabDelivered: 'Доставленные',
    tabCancelled: 'Отменённые',
    statusPending: 'Ожидает',
    statusPendingFull: 'Ожидает подтверждения',
    statusConfirmed: 'Подтверждён',
    statusProcessing: 'Обрабатывается',
    statusShipped: 'В пути',
    statusDelivered: 'Доставлен',
    statusCancelled: 'Отменён',
    stepPlaced: 'Оформлен',
    stepConfirmed: 'Подтверждён',
    stepInTransit: 'В пути',
    stepDelivered: 'Доставлен',
    deliveryTitle: 'Доставка',
    byCourier: 'Курьером',
    pickup: 'Самовывоз',
    deliveryWord: 'Доставка',
    productsTitle: 'Товары',
    pcs: 'шт.',
    paymentTitle: 'Оплата',
    paymentCash: 'Наличными',
    paymentCard: 'Карта',
    recipient: 'Получатель',
    colorLabel: 'Цвет',
    sizeLabel: 'Размер',
    errorLoadOrders: 'Не удалось загрузить заказы',
    errorLoading: 'Ошибка загрузки',
    retry: 'Повторить',
    noOrdersInCategory: 'Нет заказов в этой категории',
    neverOrdered: 'Вы ещё не делали заказов',
    orderNotFound: 'Заказ не найден',
    // Returns
    returnTitle: 'Оформить возврат',
    returnPossibleWithin: 'Возврат возможен в течение',
    hoursShort: 'ч',
    afterOrder: 'после заказа',
    returnReasonPlaceholder: 'Опишите причину возврата...',
    sendRequest: 'Отправить заявку',
    sending: 'Отправка...',
    returnRequestedMsg: 'Заявка на возврат отправлена продавцу',
    returnExpired: 'Срок возврата истёк',
    returnWord: 'Возврат',
    describeReturnReason: 'Опишите причину возврата',
    returnSentMsg: 'Заявка на возврат отправлена продавцу. Ожидайте решения.',
    returnFailMsg: 'Не удалось отправить заявку на возврат. Попробуйте позже.',
    noReturnsAccepted: 'Эта компания не принимает возвраты',
    contactSupport: 'Связаться с поддержкой',
    supportTitle: 'Поддержка',
    supportPhoneMsg: 'Свяжитесь с нами по телефону',

    // ─── ProductCard ─────────────────────────────────────────
    sold: 'продано',
    priceFrom: 'от',

    // ─── Notifications ───────────────────────────────────────
    markAllRead: 'Прочитать все',
    noNotifications: 'Нет уведомлений',
    notificationsHint: 'Здесь будут появляться уведомления о заказах и акциях',

    // ─── Product questions ───────────────────────────────────
    questionsTitle: 'Вопросы о товаре',
    askQuestionBtn: 'Задать вопрос о товаре',
    askPlaceholder: 'Задайте вопрос продавцу...',
    loginToAskPlaceholder: 'Войдите, чтобы задать вопрос',
    noQuestionsYet: 'Пока нет вопросов. Задайте первый!',
    questionWord: 'Вопрос',
    enterQuestion: 'Введите текст вопроса',
    loginWord: 'Вход',
    loginToAskMsg: 'Войдите в аккаунт, чтобы задать вопрос',
    thanksWord: 'Спасибо!',
    questionSentMsg: 'Ваш вопрос отправлен продавцу. Ответ появится здесь.',
  },
  uz: {
    home: 'Bosh sahifa',
    cart: 'Savat',
    favorites: 'Sevimlilar',
    profile: 'Profil',
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
    noAccount: "Hisob yo'qmi?",
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
    supportContact: "Biz bilan bog'laning:\ninfo@axentis.uz",
    noGalleryAccess: "Ruxsat yo'q",
    allowGallery: 'Sozlamalarda foto galereyaga ruxsat bering',
    uploadError: 'Xato',
    uploadFail: "Fotoni yuklab bo'lmadi",
    catalogTitle: 'Katalog',
    allProducts: 'Barcha mahsulotlar',
    searchPlaceholder: 'Mahsulot qidirish',
    notFound: 'Mahsulotlar topilmadi',
    noProducts: "Mahsulotlar yo'q",
    cartTitle: 'Savat',
    clearCart: "Barcha mahsulotlarni o'chirish",
    clearCartMsg: "Barcha mahsulotlar savatdan o'chiriladi. Davom etasizmi?",
    clear: "Ha, o'chirish",
    no: "Yo'q",
    checkout: 'Buyurtma berish',
    total: 'Jami',
    emptyCart: "Savat bo'sh",
    emptyCartHint: "Katalogdan mahsulot qo'shing",
    sum: "so'm",
    favoritesTitle: 'Sevimlilar',
    items: 'ta mahsulot',
    listEmpty: "Ro'yxat bo'sh",
    favoritesHint: 'Mahsulot kartasidagi yurakchani bosing va uni bu yerda saqlang',
    goToHome: "Katalogga o'tish",
    ordersTitle: 'Buyurtmalarim',
    noOrders: "Buyurtmalar yo'q",
    noOrdersHint: 'Birinchi buyurtmangizni bering',
    langSelectTitle: 'Tilni tanlang',
    langSelectSubtitle: "Keyinchalik profildan o'zgartirish mumkin",
    russian: 'Русский',
    uzbek: "O'zbek",
    continueBtn: 'Davom etish',
    currentLanguage: 'Joriy til',

    // ─── Orders ──────────────────────────────────────────────
    orderLabel: 'Buyurtma',
    orderFrom: 'Buyurtma sanasi',
    tabAll: 'Barchasi',
    tabActive: 'Faol',
    tabDelivered: 'Yetkazilgan',
    tabCancelled: 'Bekor qilingan',
    statusPending: 'Kutilmoqda',
    statusPendingFull: 'Tasdiqlash kutilmoqda',
    statusConfirmed: 'Tasdiqlandi',
    statusProcessing: 'Tayyorlanmoqda',
    statusShipped: "Yo'lda",
    statusDelivered: 'Yetkazildi',
    statusCancelled: 'Bekor qilindi',
    stepPlaced: 'Rasmiylashtirildi',
    stepConfirmed: 'Tasdiqlandi',
    stepInTransit: "Yo'lda",
    stepDelivered: 'Yetkazildi',
    deliveryTitle: 'Yetkazib berish',
    byCourier: 'Kuryer orqali',
    pickup: "O'zi olib ketish",
    deliveryWord: 'Yetkazib berish',
    productsTitle: 'Mahsulotlar',
    pcs: 'dona',
    paymentTitle: "To'lov",
    paymentCash: 'Naqd pul',
    paymentCard: 'Karta',
    recipient: 'Qabul qiluvchi',
    colorLabel: 'Rang',
    sizeLabel: "O'lcham",
    errorLoadOrders: "Buyurtmalarni yuklab bo'lmadi",
    errorLoading: 'Yuklashda xato',
    retry: 'Qayta urinish',
    noOrdersInCategory: "Bu turkumda buyurtmalar yo'q",
    neverOrdered: 'Siz hali buyurtma bermagansiz',
    orderNotFound: 'Buyurtma topilmadi',
    // Returns
    returnTitle: 'Qaytarishni rasmiylashtirish',
    returnPossibleWithin: 'Qaytarish mumkin:',
    hoursShort: 'soat',
    afterOrder: 'buyurtmadan keyin',
    returnReasonPlaceholder: 'Qaytarish sababini yozing...',
    sendRequest: "So'rov yuborish",
    sending: 'Yuborilmoqda...',
    returnRequestedMsg: "Qaytarish so'rovi sotuvchiga yuborildi",
    returnExpired: 'Qaytarish muddati tugadi',
    returnWord: 'Qaytarish',
    describeReturnReason: 'Qaytarish sababini yozing',
    returnSentMsg: "Qaytarish so'rovi sotuvchiga yuborildi. Javobni kuting.",
    returnFailMsg: "So'rovni yuborib bo'lmadi. Keyinroq urinib ko'ring.",
    noReturnsAccepted: 'Bu kompaniya qaytarishni qabul qilmaydi',
    contactSupport: "Qo'llab-quvvatlash bilan bog'lanish",
    supportTitle: "Qo'llab-quvvatlash",
    supportPhoneMsg: "Biz bilan telefon orqali bog'laning",

    // ─── ProductCard ─────────────────────────────────────────
    sold: 'sotildi',
    priceFrom: 'dan',

    // ─── Notifications ───────────────────────────────────────
    markAllRead: "Hammasini o'qish",
    noNotifications: "Bildirishnomalar yo'q",
    notificationsHint: "Bu yerda buyurtmalar va aksiyalar haqida bildirishnomalar paydo bo'ladi",

    // ─── Product questions ───────────────────────────────────
    questionsTitle: 'Mahsulot haqida savollar',
    askQuestionBtn: 'Mahsulot haqida savol berish',
    askPlaceholder: 'Sotuvchiga savol bering...',
    loginToAskPlaceholder: 'Savol berish uchun tizimga kiring',
    noQuestionsYet: "Hozircha savollar yo'q. Birinchi bo'lib so'rang!",
    questionWord: 'Savol',
    enterQuestion: 'Savol matnini kiriting',
    loginWord: 'Kirish',
    loginToAskMsg: 'Savol berish uchun hisobingizga kiring',
    thanksWord: 'Rahmat!',
    questionSentMsg: "Savolingiz sotuvchiga yuborildi. Javob shu yerda paydo bo'ladi.",
  },
};

const LanguageContext = createContext({});

export const LanguageProvider = ({ children }) => {
  const [language, setLang] = useState('uz');
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

  const setLanguage = async (lang) => {
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

  const t = (key) => {
    return translations[language]?.[key] ?? translations.ru?.[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, hasChosenLanguage, markLanguageChosen, isLanguageLoading }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
