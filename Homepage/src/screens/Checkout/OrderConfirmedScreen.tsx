import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'OrderConfirmed'>;

export default function OrderConfirmedScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { orderId, orderCode } = route.params;

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.content}>
        {/* Success icon */}
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.iconCircle}
          >
            <Ionicons name="checkmark" size={56} color="#FFFFFF" />
          </LinearGradient>
        </Animated.View>

        <Animated.View style={[styles.textBlock, { opacity: fadeAnim }]}>
          <Text style={[styles.title, { color: colors.text }]}>Заказ оформлен</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Спасибо! Ваша заказ принят
          </Text>
          <Text style={[styles.orderCode, { color: colors.primary }]}>#{orderCode}</Text>

          {/* Info card */}
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <Ionicons name="bicycle-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Доставка курьером</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>24 мая, с 10:00 до 13:00</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Buttons */}
      <Animated.View style={[styles.buttons, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={[styles.trackBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('OrderDetail', { orderId })}
          activeOpacity={0.85}
        >
          <Ionicons name="location-outline" size={18} color="#FFF" />
          <Text style={styles.trackBtnText}>Отследить заказ</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.homeBtn, { backgroundColor: colors.surface, borderColor: colors.primary + '60' }]}
          onPress={() => navigation.navigate('AllOrders')}
          activeOpacity={0.8}
        >
          <Ionicons name="receipt-outline" size={18} color={colors.primary} />
          <Text style={[styles.homeBtnText, { color: colors.primary }]}>Мои заказы</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.homeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] })}
          activeOpacity={0.8}
        >
          <Text style={[styles.homeBtnText, { color: colors.text }]}>На главную</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', padding: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7B5CF0',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
  },
  textBlock: { alignItems: 'center', gap: 8, width: '100%' },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 15 },
  orderCode: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  infoCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  buttons: { gap: 12, paddingBottom: 16 },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
  },
  trackBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  homeBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
  },
  homeBtnText: { fontSize: 16, fontWeight: '600' },
});
