// Watchlist state + Firestore sync. Doc shape:
//   watchlists/{uid} = { userId, tickers: [...], updated_at }
// Each ticker entry: { ticker, company_name, added_at, last_score, last_band,
//                      last_checked, alert_on_change }

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { auth, db } from '../config/firebase';
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp,
  collection, query, orderBy, limit, where, writeBatch,
} from 'firebase/firestore';
import { useAuth } from './AuthContext';

const WatchlistContext = createContext(null);

export function WatchlistProvider({ children }) {
  const { user } = useAuth();
  const [tickers, setTickers]       = useState([]);  // [{ticker, company_name, ...}]
  const [loading, setLoading]       = useState(true);
  const [notifications, setNotifs]  = useState([]);  // in-app notification log
  const [unreadCount, setUnreadCount] = useState(0);

  // ── Watchlist: realtime Firestore subscription ──
  useEffect(() => {
    if (!user?.uid) {
      setTickers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'watchlists', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTickers(Array.isArray(data.tickers) ? data.tickers : []);
      } else {
        setTickers([]);
      }
      setLoading(false);
    }, (err) => {
      console.warn('[Watchlist] subscription error:', err.message);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  // ── Notifications: recent alerts for this user ──
  useEffect(() => {
    if (!user?.uid) {
      setNotifs([]);
      setUnreadCount(0);
      return;
    }
    const ref = collection(db, 'notifications', user.uid, 'items');
    const q   = query(ref, orderBy('timestamp', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifs(items);
      setUnreadCount(items.filter((n) => !n.read).length);
    }, (err) => {
      console.warn('[Watchlist] notifications subscription error:', err.message);
    });
    return unsub;
  }, [user?.uid]);

  // ── Mutations ──
  const isSaved = useCallback((symbol) => {
    return tickers.some((t) => t.ticker === symbol);
  }, [tickers]);

  const writeWatchlist = async (newTickers) => {
    if (!user?.uid) return;
    const ref = doc(db, 'watchlists', user.uid);
    await setDoc(ref, {
      userId:     user.uid,
      tickers:    newTickers,
      updated_at: serverTimestamp(),
    }, { merge: true });
  };

  const addTicker = useCallback(async (stock, scoreData) => {
    if (!user?.uid || !stock?.symbol) return;
    if (tickers.some((t) => t.ticker === stock.symbol)) return;
    const entry = {
      ticker:           stock.symbol,
      company_name:     stock.name || stock.symbol,
      added_at:         new Date().toISOString(),
      last_score:       scoreData?.score ?? null,
      last_band:        scoreData?.band  ?? null,
      initial_band:     scoreData?.band  ?? null,
      last_checked:     new Date().toISOString(),
      alert_on_change:  true,
    };
    const next = [...tickers, entry];
    setTickers(next);  // optimistic
    try { await writeWatchlist(next); }
    catch (err) { console.warn('[Watchlist] add failed:', err.message); }
  }, [user?.uid, tickers]);

  const removeTicker = useCallback(async (symbol) => {
    if (!user?.uid) return;
    const next = tickers.filter((t) => t.ticker !== symbol);
    setTickers(next);  // optimistic
    try { await writeWatchlist(next); }
    catch (err) { console.warn('[Watchlist] remove failed:', err.message); }
  }, [user?.uid, tickers]);

  const toggleTicker = useCallback(async (stock, scoreData) => {
    if (!stock?.symbol) return;
    if (tickers.some((t) => t.ticker === stock.symbol)) {
      return removeTicker(stock.symbol);
    }
    return addTicker(stock, scoreData);
  }, [tickers, addTicker, removeTicker]);

  // Mark all notifications as read (called when notification screen is opened)
  const markAllRead = useCallback(async () => {
    if (!user?.uid || notifications.length === 0) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, 'notifications', user.uid, 'items', n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.warn('[Watchlist] markAllRead failed:', err.message);
    }
  }, [user?.uid, notifications]);

  const value = useMemo(() => ({
    tickers, loading, isSaved,
    addTicker, removeTicker, toggleTicker,
    notifications, unreadCount, markAllRead,
  }), [tickers, loading, isSaved, addTicker, removeTicker, toggleTicker, notifications, unreadCount, markAllRead]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export const useWatchlist = () => {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
};
