/**
 * Klient REST API. Aplikacja liczy wszystko w przeglądarce tym samym silnikiem (działa też bez serwera),
 * a API udostępnia te same wyliczenia innym systemom (np. PUE/eZUS, aplikacji mobilnej).
 * W trybie deweloperskim Vite przekierowuje /api na serwer (vite.config.ts).
 */
import type { Profile } from '../domain/types';

const BASE = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';

export interface ApiHealth {
  status: string;
  version: string;
  legalState: string;
}

export async function fetchHealth(signal?: AbortSignal): Promise<ApiHealth | null> {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as ApiHealth;
    return data.status === 'ok' ? data : null;
  } catch {
    return null;
  }
}

export async function calculateOnServer(profile: Profile, today: string) {
  const res = await fetch(`${BASE}/api/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, today }),
  });
  if (!res.ok) throw new Error(`API: ${res.status}`);
  return res.json();
}
