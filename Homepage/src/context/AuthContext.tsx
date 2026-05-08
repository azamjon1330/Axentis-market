import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { loginUser, getUserProfile } from '../api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (phone: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const savedUser = await AsyncStorage.getItem('currentUser');
      if (savedUser) {
        const parsed = JSON.parse(savedUser) as User;
        setUser(parsed);
        // Refresh from server
        try {
          const fresh = await getUserProfile(parsed.phone);
          setUser(fresh);
          await AsyncStorage.setItem('currentUser', JSON.stringify(fresh));
        } catch {
          // Use cached
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (phone: string, name?: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const result = await loginUser(cleanPhone, name);
    const userData = result.user || (result as unknown as User);
    setUser(userData);
    await AsyncStorage.setItem('currentUser', JSON.stringify(userData));
    if (result.token) {
      await AsyncStorage.setItem('userToken', result.token);
    }
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.multiRemove(['currentUser', 'userToken']);
  };

  const refreshUser = async () => {
    if (!user) return;
    try {
      const fresh = await getUserProfile(user.phone);
      setUser(fresh);
      await AsyncStorage.setItem('currentUser', JSON.stringify(fresh));
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
