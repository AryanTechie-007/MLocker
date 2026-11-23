"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ApiError, getErrorMessage } from "./api-client";

export interface UseApiOptions<T> {
  initialData?: T;
  onError?: (err: unknown) => void;
  onSuccess?: (data: T) => void;
  autoFetch?: boolean;
}

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | Error | null;
  errorMessage: string | null;
  refetch: () => Promise<T | null>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * MLocker Shared Data-Fetching Hook (U-2 Fix)
 *
 * Consolidates data-fetching patterns across Dashboard, Library, Collections, and Detail views.
 * Features:
 * - Automatic cancellation on unmount or re-fetch using AbortSignal
 * - Resilient error handling using getErrorMessage
 * - Typed state management (data, loading, error, errorMessage)
 * - Imperative `refetch()` for mutations and background refreshes
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList = [],
  options: UseApiOptions<T> = {}
): UseApiResult<T> {
  const { initialData = null, onError, onSuccess, autoFetch = true } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async (): Promise<T | null> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await fetcher(controller.signal);
      if (!controller.signal.aborted) {
        setData(result);
        setLoading(false);
        onSuccess?.(result);
        return result;
      }
      return null;
    } catch (err: unknown) {
      if (
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return null;
      }
      const wrappedError =
        err instanceof Error ? err : new Error(String(err));
      setError(wrappedError);
      setLoading(false);
      onError?.(err);
      return null;
    }
  }, [fetcher, onError, onSuccess]);

  useEffect(() => {
    if (!autoFetch) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let isMounted = true;

    fetcher(controller.signal)
      .then((result) => {
        if (isMounted && !controller.signal.aborted) {
          setData(result);
          setLoading(false);
          onSuccess?.(result);
        }
      })
      .catch((err: unknown) => {
        if (
          isMounted &&
          !controller.signal.aborted &&
          !(err instanceof DOMException && err.name === "AbortError")
        ) {
          const wrappedError =
            err instanceof Error ? err : new Error(String(err));
          setError(wrappedError);
          setLoading(false);
          onError?.(err);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const errorMessage = error ? getErrorMessage(error) : null;

  return {
    data,
    loading,
    error,
    errorMessage,
    refetch,
    setData,
  };
}
