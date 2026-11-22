/**
 * Stałe parametry prawne i wskaźniki — stan prawny: wrzesień 2026 r.
 *
 * Źródła:
 *  - Rozporządzenie RM w sprawie minimalnego wynagrodzenia za pracę w 2026 r.
 *  - Ustawa z 25.06.1999 o świadczeniach pieniężnych z ubezpieczenia społecznego w razie choroby
 *    i macierzyństwa (dalej: ustawa zasiłkowa), art. 3, 2a, 8, 11, 30a, 31, 32–35, 36–52.
 *  - Ustawa o systemie ubezpieczeń społecznych (stopy składek, podstawy dla JDG).
 *  - Kodeks pracy (Dz.U. 2026 poz. 1245), art. 180–183.
 *  - Poradnik ZUS dla rodziców 2026.
 */

/** Minimalne wynagrodzenie za pracę w 2026 r. (brutto, pełny etat). */
export const MIN_WAGE_2026 = 4806.0;

/** Prognozowane przeciętne wynagrodzenie miesięczne na 2026 r. (250% = 23 550 zł). */
export const FORECAST_AVG_WAGE_2026 = 9420.0;

/** Część składek społecznych finansowana przez ubezpieczonego: 9,76% + 1,5% + 2,45% = 13,71%. */
export const EMPLOYEE_SOCIAL_SHARE = 0.1371;

/** Minimalna podstawa wymiaru zasiłku dla pełnego etatu (art. 45 ustawy zasiłkowej): 4 806 × (1 − 0,1371). */
export const MIN_BENEFIT_BASE_FULL_TIME = round2(MIN_WAGE_2026 * (1 - EMPLOYEE_SOCIAL_SHARE)); // 4 147,10

/** Maks. miesięczna podstawa dobrowolnej składki chorobowej (250% prognozowanego przeciętnego). */
export const MAX_VOLUNTARY_SICKNESS_BASE = 23550.0;

/** Maks. podstawa zasiłku przy dobrowolnym ubezpieczeniu chorobowym (po odliczeniu 13,71%). */
export const MAX_VOLUNTARY_BENEFIT_BASE = round2(MAX_VOLUNTARY_SICKNESS_BASE * (1 - EMPLOYEE_SOCIAL_SHARE)); // 20 321,30

/** Stopy składek (art. 22 ustawy o sus; art. 79 ustawy o świadczeniach opieki zdrowotnej). */
export const CONTRIBUTION_RATES = {
  pension: 0.1952, // emerytalna 9,76% + 9,76%
  pensionEmployee: 0.0976,
  disability: 0.08, // rentowa
  disabilityEmployee: 0.015,
  disabilityEmployer: 0.065,
  sickness: 0.0245, // chorobowa — finansuje ubezpieczony
  health: 0.09,
} as const;

/** Najniższe podstawy wymiaru składek dla JDG w 2026 r. */
export const JDG_BASES_2026 = {
  /** Duży ZUS: 60% prognozowanego przeciętnego wynagrodzenia. */
  standardMin: round2(FORECAST_AVG_WAGE_2026 * 0.6), // 5 652,00
  /** Preferencyjny ZUS (24 mies.) i dolna granica małego ZUS+: 30% minimalnego wynagrodzenia. */
  preferentialMin: round2(MIN_WAGE_2026 * 0.3), // 1 441,80
  /** Mały ZUS+: limit przychodu w poprzednim roku. */
  malyZusPlusRevenueLimit: 120000,
  malyZusPlusMaxMonths: 36,
  malyZusPlusWindowMonths: 60,
  malyZusPlusMinDaysPrevYear: 60,
  preferentialMonths: 24,
  ulgaNaStartMonths: 6,
} as const;

/** Próg wielkości płatnika zasiłków (art. 61 ustawy zasiłkowej) — stan na 30 listopada roku poprzedniego. */
export const PAYER_THRESHOLD = 20; // > 20 (≥ 21) → płatnik składek; ≤ 20 → ZUS

/** Art. 2a ustawy zasiłkowej — dopuszczalne zadłużenie składkowe: 1% minimalnego wynagrodzenia. */
export const DEBT_TOLERANCE = round2(MIN_WAGE_2026 * 0.01); // 48,06 zł
export const DEBT_LIMITATION_MONTHS = 6;

/** Zasiłek pogrzebowy (także przy martwym urodzeniu). */
export const FUNERAL_GRANT = 7000.0;
export const FUNERAL_GRANT_DEADLINE_MONTHS = 12;

/** Świadczenie rodzicielskie — kwota, do której podwyższa się zasiłek macierzyński (art. 31 ust. 3a). */
export const PARENTAL_BENEFIT_AMOUNT = 1000.0;

/** Okresy wyczekiwania (art. 4 ustawy zasiłkowej). */
export const WAITING_PERIOD_DAYS = { mandatory: 30, voluntary: 90 } as const;

/** Okres zasiłkowy (art. 8 ustawy zasiłkowej). */
export const SICKNESS_PERIOD_DAYS = { standard: 182, pregnancy: 270 } as const;
/** Art. 18 ust. 2 ustawy zasiłkowej — świadczenie rehabilitacyjne najdłużej 12 miesięcy. */
export const REHAB_MAX_MONTHS = 12;
export const SICKNESS_GAP_RESET_DAYS = 60; // przerwa > 60 dni → nowy okres zasiłkowy

/** Art. 92 KP — wynagrodzenie chorobowe finansowane przez pracodawcę. */
export const EMPLOYER_SICK_PAY_DAYS = { under50: 33, over50: 14 } as const;

/** Urlop macierzyński (art. 180 § 1 KP) — liczba dzieci → tygodnie. */
export const MATERNITY_WEEKS: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 20, 2: 31, 3: 33, 4: 35, 5: 37 };
export const MATERNITY_PRENATAL_MAX_WEEKS = 6;
export const MATERNITY_RESERVED_WEEKS = 14;
export const MATERNITY_RESERVED_WEEKS_SPECIAL = 8;
/** Art. 183 § 3 KP — urlop na warunkach urlopu macierzyńskiego nie krótszy niż 9 tygodni. */
export const ADOPTION_MATERNITY_MIN_WEEKS = 9;

/** Urlop rodzicielski (art. 182¹a KP). */
export const PARENTAL_WEEKS = {
  single: 41,
  multiple: 43,
  zaZyciemSingle: 65,
  zaZyciemMultiple: 67,
  /** art. 183 § 4² — przyjęcie dziecka (rodzina zastępcza / przysposobienie) w wieku 7–14 lat. */
  adoptionOlder: 38,
  adoptionOlderZaZyciem: 62,
  nonTransferable: 9,
  maxParts: 5,
} as const;

/** Art. 182¹f KP — górne granice wydłużenia przy łączeniu z pracą. */
export const PARENTAL_PART_TIME_CAPS = {
  single: 82,
  multiple: 86,
  zaZyciemSingle: 130,
  zaZyciemMultiple: 134,
  maxWorkFraction: 0.5,
} as const;

/** Urlop ojcowski (art. 182³ KP). */
export const PATERNITY = { weeks: 2, maxParts: 2, childAgeMonths: 12, adoptionMaxAgeYears: 14, noticeDays: 7 } as const;

/** Uzupełniający urlop macierzyński (art. 180² KP). */
export const SUPPLEMENTARY = {
  extremePretermWeekLimit: 28,
  lowBirthWeightGrams: 1000,
  termWeek: 37,
  maxWeeksExtreme: 15,
  maxWeeksOther: 8,
  termHospitalFromDay: 5,
  termHospitalFirstDayMax: 28,
  termHospitalMinConsecutiveDays: 2,
  noticeDaysBeforeMaternityEnd: 21,
} as const;

/** Stawki procentowe zasiłków (art. 11, 31, 33 ustawy zasiłkowej). */
export const RATES = {
  full: 1.0,
  averaged: 0.815,
  parental: 0.7,
  sicknessStandard: 0.8,
  hospital: 0.7,
  care: 0.8,
  sicknessPregnancy: 1.0,
  /** Art. 19 ust. 1 ustawy zasiłkowej — świadczenie rehabilitacyjne. */
  rehabFirst3Months: 0.9,
  rehabLater: 0.75,
  rehabPregnancy: 1.0,
  /** Art. 30 ust. 3 — zasiłek w wysokości zasiłku macierzyńskiego (do dnia porodu). */
  bridgingMaternity: 1.0,
} as const;

/** Termin na wniosek o wariant uśredniony (art. 31 ust. 3 ustawy zasiłkowej). */
export const AVERAGED_VARIANT_DEADLINE_DAYS = 21;
export const PARENTAL_NOTICE_DAYS = 21;

/**
 * Świadczenie rodzicielskie dla osób bez prawa do zasiłku macierzyńskiego (art. 17c ustawy o świadczeniach rodzinnych):
 * 1 000 zł miesięcznie przez 52 tygodnie (1 dziecko), 65/67/69/71 tygodni przy 2/3/4/5+ dzieciach. Zwolnione z PIT.
 */
export const PARENTAL_BENEFIT_WEEKS: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 52, 2: 65, 3: 67, 4: 69, 5: 71 };

/** Zasiłek opiekuńczy — limity roczne (art. 32–33 ustawy zasiłkowej). */
export const CARE_LIMITS = {
  childUnder14OrHealthyUnder8: 60,
  disabledChild14to18: 30,
  otherFamilyOrChildOver14: 14,
  familyTotalCap: 60,
  healthyChildMaxAge: 8,
  sickChildMaxAge: 14,
  disabledChildMaxAge: 18,
  facilityClosureNoticeDays: 7,
} as const;

/** Art. 67 ustawy zasiłkowej — świadczenie nienależne/niewypłacone: przedawnienie roszczeń o wypłatę. */
export const CLAIM_LIMITATION_MONTHS = 6;

/** Zaliczka na PIT od zasiłków (skala 12%) i miesięczna kwota zmniejszająca podatek (PIT-2). */
export const PIT_RATE = 0.12;
export const PIT_MONTHLY_REDUCTION = 300;

/** Zaokrąglenie do grosza (metoda „połówkowa” stosowana przez ZUS). */
export function round2(value: number): number {
  // Korekta błędu reprezentacji binarnej (np. 23 550 × 0,8629 = 20 321,295 → 20 321,30).
  return Math.round(Number((value * 100).toFixed(6))) / 100;
}

/** Opisy podstaw prawnych używane w dymkach „Podstawa prawna”. */
export const LEGAL = {
  art177: 'art. 177 KP — szczególna ochrona trwałości stosunku pracy pracownicy w ciąży',
  art180: 'art. 180 KP — urlop macierzyński',
  art1801: 'art. 180¹ KP — urodzenie martwe lub zgon dziecka',
  art1802: 'art. 180² KP — uzupełniający urlop macierzyński',
  art1821a: 'art. 182¹a KP — urlop rodzicielski',
  art1821f: 'art. 182¹f KP — wydłużenie urlopu rodzicielskiego przy łączeniu z pracą',
  art1823: 'art. 182³ KP — urlop ojcowski',
  art183: 'art. 183 KP — urlop na warunkach urlopu macierzyńskiego',
  art185: 'art. 185 § 2 KP — zwolnienie na badania w ciąży',
  art92: 'art. 92 KP — wynagrodzenie chorobowe',
  uz2a: 'art. 2a ustawy zasiłkowej — zadłużenie z tytułu składek',
  uz4: 'art. 4 ustawy zasiłkowej — okres wyczekiwania',
  uz8: 'art. 8 ustawy zasiłkowej — okres zasiłkowy',
  uz11: 'art. 11 ustawy zasiłkowej — wysokość zasiłku chorobowego',
  uz18: 'art. 18–19 ustawy zasiłkowej — świadczenie rehabilitacyjne',
  uz30: 'art. 30 ustawy zasiłkowej — zasiłek po ustaniu ubezpieczenia w czasie ciąży',
  uz31: 'art. 31 ustawy zasiłkowej — wysokość zasiłku macierzyńskiego',
  uz31_3a: 'art. 31 ust. 3a ustawy zasiłkowej — podwyższenie do kwoty świadczenia rodzicielskiego',
  uz31_4: 'art. 31 ust. 4 ustawy zasiłkowej — wyrównanie do 100%',
  uz32: 'art. 32–35 ustawy zasiłkowej — zasiłek opiekuńczy',
  uz36: 'art. 36 ustawy zasiłkowej — podstawa wymiaru (pracownicy)',
  uz38: 'art. 38 ustawy zasiłkowej — niepełne miesiące',
  uz42: 'art. 42 ustawy zasiłkowej — składniki kwartalne i roczne',
  uz43: 'art. 43 ustawy zasiłkowej — brak ustalania nowej podstawy',
  uz45: 'art. 45 ustawy zasiłkowej — minimalna podstawa wymiaru',
  uz48: 'art. 48–52 ustawy zasiłkowej — podstawa wymiaru (niepracownicy)',
  uz48a: 'art. 48a ust. 1 ustawy zasiłkowej — podstawa przy ubezpieczeniu < 12 mies.',
  uz61: 'art. 61 ustawy zasiłkowej — kto wypłaca zasiłki',
  rozp2026: 'Rozporządzenie MRPiPS z 27.09.2026 (Dz.U. 2026 poz. 1316)',
  rozp2025: 'Rozporządzenie MRPiPS z 11.03.2025 (Dz.U. 2025 poz. 322)',
} as const;
