"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { Workspace } from "@/lib/types";
import { supabase, api, command, configured } from "@/lib/supabase";
export type ScoreDraft = {
  score: string;
  comment: string;
  reason: string;
  version: number;
};
type Context = {
  user: User | null;
  ready: boolean;
  work: Workspace | null;
  loading: boolean;
  notice: string;
  scoreDrafts: Record<string, ScoreDraft>;
  setScoreDrafts: Dispatch<SetStateAction<Record<string, ScoreDraft>>>;
  clearScoreDrafts: () => void;
  setNotice: (s: string) => void;
  refresh: () => Promise<void>;
  mutate: (
    a: string,
    p: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
};
const C = createContext<Context>(null!);
export function Provider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(!configured),
    [work, setWork] = useState<Workspace | null>(null),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState("");
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>(
    {},
  );
  const draftsRef = useRef(scoreDrafts);
  draftsRef.current = scoreDrafts;
  const clearScoreDrafts = () => {
    draftsRef.current = {};
    setScoreDrafts({});
  };
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (Object.keys(draftsRef.current).length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const initialGeneration = generation.current;
    supabase.auth.getSession().then(({ data, error }) => {
      if (generation.current !== initialGeneration) return;
      if (error) setNotice(error.message);
      identity.current = data.session?.user.id ?? null;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_, session) => {
      if (identity.current !== (session?.user.id ?? null)) clearScoreDrafts();
      generation.current++;
      identity.current = session?.user.id ?? null;
      setUser(session?.user ?? null);
      setWork(null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const refresh = useCallback(async () => {
    if (!user) {
      setWork(null);
      return;
    }
    setLoading(true);
    const expectedGeneration = generation.current;
    try {
      const result = await api<Workspace>("workspace");
      // Never display an in-flight response from a previous signed-in account.
      if (
        generation.current === expectedGeneration &&
        identity.current === user.id
      )
        setWork(result);
    } finally {
      setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    refresh().catch((e) => setNotice(e.message));
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        refresh().catch(() =>
          setNotice("同步失敗，保留目前畫面。請按重新同步。"),
        );
    }, 20000);
    return () => clearInterval(timer);
  }, [refresh]);
  const mutate = async (a: string, p: Record<string, unknown>) => {
    setLoading(true);
    try {
      const r = await command(a, p);
      try {
        await refresh();
        setNotice("已儲存至雲端");
      } catch {
        setNotice("已寫入雲端，但畫面同步失敗。請按重新同步；不要重複送出。");
      }
      return r;
    } catch (e) {
      setNotice((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  };
  return (
    <C.Provider
      value={{
        user,
        ready,
        work,
        loading,
        notice,
        setNotice,
        refresh,
        mutate,
        scoreDrafts,
        setScoreDrafts,
        clearScoreDrafts,
      }}
    >
      {children}
    </C.Provider>
  );
}
export const useApp = () => useContext(C);
