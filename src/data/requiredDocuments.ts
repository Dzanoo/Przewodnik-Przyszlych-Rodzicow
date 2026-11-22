/**
 * Katalog dokumentów i scenariuszy wniosków.
 * Źródło prawdy: `wymagane_dokumenty.json` (Rozporządzenie MRPiPS z 11.03.2025, Dz.U. 2025 poz. 322;
 * Kodeks pracy art. 180–183; Poradnik ZUS 2026) — importowany bez przepisywania,
 * uzupełniony o formularze ZUS spoza rozporządzenia (e-ZLA, Z-3, Z-15A/B, Z-12, ZUA).
 */
import raw from './wymagane_dokumenty.json';

export interface DocumentDef {
  name: string;
  note?: string;
  legal?: string;
}

export interface ConditionalDocs {
  warunek: string;
  dokumenty: string[];
}

export interface RequirementScenario {
  id: string;
  nazwa: string;
  dotyczy: string;
  podstawa: string;
  termin_wniosku?: string;
  pola_wniosku: string[];
  dokumenty: string[];
  dokumenty_warunkowe?: ConditionalDocs[];
  dokumenty_jeden_z?: string[][];
  uwagi?: string;
  /** Pola opisowe dla scenariuszy szczególnych (np. martwe urodzenie). */
  wymiar?: string;
  wysokosc_zasilku?: string;
  reguly_kalkulatora?: string[];
  uwagi_interfejs?: string;
}

interface RawJson {
  meta: { opis: string; zrodla: string[]; zasady_ogolne: string[] };
  dokumenty: Record<string, { nazwa: string; uwagi?: string; podstawa?: string; warunek?: string }>;
  scenariusze: RequirementScenario[];
  poza_zakresem_zasilku: { id: string; nazwa: string; podstawa: string; uwagi: string }[];
}

const data = raw as RawJson;

/** Dokumenty spoza rozporządzenia, potrzebne w ścieżce zasiłkowej ZUS. */
const EXTRA: Record<string, DocumentDef> = {
  zus_z3: { name: 'Zaświadczenie płatnika składek — ZUS Z-3 (wystawia pracodawca)', note: 'Mały płatnik (≤ 20 ubezpieczonych) przekazuje je do ZUS wraz z dokumentami.' },
  zus_z3a: { name: 'Zaświadczenie płatnika składek — ZUS Z-3a (wystawia zleceniodawca)', note: 'Mały płatnik (≤ 20 ubezpieczonych) przekazuje je do ZUS wraz z Twoim wnioskiem.' },
  zus_zas53: { name: 'Wniosek o zasiłek chorobowy — ZUS ZAS-53', note: 'Przedsiębiorczyni składa go w ZUS; e-ZLA lekarz wysyła sam.' },
  zus_z15a: { name: 'Wniosek o zasiłek opiekuńczy z tytułu opieki nad dzieckiem — ZUS Z-15A', legal: 'art. 32 ustawy zasiłkowej' },
  zus_z15b: { name: 'Wniosek o zasiłek opiekuńczy z tytułu opieki nad chorym członkiem rodziny — ZUS Z-15B', legal: 'art. 32 ustawy zasiłkowej' },
  zus_z12: { name: 'Wniosek o zasiłek pogrzebowy — ZUS Z-12 (7 000 zł, w terminie 12 miesięcy od pochówku)' },
  zus_zua: { name: 'Zgłoszenie do ubezpieczeń — ZUS ZUA (ponowne objęcie dobrowolnym chorobowym po zasiłku macierzyńskim)', legal: 'art. 14 ust. 2 pkt 3 ustawy o sus' },
  e_zla: { name: 'Elektroniczne zwolnienie lekarskie e-ZLA (z kodem B w ciąży)', note: 'Lekarz przesyła je automatycznie do ZUS i płatnika.' },
};

export const DOCUMENTS: Record<string, DocumentDef> = {
  ...Object.fromEntries(
    Object.entries(data.dokumenty).map(([id, d]) => [id, { name: d.nazwa, note: d.uwagi, legal: d.podstawa }]),
  ),
  ...EXTRA,
};

export type DocumentId = string;

export const SCENARIOS: RequirementScenario[] = data.scenariusze;
export const SCENARIO_BY_ID: Record<string, RequirementScenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
export const GENERAL_RULES: string[] = data.meta.zasady_ogolne;
export const SOURCES: string[] = data.meta.zrodla;
/** Karta „poza zakresem” w Documents.tsx opisuje urlop wychowawczy; zasiłek pogrzebowy trafia do checklisty jako ZUS Z-12. */
export const OUT_OF_SCOPE = data.poza_zakresem_zasilku.filter((o) => o.id === 'urlop_wychowawczy');

export function docName(id: string): string {
  return DOCUMENTS[id]?.name ?? id;
}
