import { useState, useCallback, useRef, useEffect, type Dispatch, type SetStateAction } from "react";
import cockpit from "cockpit";

export function useCockpitLocation() {
    const [location, setLocation] = useState(cockpit.location);
    useEffect(() => {
        function sync() { setLocation(cockpit.location); }
        cockpit.addEventListener("locationchanged", sync);
        return () => cockpit.removeEventListener("locationchanged", sync);
    }, []);
    return location;
}

export function useTwoPhaseLoad<
    K extends string,
    L extends Record<K, string> & { detailsLoaded: false },
    F extends Record<K, string> & { detailsLoaded: true },
>(
    keyField: K,
    listLight: () => Promise<L[]>,
    getDetails: (key: string) => Promise<F>,
): {
    items: (L | F)[];
    setItems: Dispatch<SetStateAction<(L | F)[]>>;
    loading: boolean;
    detailsLoading: boolean;
    error: string | null;
    reload: () => void;
} {
    const [items, setItems] = useState<(L | F)[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadGenRef = useRef(0);

    const reload = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        setDetailsLoading(false);
        setError(null);
        try {
            const lightItems = await listLight();
            if (gen !== loadGenRef.current) return;
            setItems(lightItems);
            setLoading(false);

            setDetailsLoading(true);
            await Promise.all(lightItems.map(async (row) => {
                try {
                    const full = await getDetails(row[keyField]);
                    if (gen !== loadGenRef.current) return;
                    setItems(prev => prev.map(i => i[keyField] === row[keyField] ? full : i));
                } catch {
                    // keep light row on error
                }
            }));
        } catch (err: unknown) {
            if (gen !== loadGenRef.current) return;
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
        } finally {
            if (gen === loadGenRef.current) setDetailsLoading(false);
        }
    }, [keyField, listLight, getDetails]);

    useEffect(() => { reload(); }, [reload]);

    return { items, setItems, loading, detailsLoading, error, reload };
}
