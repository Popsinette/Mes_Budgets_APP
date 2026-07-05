import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { useInvalidation } from '@/src/store/invalidation';

/**
 * Exécute une requête et la relance automatiquement après chaque mutation
 * (via le compteur global d'invalidation) ou quand les dépendances changent.
 */
export function useLiveQuery<T>(
  query: (db: SQLiteDatabase) => Promise<T>,
  deps: readonly unknown[] = [],
): { data: T | undefined; loading: boolean; error: Error | null } {
  const db = useSQLiteContext();
  const version = useInvalidation((s) => s.version);
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    query(db)
      .then((result) => {
        if (!mounted) return;
        setData(result);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, ...deps]);

  return { data, loading, error };
}
