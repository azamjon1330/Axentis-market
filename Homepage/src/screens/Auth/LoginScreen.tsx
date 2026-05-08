import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Animated, Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');

type Tab = 'login' | 'register';

// +998 (UZ) format: +998 XX XXX XX XX
function formatUzPhone(val: string): string {
  const digits = val.replace(/\D/g, '');
  // Remove leading 998 if typed
  const local = digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length === 0) return '';
  if (local.length <= 2) return `+998 ${local}`;
  if (local.length <= 5) return `+998 ${local.slice(0, 2)} ${local.slice(2)}`;
  if (local.length <= 7) return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  if (local.length <= 9) return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
  return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

function getCleanPhone(formatted: string): string {
  const digits = formatted.replace(/\D/g, '');
  if (digits.startsWith('998')) return digits;
  return '998' + digits;
}

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { login, register } = useAuth();

  const [tab, setTab] = useState<Tab>('login');
  const tabAnim = useRef(new Animated.Value(0)).current;

  // Login fields
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginPassVisible, setLoginPassVisible] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Register fields
  const [regName, setRegName] = useState('');
  const [regSurname, setRegSurname] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regPassVisible, setRegPassVisible] = useState(false);
  const [regConfirmVisible, setRegConfirmVisible] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  const switchTab = (t: Tab) => {
    setTab(t);
    Animated.spring(tabAnim, {
      toValue: t === 'login' ? 0 : 1,
      useNativeDriver: false,
      tension: 60,
      friction: 10,
    }).start();
  };

  const handleLoginPhoneChange = (text: string) => {
    if (text === '' || text === '+') { setLoginPhone(''); return; }
    const digits = text.replace(/\D/g, '');
    setLoginPhone(formatUzPhone(digits));
  };

  const handleRegPhoneChange = (text: string) => {
    if (text === '' || text === '+') { setRegPhone(''); return; }
    const digits = text.replace(/\D/g, '');
    setRegPhone(formatUzPhone(digits));
  };

  const loginPhoneDigits = loginPhone.replace(/\D/g, '');
  const isLoginPhoneValid = loginPhoneDigits.length >= 9;
  const isLoginValid = isLoginPhoneValid && loginPassword.length >= 4;

  const regPhoneDigits = regPhone.replace(/\D/g, '');
  const isRegPhoneValid = regPhoneDigits.length >= 9;
  const isRegValid =
    regName.trim().length >= 2 &&
    regSurname.trim().length >= 2 &&
    isRegPhoneValid &&
    regPassword.length >= 6 &&
    regPassword === regConfirm;

  const handleLogin = async () => {
    if (!isLoginValid) return;
    setLoginLoading(true);
    try {
      const phone = getCleanPhone(loginPhone);
      await login(phone, loginPassword);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Ошибка входа';
      if (err?.response?.status === 404) {
        Alert.alert('Не найден', 'Пользователь не зарегистрирован. Создайте аккаунт.', [
          { text: 'Регистрация', onPress: () => switchTab('register') },
          { text: 'ОК', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Ошибка', msg);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!isRegValid) {
      if (regPassword !== regConfirm) {
        Alert.alert('Ошибка', 'Пароли не совпадают');
        return;
      }
      if (regPassword.length < 6) {
        Alert.alert('Ошибка', 'Пароль должен быть не менее 6 символов');
        return;
      }
      return;
    }
    setRegLoading(true);
    try {
      const phone = getCleanPhone(regPhone);
      await register(phone, regName.trim(), regSurname.trim(), regPassword);
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.error || 'Не удалось создать аккаунт');
    } finally {
      setRegLoading(false);
    }
  };

  const indicatorLeft = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, (width - 48) / 2 + 4],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LinearGradient
        colors={isDark ? ['#1A0A3E', '#0A0A1E'] : ['#EDE8FF', '#F5F3FF']}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
              <Ionicons name="storefront" size={36} color="#fff" />
            </View>
            <Text style={[styles.appName, { color: colors.text }]}>Axentis Market</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              Всё, что нужно — рядом
            </Text>
          </View>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Tab switcher */}
            <View style={[styles.tabBar, { backgroundColor: colors.inputBg }]}>
              <Animated.View
                style={[styles.tabIndicator, { backgroundColor: colors.primary, left: indicatorLeft }]}
              />
              <TouchableOpacity style={styles.tabBtn} onPress={() => switchTab('login')} activeOpacity={0.8}>
                <Text style={[styles.tabText, { color: tab === 'login' ? '#fff' : colors.textSecondary }]}>
                  Войти
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tabBtn} onPress={() => switchTab('register')} activeOpacity={0.8}>
                <Text style={[styles.tabText, { color: tab === 'register' ? '#fff' : colors.textSecondary }]}>
                  Регистрация
                </Text>
              </TouchableOpacity>
            </View>

            {tab === 'login' ? (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.formTitle, { color: colors.text }]}>Вход в аккаунт</Text>

                {/* Phone */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Номер телефона</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="call-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={loginPhone}
                    onChangeText={handleLoginPhoneChange}
                    placeholder="+998 XX XXX XX XX"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    maxLength={17}
                  />
                  {loginPhone.length > 0 && (
                    <TouchableOpacity onPress={() => setLoginPhone('')}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Password */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Пароль</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    placeholder="Введите пароль"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!loginPassVisible}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setLoginPassVisible(v => !v)}>
                    <Ionicons
                      name={loginPassVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: isLoginValid ? colors.primary : colors.border }]}
                  onPress={handleLogin}
                  disabled={!isLoginValid || loginLoading}
                  activeOpacity={0.85}
                >
                  {loginLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnText}>Войти</Text>
                  }
                </TouchableOpacity>

                <TouchableOpacity onPress={() => switchTab('register')} style={styles.switchHint}>
                  <Text style={[styles.switchText, { color: colors.textSecondary }]}>
                    Нет аккаунта?{' '}
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Зарегистрироваться</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.formTitle, { color: colors.text }]}>Создать аккаунт</Text>

                {/* Name */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Имя</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={regName}
                    onChangeText={setRegName}
                    placeholder="Ваше имя"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>

                {/* Surname */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Фамилия</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={regSurname}
                    onChangeText={setRegSurname}
                    placeholder="Ваша фамилия"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                </View>

                {/* Phone */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Номер телефона</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="call-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={regPhone}
                    onChangeText={handleRegPhoneChange}
                    placeholder="+998 XX XXX XX XX"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    maxLength={17}
                  />
                  {regPhone.length > 0 && (
                    <TouchableOpacity onPress={() => setRegPhone('')}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Password */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Пароль</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={regPassword}
                    onChangeText={setRegPassword}
                    placeholder="Минимум 6 символов"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!regPassVisible}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setRegPassVisible(v => !v)}>
                    <Ionicons
                      name={regPassVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                {/* Confirm password */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Повторите пароль</Text>
                <View style={[
                  styles.inputRow,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: regConfirm.length > 0 && regConfirm !== regPassword
                      ? colors.error
                      : colors.border,
                  },
                ]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={regConfirm}
                    onChangeText={setRegConfirm}
                    placeholder="Повторите пароль"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!regConfirmVisible}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setRegConfirmVisible(v => !v)}>
                    <Ionicons
                      name={regConfirmVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={
                        regConfirm.length > 0 && regConfirm !== regPassword
                          ? colors.error
                          : colors.textMuted
                      }
                    />
                  </TouchableOpacity>
                </View>

                {regConfirm.length > 0 && regConfirm !== regPassword && (
                  <Text style={[styles.errorHint, { color: colors.error }]}>Пароли не совпадают</Text>
                )}

                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: isRegValid ? colors.primary : colors.border, marginTop: 8 }]}
                  onPress={handleRegister}
                  disabled={!isRegValid || regLoading}
                  activeOpacity={0.85}
                >
                  {regLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnText}>Создать аккаунт</Text>
                  }
                </TouchableOpacity>

                <TouchableOpacity onPress={() => switchTab('login')} style={styles.switchHint}>
                  <Text style={[styles.switchText, { color: colors.textSecondary }]}>
                    Уже есть аккаунт?{' '}
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Войти</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 60 },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#7B5CF0',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  appName: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 14, marginTop: 4 },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    position: 'relative',
    height: 46,
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    width: '50%',
    height: 38,
    borderRadius: 11,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  formTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 50,
    marginBottom: 14,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15, height: '100%' },
  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchHint: { alignItems: 'center', marginTop: 16 },
  switchText: { fontSize: 13 },
  errorHint: { fontSize: 12, marginTop: -10, marginBottom: 10 },
  disclaimer: { textAlign: 'center', fontSize: 12, marginTop: 24, lineHeight: 18 },
});
