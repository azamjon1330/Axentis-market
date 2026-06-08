import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCart, addToCart, setCartItem, removeCartItem, clearCart } from '../api';
import { useAuth } from './AuthContext';

const CartContext = createContext({});

// A cart line is uniquely identified by the product plus its selected
// color/size variant. Two lines for the same product but different
// color/size are distinct. (Task 26.1 will additionally dedup by a backend
// variantId; this key stays consistent with that direction.)
export const lineKey = (productId, color, size) =>
  `${productId}::${color || ''}::${size || ''}`;

// Builds the exact stock warning string required by the spec (Req 20.3).
export const stockWarningMessage = (n) =>
  `Only ${n} of this product are in stock at this company's warehouse`;

/**
 * clampQuantity(requested, stock)
 *
 * Returns an object `{ quantity, warning }`:
 *  - `quantity` is an integer in the range [1, stock].
 *  - Non-finite or < 1 `requested` values normalize to 1 (Req 19.3).
 *  - When `requested` exceeds a known positive `stock`, the quantity is
 *    clamped down to `stock` and `warning` carries the exact stock message
 *    (Req 20.1, 20.2, 20.3).
 *  - When `stock` is unknown (non-finite or < 1, e.g. variant stock not
 *    loaded) no cap is applied so the buyer can still increment.
 *
 * Pure and side-effect free so it can be imported directly by property tests.
 */
export const clampQuantity = (requested, stock) => {
  let quantity = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1;
  let warning = null;
  if (Number.isFinite(stock) && stock >= 1 && quantity > stock) {
    quantity = Math.floor(stock);
    warning = stockWarningMessage(quantity);
  }
  return { quantity, warning };
};

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

  // Resolve the available stock for an existing cart line so re-adds can be
  // capped. Mirrors CartScreen's getLineStock: a specific color/size line uses
  // its matching variant stock; otherwise the product's own quantity. Unknown
  // / non-positive values return null (treated as "uncapped" by clampQuantity).
  const lineStockOf = (item, color, size) => {
    const product = item?.product || {};
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const c = color || '';
    const s = size || '';
    if ((c || s) && variants.length) {
      const match = variants.find(v =>
        ((v.color ?? v.selected_color ?? v.colorName ?? '') === c) &&
        ((v.size ?? v.selected_size ?? v.sizeName ?? '') === s)
      );
      if (match) {
        const ms = match.stockQuantity ?? match.stock_quantity ?? match.quantity;
        if (Number.isFinite(ms) && ms >= 1) return ms;
      }
    }
    const pq = product.quantity;
    if (Number.isFinite(pq) && pq >= 1) return pq;
    return null;
  };

  // Add a line for a (product, color, size) variant, deduping by that key.
  //  - If a matching line already exists, INCREMENT its quantity (capped at the
  //    line's known stock via clampQuantity) instead of creating a duplicate
  //    line (Req 17.3). Using setCartItem with the resolved absolute quantity
  //    avoids double-counting against the backend's own increment.
  //  - Otherwise create the line via the backend (which keys by product +
  //    selected color/size, so passing `size` keeps a variant product from ever
  //    collapsing into a single variant-less line — Req 17.2).
  // The payload is an object so it can be extended (e.g. a backend variant_id)
  // without changing the call sites.
  const addItem = async (productId, quantity = 1, color, size) => {
    if (!user) return;
    const existing = items.find(i =>
      i.productId === productId &&
      (i.selected_color || '') === (color || '') &&
      (i.selected_size || '') === (size || '')
    );
    if (existing) {
      const stock = lineStockOf(existing, color, size);
      const { quantity: capped } = clampQuantity((existing.quantity || 0) + quantity, stock);
      await updateItem(productId, capped, color, size);
      return;
    }
    const payload = {
      user_phone: user.phone,
      product_id: productId,
      quantity,
      selected_color: color,
      selected_size: size,
    };
    await addToCart(payload);
    await refresh();
  };

  // Set the exact quantity for the line matching (product, color, size). A line
  // is matched by product id together with BOTH its color and size so distinct
  // variants of the same product are updated independently.
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
        selected_color: color,
        selected_size: size,
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
