import { useCallback } from 'react';
import { clearProfileError, useProfileStore } from '@/stores/profiles';

export function useProfileOperationState() {
  const isLoading = useProfileStore((state) => state.isLoading);
  const error = useProfileStore((state) => state.error);

  const clearError = useCallback(() => {
    clearProfileError();
  }, []);

  const runProfileOperation = useCallback(async <T,>(
    operation: () => Promise<T>,
    onError?: () => void,
  ): Promise<T | null> => {
    clearProfileError();
    try {
      return await operation();
    } catch {
      onError?.();
      return null;
    }
  }, []);

  return {
    isLoading,
    error,
    clearError,
    runProfileOperation,
  };
}
