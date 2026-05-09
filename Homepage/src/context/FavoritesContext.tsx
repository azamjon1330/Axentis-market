import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Product } from '../types';
import { getFavorites, toggleFavorite } from '../api';
import { useAuth } from './AuthContext';

interface FavoritesContextType {
  products: Product[];
  count: number;
  isLoading: boolean;
  isFavorite: (productId: number) => boolean;
  toggle: (productId: number, product?: Product) => Promise<void>;
  refresh: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType>({} as FavoritesContextType);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setProducts([]); return; }
    setIsLoading(true);
    try {
      const data = await getFavorites(user.phone);
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const isFavorite = (productId: number) => products.some(p => p.id === productId);

  const toggle = async (productId: number, product?: Product) => {
    if (!user) return;
    const wasFav = products.some(p => p.id === productId);
    // Optimistic update
    setProducts(prev =>
      wasFav
        ? prev.filter(p => p.id !== productId)
        : product ? [...prev, product] : prev
    );
    try {
      await toggleFavorite(user.phone, productId);
      if (!wasFav && !product) {
        const data = await getFavorites(user.phone);
        setProducts(Array.isArray(data) ? data : []);
      }
    } catch {
      await refresh();
    }
  };

  return (
    <FavoritesContext.Provider value={{ products, count: products.length, isLoading, isFavorite, toggle, refresh }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => useContext(FavoritesContext);
