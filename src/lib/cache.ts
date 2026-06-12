interface CacheEntry {
    value: string;
    ts: number;
}

export interface Cache {
    get(key: string, ttlMs: number): string | null;
    set(key: string, value: string): void;
    invalidate(predicate: (key: string) => boolean): void;
    clear(): void;
}

export function createCache(): Cache {
    const store = new Map<string, CacheEntry>();

    return {
        get(key, ttlMs) {
            const entry = store.get(key);
            if (!entry) return null;
            if (Date.now() - entry.ts > ttlMs) {
                store.delete(key);
                return null;
            }
            return entry.value;
        },
        set(key, value) {
            store.set(key, { value, ts: Date.now() });
        },
        invalidate(predicate) {
            for (const key of store.keys()) {
                if (predicate(key)) store.delete(key);
            }
        },
        clear() {
            store.clear();
        },
    };
}
