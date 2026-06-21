"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

interface UseApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Minimal data hook for the prototype. Handles loading, error (with the real
 * FastAPI detail surfaced), and manual refetch. No global cache; each page
 * owns its own request lifecycle.
 *
 * Loading is DERIVED from whether the latest tick has settled, rather than
 * set synchronously in the effect body — satisfies react-hooks/set-state-in-effect.
 *
 * Pass refetchMs for live-feeling pages (Command Center, etc).
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  opts: { refetchMs?: number; enabled?: boolean } = {}
): UseApiState<T> {
  const { refetchMs, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const [settledTick, setSettledTick] = useState(-1);

  // Keep the latest fetcher without re-running the fetch effect every render.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const currentTick = tick;
    fetcherRef
      .current()
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
        setSettledTick(currentTick);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err : new ApiError(0, String(err), "unknown")
        );
        setSettledTick(currentTick);
      });
    return () => {
      cancelled = true;
    };
  }, [tick, enabled]);

  useEffect(() => {
    if (!refetchMs || !enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), refetchMs);
    return () => clearInterval(id);
  }, [refetchMs, enabled]);

  const loading = enabled ? settledTick !== tick : false;

  return { data, error, loading, refetch };
}
