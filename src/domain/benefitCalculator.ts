/**
 * Silnik obliczeń podstawy wymiaru i wysokości świadczeń (ustawa zasiłkowa, stan na 2026 r.).
 * Wszystkie kwoty w złotych, zaokrąglane do grosza dopiero w punktach, w których robi to ZUS.
 */
import {
  CARE_LIMITS,
  EMPLOYEE_SOCIAL_SHARE,
  EMPLOYER_SICK_PAY_DAYS,
  JDG_BASES_2026,
  LEGAL,
  MAX_VOLUNTARY_BENEFIT_BASE,
  MIN_BENEFIT_BASE_FULL_TIME,
  MIN_WAGE_2026,
  PARENTAL_BENEFIT_AMOUNT,
  PARENTAL_BENEFIT_WEEKS,
  PIT_MONTHLY_REDUCTION,
  PIT_RATE,
  RATES,
  REHAB_MAX_MONTHS,
  SICKNESS_PERIOD_DAYS,
  round2,
} from './constants2026';
import { addDays, addMonths, diffDays, isValidISO, parseISO, shiftMonth, toISO } from './dateUtils';
import { anchorBirthDate, buildTimeline, parentalDimension, partTimeExtension } from './eligibilityEngine';
import type { BaseBreakdown, Eligibility, LeaveBlock, PaymentVariant, Profile, SalaryMonth } from './types';

const NET = 1 - EMPLOYEE_SOCIAL_SHARE;
const zl = (v: number) => `${round2(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

/* ------------------------------------------------------------------ */
/* Podstawa wymiaru — pracownicy (art. 36–47)                          */
/* ------------------------------------------------------------------ */

export interface MonthEvaluation {
  month: string;
  included: boolean;
  reason: string;
  /** Kwota przyjęta do podstawy (brutto, przed odliczeniem 13,71%). */
  counted: number;
}

/** Art. 38 — ocena pojedynczego miesiąca. */
export function evaluateMonth(m: SalaryMonth): MonthEvaluation {
  if (m.requiredDays <= 0) return { month: m.month, included: false, reason: 'brak obowiązującego czasu pracy', counted: 0 };
  if (m.workedDays * 2 < m.requiredDays) {
    return { month: m.month, included: false, reason: `przepracowano ${m.workedDays}/${m.requiredDays} dni (< połowy) — miesiąc wyłączony (art. 38 ust. 1)`, counted: 0 };
  }
  if (m.workedDays < m.requiredDays) {
    const fixed = m.fixedContract; // składniki stałe uzupełnia się do pełnej kwoty z umowy
    const variable = m.workedDays > 0 ? (m.variablePaid / m.workedDays) * m.requiredDays : 0;
    return {
      month: m.month,
      included: true,
      reason: `≥ połowy czasu pracy — uzupełniono: stałe do ${zl(fixed)}, zmienne (${zl(m.variablePaid)} / ${m.workedDays} × ${m.requiredDays}) = ${zl(variable)} (art. 38 ust. 2)`,
      counted: fixed + variable,
    };
  }
  return { month: m.month, included: true, reason: 'pełny miesiąc', counted: m.fixedPaid + m.variablePaid };
}

export function employeeBase(p: Profile): BaseBreakdown & { months: MonthEvaluation[] } {
  const months = p.salary.months.slice(-12).map(evaluateMonth);
  const included = months.filter((m) => m.included);
  const steps: string[] = [];
  let monthly: number;
  let method: string;

  if (included.length === 0) {
    // art. 37 ust. 2 — wynagrodzenie, które pracownik osiągnąłby za pełny miesiąc.
    const last = p.salary.months[p.salary.months.length - 1];
    const contract = last ? last.fixedContract + (last.workedDays > 0 ? (last.variablePaid / last.workedDays) * last.requiredDays : 0) : 0;
    monthly = contract * NET;
    method = 'Brak pełnego miesiąca do uwzględnienia — wynagrodzenie za pełny miesiąc wg umowy (art. 37 ust. 2).';
    steps.push(`Wynagrodzenie z umowy (uzupełnione): ${zl(contract)} × (1 − 13,71%) = ${zl(monthly)}`);
  } else {
    const sum = included.reduce((s, m) => s + m.counted, 0);
    const avg = sum / included.length;
    monthly = avg * NET;
    method = included.length >= 12 ? 'Przeciętne wynagrodzenie z 12 pełnych miesięcy kalendarzowych (art. 36 ust. 1).' : `Przeciętne wynagrodzenie z ${included.length} pełnych miesięcy ubezpieczenia (art. 36 ust. 2).`;
    steps.push(`Suma wynagrodzeń z ${included.length} mies.: ${zl(sum)} → średnio ${zl(avg)}`);
    steps.push(`Po odliczeniu 13,71% składek: ${zl(avg)} × 0,8629 = ${zl(monthly)}`);
  }

  const quarterly = p.salary.quarterlyBonuses.reduce((s, v) => s + v, 0);
  if (quarterly > 0) {
    const add = (quarterly / 12) * NET;
    monthly += add;
    steps.push(`Premie kwartalne (art. 42): ${zl(quarterly)} / 12 × 0,8629 = +${zl(add)}`);
  }
  if (p.salary.annualBonus > 0) {
    const add = (p.salary.annualBonus / 12) * NET;
    monthly += add;
    steps.push(`Składniki roczne (art. 42): ${zl(p.salary.annualBonus)} / 12 × 0,8629 = +${zl(add)}`);
  }

  let raisedToMinimum = false;
  const minBase = round2(MIN_BENEFIT_BASE_FULL_TIME * Math.min(1, Math.max(0, p.employment.fullTimeFraction || 1)));
  if (monthly < minBase) {
    steps.push(`Podstawa niższa niż minimalna (${zl(minBase)} dla ${p.employment.fullTimeFraction} etatu) — podwyższono (art. 45).`);
    monthly = minBase;
    raisedToMinimum = true;
  }
  if (p.salary.continuousWithPregnancySickLeave) {
    steps.push('Brak przerwy ≥ pełnego miesiąca między zasiłkami — podstawa nie jest ustalana na nowo (art. 43).');
  }

  return {
    base: round2(monthly),
    method,
    legal: `${LEGAL.uz36}; ${LEGAL.uz38}; ${LEGAL.uz42}; ${LEGAL.uz45}`,
    steps,
    includedMonths: included.length,
    excludedMonths: months.filter((m) => !m.included).map((m) => `${m.month}: ${m.reason}`),
    cappedAtMax: false,
    raisedToMinimum,
    months,
  };
}

/* ------------------------------------------------------------------ */
/* Podstawa wymiaru — niepracownicy (art. 48–52, 48a)                  */
/* ------------------------------------------------------------------ */

export function jdgMinimumBase(p: Profile): number {
  switch (p.employment.jdgVariant) {
    case 'PREFERENCYJNY':
    case 'MALY_ZUS_PLUS':
      return JDG_BASES_2026.preferentialMin;
    case 'DUZY_ZUS':
      return JDG_BASES_2026.standardMin;
    default:
      return 0;
  }
}

export function nonEmployeeBase(p: Profile): BaseBreakdown {
  const declared = p.salary.declaredBases.slice(-12);
  const mins = p.salary.minimumBases.slice(-12);
  const n = declared.length;
  const steps: string[] = [];
  let base: number;
  let method: string;
  let legal: string = LEGAL.uz48;

  // Kwoty zadeklarowane powyżej 250% przeciętnego nie wchodzą do podstawy.
  const cappedDeclared = declared.map((d) => Math.min(d, MAX_VOLUNTARY_BENEFIT_BASE / NET));

  if (n === 0) {
    const min = p.employment.title === 'JDG' ? jdgMinimumBase(p) : mins[mins.length - 1] ?? 0;
    base = min * NET;
    method = 'Ubezpieczenie krótsze niż pełny miesiąc — najniższa podstawa wymiaru składek po odliczeniu 13,71% (art. 48a).';
    legal = LEGAL.uz48a;
    steps.push(`${zl(min)} × 0,8629 = ${zl(base)}`);
  } else if (n >= 12) {
    const avg = cappedDeclared.reduce((s, v) => s + v, 0) / n;
    base = avg * NET;
    method = 'Przeciętny miesięczny przychód (podstawa składki chorobowej) z 12 miesięcy (art. 48 ust. 1).';
    steps.push(`Średnia z 12 mies.: ${zl(avg)} × 0,8629 = ${zl(base)}`);
  } else {
    const minAligned = cappedDeclared.map((_, i) => mins[i] ?? jdgMinimumBase(p));
    const anyAbove = cappedDeclared.some((d, i) => d > minAligned[i] + 0.004);
    if (anyAbove) {
      // art. 48a ust. 1: P_min + (P_nadwyżka / 12 × n)
      const pMin = (minAligned.reduce((s, v) => s + v, 0) / n) * NET;
      const pExcess = (cappedDeclared.reduce((s, d, i) => s + Math.max(0, d - minAligned[i]), 0) / n) * NET;
      base = pMin + (pExcess / 12) * n;
      method = `Ubezpieczenie ${n} pełnych mies. (< 12) z kwotą zadeklarowaną ponad najniższą podstawę — algorytm art. 48a ust. 1.`;
      legal = LEGAL.uz48a;
      steps.push(`P̄min = średnia najniższa podstawa × 0,8629 = ${zl(pMin)}`);
      steps.push(`P̄nadwyżka = średnia nadwyżka ponad minimum × 0,8629 = ${zl(pExcess)}`);
      steps.push(`Podstawa = ${zl(pMin)} + (${zl(pExcess)} / 12 × ${n}) = ${zl(base)}`);
      steps.push(`Dla porównania: zwykła średnia dałaby ${zl((cappedDeclared.reduce((s, v) => s + v, 0) / n) * NET)}.`);
    } else {
      const avg = cappedDeclared.reduce((s, v) => s + v, 0) / n;
      base = avg * NET;
      method = `Przeciętny przychód z ${n} pełnych miesięcy ubezpieczenia (art. 48 ust. 2).`;
      steps.push(`Średnia: ${zl(avg)} × 0,8629 = ${zl(base)}`);
    }
  }

  let cappedAtMax = false;
  if (base > MAX_VOLUNTARY_BENEFIT_BASE) {
    base = MAX_VOLUNTARY_BENEFIT_BASE;
    cappedAtMax = true;
    steps.push(`Ograniczenie do maksimum ${zl(MAX_VOLUNTARY_BENEFIT_BASE)} (250% prognozowanego przeciętnego po odliczeniu 13,71%).`);
  }
  return { base: round2(base), method, legal, steps, includedMonths: n, excludedMonths: [], cappedAtMax, raisedToMinimum: false };
}

export function benefitBase(p: Profile, e: Eligibility): BaseBreakdown {
  if (!e.sicknessInsured) {
    return { base: 0, method: 'Brak ubezpieczenia chorobowego — brak podstawy wymiaru.', legal: LEGAL.uz36, steps: [], includedMonths: 0, excludedMonths: [], cappedAtMax: false, raisedToMinimum: false };
  }
  return e.isEmployee ? employeeBase(p) : nonEmployeeBase(p);
}

/* ------------------------------------------------------------------ */
/* Kwoty za okres                                                       */
/* ------------------------------------------------------------------ */

/** Stawka dzienna = podstawa × % / 30 (zaokrąglona do grosza). */
export function dailyRate(base: number, rate: number): number {
  return round2((base * rate) / 30);
}

/**
 * Kwota za okres [start, end]: za pełny miesiąc kalendarzowy — 30 stawek dziennych (= podstawa × %),
 * za niepełny — stawka dzienna × liczba dni.
 */
export function periodAmount(base: number, rate: number, start: string, end: string): number {
  if (end < start || base <= 0) return 0;
  const daily = dailyRate(base, rate);
  let total = 0;
  let cursor = start;
  while (cursor <= end) {
    const d = parseISO(cursor);
    const monthStart = toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    const monthEnd = toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    const segEnd = end < monthEnd ? end : monthEnd;
    const days = diffDays(cursor, segEnd) + 1;
    total += cursor === monthStart && segEnd === monthEnd ? daily * 30 : daily * days;
    cursor = addDays(segEnd, 1);
  }
  return round2(total);
}

/** Orientacyjna zaliczka na PIT od zasiłku (12%, opcjonalnie z kwotą zmniejszającą z PIT-2). */
export function pitAdvance(grossMonthly: number, usePit2: boolean): number {
  return Math.max(0, Math.round(grossMonthly * PIT_RATE - (usePit2 ? PIT_MONTHLY_REDUCTION : 0)));
}

export function netMonthly(grossMonthly: number, usePit2: boolean): number {
  return round2(grossMonthly - pitAdvance(grossMonthly, usePit2));
}

export interface MonthlyBenefit {
  rate: number;
  gross: number;
  net: number;
  toppedUp: boolean;
  netAfterTopUp: number;
}

/** Miesięczny zasiłek macierzyński z ewentualnym podwyższeniem do kwoty świadczenia rodzicielskiego (art. 31 ust. 3a). */
export function monthlyMaternity(base: number, rate: number, usePit2: boolean): MonthlyBenefit {
  const gross = round2(base * rate);
  const net = netMonthly(gross, usePit2);
  const toppedUp = base > 0 && net < PARENTAL_BENEFIT_AMOUNT;
  return { rate, gross, net, toppedUp, netAfterTopUp: toppedUp ? PARENTAL_BENEFIT_AMOUNT : net };
}

/* ------------------------------------------------------------------ */
/* Zasiłek chorobowy w ciąży                                            */
/* ------------------------------------------------------------------ */

export interface PregnancySickness {
  rate: number;
  periodLimit: number;
  requestedDays: number;
  employerDays: number;
  zusDays: number;
  overLimitDays: number;
  employerAmount: number;
  zusAmount: number;
  dailyRate: number;
  netEstimate: number;
  notes: string[];
  /** Świadczenie rehabilitacyjne po wyczerpaniu okresu zasiłkowego (art. 18–19 ustawy zasiłkowej). */
  rehab: RehabEstimate | null;
}

export interface RehabEstimate {
  /** Dni niezdolności ponad okres zasiłkowy, za które można wnioskować o świadczenie (maks. 12 miesięcy). */
  days: number;
  rate: number;
  dailyRate: number;
  amount: number;
  /** Czy niezdolność przypada w ciąży (stawka 100%). */
  inPregnancy: boolean;
}

/**
 * Świadczenie rehabilitacyjne (art. 18–19): po wyczerpaniu zasiłku chorobowego, gdy dalsze leczenie rokuje
 * odzyskanie zdolności do pracy — o czym orzeka lekarz orzecznik ZUS. Najdłużej 12 miesięcy.
 * Stawka: w ciąży 100%, poza ciążą 90% przez 3 miesiące, potem 75%. Bez kwartalnej waloryzacji podstawy (art. 19 ust. 2).
 */
export function rehabilitationBenefit(base: number, days: number, inPregnancy: boolean): RehabEstimate | null {
  const capped = Math.min(Math.max(0, Math.round(days)), REHAB_MAX_MONTHS * 30);
  if (capped <= 0) return null;
  if (inPregnancy) {
    const daily = dailyRate(base, RATES.rehabPregnancy);
    return { days: capped, rate: RATES.rehabPregnancy, dailyRate: daily, amount: round2(daily * capped), inPregnancy };
  }
  const first = Math.min(capped, 90);
  const amount = round2(dailyRate(base, RATES.rehabFirst3Months) * first + dailyRate(base, RATES.rehabLater) * (capped - first));
  return { days: capped, rate: capped > 90 ? RATES.rehabLater : RATES.rehabFirst3Months, dailyRate: dailyRate(base, RATES.rehabFirst3Months), amount, inPregnancy };
}

export interface BridgingMaternity {
  /** Czy przysługuje zasiłek w wysokości zasiłku macierzyńskiego do dnia porodu (art. 30 ust. 3). */
  eligible: boolean;
  /** Czy po porodzie przysługuje zasiłek macierzyński mimo ustania ubezpieczenia (art. 30 ust. 1). */
  maternityAfterBirth: boolean;
  start: string;
  end: string;
  days: number;
  dailyRate: number;
  amount: number;
  notes: string[];
}

/** Zasiłek w wysokości zasiłku macierzyńskiego dla pracownicy, z którą w ciąży rozwiązano umowę (art. 30 ust. 1 i 3). */
export function bridgingMaternity(p: Profile, base: number, today: string): BridgingMaternity | null {
  const emp = p.employment;
  if (emp.title !== 'UOP' || emp.pregnancyTermination === 'BRAK') return null;
  const notes: string[] = [];
  const due = isValidISO(p.family.birthDate) && p.family.situation === 'PO_PORODZIE' ? p.family.birthDate : isValidISO(p.family.expectedDueDate) ? p.family.expectedDueDate : today;
  const viaEmployer = emp.pregnancyTermination === 'UPADLOSC_LIKWIDACJA' || emp.pregnancyTermination === 'SMIERC_PRACODAWCY';
  const start = isValidISO(emp.terminationDate) ? addDays(emp.terminationDate, 1) : '';
  if (viaEmployer) {
    if (!start) {
      notes.push('Podaj datę ustania umowy, żeby policzyć okres i kwotę.');
      return { eligible: true, maternityAfterBirth: true, start: '', end: '', days: 0, dailyRate: dailyRate(base, RATES.bridgingMaternity), amount: 0, notes };
    }
    const end = addDays(due, -1);
    const days = Math.max(0, diffDays(start, end) + 1);
    const daily = dailyRate(base, RATES.bridgingMaternity);
    notes.push('Zasiłek przysługuje od dnia po ustaniu umowy do dnia porodu, jeżeli pracodawca nie zapewnił Ci innego zatrudnienia.');
    notes.push('Po porodzie zachowujesz prawo do zasiłku macierzyńskiego, mimo że ubezpieczenie ustało (art. 30 ust. 1 pkt 1).');
    return { eligible: true, maternityAfterBirth: true, start, end, days, dailyRate: daily, amount: round2(daily * days), notes };
  }
  // Naruszenie przepisów: art. 30 ust. 3 go nie obejmuje; zasiłek macierzyński po porodzie — gdy naruszenie stwierdzi prawomocny wyrok (ust. 1 pkt 2).
  notes.push('Gdy umowę rozwiązano z naruszeniem przepisów, zasiłek macierzyński po porodzie przysługuje dopiero wtedy, gdy naruszenie stwierdzi prawomocny wyrok sądu (art. 30 ust. 1 pkt 2). Art. 30 ust. 3 (zasiłek do dnia porodu) dotyczy tylko upadłości, likwidacji i śmierci pracodawcy.');
  return { eligible: false, maternityAfterBirth: true, start, end: '', days: 0, dailyRate: dailyRate(base, RATES.bridgingMaternity), amount: 0, notes };
}

export function pregnancySickness(p: Profile, e: Eligibility, base: number): PregnancySickness {
  const rate = p.plan.codeB ? RATES.sicknessPregnancy : RATES.sicknessStandard;
  const periodLimit = p.plan.codeB ? SICKNESS_PERIOD_DAYS.pregnancy : SICKNESS_PERIOD_DAYS.standard;
  const requested = Math.max(0, Math.round(p.plan.sickLeavePregnancyDays));
  const payable = Math.min(requested, periodLimit);
  const notes: string[] = [];

  let employerDays = 0;
  if (e.isEmployee) {
    const limit = e.isOver50 ? EMPLOYER_SICK_PAY_DAYS.over50 : EMPLOYER_SICK_PAY_DAYS.under50;
    employerDays = Math.min(payable, Math.max(0, limit - p.plan.sickDaysUsedThisYear));
    notes.push(`Wynagrodzenie chorobowe od pracodawcy: ${employerDays} dni (limit ${limit} dni w roku, wykorzystano wcześniej ${p.plan.sickDaysUsedThisYear}) — ${LEGAL.art92}.`);
  } else {
    notes.push('Zleceniobiorcy i przedsiębiorcy: zasiłek chorobowy z ZUS od 1. dnia niezdolności (po okresie wyczekiwania).');
  }
  if (!e.sicknessEligible) {
    notes.push(e.waitingPeriodSatisfied ? 'Brak prawa do zasiłku chorobowego.' : `Okres wyczekiwania niespełniony (${e.insuredDays}/${e.waitingPeriodDays} dni) — zasiłek nie przysługuje do jego upływu.`);
  }
  const zusDays = payable - employerDays;
  const daily = dailyRate(base, rate);
  const eligibleFactor = e.sicknessEligible ? 1 : 0;
  notes.push(p.plan.codeB ? 'Kod B na e-ZLA: 100% podstawy i okres zasiłkowy 270 dni; okresy choroby sprzed ciąży (bez kodu B) nie wliczają się do tego okresu.' : 'Bez kodu B: 80% podstawy i okres zasiłkowy 182 dni.');
  const employerAmount = round2(daily * employerDays * eligibleFactor);
  const zusAmount = round2(daily * zusDays * eligibleFactor);
  // Wynagrodzenie chorobowe: składka zdrowotna 9% + PIT; zasiłek z ZUS: tylko PIT.
  const netEstimate = round2(employerAmount * (1 - 0.09) * (1 - PIT_RATE) + zusAmount * (1 - PIT_RATE));
  const overLimitDays = requested - payable;
  const rehab = e.sicknessInsured ? rehabilitationBenefit(base, overLimitDays, p.plan.codeB) : null;
  if (overLimitDays > 0) {
    notes.push(`Zwolnienie przekracza okres zasiłkowy o ${overLimitDays} dni. Za ten czas możesz wnioskować o świadczenie rehabilitacyjne (art. 18) — przyznaje je ZUS po orzeczeniu lekarza orzecznika, że dalsze leczenie rokuje powrót do pracy.`);
  }
  return { rate, periodLimit, requestedDays: requested, employerDays, zusDays, overLimitDays, employerAmount, zusAmount, dailyRate: daily, netEstimate, notes, rehab };
}

/* ------------------------------------------------------------------ */
/* Porównywarka wariantów 81,5% vs 100% + 70%                          */
/* ------------------------------------------------------------------ */

export interface PaymentLine {
  id: string;
  label: string;
  who: LeaveBlock['who'];
  start: string;
  end: string;
  rate: number;
  amount: number;
  monthlyGross: number;
}

export interface VariantResult {
  variant: PaymentVariant;
  lines: PaymentLine[];
  motherTotal: number;
  fatherTotal: number;
  familyTotal: number;
  equalisation: number;
}

/** Współczynnik obniżenia zasiłku w bloku rodzicielskim przy łączeniu z pracą (proporcjonalnie do wymiaru etatu). */
function partTimeFactor(p: Profile): number {
  const par = parentalDimension(p);
  const ext = partTimeExtension(p, par);
  if (ext.combinedWeeks <= 0 || ext.motherTotalWeeks <= 0) return 1;
  const f = p.plan.partTimeFraction;
  const notCombinedExt = p.plan.combineExtension ? 0 : ext.extensionWeeks;
  const paidWeeks = (par.motherWeeks - ext.combinedWeeks) + ext.combinedWeeks * (1 - f) + ext.combinedExtensionWeeks * (1 - f) + notCombinedExt;
  return paidWeeks / ext.motherTotalWeeks;
}

export function simulateVariant(p: Profile, today: string, variant: PaymentVariant, motherBase: number, fatherBase: number): VariantResult {
  const profile: Profile = { ...p, plan: { ...p.plan, variant } };
  const blocks = buildTimeline(profile, today);
  const ptFactor = partTimeFactor(profile);
  const lines: PaymentLine[] = [];
  let equalisation = 0;

  for (const b of blocks) {
    const base = b.who === 'OJCIEC' ? fatherBase : motherBase;
    let rate = b.rate;
    let factor = 1;
    if (b.kind === 'RODZICIELSKI') factor = ptFactor;
    if (variant === 'USREDNIONY' && p.plan.simulateNoParentalFirstYear && b.kind === 'RODZICIELSKI') continue;
    const amount = round2(periodAmount(base, rate, b.start, b.end) * factor);
    if (variant === 'USREDNIONY' && p.plan.simulateNoParentalFirstYear && (b.kind === 'MACIERZYNSKI' || b.kind === 'PRZED_PORODEM')) {
      equalisation += round2(periodAmount(base, RATES.full, b.start, b.end) - amount);
    }
    lines.push({ id: b.id, label: b.label, who: b.who, start: b.start, end: b.end, rate: rate * factor, amount, monthlyGross: round2(base * rate * factor) });
  }
  if (equalisation > 0) {
    lines.push({ id: 'eq', label: 'Wyrównanie do 100% (art. 31 ust. 4)', who: 'MATKA', start: '', end: '', rate: 0, amount: round2(equalisation), monthlyGross: 0 });
  }
  const motherTotal = round2(lines.filter((l) => l.who !== 'OJCIEC').reduce((s, l) => s + l.amount, 0));
  const fatherTotal = round2(lines.filter((l) => l.who === 'OJCIEC').reduce((s, l) => s + l.amount, 0));
  return { variant, lines, motherTotal, fatherTotal, familyTotal: round2(motherTotal + fatherTotal), equalisation: round2(equalisation) };
}

export function compareVariants(p: Profile, today: string, motherBase: number, fatherBase: number) {
  const averaged = simulateVariant(p, today, 'USREDNIONY', motherBase, fatherBase);
  const variable = simulateVariant(p, today, 'ZMIENNY', motherBase, fatherBase);
  const better: PaymentVariant = averaged.familyTotal >= variable.familyTotal ? 'USREDNIONY' : 'ZMIENNY';
  return { averaged, variable, better, difference: round2(Math.abs(averaged.familyTotal - variable.familyTotal)) };
}

/* ------------------------------------------------------------------ */
/* Zasiłek opiekuńczy (art. 32–35)                                      */
/* ------------------------------------------------------------------ */

export interface CareResult {
  eligible: boolean;
  pool: 60 | 30 | 14;
  poolLimit: number;
  poolUsed: number;
  familyUsed: number;
  availableDays: number;
  grantedDays: number;
  dailyRate: number;
  amount: number;
  reasons: string[];
}

export function careAllowance(p: Profile, e: Eligibility, base: number): CareResult {
  const c = p.care;
  const reasons: string[] = [];
  let eligible = e.careEligible;
  let pool: 60 | 30 | 14 = 60;

  switch (c.reason) {
    case 'CHORE_DZIECKO_DO_14':
      if (c.childAgeYears >= CARE_LIMITS.sickChildMaxAge) { eligible = false; reasons.push('Dziecko ukończyło 14 lat — wybierz pulę 14 dni lub 30 dni (niepełnosprawność).'); }
      break;
    case 'ZAMKNIECIE_PLACOWKI':
    case 'PORÓD_LUB_SZPITAL_OPIEKUNA':
      if (c.childAgeYears >= CARE_LIMITS.healthyChildMaxAge) { eligible = false; reasons.push('Opieka nad zdrowym dzieckiem przysługuje do ukończenia 8 lat.'); }
      if (c.reason === 'ZAMKNIECIE_PLACOWKI' && c.facilityNoticeDays >= CARE_LIMITS.facilityClosureNoticeDays) {
        eligible = false;
        reasons.push('Zamknięcie żłobka/przedszkola musi być nieprzewidziane — powiadomienie mniej niż 7 dni wcześniej.');
      }
      break;
    case 'CHORE_DZIECKO_NIEPELNOSPRAWNE_14_18':
      pool = 30;
      if (c.childAgeYears < 14 || c.childAgeYears >= CARE_LIMITS.disabledChildMaxAge) { eligible = false; reasons.push('Pula 30 dni dotyczy dziecka z niepełnosprawnością w wieku 14–18 lat.'); }
      break;
    case 'CHORE_DZIECKO_POWYZEJ_14':
    case 'INNY_CZLONEK_RODZINY':
      pool = 14;
      break;
  }
  // art. 34 — zasiłek nie przysługuje, gdy jest inny domownik mogący zapewnić opiekę (wyjątek: chore dziecko do lat 2).
  if (c.otherCarerAvailable && !(c.reason === 'CHORE_DZIECKO_DO_14' && c.childAgeYears < 2)) {
    eligible = false;
    reasons.push('W gospodarstwie domowym jest inny członek rodziny, który może zapewnić opiekę (art. 34) — zasiłek nie przysługuje.');
  }
  if (!e.careEligible) reasons.push('Brak ubezpieczenia chorobowego (lub zadłużenie > 1% płacy minimalnej).');

  const poolLimit = pool === 60 ? CARE_LIMITS.childUnder14OrHealthyUnder8 : pool === 30 ? CARE_LIMITS.disabledChild14to18 : CARE_LIMITS.otherFamilyOrChildOver14;
  const poolUsed = pool === 60 ? c.usedPool60 : pool === 30 ? c.usedPool30 : c.usedPool14;
  const familyUsed = c.usedPool60 + c.usedPool30 + c.usedPool14;
  const availableDays = Math.max(0, Math.min(poolLimit - poolUsed, CARE_LIMITS.familyTotalCap - familyUsed));
  const grantedDays = eligible ? Math.min(Math.max(0, c.daysRequested), availableDays) : 0;
  if (eligible && c.daysRequested > availableDays) reasons.push(`Wnioskowano ${c.daysRequested} dni, dostępne ${availableDays} — limit puli ${poolLimit} dni i łączny limit 60 dni w roku.`);
  const daily = dailyRate(base, RATES.care);
  return { eligible, pool, poolLimit, poolUsed, familyUsed, availableDays, grantedDays, dailyRate: daily, amount: round2(daily * grantedDays), reasons };
}

/* ------------------------------------------------------------------ */
/* Ile tracisz bez ubezpieczenia                                         */
/* ------------------------------------------------------------------ */

export interface LossMonth {
  month: string;
  /** Zasiłki matki na rękę przy umowie o pracę. */
  insured: number;
  /** Świadczenie rodzicielskie (bez PIT). */
  uninsured: number;
}

export interface InsuranceLoss {
  salaryGross: number;
  base: number;
  months: LossMonth[];
  insuredTotal: number;
  uninsuredTotal: number;
  loss: number;
  insuredWeeks: number;
  uninsuredWeeks: number;
  /** Dodatkowe utracone świadczenia, gdy w profilu są dane (L4 w ciąży, opiekuńczy). */
  extras: { label: string; amount: number; legal: string }[];
}

/**
 * Porównuje świadczenia matki bez ubezpieczenia (świadczenie rodzicielskie 1 000 zł/mies.)
 * z hipotetyczną umową o pracę za `salaryGross` brutto (zasiłki macierzyńskie z ZUS, na rękę).
 */
export function insuranceLoss(p: Profile, today: string, salaryGross: number): InsuranceLoss {
  const gross = Math.max(MIN_WAGE_2026 * 0.1, salaryGross || MIN_WAGE_2026);
  const birth = anchorBirthDate(p, today);
  const lastMonth = shiftMonth(birth.slice(0, 7), -1);
  const months: SalaryMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: shiftMonth(lastMonth, i - 11), fixedPaid: gross, fixedContract: gross, variablePaid: 0, requiredDays: 21, workedDays: 21 }));
  const hyp: Profile = {
    ...p,
    employment: { ...p.employment, title: 'UOP', insuranceStart: addMonths(birth, -24), contractType: 'NIEOKRESLONY', fullTimeFraction: 1, insuredAtPayer: Math.max(1, p.employment.insuredAtPayer), concurrentUop: false },
    family: { ...p.family, specialCase: 'BRAK' },
    salary: { ...p.salary, months, quarterlyBonuses: [0, 0, 0, 0], annualBonus: 0 },
  };
  const base = employeeBase(hyp).base;
  const blocks = buildTimeline(hyp, today).filter((b) => b.who !== 'OJCIEC');
  const kids = Math.min(5, Math.max(1, Math.round(p.family.childrenCount))) as 1 | 2 | 3 | 4 | 5;
  const sbWeeks = PARENTAL_BENEFIT_WEEKS[kids];
  const sbStart = birth;
  const sbEnd = addDays(sbStart, Math.round(sbWeeks * 7) - 1);

  const first = blocks.reduce((m, b) => (b.start < m ? b.start : m), sbStart);
  const last = blocks.reduce((m, b) => (b.end > m ? b.end : m), sbEnd);
  const out: LossMonth[] = [];
  for (let ym = first.slice(0, 7); ym <= last.slice(0, 7); ym = shiftMonth(ym, 1)) {
    const mStart = `${ym}-01`;
    const mEnd = toISO(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)));
    let grossInsured = 0;
    for (const b of blocks) {
      const s0 = b.start > mStart ? b.start : mStart;
      const e0 = b.end < mEnd ? b.end : mEnd;
      if (s0 <= e0) grossInsured += periodAmount(base, b.rate, s0, e0);
    }
    const s1 = sbStart > mStart ? sbStart : mStart;
    const e1 = sbEnd < mEnd ? sbEnd : mEnd;
    const daysInMonth = diffDays(mStart, mEnd) + 1;
    const uninsured = s1 <= e1 ? round2((PARENTAL_BENEFIT_AMOUNT * (diffDays(s1, e1) + 1)) / daysInMonth) : 0;
    const insured = grossInsured > 0 ? round2(grossInsured - pitAdvance(grossInsured, p.salary.usePit2)) : 0;
    out.push({ month: ym, insured, uninsured });
  }
  const insuredTotal = round2(out.reduce((a, m) => a + m.insured, 0));
  const uninsuredTotal = round2(out.reduce((a, m) => a + m.uninsured, 0));
  const extras: InsuranceLoss['extras'] = [];
  if (p.plan.sickLeavePregnancyDays > 0) {
    const days = Math.min(p.plan.sickLeavePregnancyDays, SICKNESS_PERIOD_DAYS.pregnancy);
    extras.push({ label: `Zwolnienie lekarskie w ciąży (${days} dni, 100% podstawy)`, amount: round2(dailyRate(base, RATES.sicknessPregnancy) * days), legal: `${LEGAL.uz11}; ${LEGAL.art92}` });
  }
  if (p.care.daysRequested > 0) {
    extras.push({ label: `Zasiłek opiekuńczy (${p.care.daysRequested} dni, 80%)`, amount: round2(dailyRate(base, RATES.care) * p.care.daysRequested), legal: LEGAL.uz32 });
  }
  return {
    salaryGross: gross,
    base,
    months: out,
    insuredTotal,
    uninsuredTotal,
    loss: round2(insuredTotal - uninsuredTotal),
    insuredWeeks: blocks.reduce((a, b) => a + b.weeks, 0),
    uninsuredWeeks: sbWeeks,
    extras,
  };
}

export { zl as formatZl };
