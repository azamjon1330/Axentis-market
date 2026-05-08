import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

type Step = 'phone' | 'name';

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { login } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length === 0) return '';
    if (digits.length <= 1) return `+7 (${digits}`;
    if (digits.length <= 4) return `+7 (${digits.slice(1, 4)}`;
    if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}`;
    if (digits.length <= 9) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}`;
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  };

  const handlePhoneChange = (text: string) => {
    if (!text.startsWith('+7')) {
      if (text === '' || text === '+') { setPhone(''); return; }
      const digits = text.replace(/\D/g, '');
      setPhone(formatPhone('7' + digits));
      return;
    }
    setPhone(formatPhone(text));
  };

  const cleanPhone = phone.replace(/\D/g, '');
  const isPhoneValid = cleanPhone.length === 11;
  const isNameValid = name.trim().length >= 2;

  const handleContinue = async () => {
    if (!isPhoneValid) return;
    setIsLoading(true);
    try {
      // Try login first; if user doesn't exist, ask for name
      await login(cleanPhone);
      // Success - user exists
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || '';
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('не найден') || err?.response?.status === 404) {
        // New user
        setIsNewUser(true);
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
        setStep('name');
      } else {
        Alert.alert('Ошибка', msg || 'Не удалось войти. Попробуйте позже.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!isNameValid) return;
    setIsLoading(true);
    try {
      await login(cleanPhone, name.trim());
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось зарегистрироваться.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={isDark ? ['#1A1A3E', '#0F0F1E'] : ['#EEE8FF', '#F5F5F7']}
        style={styles.topGradient}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo area */}
          <View style={styles.logoArea}>
            <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
              <Ionicons name="storefront" size={40} color="#FFFFFF" />
            </View>
            <Text style={[styles.appName, { color: colors.text }]}>Axentis Market</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              Всё, что нужно — рядом
            </Text>
          </View>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Animated.View style={{ opacity: fadeAnim }}>
              {step === 'phone' ? (
                <>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Вход в аккаунт</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Введите ваш номер телефона
                  </Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Ionicons name="call-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={phone}
                      onChangeText={handlePhoneChange}
                      placeholder="+7 (___) ___-__-__"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="phone-pad"
                      maxLength={18}
                      autoFocus
                    />
                    {phone.length > 0 && (
                      <TouchableOpacity onPress={() => setPhone('')}>
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.btn,
                      { backgroundColor: isPhoneValid ? colors.primary : colors.border },
                    ]}
                    onPress={handleContinue}
                    disabled={!isPhoneValid || isLoading}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.btnText}>Продолжить</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity onPress={() => { setStep('phone'); setIsNewUser(false); }} style={styles.backRow}>
                    <Ionicons name="chevron-back" size={20} color={colors.primary} />
                    <Text style={[styles.backText, { color: colors.primary }]}>Назад</Text>
                  </TouchableOpacity>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Регистрация</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Введите ваше имя для создания аккаунта
                  </Text>
                  <View style={[styles.phoneBadge, { backgroundColor: colors.inputBg }]}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={[styles.phoneBadgeText, { color: colors.text }]}>{phone}</Text>
                  </View>
                  <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={name}
                      onChangeText={setName}
                      placeholder="Ваше имя"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="words"
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.btn,
                      { backgroundColor: isNameValid ? colors.primary : colors.border },
                    ]}
                    onPress={handleRegister}
                    disabled={!isNameValid || isLoading}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.btnText}>Создать аккаунт</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </Animated.View>
          </View>

          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
            Продолжая, вы соглашаетесь с{' '}
            <Text style={{ color: colors.primary }}>условиями сервиса</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },
  keyboardView: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 80 },
  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#7B5CF0',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  appName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 15, marginTop: 6 },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  cardSubtitle: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 54,
    marginBottom: 20,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, height: '100%' },
  btn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disclaimer: { textAlign: 'center', fontSize: 12, marginTop: 24, lineHeight: 18 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backText: { fontSize: 14, fontWeight: '500' },
  phoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  phoneBadgeText: { fontSize: 14, fontWeight: '500' },
});
