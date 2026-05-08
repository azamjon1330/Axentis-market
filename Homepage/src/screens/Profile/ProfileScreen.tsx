import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Switch, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { RootStackParamList } from '../../types';

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
  const { user, logout } = useAuth();
  const navigation = useNavigation<Nav>();

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
      onPress: () => Alert.alert('Скоро', 'Функция в разработке'),
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
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarInitials}>{getInitials(user?.name || '')}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: colors.text }]}>{user?.name || 'Пользователь'}</Text>
              <Text style={[styles.userPhone, { color: colors.textSecondary }]}>
                {user?.phone ? `+${user.phone}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.editBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Bonuses */}
          <View style={[styles.bonusesCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
            <View style={styles.bonusesLeft}>
              <Ionicons name="star" size={18} color={colors.primary} />
              <Text style={[styles.bonusesLabel, { color: colors.text }]}>Бонусы</Text>
            </View>
            <Text style={[styles.bonusesValue, { color: colors.primary }]}>3 450 ₽</Text>
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
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  userName: { fontSize: 18, fontWeight: '700' },
  userPhone: { fontSize: 14, marginTop: 2 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bonusesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  bonusesLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bonusesLabel: { fontSize: 15, fontWeight: '500' },
  bonusesValue: { fontSize: 18, fontWeight: '800' },
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
