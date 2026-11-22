import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createDefaultProfile, DEMO_SCENARIOS } from '../data/demoScenarios';
import { computeResults } from '../domain/results';
import { toISO } from '../domain/dateUtils';
import type { Profile } from '../domain/types';

function useDerived(profile: Profile, today: string) {
  return useMemo(() => computeResults(profile, today), [profile, today]);
}

export type Derived = ReturnType<typeof useDerived>;

interface Ctx {
  profile: Profile;
  today: string;
  derived: Derived;
  /** Profil domyślny — źródło wartości pokazywanych jako placeholder w pustych polach. */
  defaults: Profile;
  activeDemo: string | null;
  update: (fn: (p: Profile) => Profile) => void;
  loadDemo: (id: string) => void;
  reset: () => void;
}

const ProfileCtx = createContext<Ctx | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const today = useMemo(() => toISO(new Date()), []);
  const [profile, setProfile] = useState<Profile>(() => createDefaultProfile(today));
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const derived = useDerived(profile, today);
  const defaults = useMemo(() => createDefaultProfile(today), [today]);

  const update = useCallback((fn: (p: Profile) => Profile) => {
    setProfile((p) => fn(p));
    setActiveDemo(null);
  }, []);
  const loadDemo = useCallback((id: string) => {
    const s = DEMO_SCENARIOS.find((d) => d.id === id);
    if (!s) return;
    setProfile(s.build(today));
    setActiveDemo(id);
  }, [today]);
  const reset = useCallback(() => {
    setProfile(createDefaultProfile(today));
    setActiveDemo(null);
  }, [today]);

  const value = useMemo(() => ({ profile, today, derived, defaults, activeDemo, update, loadDemo, reset }), [profile, today, derived, defaults, activeDemo, update, loadDemo, reset]);
  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile(): Ctx {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error('useProfile musi być użyty wewnątrz ProfileProvider');
  return ctx;
}

/** Pomocnik do aktualizacji zagnieżdżonych sekcji profilu. */
export function useSection<K extends keyof Profile>(key: K) {
  const { profile, update } = useProfile();
  const set = useCallback(
    <F extends keyof Profile[K]>(field: F, value: Profile[K][F]) => update((p) => ({ ...p, [key]: { ...p[key], [field]: value } })),
    [key, update],
  );
  return [profile[key], set] as const;
}
