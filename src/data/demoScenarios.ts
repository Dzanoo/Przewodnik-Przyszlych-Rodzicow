/** Predefiniowane scenariusze „One-Click Demo” dla jury + profil domyślny. Daty liczone względem dnia uruchomienia. */
import { JDG_BASES_2026 } from '../domain/constants2026';
import { addDays, addMonths, shiftMonth } from '../domain/dateUtils';
import type { Profile, SalaryMonth } from '../domain/types';

/** 12 miesięcy referencyjnych kończących się na miesiącu poprzedzającym zdarzenie. */
export function buildSalaryMonths(eventISO: string, count: number, fixed: number, variable: number): SalaryMonth[] {
  const lastMonth = shiftMonth(eventISO.slice(0, 7), -1);
  return Array.from({ length: count }, (_, i) => ({
    month: shiftMonth(lastMonth, i - count + 1),
    fixedPaid: fixed,
    fixedContract: fixed,
    variablePaid: variable,
    requiredDays: 21,
    workedDays: 21,
  }));
}

export function createDefaultProfile(today: string): Profile {
  const due = addDays(today, 60);
  return {
    person: { firstName: 'Anna', lastName: 'Kowalska', pesel: '', address: 'Warszawa', birthDate: '1993-05-14', isStudentUnder26: false },
    employment: {
      title: 'UOP',
      insuredAtPayer: 45,
      employerName: 'Przykładowa Sp. z o.o.',
      insuranceStart: addMonths(today, -30),
      contractType: 'NIEOKRESLONY',
      contractEnd: '',
      fullTimeFraction: 1,
      voluntarySickness: true,
      reportedWithin7Days: true,
      concurrentUop: false,
      concurrentUopSalary: 0,
      jdgVariant: 'DUZY_ZUS',
      jdgStart: '',
      previousYearRevenue: 0,
      previousYearActivityDays: 365,
      malyZusPlusMonthsUsed: 0,
      contributionDebt: 0,
      graduateWithin90Days: false,
      priorMandatory10Years: false,
      commuteAccident: false,
      pregnancyTermination: 'BRAK',
      terminationDate: '',
    },
    family: {
      situation: 'CIAZA',
      expectedDueDate: due,
      birthDate: '',
      childrenCount: 1,
      childOutcome: 'ZYWE',
      childDeathDate: '',
      pregnancyWeekAtBirth: 39,
      birthWeightGrams: 3400,
      childHospitalDays: 0,
      childHospitalStartDay: 1,
      zaZyciem: false,
      childAgeYears: 0,
      schoolDeferral: false,
      adoptionDate: '',
      prenatalWeeks: 0,
      documentsOrigin: 'PL',
      specialCase: 'BRAK',
      specialCaseDate: '',
      specialCaseEndDate: '',
      adoptionFinalized: false,
      considersChildcareLeave: false,
      motherIncapacityOrHospital: false,
      otherParent: { name: 'Piotr Kowalski', insured: true, title: 'UOP', monthlyBase: 6000, takesPaternity: true, takesNineWeeks: true },
    },
    salary: {
      months: buildSalaryMonths(due, 12, 7000, 0),
      quarterlyBonuses: [0, 0, 0, 0],
      annualBonus: 0,
      declaredBases: [],
      minimumBases: [],
      continuousWithPregnancySickLeave: true,
      usePit2: true,
    },
    plan: {
      variant: 'USREDNIONY',
      partTimeFraction: 0,
      partTimeWeeks: 0,
      combineExtension: true,
      sickLeavePregnancyDays: 0,
      sickDaysUsedThisYear: 0,
      codeB: true,
      simulateNoParentalFirstYear: false,
      hypotheticalSalary: 4806,
    },
    care: {
      reason: 'CHORE_DZIECKO_DO_14',
      childAgeYears: 3,
      daysRequested: 0,
      usedPool60: 0,
      usedPool30: 0,
      usedPool14: 0,
      facilityNoticeDays: 1,
      otherCarerAvailable: false,
    },
  };
}

export interface DemoScenario {
  id: string;
  short: string;
  title: string;
  description: string;
  build: (today: string) => Profile;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'preterm',
    short: 'Wcześniak 27 tc.',
    title: 'Pracownica UoP (duża firma) — wcześniak z 27. tygodnia, 12 tyg. hospitalizacji, premia kwartalna',
    description: 'Płatnik > 20 osób, uzupełniający urlop macierzyński do 15 tyg., niepełne miesiące (art. 38) i premie kwartalne (art. 42).',
    build: (today) => {
      const p = createDefaultProfile(today);
      const birth = addDays(today, -10);
      const months = buildSalaryMonths(birth, 12, 8200, 600);
      months[7] = { ...months[7], fixedPaid: 4300, workedDays: 11, variablePaid: 310 }; // ≥ połowy → uzupełnienie
      months[10] = { ...months[10], fixedPaid: 2700, workedDays: 7, variablePaid: 150 }; // < połowy → wyłączony
      return {
        ...p,
        person: { ...p.person, firstName: 'Magdalena', lastName: 'Nowak', birthDate: '1990-03-02' },
        employment: { ...p.employment, insuredAtPayer: 240, employerName: 'TechBud S.A.' },
        family: {
          ...p.family,
          situation: 'PO_PORODZIE',
          birthDate: birth,
          expectedDueDate: addDays(birth, 13 * 7),
          pregnancyWeekAtBirth: 27,
          birthWeightGrams: 980,
          childHospitalDays: 84,
          childHospitalStartDay: 1,
          otherParent: { ...p.family.otherParent, name: 'Tomasz Nowak', monthlyBase: 7400 },
        },
        salary: { ...p.salary, months, quarterlyBonuses: [2500, 2500, 3000, 2800] },
      };
    },
  },
  {
    id: 'jdg48a',
    short: 'JDG Mały ZUS+',
    title: 'Przedsiębiorczyni JDG (mały ZUS+) — wysoka podstawa opłacana przez 5 miesięcy',
    description: 'Algorytm art. 48a: najniższa podstawa + 1/12 nadwyżki za każdy pełny miesiąc. Ryzyko ZUS ZUA i zadłużenia.',
    build: (today) => {
      const p = createDefaultProfile(today);
      const due = addDays(today, 35);
      const min = JDG_BASES_2026.preferentialMin;
      return {
        ...p,
        person: { ...p.person, firstName: 'Karolina', lastName: 'Wiśniewska', birthDate: '1991-08-20' },
        employment: {
          ...p.employment,
          title: 'JDG',
          jdgVariant: 'MALY_ZUS_PLUS',
          insuredAtPayer: 1,
          employerName: 'Karolina Wiśniewska Design',
          insuranceStart: addMonths(due, -5),
          jdgStart: '2023-02-01',
          previousYearRevenue: 96000,
          voluntarySickness: true,
          contributionDebt: 31.5,
        },
        family: { ...p.family, expectedDueDate: due, prenatalWeeks: 2, otherParent: { ...p.family.otherParent, name: 'Michał Wiśniewski', monthlyBase: 5600 } },
        salary: { ...p.salary, months: [], declaredBases: [15000, 15000, 15000, 15000, 15000], minimumBases: [min, min, min, min, min] },
        plan: { ...p.plan, variant: 'ZMIENNY' },
      };
    },
  },
  {
    id: 'shared',
    short: 'Podział opieki',
    title: 'Rodzice dzielący opiekę — 81,5% vs 100%/70%, 9 tyg. ojca + praca na 1/2 etatu',
    description: 'Mały pracodawca (płatnikiem ZUS), łączenie urlopu z pracą (art. 182¹f § 2 i § 7) i nieprzenoszalne 9 tygodni.',
    build: (today) => {
      const p = createDefaultProfile(today);
      const birth = addDays(today, -6);
      return {
        ...p,
        person: { ...p.person, firstName: 'Ewa', lastName: 'Zielińska', birthDate: '1989-11-11' },
        employment: { ...p.employment, insuredAtPayer: 12, employerName: 'Biuro Rachunkowe Zieliński' },
        family: { ...p.family, situation: 'PO_PORODZIE', birthDate: birth, expectedDueDate: addDays(birth, 3), otherParent: { ...p.family.otherParent, name: 'Adam Zieliński', monthlyBase: 9800 } },
        salary: { ...p.salary, months: buildSalaryMonths(birth, 12, 10500, 0), annualBonus: 6000 },
        plan: { ...p.plan, variant: 'USREDNIONY', partTimeFraction: 0.5, partTimeWeeks: 16, combineExtension: true },
      };
    },
  },
  {
    id: 'zlecenie',
    short: 'Zlecenie + UoP',
    title: 'Zleceniobiorczyni w zbiegu z umową o pracę + zasiłek opiekuńczy przy zamknięciu żłobka',
    description: 'UoP ≥ płaca minimalna wyłącza ubezpieczenia ze zlecenia; opiekuńczy 80% przy nagłym zamknięciu placówki.',
    build: (today) => {
      const p = createDefaultProfile(today);
      const due = addDays(today, 150);
      return {
        ...p,
        person: { ...p.person, firstName: 'Joanna', lastName: 'Lewandowska', birthDate: '1995-01-30' },
        employment: { ...p.employment, title: 'ZLECENIE', concurrentUop: true, concurrentUopSalary: 5400, insuredAtPayer: 8, employerName: 'Sklep Pod Lipami s.c.', voluntarySickness: false },
        family: { ...p.family, expectedDueDate: due, otherParent: { ...p.family.otherParent, name: 'Krzysztof Lewandowski', monthlyBase: 6200 } },
        salary: { ...p.salary, months: buildSalaryMonths(today, 12, 5400, 0) },
        plan: { ...p.plan, sickLeavePregnancyDays: 45, sickDaysUsedThisYear: 6 },
        care: { ...p.care, reason: 'ZAMKNIECIE_PLACOWKI', childAgeYears: 2, daysRequested: 5, usedPool60: 12, facilityNoticeDays: 2 },
      };
    },
  },
  {
    id: 'takeover',
    short: 'Ojciec przejmuje',
    title: 'Mama wraca do pracy po 14 tygodniach — resztę urlopu macierzyńskiego bierze tata',
    description: 'Rezygnacja matki (art. 180 § 4 KP, § 3 rozporządzenia) i wniosek ojca (§ 5). Zasiłek ojca od jego podstawy.',
    build: (today) => {
      const p = createDefaultProfile(today);
      const birth = addDays(today, -95);
      return {
        ...p,
        person: { ...p.person, firstName: 'Natalia', lastName: 'Kamińska', birthDate: '1992-06-03' },
        employment: { ...p.employment, insuredAtPayer: 14, employerName: 'Kancelaria Kamińska i Wspólnicy' },
        family: {
          ...p.family,
          situation: 'PO_PORODZIE',
          birthDate: birth,
          expectedDueDate: addDays(birth, 2),
          specialCase: 'REZYGNACJA_PO_14',
          specialCaseDate: addDays(today, 14),
          otherParent: { ...p.family.otherParent, name: 'Marek Kamiński', monthlyBase: 8600 },
        },
        salary: { ...p.salary, months: buildSalaryMonths(birth, 12, 9200, 0) },
        plan: { ...p.plan, variant: 'ZMIENNY' },
      };
    },
  },
];
