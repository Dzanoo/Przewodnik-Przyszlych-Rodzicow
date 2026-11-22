/**
 * REST API Przewodnika Przyszłych Rodziców.
 * Korzysta z tego samego silnika domenowego co frontend (src/domain), więc wyniki z API i z aplikacji są identyczne.
 * Ten plik zawiera tylko routing i walidację — bez zależności od serwera HTTP, żeby dało się go testować wprost.
 */
import { DEMO_SCENARIOS, createDefaultProfile } from '../src/data/demoScenarios';
import { DOCUMENTS, GENERAL_RULES, SCENARIOS, SOURCES } from '../src/data/requiredDocuments';
import { OFFICIAL_LINKS, SUPPORT_ORGANIZATIONS } from '../src/data/supportOrganizations';
import * as PARAMS from '../src/domain/constants2026';
import { isValidISO, toISO } from '../src/domain/dateUtils';
import { computeResults } from '../src/domain/results';
import type { Profile } from '../src/domain/types';

export const API_VERSION = '1.0.0';

export interface ApiResponse {
  status: number;
  body: unknown;
}

type Json = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Nakłada częściowy profil z żądania na profil domyślny: obiekty łączy rekurencyjnie, resztę podmienia, gdy typ się zgadza. */
export function mergeProfile<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return base;
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in base)) continue; // nieznane pola ignorujemy
    const current = (base as Json)[key];
    if (isPlainObject(current)) out[key] = mergeProfile(current, value);
    else if (Array.isArray(current) ? Array.isArray(value) : typeof value === typeof current) out[key] = value;
  }
  return out as T;
}

class BadRequest extends Error {}

function readInput(body: unknown): { profile: Profile; today: string } {
  if (body !== undefined && !isPlainObject(body)) throw new BadRequest('Treść żądania musi być obiektem JSON.');
  const input = (body ?? {}) as Json;
  const today = typeof input.today === 'string' && isValidISO(input.today) ? input.today : toISO(new Date());
  if (input.profile !== undefined && !isPlainObject(input.profile)) throw new BadRequest('Pole „profile” musi być obiektem.');
  const profile = mergeProfile(createDefaultProfile(today), input.profile);
  return { profile, today };
}

/** Parametry prawne i liczbowe (stawki, wymiary, limity) — podstawa przyszłego panelu administracyjnego. */
function parameters() {
  return Object.fromEntries(Object.entries(PARAMS).filter(([, v]) => typeof v !== 'function'));
}

type Handler = (body: unknown) => ApiResponse;

const ok = (body: unknown): ApiResponse => ({ status: 200, body });

const ROUTES: Record<string, Partial<Record<'GET' | 'POST', Handler>>> = {
  '/api/health': {
    GET: () => ok({ status: 'ok', version: API_VERSION, legalState: 'wrzesień 2026', time: new Date().toISOString() }),
  },
  '/api/parameters': { GET: () => ok(parameters()) },
  '/api/profiles/default': { GET: () => ok(createDefaultProfile(toISO(new Date()))) },
  '/api/profiles/demo': {
    GET: () => {
      const today = toISO(new Date());
      return ok(DEMO_SCENARIOS.map((s) => ({ id: s.id, title: s.title, short: s.short, profile: s.build(today) })));
    },
  },
  '/api/calculate': {
    POST: (body) => {
      const { profile, today } = readInput(body);
      return ok({ today, profile, results: computeResults(profile, today) });
    },
  },
  '/api/documents': {
    POST: (body) => {
      const { profile, today } = readInput(body);
      const r = computeResults(profile, today);
      return ok({ today, scenarios: r.scenarios, checklist: r.checklist, forms: r.forms });
    },
  },
  '/api/catalog/scenarios': { GET: () => ok({ sources: SOURCES, generalRules: GENERAL_RULES, scenarios: SCENARIOS }) },
  '/api/catalog/documents': { GET: () => ok(DOCUMENTS) },
  '/api/support': { GET: () => ok({ organizations: SUPPORT_ORGANIZATIONS, officialLinks: OFFICIAL_LINKS }) },
};

export const ENDPOINTS = Object.entries(ROUTES).flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m} ${path}`));

export function route(method: string, path: string, body?: unknown): ApiResponse {
  const handlers = ROUTES[path.replace(/\/+$/, '') || '/'];
  if (!handlers) return { status: 404, body: { error: 'Nie ma takiego zasobu.', endpoints: ENDPOINTS } };
  const handler = handlers[method as 'GET' | 'POST'];
  if (!handler) return { status: 405, body: { error: `Metoda ${method} nie jest obsługiwana dla ${path}.`, allowed: Object.keys(handlers) } };
  try {
    return handler(body);
  } catch (err) {
    if (err instanceof BadRequest) return { status: 400, body: { error: err.message } };
    return { status: 500, body: { error: 'Błąd serwera podczas obliczeń.' } };
  }
}
