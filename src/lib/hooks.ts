import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import cockpit from "cockpit";
import { getPasswordPolicy } from "./samba.ts";
import { generatePassword } from "./passwordUtils.ts";
import type { PasswordPolicy } from "./types.ts";

export function useCockpitLocation() {
  const [location, setLocation] = useState(cockpit.location);
  useEffect(() => {
    function sync() {
      setLocation(cockpit.location);
    }
    cockpit.addEventListener("locationchanged", sync);
    return () => cockpit.removeEventListener("locationchanged", sync);
  }, []);
  return location;
}

// ---------------------------------------------------------------------------
// useSingleLoad — single-phase load (all data arrives at once)
// ---------------------------------------------------------------------------
export function useSingleLoad<T>(
    load: () => Promise<T[]>,
): {
    items: T[];
    setItems: Dispatch<SetStateAction<T[]>>;
    loading: boolean;
    error: string | null;
    reload: () => void;
} {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const loadGenRef = useRef(0);

    const reload = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        setError(null);
        try {
            const result = await load();
            if (gen !== loadGenRef.current) return;
            setItems(result);
        } catch (err: unknown) {
            if (gen !== loadGenRef.current) return;
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, [load]);

    useEffect(() => {
        reload();
    }, [reload]);

    return { items, setItems, loading, error, reload };
}

// ---------------------------------------------------------------------------
// usePagination
// ---------------------------------------------------------------------------
export const PER_PAGE_OPTIONS = [10, 15, 20, 25, 30, 40, 50].map((v) => ({
  title: String(v),
  value: v,
}));

export function usePagination<T>(items: T[], defaultPerPage = 10) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const paginated = useMemo(
    () => items.slice((page - 1) * perPage, page * perPage),
    [items, page, perPage],
  );

  const onSetPage = useCallback((_evt: unknown, p: number) => setPage(p), []);
  const onPerPageSelect = useCallback((_evt: unknown, pp: number) => {
    setPerPage(pp);
    setPage(1);
  }, []);

  return { page, perPage, paginated, onSetPage, onPerPageSelect };
}

// ---------------------------------------------------------------------------
// usePasswordPolicy — loads domain password policy once at mount (cached)
// ---------------------------------------------------------------------------
export function usePasswordPolicy(): { policy: PasswordPolicy | null; policyError: string | null } {
    const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
    const [policyError, setPolicyError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getPasswordPolicy()
            .then(p => { if (!cancelled) setPolicy(p); })
            .catch((e: unknown) => { if (!cancelled) setPolicyError(e instanceof Error ? e.message : String(e)); });
        return () => { cancelled = true; };
    }, []);

    return { policy, policyError };
}

// ---------------------------------------------------------------------------
// usePasswordGenerator — generate + copy-to-clipboard + reveal lifecycle
// shared by AuthenticationSection and CreateUserModal
// ---------------------------------------------------------------------------
export type CopyState = "idle" | "copied" | "failed";

export function usePasswordGenerator(policy: PasswordPolicy | null): {
    generate: () => string | null;
    copyState: CopyState;
    revealCount: number;
} {
    const [copyState, setCopyState] = useState<CopyState>("idle");
    const [revealCount, setRevealCount] = useState(0);
    const resetTimerRef = useRef<number | undefined>(undefined);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            window.clearTimeout(resetTimerRef.current);
        };
    }, []);

    const generate = useCallback((): string | null => {
        if (!policy) return null;
        const pwd = generatePassword(policy);
        setRevealCount(c => c + 1);
        navigator.clipboard.writeText(pwd).then(() => {
            if (mountedRef.current) {
                setCopyState("copied");
                window.clearTimeout(resetTimerRef.current);
                resetTimerRef.current = window.setTimeout(() => {
                    if (mountedRef.current) setCopyState("idle");
                }, 3000);
            }
            // Auto-clear after 60 s for security — but only if the clipboard
            // still holds this password, so unrelated content is never wiped.
            // Intentionally not cancelled on unmount.
            window.setTimeout(() => {
                navigator.clipboard.readText()
                    .then(current => (current === pwd ? navigator.clipboard.writeText("") : undefined))
                    .catch(() => { /* read denied: do not blindly wipe */ });
            }, 60_000);
        }).catch(() => {
            if (mountedRef.current) setCopyState("failed");
        });
        return pwd;
    }, [policy]);

    return { generate, copyState, revealCount };
}
