'use client';
import { createContext, useContext, useReducer, useEffect, useState } from 'react';
import { logInfo, logError } from '../lib/logger';

const CartContext = createContext();

const getSessionIdFromUrl = () => {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  let sessionId = urlParams.get('sessionId');
  if (!sessionId) {
    sessionId = sessionStorage.getItem('mp_global_session_id');
  }
  return sessionId || 'default_session';
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'HYDRATE': {
      return {
        ...state,
        items: action.payload.items || [],
        totalAmount: action.payload.totalAmount || 0,
        totalItems: action.payload.totalItems || 0,
        isHydrated: true
      };
    }

    case 'ADD_ITEM': {
      const { product, quantity = 1 } = action.payload;
      const existingItem = state.items.find(item => item.productId === product.id);
      
      let newItems;
      if (existingItem) {
        newItems = state.items.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        newItems = [...state.items, {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: quantity,
          image: product.image,
          product: product
        }];
      }

      const newTotalAmount = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const newTotalItems = newItems.reduce((sum, item) => sum + item.quantity, 0);

      const newState = {
        ...state,
        items: newItems,
        totalAmount: newTotalAmount,
        totalItems: newTotalItems
      };

      // Guardar inmediatamente en localStorage
      if (typeof window !== 'undefined' && state.isHydrated) {
        try {
          const sessionId = getSessionIdFromUrl();
          const storageKey = `mp_cart_${sessionId}`;
          const cartData = {
            items: newItems,
            totalAmount: newTotalAmount,
            totalItems: newTotalItems,
            timestamp: new Date().toISOString()
          };
          localStorage.setItem(storageKey, JSON.stringify(cartData));
          
          // Disparar evento para notificar cambios
          window.dispatchEvent(new CustomEvent('mp-cart-updated', {
            detail: { 
              action: 'add',
              cartData,
              sessionId
            }
          }));
          
          logInfo('Producto agregado al carrito:', product.name);
        } catch (error) {
          logError('Error guardando en localStorage:', error);
        }
      }

      return newState;
    }

    case 'UPDATE_QUANTITY': {
      const { productId, quantity } = action.payload;
      const newItems = quantity <= 0
        ? state.items.filter(item => item.productId !== productId)
        : state.items.map(item =>
            item.productId === productId ? { ...item, quantity } : item
          );

      const newTotalAmount = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const newTotalItems = newItems.reduce((sum, item) => sum + item.quantity, 0);

      return {
        ...state,
        items: newItems,
        totalAmount: newTotalAmount,
        totalItems: newTotalItems
      };
    }

    case 'REMOVE_ITEM': {
      const newItems = state.items.filter(item => item.productId !== action.payload.productId);
      const newTotalAmount = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const newTotalItems = newItems.reduce((sum, item) => sum + item.quantity, 0);

      return {
        ...state,
        items: newItems,
        totalAmount: newTotalAmount,
        totalItems: newTotalItems
      };
    }

    case 'CLEAR_CART':
      return {
        ...state,
        items: [],
        totalAmount: 0,
        totalItems: 0
      };

    default:
      return state;
  }
};

const initialState = {
  items: [],
  totalAmount: 0,
  totalItems: 0,
  isHydrated: false
};

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const [mounted, setMounted] = useState(false);

  // Marcar como montado
  useEffect(() => {
    setMounted(true);
  }, []);

  // Hidratar desde localStorage solo cuando esté montado
  useEffect(() => {
    if (!mounted) return;

    const sessionId = getSessionIdFromUrl();
    const storageKey = `mp_cart_${sessionId}`;
    
    try {
      const savedCart = localStorage.getItem(storageKey);
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        dispatch({
          type: 'HYDRATE',
          payload: {
            items: parsedCart.items || [],
            totalAmount: parsedCart.totalAmount || 0,
            totalItems: parsedCart.totalItems || 0
          }
        });
        logInfo('Carrito hidratado desde localStorage');
      } else {
        dispatch({
          type: 'HYDRATE',
          payload: { items: [], totalAmount: 0, totalItems: 0 }
        });
      }
    } catch (error) {
      logError('Error hidratando carrito:', error);
      dispatch({
        type: 'HYDRATE',
        payload: { items: [], totalAmount: 0, totalItems: 0 }
      });
    }
  }, [mounted]);

  // Guardar cambios en localStorage (excepto durante hidratación inicial)
  useEffect(() => {
    if (!mounted || !state.isHydrated) return;

    const sessionId = getSessionIdFromUrl();
    const storageKey = `mp_cart_${sessionId}`;
    
    try {
      const cartData = {
        items: state.items,
        totalAmount: state.totalAmount,
        totalItems: state.totalItems,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(storageKey, JSON.stringify(cartData));
    } catch (error) {
      logError('Error guardando carrito:', error);
    }
  }, [state.items, state.totalAmount, state.totalItems, mounted, state.isHydrated]);

  const addItem = (product, quantity = 1) => {
    if (!state.isHydrated) {
      logError('Intentando agregar producto antes de hidratación');
      return;
    }
    dispatch({ type: 'ADD_ITEM', payload: { product, quantity } });
  };

  const updateQuantity = (productId, quantity) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { productId, quantity } });
  };

  const removeItem = (productId) => {
    dispatch({ type: 'REMOVE_ITEM', payload: { productId } });
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  // No renderizar hasta estar completamente hidratado
  if (!mounted || !state.isHydrated) {
    return (
      <CartContext.Provider value={{
        items: [],
        totalAmount: 0,
        totalItems: 0,
        addItem: () => {},
        updateQuantity: () => {},
        removeItem: () => {},
        clearCart: () => {},
        isHydrated: false
      }}>
        {children}
      </CartContext.Provider>
    );
  }

  return (
    <CartContext.Provider value={{
      ...state,
      addItem,
      updateQuantity,
      removeItem,
      clearCart
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart debe usarse dentro de CartProvider');
  }
  return context;
};