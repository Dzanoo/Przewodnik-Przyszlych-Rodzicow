/**
 * Dobór scenariuszy wniosków i dokumentów oraz generowanie treści wniosków na podstawie profilu.
 * Scenariusze i katalog dokumentów pochodzą z `wymagane_dokumenty.json`
 * (Rozporządzenie MRPiPS z 11.03.2025, Dz.U. 2025 poz. 322; KP art. 180–183; Poradnik ZUS 2026).
 */
import { DOCUMENTS, SCENARIO_BY_ID, docName, type DocumentId, type RequirementScenario } from '../data/requiredDocuments';
import { LEGAL } from './constants2026';
import { addDays, formatPL, isValidISO } from './dateUtils';
import { SPECIAL_CASES, buildTimeline, effectivePartTimeWeeks, isAdoption, isTakeoverByFather, supplementaryLeave } from './eligibilityEngine';
import type { Eligibility, LeaveBlock, Profile } from './types';

export type Destination = 'PRACODAWCA' | 'PRACODAWCA_OJCA' | 'ZUS' | 'LEKARZ';
export type Applicant = 'MATKA' | 'OJCIEC';

export const DESTINATION_LABELS: Record<Destination, { title: string; desc: string }> = {
  PRACODAWCA: { title: 'Składasz u swojego pracodawcy / zleceniodawcy', desc: 'Wnioski i oświadczenia w postaci papierowej lub elektronicznej.' },
  PRACODAWCA_OJCA: { title: 'Składa drugi rodzic u swojego pracodawcy', desc: 'Wnioski ojca (lub innego członka najbliższej rodziny).' },
  ZUS: { title: 'Przekazywane do ZUS (eZUS / PUE)', desc: 'Formularze zasiłkowe, gdy płatnikiem jest ZUS lub gdy prowadzisz działalność.' },
  LEKARZ: { title: 'Wystawia lekarz', desc: 'Trafia do ZUS i płatnika automatycznie.' },
};

/** Scenariusz wniosku z JSON dopasowany do profilu. */
export interface ApplicableScenario {
  scenario: RequirementScenario;
  applicant: Applicant;
  destination: Destination;
  /** Dokumenty warunkowe, których warunek jest spełniony. */
  conditional: { warunek: string; dokumenty: string[] }[];
  deadline?: string;
}

export interface ChecklistItem {
  id: string;
  docId: DocumentId;
  name: string;
  destination: Destination;
  /** Wnioski, do których dokument jest potrzebny. */
  reasons: string[];
  legal?: string;
  /** Zwolnienie z obowiązku dostarczenia (z uzasadnieniem). */
  waived?: string;
  note?: string;
  /** Wystarczy jeden z dokumentów w grupie. */
  oneOf?: string;
}

const lastOf = (blocks: LeaveBlock[], kind: LeaveBlock['kind']) => blocks.filter((b) => b.kind === kind).sort((a, b) => (a.end < b.end ? 1 : -1))[0];

/** Czy matka składa wnioski jako pracownica (rozporządzenie z 11.03.2025 dotyczy tylko pracowników). */
function motherIsEmployee(e: Eligibility): boolean {
  return e.isEmployee && e.sicknessInsured;
}

export function applicableScenarios(p: Profile, e: Eligibility, today: string): ApplicableScenario[] {
  const f = p.family;
  const blocks = buildTimeline(p, today);
  const out: ApplicableScenario[] = [];
  const employee = motherIsEmployee(e);
  const motherDest: Destination = p.employment.title === 'JDG' ? 'ZUS' : 'PRACODAWCA';
  const fatherIsEmployee = f.otherParent.insured && f.otherParent.title === 'UOP';
  const add = (id: string, applicant: Applicant, destination: Destination, deadline?: string) => {
    const scenario = SCENARIO_BY_ID[id];
    if (!scenario || out.some((o) => o.scenario.id === id && o.applicant === applicant)) return;
    const conditional = (scenario.dokumenty_warunkowe ?? []).filter((c) => conditionMet(p, c.warunek, blocks));
    out.push({ scenario, applicant, destination, conditional, deadline });
  };

  const pre = blocks.find((b) => b.kind === 'PRZED_PORODEM');
  const supBlock = blocks.find((b) => b.kind === 'UZUPELNIAJACY');
  const matEnd = lastOf(blocks, 'MACIERZYNSKI')?.end;
  const par = blocks.find((b) => b.kind === 'RODZICIELSKI');
  const par9 = blocks.find((b) => b.kind === 'RODZICIELSKI_9');
  const pat = blocks.find((b) => b.kind === 'OJCOWSKI');
  const matF = blocks.find((b) => b.id === 'matF');

  if (isAdoption(p)) {
    if (employee) add('pracownik_na_warunkach_macierzynskiego', 'MATKA', 'PRACODAWCA', isValidISO(f.adoptionDate) ? addDays(f.adoptionDate, 7) : undefined);
  } else if (f.childOutcome === 'ZYWE') {
    if (employee) {
      if (pre) add('pracownik_macierzynski_przed_porodem', 'MATKA', 'PRACODAWCA', addDays(pre.start, -14));
      if (blocks.some((b) => b.kind === 'MACIERZYNSKI' && b.who === 'MATKA')) add('pracownik_macierzynski_po_porodzie', 'MATKA', 'PRACODAWCA', isValidISO(f.birthDate) ? addDays(f.birthDate, 21) : undefined);
    }
  }
  // Martwe urodzenie / zgon dziecka (art. 180¹ KP) — te same zasady dla pracownicy i ubezpieczonej z innego tytułu.
  if (!isAdoption(p) && e.sicknessInsured && f.childOutcome !== 'ZYWE') {
    add(f.childOutcome === 'ZGON_PO_8_TYG' ? 'zgon_dziecka_po_8_tyg' : 'martwe_urodzenie_lub_zgon_do_8_tyg', 'MATKA', employee ? 'PRACODAWCA' : motherDest);
  }
  if (!employee && e.sicknessInsured && f.childOutcome === 'ZYWE') {
    add(p.employment.title === 'JDG' ? 'nie_pracownik_dzialalnosc' : 'nie_pracownik_umowa_cywilnoprawna', 'MATKA', motherDest);
  }

  // Szczególne sytuacje — wnioski matki (rezygnacja) i ojca (przejęcie).
  if (isTakeoverByFather(p)) {
    for (const id of SPECIAL_CASES[f.specialCase].scenarioIds) {
      if (id.startsWith('pracownik_')) {
        if (employee) add(id, 'MATKA', 'PRACODAWCA', matF ? addDays(matF.start, -7) : undefined);
      } else {
        const d = matF ? (id === 'ojciec_przejecie_po_rezygnacji' || id === 'ojciec_matka_nieubezpieczona_podejmuje_prace' ? addDays(matF.start, -14) : matF.start) : undefined;
        add(id, 'OJCIEC', 'PRACODAWCA_OJCA', d);
      }
    }
  }

  if (supBlock && matEnd) {
    const applicant: Applicant = supBlock.who === 'OJCIEC' ? 'OJCIEC' : 'MATKA';
    if (applicant === 'OJCIEC' || employee) add('pracownik_uzupelniajacy', applicant, applicant === 'OJCIEC' ? 'PRACODAWCA_OJCA' : 'PRACODAWCA', addDays(matEnd, -21));
  }
  if (par) {
    if (par.who === 'OJCIEC') {
      if (fatherIsEmployee) add('pracownik_rodzicielski', 'OJCIEC', 'PRACODAWCA_OJCA', addDays(par.start, -21));
    } else if (employee) {
      add('pracownik_rodzicielski', 'MATKA', 'PRACODAWCA', addDays(par.start, -21));
      if (effectivePartTimeWeeks(p) > 0) add('pracownik_rodzicielski_z_praca', 'MATKA', 'PRACODAWCA', addDays(par.start, -21));
    }
  }
  if (par9 && fatherIsEmployee) add('pracownik_rodzicielski', 'OJCIEC', 'PRACODAWCA_OJCA', addDays(par9.start, -21));
  if (pat && fatherIsEmployee) add('pracownik_ojcowski', 'OJCIEC', 'PRACODAWCA_OJCA', addDays(pat.start, -7));
  if (isAdoption(p) && fatherIsEmployee && f.otherParent.takesPaternity) add('pracownik_ojcowski', 'OJCIEC', 'PRACODAWCA_OJCA');
  return out;
}

/** Ocena warunków z pola `dokumenty_warunkowe` (tekst z JSON → reguła). */
function conditionMet(p: Profile, warunek: string, blocks: LeaveBlock[]): boolean {
  const w = warunek.toLowerCase();
  if (w.includes('urodziło się martwe')) return p.family.childOutcome === 'MARTWE';
  if (w.includes('żywe i zmarło')) return p.family.childOutcome === 'ZGON_PRZED_8_TYG' || p.family.childOutcome === 'ZGON_PO_8_TYG';
  if (w.includes('za życiem')) return p.family.zaZyciem;
  if (w.includes('przyjęte na wychowanie')) return isAdoption(p);
  if (w.includes('odroczony obowiązek')) return p.family.schoolDeferral;
  if (w.includes('przysposobione')) return p.family.situation === 'ADOPCJA';
  if (w.includes('przed porodem')) return blocks.some((b) => b.kind === 'PRZED_PORODEM');
  return false;
}

export function buildChecklist(p: Profile, e: Eligibility, today: string): ChecklistItem[] {
  const f = p.family;
  const items = new Map<string, ChecklistItem>();
  const scenarios = applicableScenarios(p, e, today);
  const zusIsPayer = e.payer === 'ZUS';

  const put = (docId: string, destination: Destination, reason: string, extra: Partial<ChecklistItem> = {}) => {
    const key = `${docId}|${destination}`;
    const existing = items.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    const d = DOCUMENTS[docId];
    items.set(key, { id: key, docId, name: d?.name ?? docId, destination, reasons: [reason], legal: d?.legal, note: d?.note, ...extra });
  };

  for (const a of scenarios) {
    const reason = `${a.scenario.nazwa}${a.applicant === 'OJCIEC' ? ' (wniosek ojca)' : ''}`;
    for (const docId of a.scenario.dokumenty) put(docId, a.destination, reason);
    for (const c of a.conditional) for (const docId of c.dokumenty) put(docId, a.destination, `${reason} — ${c.warunek}`);
    for (const group of a.scenario.dokumenty_jeden_z ?? []) {
      const label = group.map(docName).join(' albo ');
      for (const docId of group) put(docId, a.destination, reason, { oneOf: `Wystarczy jeden: ${label}` });
    }
  }

  // Zwolnienia i uproszczenia dla odpisu aktu urodzenia.
  for (const it of items.values()) {
    if (it.docId !== 'akt_urodzenia') continue;
    if (it.destination === 'ZUS' || (it.destination === 'PRACODAWCA' && zusIsPayer)) {
      it.waived = 'Płatnikiem jest ZUS — wystarczy podać PESEL, datę i miejsce urodzenia dziecka; ZUS sam pobierze odpis z rejestru stanu cywilnego (§ 13 ust. 2–3 rozporządzenia z 27.09.2026).';
    } else if (it.destination === 'PRACODAWCA') {
      it.note = 'Przy zasiłku po porodzie wystarczy okazać odpis pracodawcy do wglądu. Jeśli jest już w aktach osobowych, nie dołączasz go ponownie (§ 22).';
    } else if (it.destination === 'PRACODAWCA_OJCA') {
      it.note = 'Jeśli ojciec złożył już odpis (np. z wnioskiem o urlop ojcowski), nie dołącza go ponownie — jest w jego aktach osobowych (§ 22).';
    }
  }

  // Dokumenty spoza rozporządzenia (ścieżka zasiłkowa ZUS).
  if (e.sicknessInsured) {
    if (f.situation === 'CIAZA' && p.plan.sickLeavePregnancyDays > 0) {
      put('e_zla', 'LEKARZ', 'Zwolnienie w ciąży', { note: 'Poproś lekarza o kod B (100% i okres 270 dni). Na pisemny wniosek lekarz może kodu B nie wpisać.' });
    }
    if (motherIsEmployee(e) && zusIsPayer) put('zus_z3', 'ZUS', 'Pracodawca (≤ 20 ubezpieczonych) przekazuje Z-3 do ZUS — Ty dostarczasz tylko wnioski');
    if (!e.isEmployee && p.employment.title === 'ZLECENIE' && zusIsPayer) put('zus_z3a', 'ZUS', 'Zleceniodawca (≤ 20 ubezpieczonych) przekazuje Z-3a do ZUS — Ty składasz wniosek u zleceniodawcy');
    if (p.employment.title === 'JDG' && f.situation === 'CIAZA' && p.plan.sickLeavePregnancyDays > 0) put('zus_zas53', 'ZUS', 'Zasiłek chorobowy w ciąży (działalność)');
    if (p.employment.title === 'UOP' && (p.employment.pregnancyTermination === 'UPADLOSC_LIKWIDACJA' || p.employment.pregnancyTermination === 'SMIERC_PRACODAWCY')) put('zus_zam', 'ZUS', 'Zasiłek w wysokości zasiłku macierzyńskiego do dnia porodu — zaznacz upadłość, likwidację albo śmierć pracodawcy (art. 30 ust. 3)');
    if (!e.isEmployee) put('zus_zua', p.employment.title === 'JDG' ? 'ZUS' : 'PRACODAWCA', 'Po zakończeniu zasiłku macierzyńskiego — odzyskanie ochrony chorobowej');
    if (f.situation === 'PO_PORODZIE' && f.childOutcome !== 'ZYWE') {
      put('zus_z12', 'ZUS', 'Zasiłek pogrzebowy (także przy martwym urodzeniu, bez względu na czas trwania ciąży)');
    }
    if (p.care.daysRequested > 0) {
      put(p.care.reason === 'INNY_CZLONEK_RODZINY' ? 'zus_z15b' : 'zus_z15a', e.isEmployee ? 'PRACODAWCA' : 'ZUS', 'Zasiłek opiekuńczy');
    }
  }

  // Dokumenty zagraniczne (§ 21 rozporządzenia z 11.03.2025; § 8, 9, 14 rozporządzenia z 27.09.2026).
  if (f.documentsOrigin !== 'PL') {
    for (const it of items.values()) {
      if (['akt_urodzenia', 'e_zla', 'zaswiadczenie_szpital_dziecko', 'zaswiadczenie_termin_porodu'].includes(it.docId)) {
        const extra = f.documentsOrigin === 'UE_EFTA_UK'
          ? 'Dokument z UE, EFTA/EOG, Szwajcarii albo państwa, z którym Polska ma umowę o zabezpieczeniu społecznym (np. Wielka Brytania), w języku urzędowym tego państwa — bez tłumaczenia (§ 21; § 8, 9, 14 rozporządzenia z 27.09.2026).'
          : 'Dokument zagraniczny spoza tych państw — dołącz tłumaczenie na język polski (§ 21).';
        it.note = it.note ? `${it.note} ${extra}` : extra;
      }
    }
  }
  return Array.from(items.values());
}

/* ------------------------------------------------------------------ */
/* Generator wniosków                                                   */
/* ------------------------------------------------------------------ */

export interface GeneratedForm {
  id: string;
  title: string;
  legal: string;
  deadline?: string;
  body: string;
}

function header(p: Profile, today: string): string {
  const name = `${p.person.firstName} ${p.person.lastName}`.trim() || '[imię i nazwisko]';
  return [
    `${p.person.address || '[miejscowość]'}, dnia ${formatPL(today)}`,
    '',
    name,
    `PESEL: ${p.person.pesel || '[PESEL]'}`,
    '',
    `${p.employment.employerName || '[nazwa pracodawcy]'}`,
    '',
  ].join('\n');
}

function signature(): string {
  return '\n\n……………………………………\n(podpis pracownika)';
}

export function generateForms(p: Profile, e: Eligibility, today: string): GeneratedForm[] {
  const forms: GeneratedForm[] = [];
  const f = p.family;
  const blocks = buildTimeline(p, today);
  // Urlop macierzyński matki (bez części przejętej przez ojca) — do wniosku matki; koniec całego urlopu — do terminów.
  const mat = blocks.filter((b) => b.kind === 'MACIERZYNSKI' && b.who !== 'OJCIEC').sort((a, b) => (a.end < b.end ? 1 : -1))[0] ?? blocks.find((b) => b.kind === 'NA_WARUNKACH');
  const matAll = lastOf(blocks, 'MACIERZYNSKI') ?? mat;
  const pre = blocks.find((b) => b.kind === 'PRZED_PORODEM');
  const sup = blocks.find((b) => b.kind === 'UZUPELNIAJACY');
  const par = blocks.find((b) => b.kind === 'RODZICIELSKI');
  const par9 = blocks.find((b) => b.kind === 'RODZICIELSKI_9');
  const pat = blocks.find((b) => b.kind === 'OJCOWSKI');
  const childName = '[imię i nazwisko dziecka]';
  const dob = isValidISO(f.birthDate) ? formatPL(f.birthDate) : '[data urodzenia dziecka]';
  const otherName = f.otherParent.name || '[imię i nazwisko drugiego rodzica]';

  if (!e.isEmployee) {
    // Niepracownik — dane do ZUS ZAM
    forms.push({
      id: 'zam',
      title: 'Dane do wniosku ZUS ZAM (eZUS)',
      legal: `${LEGAL.uz31}; ${LEGAL.rozp2026}`,
      body: [
        'WNIOSEK O ZASIŁEK MACIERZYŃSKI — ZUS ZAM (dane do wpisania w eZUS)',
        '',
        `Ubezpieczona: ${p.person.firstName} ${p.person.lastName}, PESEL ${p.person.pesel || '[PESEL]'}`,
        `Tytuł: ${p.employment.title === 'JDG' ? 'pozarolnicza działalność gospodarcza' : 'umowa zlecenia'}`,
        `Dziecko: ${childName}, ur. ${dob}${f.childrenCount > 1 ? `, liczba dzieci: ${f.childrenCount}` : ''}`,
        '',
        `Okres zasiłku za urlop macierzyński: ${mat ? `${formatPL(pre?.start ?? mat.start)} – ${formatPL(mat.end)}` : '—'}`,
        par ? `Okres zasiłku za urlop rodzicielski: ${formatPL(par.start)} – ${formatPL(par.end)}` : '',
        `Wariant: ${p.plan.variant === 'USREDNIONY' ? '81,5% za cały okres (wniosek w ciągu 21 dni od porodu)' : '100% za macierzyński, 70% za rodzicielski'}`,
        '',
        'Odpisu aktu urodzenia NIE dołączam — wnoszę o pobranie danych z rejestru stanu cywilnego (§ 13 rozporządzenia z 27.09.2026).',
        'Rachunek bankowy do wypłaty: [numer rachunku — wpisz samodzielnie w eZUS]',
      ].filter(Boolean).join('\n'),
    });
  }

  if (mat && !isAdoption(p) && f.childOutcome === 'ZYWE') {
    const start = pre?.start ?? mat.start;
    const end = par ? par.end : mat.end;
    forms.push({
      id: 'mat-par',
      title: 'Wniosek o urlop macierzyński i rodzicielski w pełnym wymiarze (wariant 81,5%)',
      legal: 'art. 180, 182¹a KP; art. 31 ust. 3 ustawy zasiłkowej; § 2 i § 15 rozporządzenia z 11.03.2025',
      deadline: isValidISO(f.birthDate) ? addDays(f.birthDate, 21) : undefined,
      body: [
        header(p, today),
        'WNIOSEK',
        'o udzielenie urlopu macierzyńskiego i urlopu rodzicielskiego bezpośrednio po nim',
        '',
        `Na podstawie art. 180 § 1 oraz art. 182¹a i 182¹c Kodeksu pracy wnoszę o udzielenie mi urlopu macierzyńskiego w wymiarze ${Math.round(mat.weeks + (pre?.weeks ?? 0))} tygodni od dnia ${formatPL(start)} do dnia ${formatPL(mat.end)}${sup ? `, uzupełniającego urlopu macierzyńskiego od ${formatPL(sup.start)} do ${formatPL(sup.end)}` : ''}${par ? ` oraz — bezpośrednio po nim — urlopu rodzicielskiego od dnia ${formatPL(par.start)} do dnia ${formatPL(par.end)}` : ''}, w związku z urodzeniem dziecka ${childName} w dniu ${dob}.`,
        '',
        'Dotychczas nie korzystałam z urlopu rodzicielskiego ani z zasiłku macierzyńskiego za okres tego urlopu (liczba wykorzystanych części: 0).',
        '',
        `Oświadczam, że wniosek składam w ciągu 21 dni od porodu, w celu objęcia zasiłkiem macierzyńskim w wysokości 81,5% podstawy wymiaru za cały okres urlopu (art. 31 ust. 3 ustawy zasiłkowej), łącznie do ${formatPL(end)}.`,
        '',
        'Załączniki:',
        `1. Odpis skrócony aktu urodzenia dziecka${e.payer === 'ZUS' ? ' — nie dołączam; wnoszę o przekazanie do ZUS danych dziecka (§ 13 rozporządzenia z 27.09.2026)' : ' (lub do wglądu)'}.`,
        `2. Oświadczenie drugiego rodzica dziecka dot. urlopu rodzicielskiego.`,
        signature(),
      ].join('\n'),
    });
  }

  if (sup && matAll) {
    const supInfo = supplementaryLeave(p);
    forms.push({
      id: 'sup',
      title: 'Wniosek o uzupełniający urlop macierzyński',
      legal: 'art. 180² § 4–6 KP; § 14 rozporządzenia z 11.03.2025',
      deadline: addDays(matAll.end, -21),
      body: [
        header(p, today),
        'WNIOSEK',
        'o udzielenie uzupełniającego urlopu macierzyńskiego',
        '',
        `Na podstawie art. 180² Kodeksu pracy wnoszę o udzielenie mi uzupełniającego urlopu macierzyńskiego w wymiarze ${supInfo.weeks} tygodni, w okresie od dnia ${formatPL(sup.start)} do dnia ${formatPL(sup.end)}, bezpośrednio po urlopie macierzyńskim, który kończy się w dniu ${formatPL(matAll.end)}.`,
        '',
        `Dziecko urodziło się w ${f.pregnancyWeekAtBirth}. tygodniu ciąży${f.birthWeightGrams > 0 ? `, z masą urodzeniową ${f.birthWeightGrams} g` : ''} i przebywało w szpitalu przez ${f.childHospitalDays} dni.`,
        '',
        'Załączniki:',
        '1. Zaświadczenie ze szpitala o okresie pobytu dziecka oraz o tygodniu ciąży / masie urodzeniowej.',
        `2. Oświadczenie drugiego rodzica (${otherName}), że nie zamierza korzystać z uzupełniającego urlopu macierzyńskiego ani z zasiłku za ten okres.`,
        signature(),
      ].join('\n'),
    });
  }

  if (par) {
    forms.push({
      id: 'stmt-other',
      title: 'Oświadczenie drugiego rodzica dot. urlopu rodzicielskiego',
      legal: '§ 15 rozporządzenia z 11.03.2025',
      body: [
        `${p.person.address || '[miejscowość]'}, dnia ${formatPL(today)}`,
        '',
        otherName,
        '',
        'OŚWIADCZENIE',
        '',
        `Oświadczam, że ${par9 ? `zamierzam korzystać z przysługującej mi nieprzenoszalnej części urlopu rodzicielskiego (9 tygodni) w okresie od ${formatPL(par9.start)} do ${formatPL(par9.end)}, a w okresie od ${formatPL(par.start)} do ${formatPL(par.end)} nie zamierzam korzystać z urlopu rodzicielskiego ani z zasiłku macierzyńskiego za okres tego urlopu` : `nie zamierzam korzystać z urlopu rodzicielskiego ani z zasiłku macierzyńskiego za okres tego urlopu w okresie od ${formatPL(par.start)} do ${formatPL(par.end)}`} w związku z opieką nad dzieckiem ${childName}, ur. ${dob}.`,
        '',
        '……………………………………\n(podpis)',
      ].join('\n'),
    });
  }

  if (sup) {
    forms.push({
      id: 'stmt-sup',
      title: 'Oświadczenie drugiego rodzica — uzupełniający urlop macierzyński',
      legal: '§ 14 rozporządzenia z 11.03.2025',
      body: [
        `${p.person.address || '[miejscowość]'}, dnia ${formatPL(today)}`,
        '',
        otherName,
        '',
        'OŚWIADCZENIE',
        '',
        `Oświadczam, że nie zamierzam korzystać z uzupełniającego urlopu macierzyńskiego ani z zasiłku macierzyńskiego za okres tego urlopu w związku z urodzeniem dziecka ${childName} w dniu ${dob}.`,
        '',
        '……………………………………\n(podpis)',
      ].join('\n'),
    });
  }

  if (par && effectivePartTimeWeeks(p) > 0 && e.isEmployee) {
    forms.push({
      id: 'part-time',
      title: 'Wniosek o łączenie urlopu rodzicielskiego z pracą',
      legal: 'art. 182¹e–182¹f KP; § 16 rozporządzenia z 11.03.2025',
      deadline: addDays(par.start, -21),
      body: [
        header(p, today),
        'WNIOSEK',
        'o podjęcie pracy w trakcie korzystania z urlopu rodzicielskiego',
        '',
        `Na podstawie art. 182¹e § 1 i 2 Kodeksu pracy wnoszę o umożliwienie mi łączenia korzystania z urlopu rodzicielskiego z wykonywaniem pracy w wymiarze ${fraction(p.plan.partTimeFraction)} etatu przez ${effectivePartTimeWeeks(p)} tygodni, począwszy od dnia ${formatPL(par.start)}.`,
        '',
        `Urlop rodzicielski ulega wydłużeniu proporcjonalnie do wymiaru czasu pracy (art. 182¹f § 2 KP). ${p.plan.combineExtension ? 'Część urlopu powstałą z wydłużenia zamierzam również łączyć z pracą w tym samym wymiarze (art. 182¹f § 7 KP).' : 'Część urlopu powstałą z wydłużenia zamierzam wykorzystać bez łączenia z pracą.'}`,
        signature(),
      ].join('\n'),
    });
  }

  // Pozostałe scenariusze z wymagane_dokumenty.json — wnioski generowane z listy pól (pola_wniosku).
  for (const a of applicableScenarios(p, e, today)) {
    const bespoke = (a.applicant === 'MATKA' && MOTHER_BESPOKE.has(a.scenario.id)) || (a.applicant === 'OJCIEC' && a.scenario.id === 'pracownik_ojcowski') || a.scenario.id.startsWith('nie_pracownik_');
    if (bespoke) continue;
    forms.push(scenarioForm(p, a, blocks, today));
  }

  if (pat) {
    forms.push({
      id: 'pat',
      title: 'Wniosek o urlop ojcowski (składa ojciec)',
      legal: 'art. 182³ KP; § 17 rozporządzenia z 11.03.2025',
      deadline: addDays(pat.start, -7),
      body: [
        `${p.person.address || '[miejscowość]'}, dnia ${formatPL(today)}`,
        '',
        otherName,
        '',
        '[pracodawca ojca]',
        '',
        'WNIOSEK',
        'o udzielenie urlopu ojcowskiego',
        '',
        `Na podstawie art. 182³ Kodeksu pracy wnoszę o udzielenie mi urlopu ojcowskiego w wymiarze 2 tygodni, w okresie od dnia ${formatPL(pat.start)} do dnia ${formatPL(pat.end)}, w związku z urodzeniem dziecka ${childName} w dniu ${dob}.`,
        '',
        'Oświadczam, że dotychczas nie korzystałem z urlopu ojcowskiego w związku z urodzeniem tego dziecka.',
        '',
        'Załącznik: odpis skrócony aktu urodzenia dziecka (jeżeli nie znajduje się w aktach osobowych — § 22).',
        '\n\n……………………………………\n(podpis pracownika)',
      ].join('\n'),
    });
  }

  if (p.care.daysRequested > 0) {
    forms.push({
      id: 'care',
      title: `Dane do wniosku ${p.care.reason === 'INNY_CZLONEK_RODZINY' ? 'ZUS Z-15B' : 'ZUS Z-15A'} (zasiłek opiekuńczy)`,
      legal: LEGAL.uz32,
      body: [
        `${p.care.reason === 'INNY_CZLONEK_RODZINY' ? 'ZUS Z-15B' : 'ZUS Z-15A'} — wniosek o zasiłek opiekuńczy`,
        '',
        `Wnioskodawca: ${p.person.firstName} ${p.person.lastName}, PESEL ${p.person.pesel || '[PESEL]'}`,
        `Powód: ${careReasonLabel(p.care.reason)}`,
        `Liczba dni opieki: ${p.care.daysRequested}`,
        `Wiek dziecka: ${p.care.childAgeYears} lat`,
        p.care.reason === 'ZAMKNIECIE_PLACOWKI' ? `Powiadomienie o zamknięciu placówki: ${p.care.facilityNoticeDays} dni przed zamknięciem (wymagane < 7 dni). Dołącz oświadczenie o nieprzewidzianym zamknięciu.` : '',
        'Oświadczenie: w okresie opieki nie ma innego członka rodziny pozostającego we wspólnym gospodarstwie domowym, który mógłby zapewnić opiekę.',
        `Dni zasiłku opiekuńczego wykorzystane w tym roku przez rodzinę: ${p.care.usedPool60 + p.care.usedPool30 + p.care.usedPool14}`,
      ].filter(Boolean).join('\n'),
    });
  }

  // Zasiłek pogrzebowy po martwym urodzeniu / zgonie dziecka (art. 77–81 ustawy emerytalnej; poradnik ZUS s. 35–36).
  if (e.sicknessInsured && f.situation === 'PO_PORODZIE' && f.childOutcome !== 'ZYWE') {
    const stillborn = f.childOutcome === 'MARTWE';
    const deathDate = isValidISO(f.childDeathDate) ? formatPL(f.childDeathDate) : '[data zgonu]';
    forms.push({
      id: 'funeral',
      title: 'Dane do wniosku ZUS Z-12 (zasiłek pogrzebowy)',
      legal: 'art. 77–81 ustawy o emeryturach i rentach z FUS; poradnik ZUS (s. 35–36)',
      body: [
        'ZUS Z-12 — wniosek o zasiłek pogrzebowy',
        'Składasz w ZUS: przez eZUS, w placówce ZUS albo pocztą — w ciągu 12 miesięcy od dnia pochówku.',
        '',
        `Wnioskodawca: ${`${p.person.firstName} ${p.person.lastName}`.trim() || '[imię i nazwisko]'}, PESEL ${p.person.pesel || '[PESEL]'}`,
        `Adres: ${p.person.address || '[adres]'}`,
        `Stopień pokrewieństwa ze zmarłym dzieckiem: matka`,
        stillborn
          ? `Dziecko: ${childName}, urodzone martwe w dniu ${dob}`
          : `Dziecko: ${childName}, ur. ${dob}, zmarłe w dniu ${deathDate}`,
        'Data pochówku: [uzupełnij]',
        'Koszty pogrzebu poniosłam: [kwota] zł',
        'Wypłata: na rachunek bankowy nr [uzupełnij] albo przekazem pocztowym na adres zamieszkania',
        '',
        'Załączniki:',
        '1. Rachunki potwierdzające koszty pogrzebu (np. zakładu pogrzebowego, parafii)',
        stillborn
          ? '2. Odpis skrócony aktu urodzenia z adnotacją, że dziecko urodziło się martwe; jeśli aktu nie sporządzono — karta zgonu (lub jej kopia) albo zaświadczenie o martwym urodzeniu wydane przez lekarza położnictwa i ginekologii albo położną'
          : '2. Odpis skrócony aktu zgonu dziecka albo karta zgonu',
        '',
        'Zasiłek wynosi 7 000 zł. Rodzicom przysługuje pełna kwota, nawet jeśli koszty pogrzebu były niższe.',
      ].join('\n'),
    });
  }

  return forms;
}

/** Wnioski matki, dla których istnieje dedykowany wzór (mat-par, sup, part-time). */
const MOTHER_BESPOKE = new Set(['pracownik_macierzynski_po_porodzie', 'pracownik_uzupelniajacy', 'pracownik_rodzicielski', 'pracownik_rodzicielski_z_praca']);

/** Wartość pola wniosku (pola_wniosku z JSON) wyliczona z profilu i harmonogramu. */
function fieldValue(field: string, p: Profile, a: ApplicableScenario, blocks: LeaveBlock[]): string {
  const f = p.family;
  const w = field.toLowerCase();
  const range = (b?: LeaveBlock) => (b ? `od ${formatPL(b.start)} do ${formatPL(b.end)}` : '[okres]');
  const matF = blocks.find((b) => b.id === 'matF');
  const pre = blocks.find((b) => b.kind === 'PRZED_PORODEM');
  const dob = isValidISO(f.birthDate) ? formatPL(f.birthDate) : '[data urodzenia]';
  const evDate = isValidISO(f.specialCaseDate) ? formatPL(f.specialCaseDate) : '[data]';
  const applicantName = a.applicant === 'OJCIEC' ? f.otherParent.name || '[imię i nazwisko ojca]' : `${p.person.firstName} ${p.person.lastName}`.trim() || '[imię i nazwisko]';

  if (w === 'imię i nazwisko') return applicantName;
  if (w.startsWith('imię, nazwisko i data urodzenia dziecka')) return `[imię i nazwisko dziecka], ur. ${dob}`;
  if (w.startsWith('data rozpoczęcia urlopu')) return pre ? formatPL(pre.start) : '[data]';
  if (w.startsWith('termin powrotu do pracy')) return matF ? formatPL(matF.start) : evDate;
  if (w.includes('wykorzystanego przez matkę przed porodem')) return pre ? `${pre.weeks} tyg. (${range(pre)})` : 'matka nie korzystała z urlopu przed porodem';
  if (w.startsWith('okres, na który ma być udzielona pozostała część')) return range(matF);
  if (w.startsWith('data, od której ma być udzielona')) return matF ? formatPL(matF.start) : evDate;
  if (w.includes('zgonu matki')) return evDate;
  if (w.includes('porzucenia dziecka')) return evDate;
  if (w.includes('zobowiązanie do poinformowania pracodawcy o dacie wyjścia matki ze szpitala')) return 'Zobowiązuję się niezwłocznie poinformować pracodawcę o dniu wyjścia matki ze szpitala.';
  if (w.includes('zobowiązanie do poinformowania pracodawcy o ustaniu zatrudnienia')) return 'Zobowiązuję się niezwłocznie poinformować pracodawcę o ustaniu zatrudnienia matki.';
  if (w.startsWith('termin zakończenia urlopu macierzyńskiego')) return lastOf(blocks, 'MACIERZYNSKI') ? formatPL(lastOf(blocks, 'MACIERZYNSKI')!.end) : '[data]';
  if (w.startsWith('okres uzupełniającego')) return range(blocks.find((b) => b.kind === 'UZUPELNIAJACY'));
  if (w.startsWith('dotychczas wykorzystany urlop rodzicielski')) return 'nie korzystałem/am';
  if (w.startsWith('liczba wykorzystanych części')) return '0';
  if (w.startsWith('okres, na który ma być udzielony urlop')) {
    const own = blocks.filter((b) => (b.kind === 'RODZICIELSKI' || b.kind === 'RODZICIELSKI_9') && (a.applicant === 'OJCIEC' ? b.who === 'OJCIEC' : b.who !== 'OJCIEC'));
    return own.length ? own.map(range).join('; ') : '[okres]';
  }
  if (w.startsWith('data porodu')) return dob;
  if (w.startsWith('data zgonu dziecka')) return f.childOutcome === 'MARTWE' ? 'dziecko urodziło się martwe' : isValidISO(f.childDeathDate) ? formatPL(f.childDeathDate) : '[data zgonu]';
  if (w.startsWith('liczba dzieci urodzonych')) return `urodzonych: ${f.childrenCount || 1}; pozostałych przy życiu: [uzupełnij]`;
  if (w.startsWith('liczba dzieci pozostałych')) return '[uzupełnij]';
  if (w === 'okres urlopu') {
    const k = a.scenario.id === 'pracownik_ojcowski' ? 'OJCOWSKI' : a.scenario.id === 'pracownik_na_warunkach_macierzynskiego' ? 'NA_WARUNKACH' : 'MACIERZYNSKI';
    return range(blocks.find((b) => b.kind === k));
  }
  if (w.startsWith('wymiar czasu pracy')) return `${Math.round(p.plan.partTimeFraction * 100)}% etatu`;
  if (w.startsWith('okres łączenia')) return `${effectivePartTimeWeeks(p)} tygodni`;
  if (w.startsWith('wariant zasiłku')) return p.plan.variant === 'USREDNIONY' ? 'uśredniony (81,5%)' : 'zmienny (100% + 70%)';
  return '[uzupełnij]';
}

/** Wniosek wygenerowany z definicji scenariusza (nazwa, podstawa, pola_wniosku, dokumenty). */
function scenarioForm(p: Profile, a: ApplicableScenario, blocks: LeaveBlock[], today: string): GeneratedForm {
  const sc = a.scenario;
  const father = a.applicant === 'OJCIEC';
  const name = father ? p.family.otherParent.name || '[imię i nazwisko ojca]' : `${p.person.firstName} ${p.person.lastName}`.trim();
  const docs = [...sc.dokumenty, ...a.conditional.flatMap((c) => c.dokumenty)];
  const head = [
    `${p.person.address || '[miejscowość]'}, dnia ${formatPL(today)}`,
    '',
    name,
    '',
    father ? '[pracodawca ojca]' : p.employment.employerName || '[nazwa pracodawcy]',
    '',
  ];
  const body: (string | null)[] = [
    ...head,
    'WNIOSEK',
    sc.nazwa,
    '',
    `Na podstawie ${sc.podstawa.replace(/; poradnik.*$/i, '')} składam wniosek obejmujący następujące dane:`,
    '',
    ...sc.pola_wniosku.map((pole, i) => `${i + 1}. ${pole.charAt(0).toUpperCase() + pole.slice(1)}: ${fieldValue(pole, p, a, blocks)}`),
    '',
    docs.length ? 'Załączniki:' : null,
    ...docs.map((d, i) => `${i + 1}. ${docName(d)}`),
    sc.uwagi ? `\nUwagi: ${sc.uwagi}` : null,
    sc.termin_wniosku ? `\nTermin złożenia: ${sc.termin_wniosku}.` : null,
    '\n\n……………………………………\n(podpis)',
  ].filter((l): l is string => l !== null);
  return {
    id: `sc-${sc.id}-${a.applicant}`,
    title: `${sc.nazwa}${father ? ' — wniosek ojca' : ''}`,
    legal: sc.podstawa,
    deadline: a.deadline,
    body: body.join('\n'),
  };
}

export function careReasonLabel(r: Profile['care']['reason']): string {
  switch (r) {
    case 'CHORE_DZIECKO_DO_14': return 'opieka nad chorym dzieckiem do 14 lat';
    case 'ZAMKNIECIE_PLACOWKI': return 'nieprzewidziane zamknięcie żłobka/przedszkola/szkoły (dziecko do 8 lat)';
    case 'PORÓD_LUB_SZPITAL_OPIEKUNA': return 'poród lub pobyt w szpitalu drugiego rodzica stale opiekującego się dzieckiem (dziecko do 8 lat)';
    case 'CHORE_DZIECKO_NIEPELNOSPRAWNE_14_18': return 'opieka nad chorym dzieckiem z niepełnosprawnością (14–18 lat)';
    case 'CHORE_DZIECKO_POWYZEJ_14': return 'opieka nad chorym dzieckiem powyżej 14 lat';
    case 'INNY_CZLONEK_RODZINY': return 'opieka nad innym chorym członkiem rodziny (wspólne gospodarstwo)';
  }
}

function fraction(f: number): string {
  if (Math.abs(f - 0.5) < 1e-9) return '1/2';
  if (Math.abs(f - 0.25) < 1e-9) return '1/4';
  return `${Math.round(f * 100)}%`;
}

/** Eksport checklisty do Markdown. */
export function checklistToMarkdown(items: ChecklistItem[]): string {
  const out: string[] = ['# Checklista dokumentów', ''];
  (Object.keys(DESTINATION_LABELS) as Destination[]).forEach((d) => {
    const rows = items.filter((i) => i.destination === d);
    if (!rows.length) return;
    out.push(`## ${DESTINATION_LABELS[d].title}`, '');
    rows.forEach((r) => {
      out.push(`- [${r.waived ? 'x' : ' '}] **${r.name}**${r.legal ? ` _(${r.legal})_` : ''}`);
      out.push(`  - Do: ${r.reasons.join('; ')}`);
      if (r.oneOf) out.push(`  - ${r.oneOf}`);
      if (r.waived) out.push(`  - Zwolnienie: ${r.waived}`);
      if (r.note) out.push(`  - ${r.note}`);
    });
    out.push('');
  });
  return out.join('\n');
}

/** Czy wniosek o łączenie urlopu rodzicielskiego z pracą jest dostępny — a jeśli nie, dlaczego (do komunikatów w UI). */
export function partTimeFormStatus(p: Profile, e: Eligibility, today: string): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const blocks = buildTimeline(p, today);
  const motherPar = blocks.find((b) => b.kind === 'RODZICIELSKI' && b.who !== 'OJCIEC');
  if (!e.sicknessInsured) reasons.push('W kroku 1 („Twoja sytuacja”) wybrany jest brak ubezpieczenia chorobowego — wybierz „Umowa o pracę”.');
  else if (!e.isEmployee) reasons.push('Wniosek składa tylko pracownik u swojego pracodawcy. W kroku 1 wybierz „Umowa o pracę” (teraz: zlecenie lub działalność).');
  if (!motherPar) reasons.push('W planie nie ma urlopu rodzicielskiego matki (np. martwe urodzenie albo cały urlop przejmuje ojciec).');
  if (p.plan.partTimeFraction <= 0) {
    reasons.push(p.employment.fullTimeFraction < 1
      ? 'Pole „Wymiar etatu” w kroku 1 to Twój etat w pracy — nie tworzy wniosku. Przesuń suwak „Wymiar pracy” w zakładce „Ile dostaniesz” → „Rodzicielski + praca” (np. na 50%).'
      : 'Przesuń suwak „Wymiar pracy” w zakładce „Ile dostaniesz” → „Rodzicielski + praca” powyżej 0% (np. na 50%).');
  }
  return { ready: reasons.length === 0, reasons };
}
