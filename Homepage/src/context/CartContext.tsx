import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CartItem } from '../types';
import { getCart, addToCart, setCartItem, removeCartItem, clearCart, getCartCount } from '../api';
import { useAuth } from './AuthContext';

interface CartContextType {
  items: CartItem[];
  count: number;
  total: number;
  isLoading: boolean;
  addItem: (productId: number, quantity?: number, color?: string) => Promise<void>;
  updateItem: (productId: number, quantity: number, color?: string) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
  clearAllItems: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextType>({} as CartContextType);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setIsLoading(true);
    try {
      const data = await getCart(user.phone);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = async (productId: number, quantity = 1, color?: string) => {
    if (!user) return;
    await addToCart({ user_phone: user.phone, product_id: productId, quantity, selected_color: color });
    await refresh();
  };

  const updateItem = async (productId: number, quantity: number, color?: string) => {
    if (!user) return;
    await setCartItem({ user_phone: user.phone, product_id: productId, quantity, selected_color: color });
    await refresh();
  };

  const removeItem = async (itemId: number) => {
    await removeCartItem(itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  const clearAllItems = async () => {
    if (!user) return;
    await clearCart(user.phone);
    setItems([]);
  };

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => {
    const price = item.product?.discountedPrice || item.product?.sellingPrice || item.product?.price || 0;
    return sum + price * item.quantity;
  }, 0);

  return (
    <CartContext.Provider value={{ items, count, total, isLoading, addItem, updateItem, removeItem, clearAllItems, refresh }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
