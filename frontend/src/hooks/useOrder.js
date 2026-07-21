import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

// Loads an order and polls while it is in a live (non-terminal) state.
const TERMINAL = new Set(['RELEASED', 'REVERSED', 'SPLIT']);

export function useOrder(ref, { poll = true, interval = 3500 } = {}) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const o = await api.getOrder(ref);
      setOrder(o);
      setError(null);
      return o;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [ref]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh();
    if (poll) {
      timer.current = setInterval(async () => {
        if (!active) return;
        const o = await refresh();
        if (o && TERMINAL.has(o.state) && timer.current) clearInterval(timer.current);
      }, interval);
    }
    return () => { active = false; if (timer.current) clearInterval(timer.current); };
  }, [ref, poll, interval, refresh]);

  return { order, error, loading, refresh, setOrder };
}
