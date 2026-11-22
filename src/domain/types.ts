/** Model domenowy profilu rodzica / ubezpieczonego. Daty jako ISO `YYYY-MM-DD`. */

export type InsuranceTitle = 'UOP' | 'ZLECENIE' | 'JDG' | 'NIEUBEZPIECZONY';
export type JdgVariant = 'ULGA_NA_START' | 'PREFERENCYJNY' | 'MALY_ZUS_PLUS' | 'DUZY_ZUS';
export type ContractType = 'NIEOKRESLONY' | 'OKRESLONY' | 'PROBNY' | 'ZASTEPSTWO';
/** Ustanie umowy o pracę w czasie ciąży (art. 30 ustawy zasiłkowej). */
export type PregnancyTermination = 'BRAK' | 'UPADLOSC_LIKWIDACJA' | 'SMIERC_PRACODAWCY' | 'NARUSZENIE_PRAWA';
export type FamilySituation = 'CIAZA' | 'PO_PORODZIE' | 'ADOPCJA' | 'RODZINA_ZASTEPCZA';
export type ChildOutcome = 'ZYWE' | 'MARTWE' | 'ZGON_PRZED_8_TYG' | 'ZGON_PO_8_TYG';
export type DocumentOrigin = 'PL' | 'UE_EFTA_UK' | 'INNE';
/**
 * Szczególne sytuacje z rozporządzenia z 11.03.2025 (§ 3–13) i art. 180 § 4–17 KP:
 * przejęcie części urlopu macierzyńskiego przez ojca (lub innego członka najbliższej rodziny).
 */
export type SpecialCase =
  | 'BRAK'
  | 'REZYGNACJA_PO_14'
  | 'REZYGNACJA_NIEZDOLNOSC_PO_8'
  | 'MATKA_SZPITAL'
  | 'ZGON_MATKI'
  | 'PORZUCENIE'
  | 'MATKA_NIEUB_ZGON'
  | 'MATKA_NIEUB_PORZUCENIE'
  | 'MATKA_NIEUB_NIEZDOLNOSC'
  | 'MATKA_NIEUB_PRACA';
export type PaymentVariant = 'USREDNIONY' | 'ZMIENNY';
export type CareReason =
  | 'CHORE_DZIECKO_DO_14'
  | 'ZAMKNIECIE_PLACOWKI'
  | 'PORÓD_LUB_SZPITAL_OPIEKUNA'
  | 'CHORE_DZIECKO_NIEPELNOSPRAWNE_14_18'
  | 'CHORE_DZIECKO_POWYZEJ_14'
  | 'INNY_CZLONEK_RODZINY';

/** Jeden pełny miesiąc kalendarzowy w okresie referencyjnym (pracownik). */
export interface SalaryMonth {
  /** `YYYY-MM` */
  month: string;
  /** Składniki stałe wypłacone faktycznie. */
  fixedPaid: number;
  /** Składniki stałe należne za pełny miesiąc (z umowy) — do uzupełnienia (art. 38 ust. 2). */
  fixedContract: number;
  /** Składniki zmienne wypłacone faktycznie. */
  variablePaid: number;
  /** Dni robocze obowiązujące w miesiącu. */
  requiredDays: number;
  /** Dni faktycznie przepracowane. */
  workedDays: number;
}

export interface Profile {
  person: {
    firstName: string;
    lastName: string;
    pesel: string;
    address: string;
    birthDate: string;
    isStudentUnder26: boolean;
  };
  employment: {
    title: InsuranceTitle;
    /** Liczba osób zgłoszonych do ubezp. chorobowego u płatnika (stan na 30.11 roku poprzedniego). */
    insuredAtPayer: number;
    employerName: string;
    insuranceStart: string;
    contractType: ContractType;
    contractEnd: string;
    fullTimeFraction: number;
    /** Zleceniobiorca: zgłoszenie do dobrowolnego chorobowego. JDG: opłacanie dobrowolnej składki. */
    voluntarySickness: boolean;
    /** Zleceniobiorca: czy zgłoszenie do ubezpieczeń nastąpiło w terminie 7 dni. */
    reportedWithin7Days: boolean;
    /** Zbieg: zlecenie + UoP u innego pracodawcy. */
    concurrentUop: boolean;
    concurrentUopSalary: number;
    jdgVariant: JdgVariant;
    jdgStart: string;
    previousYearRevenue: number;
    previousYearActivityDays: number;
    malyZusPlusMonthsUsed: number;
    contributionDebt: number;
    /** Wyjątki od okresu wyczekiwania (art. 4 ust. 2 ustawy zasiłkowej). */
    graduateWithin90Days: boolean;
    priorMandatory10Years: boolean;
    commuteAccident: boolean;
    /** Czy umowa o pracę ustała w czasie ciąży i z jakiej przyczyny (art. 30 ustawy zasiłkowej). */
    pregnancyTermination: PregnancyTermination;
    /** Data ustania umowy o pracę. */
    terminationDate: string;
  };
  family: {
    situation: FamilySituation;
    expectedDueDate: string;
    birthDate: string;
    childrenCount: number;
    childOutcome: ChildOutcome;
    childDeathDate: string;
    pregnancyWeekAtBirth: number;
    birthWeightGrams: number;
    /** Łączna liczba dni pobytu dziecka w szpitalu (sumowane, art. 180² § 2). */
    childHospitalDays: number;
    /** Dzień po porodzie, w którym rozpoczęła się hospitalizacja (dla dziecka donoszonego). */
    childHospitalStartDay: number;
    zaZyciem: boolean;
    /** Adopcja / rodzina zastępcza. */
    childAgeYears: number;
    schoolDeferral: boolean;
    adoptionDate: string;
    prenatalWeeks: number;
    documentsOrigin: DocumentOrigin;
    /** Szczególna sytuacja (przejęcie urlopu przez ojca / matka bez ubezpieczenia). */
    specialCase: SpecialCase;
    /** Data zdarzenia: powrót matki do pracy, przyjęcie do szpitala, zgon, porzucenie, podjęcie pracy przez matkę. */
    specialCaseDate: string;
    /** Data końca: wyjście matki ze szpitala / koniec zatrudnienia matki (opcjonalnie). */
    specialCaseEndDate: string;
    /** Prawomocne postanowienie o przysposobieniu (urlop ojcowski przy adopcji). */
    adoptionFinalized: boolean;
    /** Rodzic rozważa urlop wychowawczy (informacja — bez zasiłku macierzyńskiego). */
    considersChildcareLeave: boolean;
    motherIncapacityOrHospital: boolean;
    otherParent: {
      name: string;
      insured: boolean;
      title: InsuranceTitle;
      monthlyBase: number;
      takesPaternity: boolean;
      takesNineWeeks: boolean;
    };
  };
  salary: {
    months: SalaryMonth[];
    /** Premie kwartalne wypłacone za 4 ostatnie kwartały. */
    quarterlyBonuses: [number, number, number, number];
    annualBonus: number;
    /** Niepracownik: zadeklarowane podstawy wymiaru składki chorobowej za pełne miesiące (najnowsze na końcu). */
    declaredBases: number[];
    /** Niepracownik: najniższa podstawa obowiązująca w tych miesiącach. */
    minimumBases: number[];
    /** Art. 43 — ciągłość: przerwa między L4 w ciąży a zasiłkiem macierzyńskim krótsza niż pełny miesiąc. */
    continuousWithPregnancySickLeave: boolean;
    usePit2: boolean;
  };
  plan: {
    variant: PaymentVariant;
    /** Wymiar etatu przy łączeniu urlopu rodzicielskiego z pracą (0–0,5). */
    partTimeFraction: number;
    /** Liczba tygodni rodzicielskiego, przez które matka łączy urlop z pracą. */
    partTimeWeeks: number;
    /** Art. 182¹f § 7 — łączenie z pracą także części powstałej z wydłużenia. */
    combineExtension: boolean;
    sickLeavePregnancyDays: number;
    /** Dni wynagrodzenia chorobowego wykorzystane już w roku kalendarzowym. */
    sickDaysUsedThisYear: number;
    /** Kod B na e-ZLA. */
    codeB: boolean;
    /** Symulacja: nie wykorzystano żadnego dnia rodzicielskiego w 1. roku życia (art. 31 ust. 4). */
    simulateNoParentalFirstYear: boolean;
    /** Porównanie „co tracisz bez ubezpieczenia”: wynagrodzenie brutto na hipotetycznej umowie o pracę. */
    hypotheticalSalary: number;
  };
  care: {
    reason: CareReason;
    childAgeYears: number;
    daysRequested: number;
    /** Dni zasiłku opiekuńczego już wykorzystane w roku przez rodzinę, wg puli. */
    usedPool60: number;
    usedPool30: number;
    usedPool14: number;
    facilityNoticeDays: number;
    otherCarerAvailable: boolean;
  };
}

export type Payer = 'ZUS' | 'PLATNIK';

export interface Eligibility {
  sicknessInsured: boolean;
  sicknessMandatory: boolean;
  payer: Payer;
  payerReason: string;
  waitingPeriodDays: number;
  waitingPeriodWaived: string | null;
  waitingPeriodSatisfied: boolean;
  insuredDays: number;
  maternityEligible: boolean;
  careEligible: boolean;
  sicknessEligible: boolean;
  blockedByDebt: boolean;
  isEmployee: boolean;
  isOver50: boolean;
  notes: Note[];
}

export interface Note {
  text: string;
  legal: string;
}

export interface LeaveBlock {
  id: string;
  label: string;
  who: 'MATKA' | 'OJCIEC' | 'RODZIC';
  kind: 'PRZED_PORODEM' | 'MACIERZYNSKI' | 'UZUPELNIAJACY' | 'RODZICIELSKI' | 'RODZICIELSKI_9' | 'OJCOWSKI' | 'NA_WARUNKACH';
  start: string;
  end: string;
  weeks: number;
  rate: number;
  legal: string;
}

export interface Deadline {
  id: string;
  date: string;
  title: string;
  description: string;
  legal: string;
  severity: 'krytyczny' | 'ważny' | 'informacyjny';
}

export interface BaseBreakdown {
  base: number;
  method: string;
  legal: string;
  steps: string[];
  includedMonths: number;
  excludedMonths: string[];
  cappedAtMax: boolean;
  raisedToMinimum: boolean;
}
