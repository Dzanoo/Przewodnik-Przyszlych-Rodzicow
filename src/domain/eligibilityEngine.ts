/**
 * Silnik kwalifikacji: tytuł ubezpieczenia → ubezpieczenie chorobowe, płatnik zasiłku, okres wyczekiwania,
 * wymiary urlopów (art. 180–183 KP), harmonogram urlopów oraz krytyczne terminy.
 */
import {
  ADOPTION_MATERNITY_MIN_WEEKS,
  AVERAGED_VARIANT_DEADLINE_DAYS,
  CLAIM_LIMITATION_MONTHS,
  DEBT_TOLERANCE,
  FUNERAL_GRANT_DEADLINE_MONTHS,
  LEGAL,
  MATERNITY_PRENATAL_MAX_WEEKS,
  MATERNITY_WEEKS,
  MIN_WAGE_2026,
  PARENTAL_NOTICE_DAYS,
  PARENTAL_PART_TIME_CAPS,
  PARENTAL_WEEKS,
  PATERNITY,
  PAYER_THRESHOLD,
  RATES,
  SUPPLEMENTARY,
  WAITING_PERIOD_DAYS,
} from './constants2026';
import {
  addDays,
  addMonths,
  addWeeks,
  ageInYears,
  diffDays,
  endOfYearChildTurns,
  formatPL,
  isValidISO,
  parseISO,
} from './dateUtils';
import type { Deadline, Eligibility, LeaveBlock, Note, Profile, SpecialCase } from './types';

/* ------------------------------------------------------------------ */
/* Data zdarzenia (powstania prawa do świadczenia)                      */
/* ------------------------------------------------------------------ */

/** Data, w której powstaje prawo do świadczenia: poród / przyjęcie dziecka / (w ciąży) dzień odniesienia. */
export function eventDate(p: Profile, today: string): string {
  const f = p.family;
  if ((f.situation === 'ADOPCJA' || f.situation === 'RODZINA_ZASTEPCZA') && isValidISO(f.adoptionDate)) return f.adoptionDate;
  if (f.situation === 'PO_PORODZIE' && isValidISO(f.birthDate)) return f.birthDate;
  if (isValidISO(f.expectedDueDate)) return f.expectedDueDate;
  return today;
}

/** Data porodu używana do planowania: faktyczna, a w ciąży przewidywana. */
export function anchorBirthDate(p: Profile, today: string): string {
  const f = p.family;
  if (f.situation === 'PO_PORODZIE' && isValidISO(f.birthDate)) return f.birthDate;
  if (isValidISO(f.expectedDueDate)) return f.expectedDueDate;
  return today;
}

export function isAdoption(p: Profile): boolean {
  return p.family.situation === 'ADOPCJA' || p.family.situation === 'RODZINA_ZASTEPCZA';
}

/* ------------------------------------------------------------------ */
/* Kwalifikacja                                                         */
/* ------------------------------------------------------------------ */

export function computeEligibility(p: Profile, today: string): Eligibility {
  const e = p.employment;
  const notes: Note[] = [];
  const refDate = eventDate(p, today);

  let sicknessInsured = false;
  let sicknessMandatory = false;
  let isEmployee = false;

  switch (e.title) {
    case 'UOP':
      sicknessInsured = true;
      sicknessMandatory = true;
      isEmployee = true;
      notes.push({ text: 'Umowa o pracę: obowiązkowe ubezpieczenie chorobowe od pierwszego dnia zatrudnienia.', legal: 'art. 11 ust. 1 ustawy o sus' });
      break;
    case 'ZLECENIE':
      if (e.concurrentUop && e.concurrentUopSalary >= MIN_WAGE_2026) {
        // Zbieg tytułów: UoP zapewnia co najmniej minimalne wynagrodzenie → zlecenie nie jest tytułem do ubezpieczeń społecznych.
        sicknessInsured = true;
        sicknessMandatory = true;
        isEmployee = true;
        notes.push({
          text: `Zbieg tytułów: z umowy o pracę przysługuje co najmniej minimalne wynagrodzenie (${MIN_WAGE_2026.toFixed(2)} zł), więc ze zlecenia nie podlegasz ubezpieczeniom społecznym i nie możesz przystąpić do dobrowolnego chorobowego ze zlecenia. Ochrona chorobowa i podstawa zasiłku wynikają wyłącznie z umowy o pracę.`,
          legal: 'art. 9 ust. 1 i 1a ustawy o sus',
        });
      } else if (p.person.isStudentUnder26) {
        notes.push({ text: 'Uczeń / student do 26. roku życia na zleceniu nie podlega ubezpieczeniom społecznym, a więc także chorobowemu.', legal: 'art. 6 ust. 4 ustawy o sus' });
      } else if (e.voluntarySickness) {
        sicknessInsured = true;
        notes.push({ text: 'Zlecenie: dobrowolne ubezpieczenie chorobowe — ochrona od dnia wskazanego w zgłoszeniu (bez możliwości objęcia wstecz, chyba że zgłoszenie złożono w 7 dni).', legal: 'art. 14 ust. 1 ustawy o sus' });
      } else {
        notes.push({ text: 'Zlecenie bez dobrowolnego ubezpieczenia chorobowego — brak prawa do zasiłków chorobowego, macierzyńskiego i opiekuńczego.', legal: 'art. 11 ust. 2 ustawy o sus' });
      }
      break;
    case 'JDG':
      if (e.jdgVariant === 'ULGA_NA_START') {
        notes.push({ text: 'Ulga na start: przez pierwsze 6 miesięcy nie podlegasz ubezpieczeniom społecznym — brak prawa do zasiłku chorobowego, macierzyńskiego i opiekuńczego.', legal: 'art. 18 ustawy Prawo przedsiębiorców' });
      } else if (e.voluntarySickness) {
        sicknessInsured = true;
        notes.push({ text: 'JDG: dobrowolne ubezpieczenie chorobowe opłacane — zasiłki wypłaca zawsze ZUS.', legal: 'art. 11 ust. 2 ustawy o sus; ' + LEGAL.uz61 });
      } else {
        notes.push({ text: 'JDG bez dobrowolnego ubezpieczenia chorobowego — brak prawa do zasiłków z ubezpieczenia chorobowego.', legal: 'art. 11 ust. 2 ustawy o sus' });
      }
      break;
    case 'NIEUBEZPIECZONY':
      notes.push({ text: 'Brak tytułu do ubezpieczenia chorobowego — zasiłki z ZUS nie przysługują. Możesz ubiegać się o świadczenie rodzicielskie (1 000 zł/mies.; szczegóły na gov.pl).', legal: 'art. 17c ustawy o świadczeniach rodzinnych' });
      break;
  }

  // Płatnik zasiłku (art. 61 ustawy zasiłkowej)
  let payer: Eligibility['payer'] = 'ZUS';
  let payerReason: string;
  if (e.title === 'JDG') {
    payerReason = 'Przedsiębiorcom (i osobom współpracującym) zasiłki ustala i wypłaca ZUS.';
  } else if (!sicknessInsured) {
    payerReason = 'Brak ubezpieczenia chorobowego — brak płatnika zasiłku.';
  } else if (e.insuredAtPayer > PAYER_THRESHOLD) {
    payer = 'PLATNIK';
    payerReason = `Płatnik zgłosił ${e.insuredAtPayer} osób do ubezpieczenia chorobowego (> ${PAYER_THRESHOLD}) — zasiłek ustala i wypłaca pracodawca/zleceniodawca.`;
  } else {
    payerReason = `Płatnik zgłosił ${e.insuredAtPayer} osób (≤ ${PAYER_THRESHOLD}) — zasiłek ustala i wypłaca ZUS (płatnik przekazuje Z-3 i dokumenty).`;
  }

  // Okres wyczekiwania (art. 4 ustawy zasiłkowej) — dotyczy tylko zasiłku chorobowego.
  const waitingPeriodDays = sicknessMandatory ? WAITING_PERIOD_DAYS.mandatory : WAITING_PERIOD_DAYS.voluntary;
  let waitingPeriodWaived: string | null = null;
  if (e.commuteAccident) waitingPeriodWaived = 'niezdolność spowodowana wypadkiem w drodze do/z pracy';
  else if (e.graduateWithin90Days) waitingPeriodWaived = 'absolwent zgłoszony do ubezpieczenia w ciągu 90 dni od ukończenia szkoły/studiów';
  else if (sicknessMandatory && e.priorMandatory10Years) waitingPeriodWaived = 'co najmniej 10-letni okres obowiązkowego ubezpieczenia chorobowego';
  const insuredDays = isValidISO(e.insuranceStart) ? Math.max(0, diffDays(e.insuranceStart, today)) : 0;
  const waitingPeriodSatisfied = waitingPeriodWaived !== null || insuredDays >= waitingPeriodDays;

  // Art. 2a — zadłużenie składkowe osób opłacających składki samodzielnie (JDG).
  const blockedByDebt = e.title === 'JDG' && sicknessInsured && e.contributionDebt > DEBT_TOLERANCE;
  if (blockedByDebt) {
    notes.push({
      text: `Zadłużenie składkowe ${e.contributionDebt.toFixed(2)} zł przekracza 1% minimalnego wynagrodzenia (${DEBT_TOLERANCE.toFixed(2)} zł) — zasiłek nie przysługuje do czasu spłaty całego zadłużenia.`,
      legal: LEGAL.uz2a,
    });
  }

  const birthOk = isValidISO(p.person.birthDate);
  const yearRef = parseISO(today).getUTCFullYear();
  // art. 92 § 1 pkt 1 KP: 14 dni od roku następującego po roku, w którym pracownik ukończył 50 lat.
  const isOver50 = birthOk && parseISO(p.person.birthDate).getUTCFullYear() + 50 < yearRef;

  const maternityEligible = sicknessInsured && !blockedByDebt;
  if (maternityEligible) {
    notes.push({ text: 'Zasiłek macierzyński i opiekuńczy przysługują bez okresu wyczekiwania — od pierwszego dnia ubezpieczenia chorobowego.', legal: LEGAL.uz4 });
  }
  if (refDate < e.insuranceStart && isValidISO(e.insuranceStart)) {
    notes.push({ text: 'Data zdarzenia przypada przed początkiem ubezpieczenia — sprawdź daty.', legal: LEGAL.uz4 });
  }

  return {
    sicknessInsured,
    sicknessMandatory,
    payer,
    payerReason,
    waitingPeriodDays,
    waitingPeriodWaived,
    waitingPeriodSatisfied,
    insuredDays,
    maternityEligible,
    careEligible: sicknessInsured && !blockedByDebt,
    sicknessEligible: sicknessInsured && !blockedByDebt && waitingPeriodSatisfied,
    blockedByDebt,
    isEmployee,
    isOver50,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Wymiary urlopów                                                      */
/* ------------------------------------------------------------------ */

function childrenKey(n: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

export interface MaternityDimension {
  weeks: number;
  days: number;
  legal: string;
  note: string;
}

/** Wymiar urlopu macierzyńskiego (art. 180, 180¹, 183 KP). */
export function maternityDimension(p: Profile, today: string): MaternityDimension {
  const f = p.family;
  const standard = MATERNITY_WEEKS[childrenKey(f.childrenCount)];

  if (isAdoption(p)) {
    // art. 183 § 1–3 KP: wymiar jak macierzyński, nie dłużej niż do 7 r.ż. (10 r.ż. przy odroczeniu), nie krócej niż 9 tygodni.
    const start = isValidISO(f.adoptionDate) ? f.adoptionDate : today;
    let weeks = standard;
    if (isValidISO(f.birthDate)) {
      const limitAge = f.schoolDeferral ? 10 : 7;
      const limitDate = addDays(addMonths(f.birthDate, limitAge * 12), -1);
      const weeksToLimit = Math.max(0, Math.floor(diffDays(start, limitDate) / 7));
      weeks = Math.max(ADOPTION_MATERNITY_MIN_WEEKS, Math.min(standard, weeksToLimit));
    }
    return { weeks, days: weeks * 7, legal: LEGAL.art183, note: `Urlop na warunkach urlopu macierzyńskiego: ${weeks} tyg. (min. 9 tygodni).` };
  }

  if (f.situation === 'PO_PORODZIE' && f.childOutcome !== 'ZYWE') {
    const birth = anchorBirthDate(p, today);
    const prenatalDays = Math.min(f.prenatalWeeks, MATERNITY_PRENATAL_MAX_WEEKS) * 7;
    if (f.childOutcome === 'ZGON_PO_8_TYG' && isValidISO(f.childDeathDate)) {
      const days = prenatalDays + diffDays(birth, f.childDeathDate) + 7;
      return { weeks: days / 7, days, legal: LEGAL.art1801, note: 'Zgon dziecka po 8. tygodniu życia — urlop do upływu 7 dni od dnia zgonu.' };
    }
    // Martwe urodzenie lub zgon przed upływem 8 tygodni: 8 tygodni po porodzie, nie krócej niż 7 dni od zgonu.
    let postDays = 56;
    if (f.childOutcome === 'ZGON_PRZED_8_TYG' && isValidISO(f.childDeathDate)) {
      postDays = Math.max(56, diffDays(birth, f.childDeathDate) + 7);
    }
    const days = prenatalDays + postDays;
    return { weeks: days / 7, days, legal: LEGAL.art1801, note: 'Martwe urodzenie / zgon przed 8. tygodniem — 8 tygodni po porodzie (nie krócej niż 7 dni od zgonu).' };
  }

  return { weeks: standard, days: standard * 7, legal: LEGAL.art180, note: `Urlop macierzyński: ${standard} tyg. dla ${childrenKey(f.childrenCount)}${f.childrenCount >= 5 ? '+' : ''} dziecka/dzieci.` };
}

export interface SupplementaryResult {
  weeks: number;
  maxWeeks: number;
  category: 'BRAK' | 'SKRAJNY_WCZESNIAK' | 'WCZESNIAK' | 'DONOSZONY';
  explanation: string;
}

/** Uzupełniający urlop macierzyński (art. 180² KP). */
export function supplementaryLeave(p: Profile): SupplementaryResult {
  const f = p.family;
  if (f.childOutcome !== 'ZYWE' || f.childHospitalDays <= 0) {
    return { weeks: 0, maxWeeks: 0, category: 'BRAK', explanation: 'Brak hospitalizacji dziecka — uzupełniający urlop macierzyński nie przysługuje.' };
  }
  const week = f.pregnancyWeekAtBirth;
  const weight = f.birthWeightGrams;
  const start = Math.max(1, f.childHospitalStartDay);

  if (week < SUPPLEMENTARY.extremePretermWeekLimit || (weight > 0 && weight <= SUPPLEMENTARY.lowBirthWeightGrams)) {
    const limitDays = SUPPLEMENTARY.maxWeeksExtreme * 7;
    const counted = Math.max(0, Math.min(f.childHospitalDays, limitDays - start + 1));
    const weeks = Math.min(SUPPLEMENTARY.maxWeeksExtreme, Math.ceil(counted / 7));
    return {
      weeks,
      maxWeeks: SUPPLEMENTARY.maxWeeksExtreme,
      category: 'SKRAJNY_WCZESNIAK',
      explanation: `Urodzenie przed 28. tygodniem ciąży lub masa ≤ 1000 g: 1 tydzień za każdy (rozpoczęty) tydzień pobytu w szpitalu do upływu 15. tygodnia po porodzie → ${counted} dni = ${weeks} tyg.`,
    };
  }
  if (week < SUPPLEMENTARY.termWeek) {
    const limitDays = SUPPLEMENTARY.maxWeeksOther * 7;
    const counted = Math.max(0, Math.min(f.childHospitalDays, limitDays - start + 1));
    const weeks = Math.min(SUPPLEMENTARY.maxWeeksOther, Math.ceil(counted / 7));
    return {
      weeks,
      maxWeeks: SUPPLEMENTARY.maxWeeksOther,
      category: 'WCZESNIAK',
      explanation: `Urodzenie między 28. a 37. tygodniem ciąży, masa > 1000 g: pobyt w szpitalu do upływu 8. tygodnia po porodzie → ${counted} dni = ${weeks} tyg.`,
    };
  }
  // Dziecko donoszone: hospitalizacja ≥ 2 kolejne dni, rozpoczęta między 5. a 28. dniem po porodzie; liczona od 5. dnia do końca 8. tygodnia.
  const validStart = start >= SUPPLEMENTARY.termHospitalFromDay && start <= SUPPLEMENTARY.termHospitalFirstDayMax;
  if (!validStart || f.childHospitalDays < SUPPLEMENTARY.termHospitalMinConsecutiveDays) {
    return {
      weeks: 0,
      maxWeeks: SUPPLEMENTARY.maxWeeksOther,
      category: 'DONOSZONY',
      explanation: 'Dziecko donoszone: urlop przysługuje tylko przy hospitalizacji trwającej co najmniej 2 kolejne dni, rozpoczętej między 5. a 28. dniem po porodzie — warunek niespełniony.',
    };
  }
  const counted = Math.max(0, Math.min(f.childHospitalDays, SUPPLEMENTARY.maxWeeksOther * 7 - start + 1));
  const weeks = Math.min(SUPPLEMENTARY.maxWeeksOther, Math.ceil(counted / 7));
  return {
    weeks,
    maxWeeks: SUPPLEMENTARY.maxWeeksOther,
    category: 'DONOSZONY',
    explanation: `Dziecko donoszone: pobyt w szpitalu od ${start}. dnia do upływu 8. tygodnia po porodzie → ${counted} dni = ${weeks} tyg.`,
  };
}

export interface ParentalDimension {
  total: number;
  motherWeeks: number;
  fatherWeeks: number;
  forfeitedWeeks: number;
  cap: number;
  legal: string;
}

/** Urlop rodzicielski (art. 182¹a KP; art. 183 § 4–4⁵ KP). */
export function parentalDimension(p: Profile): ParentalDimension {
  const f = p.family;
  const multiple = f.childrenCount >= 2;
  let total: number;
  if (isAdoption(p) && f.childAgeYears >= 7) {
    total = f.zaZyciem ? PARENTAL_WEEKS.adoptionOlderZaZyciem : PARENTAL_WEEKS.adoptionOlder;
  } else if (f.zaZyciem) {
    total = multiple ? PARENTAL_WEEKS.zaZyciemMultiple : PARENTAL_WEEKS.zaZyciemSingle;
  } else {
    total = multiple ? PARENTAL_WEEKS.multiple : PARENTAL_WEEKS.single;
  }
  const cap = f.zaZyciem
    ? multiple ? PARENTAL_PART_TIME_CAPS.zaZyciemMultiple : PARENTAL_PART_TIME_CAPS.zaZyciemSingle
    : multiple ? PARENTAL_PART_TIME_CAPS.multiple : PARENTAL_PART_TIME_CAPS.single;

  if (f.situation === 'PO_PORODZIE' && f.childOutcome !== 'ZYWE') {
    return { total: 0, motherWeeks: 0, fatherWeeks: 0, forfeitedWeeks: 0, cap, legal: LEGAL.art1801 };
  }
  const nine = PARENTAL_WEEKS.nonTransferable;
  const fatherWeeks = f.otherParent.insured && f.otherParent.takesNineWeeks ? nine : 0;
  return {
    total,
    motherWeeks: total - nine,
    fatherWeeks,
    forfeitedWeeks: nine - fatherWeeks,
    cap,
    legal: LEGAL.art1821a,
  };
}

/**
 * Liczba tygodni łączenia urlopu rodzicielskiego z pracą. Puste pole (0) przy ustawionym wymiarze pracy
 * oznacza łączenie przez całą część urlopu rodzicielskiego matki.
 */
export function effectivePartTimeWeeks(p: Profile, parental: ParentalDimension = parentalDimension(p)): number {
  if (p.plan.partTimeFraction <= 0) return 0;
  const w = p.plan.partTimeWeeks > 0 ? p.plan.partTimeWeeks : parental.motherWeeks;
  return Math.min(parental.motherWeeks, Math.max(0, w));
}

export interface PartTimeExtension {
  combinedWeeks: number;
  extensionWeeks: number;
  motherTotalWeeks: number;
  combinedExtensionWeeks: number;
  fullLeaveWeeks: number;
  cappedAt: number | null;
}

/**
 * Łączenie urlopu rodzicielskiego z pracą (art. 182¹e–182¹f KP).
 * § 2: wydłużenie = liczba tygodni łączenia × wymiar etatu.
 * § 7: jeżeli łączy się także część powstałą z wydłużenia — jej długość = wydłużenie / (1 − wymiar etatu).
 * Łączny wymiar urlopu rodzicielskiego nie może przekroczyć 82/86 (130/134 „Za życiem”) tygodni.
 */
export function partTimeExtension(p: Profile, parental: ParentalDimension): PartTimeExtension {
  const fraction = Math.min(PARENTAL_PART_TIME_CAPS.maxWorkFraction, Math.max(0, p.plan.partTimeFraction));
  const combinedWeeks = fraction > 0 ? effectivePartTimeWeeks(p, parental) : 0;
  let extension = combinedWeeks * fraction;
  let combinedExtensionWeeks = 0;
  if (p.plan.combineExtension && fraction > 0) {
    extension = extension / (1 - fraction);
    combinedExtensionWeeks = extension;
  }
  let cappedAt: number | null = null;
  const room = parental.cap - parental.total;
  if (extension > room) {
    extension = room;
    combinedExtensionWeeks = Math.min(combinedExtensionWeeks, room);
    cappedAt = parental.cap;
  }
  // § 4: część niebędąca wielokrotnością tygodnia udzielana w dniach; niepełny dzień pomija się.
  extension = Math.floor(extension * 7) / 7;
  combinedExtensionWeeks = Math.floor(combinedExtensionWeeks * 7) / 7;
  return {
    combinedWeeks,
    extensionWeeks: extension,
    motherTotalWeeks: parental.motherWeeks + extension,
    combinedExtensionWeeks,
    fullLeaveWeeks: parental.motherWeeks - combinedWeeks + (p.plan.combineExtension ? 0 : extension),
    cappedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Oś czasu                                                             */
/* ------------------------------------------------------------------ */

export function buildTimeline(p: Profile, today: string): LeaveBlock[] {
  const blocks: LeaveBlock[] = [];
  const f = p.family;
  const mat = maternityDimension(p, today);
  // Martwe urodzenie albo zgon przed 8. tygodniem: zasiłek zawsze 100% (poradnik ZUS s. 33–34; art. 180¹ § 1 KP).
  // Wariant 81,5% wymaga wniosku o urlop macierzyński i rodzicielski w pełnym wymiarze, a tu rodzicielskiego nie ma.
  const lossFullRate = !isAdoption(p) && (f.childOutcome === 'MARTWE' || f.childOutcome === 'ZGON_PRZED_8_TYG');
  const averaged = p.plan.variant === 'USREDNIONY' && !lossFullRate;

  if (isAdoption(p)) {
    const start = isValidISO(f.adoptionDate) ? f.adoptionDate : today;
    const end = addDays(start, mat.days - 1);
    blocks.push({ id: 'adopt', label: 'Urlop na warunkach macierzyńskiego', who: 'RODZIC', kind: 'NA_WARUNKACH', start, end, weeks: mat.weeks, rate: averaged ? RATES.averaged : RATES.full, legal: LEGAL.art183 });
    appendParental(p, blocks, addDays(end, 1), averaged);
    return blocks;
  }

  const birth = anchorBirthDate(p, today);
  const prenatalWeeks = Math.min(MATERNITY_PRENATAL_MAX_WEEKS, Math.max(0, f.prenatalWeeks));
  const maternityStart = addWeeks(birth, -prenatalWeeks);
  if (prenatalWeeks > 0) {
    blocks.push({ id: 'pre', label: 'Macierzyński przed porodem', who: 'MATKA', kind: 'PRZED_PORODEM', start: maternityStart, end: addDays(birth, -1), weeks: prenatalWeeks, rate: averaged ? RATES.averaged : RATES.full, legal: 'art. 180 § 2 KP' });
  }
  const maternityEnd = addDays(maternityStart, mat.days - 1);
  blocks.push({ id: 'mat', label: 'Urlop macierzyński', who: 'MATKA', kind: 'MACIERZYNSKI', start: birth, end: maternityEnd, weeks: mat.days / 7 - prenatalWeeks, rate: averaged ? RATES.averaged : RATES.full, legal: mat.legal });

  if (f.childOutcome !== 'ZYWE') return blocks;

  let cursor = addDays(maternityEnd, 1);
  const sup = supplementaryLeave(p);
  if (sup.weeks > 0) {
    const end = addDays(cursor, sup.weeks * 7 - 1);
    blocks.push({ id: 'sup', label: 'Uzupełniający urlop macierzyński', who: 'MATKA', kind: 'UZUPELNIAJACY', start: cursor, end, weeks: sup.weeks, rate: RATES.full, legal: LEGAL.art1802 });
    cursor = addDays(end, 1);
  }

  appendParental(p, blocks, cursor, averaged);

  if (f.otherParent.insured && f.otherParent.takesPaternity) {
    // Po porodzie, który już nastąpił: najwcześniej 7 dni od dziś (termin wniosku, art. 182³ § 2 KP).
    const earliest = addDays(today, PATERNITY.noticeDays);
    const start = birth < earliest && p.family.situation === 'PO_PORODZIE' ? earliest : birth;
    blocks.push({ id: 'pat', label: 'Urlop ojcowski', who: 'OJCIEC', kind: 'OJCOWSKI', start, end: addDays(start, PATERNITY.weeks * 7 - 1), weeks: PATERNITY.weeks, rate: RATES.full, legal: LEGAL.art1823 });
  }
  return applySpecialCase(p, blocks);
}

function appendParental(p: Profile, blocks: LeaveBlock[], from: string, averaged: boolean): void {
  const par = parentalDimension(p);
  if (par.total === 0) return;
  const ext = partTimeExtension(p, par);
  const motherDays = Math.round(ext.motherTotalWeeks * 7);
  const end = addDays(from, motherDays - 1);
  blocks.push({
    id: 'par',
    label: ext.combinedWeeks > 0 ? `Rodzicielski matki (w tym ${fmtW(ext.combinedWeeks)} tyg. z pracą na ${Math.round(p.plan.partTimeFraction * 100)}% etatu)` : 'Urlop rodzicielski (część matki)',
    who: 'MATKA',
    kind: 'RODZICIELSKI',
    start: from,
    end,
    weeks: ext.motherTotalWeeks,
    rate: averaged ? RATES.averaged : RATES.parental,
    legal: par.legal,
  });
  if (par.fatherWeeks > 0) {
    const s = addDays(end, 1);
    blocks.push({ id: 'par9', label: '9 tygodni drugiego rodzica (nieprzenoszalne)', who: 'OJCIEC', kind: 'RODZICIELSKI_9', start: s, end: addDays(s, par.fatherWeeks * 7 - 1), weeks: par.fatherWeeks, rate: RATES.parental, legal: 'art. 182¹a § 3 KP' });
  }
}

function fmtW(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toFixed(2).replace('.', ',');
}

/* ------------------------------------------------------------------ */
/* Terminy                                                              */
/* ------------------------------------------------------------------ */

export function buildDeadlines(p: Profile, today: string, eligibility: Eligibility): Deadline[] {
  const list: Deadline[] = [];
  const f = p.family;
  const blocks = buildTimeline(p, today);
  const byKind = (k: LeaveBlock['kind']) => blocks.find((b) => b.kind === k);

  if (isAdoption(p)) {
    const start = isValidISO(f.adoptionDate) ? f.adoptionDate : today;
    list.push({ id: 'adopt-apply', date: addDays(start, 7), title: 'Wniosek o urlop na warunkach macierzyńskiego', description: 'Wniosek składa się w terminie 7 dni od przyjęcia dziecka; urlop rozpoczyna się najpóźniej 21 dni od przyjęcia.', legal: 'art. 183 § 6 KP', severity: 'krytyczny' });
    list.push({ id: 'adopt-start', date: addDays(start, 21), title: 'Najpóźniejszy początek urlopu', description: 'Urlop musi rozpocząć się nie później niż 21 dni od przyjęcia dziecka.', legal: 'art. 183 § 6 KP', severity: 'ważny' });
  } else {
    const birth = anchorBirthDate(p, today);
    const pre = byKind('PRZED_PORODEM');
    if (pre) {
      list.push({ id: 'pre-apply', date: addDays(pre.start, -14), title: 'Wniosek o macierzyński przed porodem', description: `Złóż wniosek z zaświadczeniem o przewidywanej dacie porodu co najmniej 14 dni przed rozpoczęciem urlopu (${formatPL(pre.start)}).`, legal: 'art. 180 § 2 KP; § 2 rozporządzenia z 11.03.2025', severity: 'ważny' });
    }
    if (f.childOutcome === 'ZYWE') {
      list.push({ id: 'variant', date: addDays(birth, AVERAGED_VARIANT_DEADLINE_DAYS), title: 'Wniosek o wariant 81,5% (macierzyński + rodzicielski)', description: 'Tylko wniosek złożony w ciągu 21 dni po porodzie daje 81,5% za cały okres. Po tym terminie: 100% za macierzyński i 70% za rodzicielski.', legal: LEGAL.uz31, severity: 'krytyczny' });
    } else {
      list.push({ id: 'funeral', date: addMonths(birth, FUNERAL_GRANT_DEADLINE_MONTHS), title: 'Zasiłek pogrzebowy (Z-12)', description: 'Wniosek Z-12 o zasiłek pogrzebowy 7 000 zł — 12 miesięcy od dnia pochówku (przyjęto datę porodu jako orientacyjną).', legal: 'art. 77–80 ustawy o emeryturach i rentach z FUS', severity: 'ważny' });
    }
    const mat = lastOfKind(blocks, 'MACIERZYNSKI');
    const sup = byKind('UZUPELNIAJACY');
    if (mat && sup) {
      list.push({ id: 'sup-apply', date: addDays(mat.end, -SUPPLEMENTARY.noticeDaysBeforeMaternityEnd), title: 'Wniosek o uzupełniający urlop macierzyński', description: `Najpóźniej 21 dni przed końcem urlopu macierzyńskiego (${formatPL(mat.end)}), z zaświadczeniem szpitala.`, legal: 'art. 180² § 4 KP; § 14 rozporządzenia z 11.03.2025', severity: 'krytyczny' });
    }
    if (f.otherParent.insured && f.otherParent.takesPaternity && isValidISO(birth)) {
      const pat = byKind('OJCOWSKI');
      const patStart = pat ? pat.start : birth;
      list.push({ id: 'pat-apply', date: addDays(patStart, -PATERNITY.noticeDays), title: 'Wniosek o urlop ojcowski', description: `Co najmniej 7 dni przed rozpoczęciem urlopu ojcowskiego (planowany start: ${formatPL(patStart)}).`, legal: 'art. 182³ § 2 KP', severity: 'ważny' });
      list.push({ id: 'pat-end', date: addDays(addMonths(birth, PATERNITY.childAgeMonths), -1), title: 'Ostatni dzień na urlop ojcowski', description: 'Urlop ojcowski trzeba wykorzystać do ukończenia przez dziecko 12. miesiąca życia — inaczej przepada.', legal: LEGAL.art1823, severity: 'krytyczny' });
    }
  }

  // Szczególne sytuacje — terminy wniosków o przejęcie urlopu (rozporządzenie z 11.03.2025, § 3–13).
  if (isTakeoverByFather(p)) {
    const meta = SPECIAL_CASES[f.specialCase];
    const matF = blocks.find((b) => b.id === 'matF');
    if (matF) {
      if (f.specialCase === 'REZYGNACJA_PO_14' || f.specialCase === 'REZYGNACJA_NIEZDOLNOSC_PO_8') {
        list.push({ id: 'resign-apply', date: addDays(matF.start, -7), title: 'Wniosek matki o rezygnację z reszty urlopu macierzyńskiego', description: `Co najmniej 7 dni przed powrotem do pracy (${formatPL(matF.start)}). Dołącz kopię wniosku ojca o pozostałą część urlopu.`, legal: meta.legal, severity: 'krytyczny' });
        list.push({ id: 'father-takeover', date: addDays(matF.start, -14), title: 'Wniosek ojca o pozostałą część urlopu macierzyńskiego', description: `Co najmniej 14 dni przed rozpoczęciem (${formatPL(matF.start)}), z odpisem aktu urodzenia i oświadczeniem matki o rezygnacji.`, legal: '§ 5 rozporządzenia z 11.03.2025', severity: 'krytyczny' });
      } else if (f.specialCase === 'MATKA_NIEUB_PRACA') {
        list.push({ id: 'father-takeover', date: addDays(matF.start, -14), title: 'Wniosek ojca o część urlopu macierzyńskiego', description: `Co najmniej 14 dni przed rozpoczęciem (${formatPL(matF.start)}), z oświadczeniem matki o dacie podjęcia zatrudnienia na co najmniej ½ etatu.`, legal: '§ 13 rozporządzenia z 11.03.2025', severity: 'krytyczny' });
      } else {
        list.push({ id: 'father-takeover', date: matF.start, title: 'Wniosek ojca o przejęcie urlopu macierzyńskiego', description: `Złóż wniosek niezwłocznie — urlop przysługuje od ${formatPL(matF.start)}. ${f.specialCase === 'MATKA_SZPITAL' ? 'Ojciec zobowiązuje się poinformować pracodawcę o dniu wyjścia matki ze szpitala.' : ''}`.trim(), legal: meta.legal, severity: 'krytyczny' });
      }
    }
  }

  const par = byKind('RODZICIELSKI');
  if (par) {
    list.push({ id: 'par-apply', date: addDays(par.start, -PARENTAL_NOTICE_DAYS), title: 'Wniosek o urlop rodzicielski', description: `Co najmniej 21 dni przed rozpoczęciem (${formatPL(par.start)}), chyba że złożono łączny wniosek w ciągu 21 dni po porodzie.`, legal: 'art. 182¹c § 1 KP; § 15 rozporządzenia z 11.03.2025', severity: 'krytyczny' });
    if (effectivePartTimeWeeks(p) > 0) {
      list.push({ id: 'pt-apply', date: addDays(par.start, -PARENTAL_NOTICE_DAYS), title: 'Wniosek o łączenie urlopu z pracą', description: 'Co najmniej 21 dni przed podjęciem pracy; pracodawca może odmówić z przyczyn organizacyjnych (informacja w 7 dni).', legal: 'art. 182¹e § 2 KP; § 16 rozporządzenia', severity: 'ważny' });
    }
    if (isValidISO(f.birthDate) || isValidISO(f.expectedDueDate)) {
      const dob = isValidISO(f.birthDate) ? f.birthDate : f.expectedDueDate;
      list.push({ id: 'par-limit', date: endOfYearChildTurns(dob, 6), title: 'Koniec okresu na wykorzystanie urlopu rodzicielskiego', description: 'Urlop rodzicielski (maks. 5 części) wykorzystuje się do końca roku, w którym dziecko kończy 6 lat.', legal: 'art. 182¹a § 1 KP', severity: 'informacyjny' });
    }
  }
  const par9 = byKind('RODZICIELSKI_9');
  if (par9) {
    list.push({ id: 'par9-apply', date: addDays(par9.start, -PARENTAL_NOTICE_DAYS), title: 'Wniosek drugiego rodzica o 9 tygodni', description: 'Nieprzenoszalne 9 tygodni — wniosek co najmniej 21 dni przed rozpoczęciem. Niewykorzystane przepadają.', legal: 'art. 182¹a § 3 KP', severity: 'ważny' });
  }

  const last = blocks.filter((b) => b.who !== 'OJCIEC').sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  if (last) {
    if ((p.employment.title === 'JDG' || (p.employment.title === 'ZLECENIE' && !eligibility.isEmployee)) && eligibility.sicknessInsured) {
      list.push({ id: 'zua', date: addDays(last.end, 1), title: 'Ponowne zgłoszenie ZUS ZUA (dobrowolne chorobowe)', description: 'Z chwilą nabycia prawa do zasiłku macierzyńskiego zostałaś wyrejestrowana z dobrowolnego chorobowego. Po zakończeniu zasiłku złóż ZUS ZUA z kodem obejmującym chorobowe — bez tego nie masz ochrony.', legal: 'art. 14 ust. 2 pkt 3 ustawy o sus', severity: 'krytyczny' });
    }
    list.push({ id: 'claim', date: addMonths(last.end, CLAIM_LIMITATION_MONTHS), title: 'Przedawnienie roszczenia o zasiłek', description: 'Prawo do zasiłku za dany dzień przedawnia się po 6 miesiącach — pilnuj złożenia wszystkich wniosków.', legal: 'art. 67 ust. 1 ustawy zasiłkowej', severity: 'informacyjny' });
  }

  return list.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function lastOfKind(blocks: LeaveBlock[], kind: LeaveBlock['kind']): LeaveBlock | undefined {
  return blocks.filter((b) => b.kind === kind).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
}

/** Wiek osoby w dniu odniesienia (pomocniczo dla UI). */
export function personAge(p: Profile, today: string): number | null {
  return isValidISO(p.person.birthDate) ? ageInYears(p.person.birthDate, today) : null;
}

/* ------------------------------------------------------------------ */
/* Szczególne sytuacje: przejęcie urlopu macierzyńskiego przez ojca     */
/* ------------------------------------------------------------------ */

export interface SpecialCaseMeta {
  label: string;
  /** true — matka ma ubezpieczenie chorobowe; false — matka bez tytułu do ubezpieczenia. */
  motherInsured: boolean;
  /** Minimalna liczba tygodni urlopu macierzyńskiego wykorzystanych przez matkę po porodzie. */
  minWeeksAfterBirth: number;
  dateLabel: string;
  endDateLabel?: string;
  legal: string;
  /** Scenariusze z wymagane_dokumenty.json. */
  scenarioIds: string[];
}

export const SPECIAL_CASES: Record<SpecialCase, SpecialCaseMeta> = {
  BRAK: { label: 'Brak — standardowy plan', motherInsured: true, minWeeksAfterBirth: 0, dateLabel: '', legal: LEGAL.art180, scenarioIds: [] },
  REZYGNACJA_PO_14: {
    label: 'Matka wraca do pracy po 14 tygodniach, resztę urlopu bierze ojciec',
    motherInsured: true, minWeeksAfterBirth: 14, dateLabel: 'Data powrotu matki do pracy',
    legal: 'art. 180 § 4, 5 i 8 KP; § 3 i § 5 rozporządzenia z 11.03.2025',
    scenarioIds: ['pracownik_rezygnacja_po_14_tyg', 'ojciec_przejecie_po_rezygnacji'],
  },
  REZYGNACJA_NIEZDOLNOSC_PO_8: {
    label: 'Matka z orzeczeniem o niezdolności do samodzielnej egzystencji rezygnuje po 8 tygodniach',
    motherInsured: true, minWeeksAfterBirth: 8, dateLabel: 'Data powrotu matki do pracy / rezygnacji',
    legal: 'art. 180 § 6 i 8 KP; § 4 i § 5 rozporządzenia z 11.03.2025',
    scenarioIds: ['pracownik_rezygnacja_niezdolnosc_po_8_tyg', 'ojciec_przejecie_po_rezygnacji'],
  },
  MATKA_SZPITAL: {
    label: 'Matka w szpitalu (po co najmniej 8 tygodniach) — ojciec przejmuje urlop na czas pobytu',
    motherInsured: true, minWeeksAfterBirth: 8, dateLabel: 'Data przyjęcia matki do szpitala', endDateLabel: 'Data wyjścia matki ze szpitala',
    legal: 'art. 180 § 10, 11 i 16 KP; § 6–7 rozporządzenia z 11.03.2025',
    scenarioIds: ['ojciec_przejecie_matka_w_szpitalu'],
  },
  ZGON_MATKI: {
    label: 'Zgon matki w trakcie urlopu / zasiłku macierzyńskiego',
    motherInsured: true, minWeeksAfterBirth: 0, dateLabel: 'Data zgonu matki',
    legal: 'art. 180 § 12 i 16 KP; § 8 rozporządzenia z 11.03.2025',
    scenarioIds: ['ojciec_przejecie_zgon_matki'],
  },
  PORZUCENIE: {
    label: 'Porzucenie dziecka przez matkę (po co najmniej 8 tygodniach)',
    motherInsured: true, minWeeksAfterBirth: 8, dateLabel: 'Data porzucenia dziecka',
    legal: 'art. 180 § 13 i 16 KP; § 9 rozporządzenia z 11.03.2025',
    scenarioIds: ['ojciec_przejecie_porzucenie'],
  },
  MATKA_NIEUB_ZGON: {
    label: 'Zgon matki bez ubezpieczenia chorobowego',
    motherInsured: false, minWeeksAfterBirth: 0, dateLabel: 'Data zgonu matki',
    legal: 'art. 180 § 15 pkt 1 KP; § 10 rozporządzenia z 11.03.2025',
    scenarioIds: ['ojciec_matka_nieubezpieczona_zgon'],
  },
  MATKA_NIEUB_PORZUCENIE: {
    label: 'Porzucenie dziecka przez matkę bez ubezpieczenia chorobowego',
    motherInsured: false, minWeeksAfterBirth: 0, dateLabel: 'Data porzucenia dziecka',
    legal: 'art. 180 § 15 pkt 2 KP; § 11 rozporządzenia z 11.03.2025',
    scenarioIds: ['ojciec_matka_nieubezpieczona_porzucenie'],
  },
  MATKA_NIEUB_NIEZDOLNOSC: {
    label: 'Matka bez ubezpieczenia z orzeczeniem o niezdolności do samodzielnej egzystencji',
    motherInsured: false, minWeeksAfterBirth: 0, dateLabel: 'Data, od której ojciec przejmuje opiekę',
    legal: 'art. 180 § 15 pkt 3 KP; § 12 rozporządzenia z 11.03.2025',
    scenarioIds: ['ojciec_matka_nieubezpieczona_niezdolnosc'],
  },
  MATKA_NIEUB_PRACA: {
    label: 'Matka bez tytułu do ubezpieczenia podejmuje pracę na co najmniej ½ etatu',
    motherInsured: false, minWeeksAfterBirth: 0, dateLabel: 'Data podjęcia zatrudnienia przez matkę', endDateLabel: 'Koniec zatrudnienia matki (opcjonalnie)',
    legal: 'art. 180 § 17 KP; § 13 rozporządzenia z 11.03.2025',
    scenarioIds: ['ojciec_matka_nieubezpieczona_podejmuje_prace'],
  },
};

export function isTakeoverByFather(p: Profile): boolean {
  return p.family.specialCase !== 'BRAK' && p.family.situation === 'PO_PORODZIE' && p.family.childOutcome === 'ZYWE';
}

/** Matka bez ubezpieczenia, a zasiłek macierzyński pobiera ubezpieczony ojciec (art. 180 § 15 i 17 KP). */
export function fatherCarriesBenefit(p: Profile): boolean {
  return isTakeoverByFather(p) && !SPECIAL_CASES[p.family.specialCase].motherInsured && p.family.otherParent.insured;
}

function weeksOf(start: string, end: string): number {
  return Math.max(0, (diffDays(start, end) + 1) / 7);
}

function reblock(b: LeaveBlock, patch: Partial<LeaveBlock>): LeaveBlock {
  const n = { ...b, ...patch };
  return { ...n, weeks: weeksOf(n.start, n.end) };
}

/**
 * Przekształca standardowy plan urlopów zgodnie ze szczególną sytuacją:
 * dzieli urlop macierzyński między matkę i ojca, a przy zgonie / porzuceniu albo braku
 * ubezpieczenia matki przenosi na ojca pozostałe urlopy.
 */
export function applySpecialCase(p: Profile, blocks: LeaveBlock[]): LeaveBlock[] {
  if (!isTakeoverByFather(p)) return blocks;
  return fixPaternityOverlap(p, transformSpecialCase(p, blocks));
}

function transformSpecialCase(p: Profile, blocks: LeaveBlock[]): LeaveBlock[] {
  const f = p.family;
  const meta = SPECIAL_CASES[f.specialCase];
  const mat = blocks.find((b) => b.kind === 'MACIERZYNSKI');
  if (!mat) return blocks;
  const birth = mat.start;
  const d = isValidISO(f.specialCaseDate) ? f.specialCaseDate : addDays(birth, meta.minWeeksAfterBirth * 7);
  const from = d < birth ? birth : d > mat.end ? mat.end : d;
  const legal = meta.legal;
  const out: LeaveBlock[] = [];

  if (!meta.motherInsured) {
    // Matka bez ubezpieczenia: nie ma urlopu ani zasiłku. Ojciec przejmuje pozostałą część urlopu macierzyńskiego.
    const endLimit = f.specialCase === 'MATKA_NIEUB_PRACA' && isValidISO(f.specialCaseEndDate) && f.specialCaseEndDate < mat.end ? f.specialCaseEndDate : mat.end;
    out.push(reblock(mat, { id: 'matF', label: 'Urlop macierzyński (część przysługująca ojcu)', who: 'OJCIEC', start: from, end: endLimit, legal }));
    for (const b of blocks) {
      if (b.kind === 'RODZICIELSKI') out.push({ ...b, id: 'parF', who: 'OJCIEC', label: 'Urlop rodzicielski (ojciec; 9 tyg. matki przepada)' });
      if (b.kind === 'OJCOWSKI') out.push(b);
      // RODZICIELSKI_9 pomijamy: ojciec bierze część „matki” (41 − 9), wyłączne 9 tyg. matki przepada.
    }
    return out;
  }

  const motherPart = (end: string): LeaveBlock[] => (end >= birth ? [reblock(mat, { end })] : []);
  for (const b of blocks) {
    if (b.kind !== 'MACIERZYNSKI') {
      out.push(b);
      continue;
    }
    if (f.specialCase === 'MATKA_SZPITAL') {
      const back = isValidISO(f.specialCaseEndDate) && f.specialCaseEndDate > from ? (f.specialCaseEndDate < mat.end ? f.specialCaseEndDate : mat.end) : mat.end;
      out.push(...motherPart(addDays(from, -1)));
      out.push(reblock(mat, { id: 'matF', label: 'Urlop macierzyński — ojciec na czas pobytu matki w szpitalu', who: 'OJCIEC', start: from, end: back, legal }));
      if (back < mat.end) out.push(reblock(mat, { id: 'mat2', label: 'Urlop macierzyński (matka po wyjściu ze szpitala)', start: addDays(back, 1), end: mat.end }));
    } else {
      out.push(...motherPart(addDays(from, -1)));
      out.push(reblock(mat, { id: 'matF', label: 'Urlop macierzyński — pozostała część (ojciec)', who: 'OJCIEC', start: from, end: mat.end, legal }));
    }
  }

  if (f.specialCase === 'ZGON_MATKI' || f.specialCase === 'PORZUCENIE') {
    // Po zgonie / porzuceniu ojciec korzysta także z dalszych urlopów (uzupełniający, rodzicielski).
    const par9 = out.find((b) => b.kind === 'RODZICIELSKI_9');
    return out
      .filter((b) => b.kind !== 'RODZICIELSKI_9')
      .map((b) => {
        if (b.kind === 'UZUPELNIAJACY') return { ...b, who: 'OJCIEC' as const, label: 'Uzupełniający urlop macierzyński (ojciec)' };
        if (b.kind === 'RODZICIELSKI') return reblock(b, { who: 'OJCIEC', label: 'Urlop rodzicielski (ojciec)', end: par9 ? par9.end : b.end });
        return b;
      });
  }
  return out;
}

/**
 * Urlop ojcowski nie może nakładać się na inny urlop ojca (np. przejętą część macierzyńskiego).
 * Przesuwamy go przed ten urlop, a gdy się nie da — tuż po ostatnim urlopie ojca (do 12. miesiąca życia dziecka).
 */
function fixPaternityOverlap(p: Profile, blocks: LeaveBlock[]): LeaveBlock[] {
  const pat = blocks.find((b) => b.kind === 'OJCOWSKI');
  if (!pat) return blocks;
  const others = blocks.filter((b) => b.who === 'OJCIEC' && b !== pat).sort((a, b) => (a.start < b.start ? -1 : 1));
  const overlaps = (s: string, e: string) => others.some((o) => s <= o.end && e >= o.start);
  if (!overlaps(pat.start, pat.end)) return blocks;
  const len = PATERNITY.weeks * 7;
  const first = others[0];
  const earliest = pat.start; // najwcześniejszy możliwy start wyliczony wcześniej (poród albo dziś + 7 dni)
  const limit = isValidISO(p.family.birthDate) ? addDays(addMonths(p.family.birthDate, PATERNITY.childAgeMonths), -1) : '9999-12-31';
  // Kandydaci: tuż przed pierwszym urlopem ojca albo tuż po każdym z jego urlopów (pierwsza wolna luka).
  const candidates = [addDays(first.start, -len), ...others.map((o) => addDays(o.end, 1))];
  const start = candidates.find((c) => c >= earliest && addDays(c, len - 1) <= limit && !overlaps(c, addDays(c, len - 1))) ?? null;
  if (!start) return blocks.filter((b) => b !== pat);
  const moved = { ...pat, start, end: addDays(start, len - 1) };
  return blocks.map((b) => (b === pat ? moved : b));
}

/** Walidacja daty szczególnej sytuacji (np. rezygnacja możliwa dopiero po 14 / 8 tygodniach). */
export function specialCaseIssues(p: Profile): string[] {
  if (!isTakeoverByFather(p)) return [];
  const f = p.family;
  const meta = SPECIAL_CASES[f.specialCase];
  const issues: string[] = [];
  if (!isValidISO(f.birthDate)) issues.push('Podaj datę porodu.');
  if (!isValidISO(f.specialCaseDate)) issues.push(`Podaj: ${meta.dateLabel.toLowerCase()}. Do czasu podania przyjmujemy najwcześniejszy dopuszczalny termin.`);
  if (isValidISO(f.birthDate) && isValidISO(f.specialCaseDate)) {
    const earliest = addDays(f.birthDate, meta.minWeeksAfterBirth * 7);
    if (f.specialCaseDate < earliest) issues.push(`Najwcześniej możliwe dopiero ${formatPL(earliest)} — po wykorzystaniu ${meta.minWeeksAfterBirth} tygodni urlopu macierzyńskiego po porodzie.`);
  }
  if (meta.motherInsured && p.employment.title === 'NIEUBEZPIECZONY') issues.push('Ta sytuacja dotyczy matki z ubezpieczeniem chorobowym. Dla matki bez ubezpieczenia wybierz wariant „bez ubezpieczenia”.');
  if (!meta.motherInsured && p.employment.title !== 'NIEUBEZPIECZONY') issues.push('Ta sytuacja dotyczy matki bez tytułu do ubezpieczenia — w kroku 1 wybierz „Brak ubezpieczenia”.');
  if (!f.otherParent.insured) issues.push('Ojciec musi mieć ubezpieczenie chorobowe (np. umowę o pracę), aby przejąć urlop i zasiłek.');
  return issues;
}
