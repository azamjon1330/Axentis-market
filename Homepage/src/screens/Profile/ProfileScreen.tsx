import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Switch, Image, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';
import { API_BASE_URL } from '../../config';
import { getImageUrl } from '../../utils/imageUrl';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface MenuItem {
  id: string;
  icon: string;
  label: string;
  sublabel?: string;
  badge?: string | number;
  onPress: () => void;
  color?: string;
}

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout, refreshUser } = useAuth();
  const navigation = useNavigation<Nav>();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разрешите доступ к фотогалерее в настройках');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: 'avatar.jpg',
      } as any);

      const res = await fetch(`${API_BASE_URL}/users/${user?.phone}/avatar`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.ok) {
        await refreshUser();
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить фото');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  };

  const MENU_ITEMS: MenuItem[] = [
    {
      id: 'orders',
      icon: 'receipt-outline',
      label: 'Мои заказы',
      onPress: () => navigation.navigate('AllOrders'),
    },
    {
      id: 'favorites',
      icon: 'heart-outline',
      label: 'Избранное',
      onPress: () => navigation.navigate('Main' as any, { screen: 'Favorites' }),
    },
    {
      id: 'notifications',
      icon: 'notifications-outline',
      label: 'Уведомления',
      onPress: () => navigation.navigate('Notifications'),
    },
    {
      id: 'address',
      icon: 'location-outline',
      label: 'Адреса доставки',
      onPress: () => Alert.alert('Скоро', 'Функция в разработке'),
    },
    {
      id: 'cards',
      icon: 'card-outline',
      label: 'Способы оплаты',
      onPress: () => navigation.navigate('PaymentCards'),
    },
    {
      id: 'support',
      icon: 'headset-outline',
      label: 'Поддержка',
      onPress: () => Alert.alert('Поддержка', 'Свяжитесь с нами:\ninfo@axentis.uz'),
    },
    {
      id: 'settings',
      icon: 'settings-outline',
      label: 'Настройки',
      onPress: () => Alert.alert('Скоро', 'Функция в разработке'),
    },
  ];

  const getInitials = (name: string) => {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Профиль</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Avatar + user info */}
        <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} style={styles.avatarWrap}>
              {user?.avatarUrl ? (
                <Image source={{ uri: getImageUrl(user.avatarUrl) || user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarInitials}>{getInitials(user?.name || '')}</Text>
                </View>
              )}
              <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="camera" size={11} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: colors.text }]}>{user?.name || 'Пользователь'}</Text>
              <Text style={[styles.userPhone, { color: colors.textSecondary }]}>
                {user?.phone ? `+${user.phone}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Theme toggle */}
        <View style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.themeLeft}>
            <View style={[styles.menuIconBg, { backgroundColor: (isDark ? '#FFD700' : '#7B5CF0') + '20' }]}>
              <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={isDark ? '#FFD700' : colors.primary} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.text }]}>
              {isDark ? 'Тёмная тема' : 'Светлая тема'}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Menu items */}
        <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {MENU_ITEMS.map((item, index) => (
            <React.Fragment key={item.id}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconBg, { backgroundColor: (item.color || colors.primary) + '15' }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.color || colors.primary} />
                </View>
                <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
                {item.badge && (
                  <View style={[styles.badge, { backgroundColor: colors.badge }]}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {index < MENU_ITEMS.length - 1 && (
                <View style={[styles.separator, { backgroundColor: colors.divider }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.error + '40' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.textMuted }]}>Версия 1.0.0</Text>
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  scroll: { padding: 16, gap: 12 },
  userCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#FFF', fontSize: 24, fontWeight: '800' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  userName: { fontSize: 18, fontWeight: '700' },
  userPhone: { fontSize: 14, marginTop: 2 },
  themeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  themeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  menuIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  separator: { height: 1, marginLeft: 66 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
  },
  logoutText: { fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 4 },
});
