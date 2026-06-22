import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCart, addToCart, setCartItem, removeCartItem, clearCart } from '../api';
import { useAuth } from './AuthContext';

const CartContext = createContext({});

export const CartProvider = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
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

  const addItem = async (productId, quantity = 1, color, size) => {
    if (!user) return;
    await addToCart({
      user_phone: user.phone,
      product_id: productId,
      quantity,
      selected_color: color || '',
      selected_size: size || '',
    });
    await refresh();
  };

  const updateItem = async (productId, quantity, color, size) => {
    if (!user) return;
    setItems(prev => prev.map(item =>
      item.productId === productId &&
      (item.selected_color || '') === (color || '') &&
      (item.selected_size || '') === (size || '')
        ? { ...item, quantity }
        : item
    ));
    try {
      await setCartItem({
        user_phone: user.phone,
        product_id: productId,
        quantity,
        selected_color: color || '',
        selected_size: size || '',
      });
    } catch {
      await refresh();
    }
  };

  const removeItem = async (itemId) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    try {
      await removeCartItem(itemId);
    } catch {
      await refresh();
    }
  };

  const clearAllItems = async () => {
    if (!user) return;
    await clearCart(user.phone);
    setItems([]);
  };

  const count = items.length;
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
