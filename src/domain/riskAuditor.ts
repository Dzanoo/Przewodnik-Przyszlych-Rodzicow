/** Silnik wykrywania pułapek prawnych, wyjątków i ryzyk dopasowanych do profilu. */
import { DEBT_TOLERANCE, JDG_BASES_2026, LEGAL, MIN_WAGE_2026, SICKNESS_PERIOD_DAYS } from './constants2026';
import { addDays, diffDays, formatPL, isValidISO } from './dateUtils';
import { monthlyMaternity, type PregnancySickness } from './benefitCalculator';
import { SPECIAL_CASES, buildTimeline, isTakeoverByFather, parentalDimension, specialCaseIssues, supplementaryLeave } from './eligibilityEngine';
import type { BaseBreakdown, Eligibility, Profile } from './types';

export type RiskSeverity = 'krytyczne' | 'ostrzeżenie' | 'informacja';

export interface RiskCard {
  id: string;
  severity: RiskSeverity;
  title: string;
  body: string;
  legal: string;
}

export function auditRisks(p: Profile, e: Eligibility, base: BaseBreakdown, sick: PregnancySickness | null, today: string): RiskCard[] {
  const r: RiskCard[] = [];
  const emp = p.employment;
  const f = p.family;

  // --- Ryzyka wskazane przez ZUS w opisie wyzwania (pkt H)
  const due = isValidISO(f.birthDate) && f.situation === 'PO_PORODZIE' ? f.birthDate : isValidISO(f.expectedDueDate) ? f.expectedDueDate : '';
  const pregnancyStart = due ? addDays(due, -280) : '';
  if (pregnancyStart && isValidISO(emp.insuranceStart) && emp.insuranceStart >= pregnancyStart && emp.title !== 'NIEUBEZPIECZONY' && f.situation !== 'ADOPCJA' && f.situation !== 'RODZINA_ZASTEPCZA') {
    r.push({ id: 'pozor', severity: 'ostrzeżenie', title: 'Ubezpieczenie zaczęło się w czasie ciąży', body: `Ubezpieczenie rozpoczęło się ${formatPL(emp.insuranceStart)}, czyli już w czasie ciąży. ZUS może sprawdzić, czy umowa albo działalność są wykonywane naprawdę. Jeśli uzna, że zawarto je dla pozoru, wyda decyzję o niepodleganiu ubezpieczeniom — a bez ubezpieczenia chorobowego nie ma zasiłków. Zachowaj dowody faktycznej pracy (umowy, faktury, korespondencję).`, legal: 'art. 83 Kodeksu cywilnego; art. 68 ustawy o sus' });
  }
  const months = p.salary.months;
  if (emp.title === 'UOP' && months.length >= 6) {
    const pay = (m: (typeof months)[number]) => m.fixedPaid + m.variablePaid;
    const recent = months.slice(-3);
    const earlier = months.slice(0, -3);
    const avg = (xs: typeof months) => xs.reduce((a, m) => a + pay(m), 0) / Math.max(1, xs.length);
    if (avg(earlier) > 0 && avg(recent) > avg(earlier) * 1.25) {
      r.push({ id: 'podwyzka', severity: 'ostrzeżenie', title: 'Wyraźny wzrost wynagrodzenia w ostatnich miesiącach', body: `Średnie wynagrodzenie z 3 ostatnich miesięcy jest o ${Math.round((avg(recent) / avg(earlier) - 1) * 100)}% wyższe niż wcześniej. Jeśli podwyżka przypadła na czas ciąży, ZUS może sprawdzić, czy nie służyła wyłącznie podwyższeniu zasiłku, i ustalić niższą podstawę wymiaru składek, a tym samym zasiłku.`, legal: 'art. 58 Kodeksu cywilnego; opis wyzwania ZUS, pkt H.2' });
    }
  }
  if ((emp.title === 'ZLECENIE' || emp.title === 'JDG') && f.situation === 'CIAZA') {
    r.push({ id: 'dzien-porodu', severity: 'ostrzeżenie', title: 'Ubezpieczenie musi trwać w dniu porodu', body: emp.title === 'JDG' ? 'Zasiłek macierzyński przysługuje, jeśli w dniu porodu podlegasz ubezpieczeniu chorobowemu. Nie zawieszaj ani nie zamykaj działalności i nie wyrejestrowuj się z dobrowolnego chorobowego przed porodem.' : 'Zasiłek macierzyński przysługuje, jeśli w dniu porodu podlegasz ubezpieczeniu chorobowemu. Jeśli umowa zlecenia skończy się przed porodem, zleceniodawca wyrejestruje Cię z ubezpieczeń i prawo do zasiłku przepadnie (umowa zlecenia, inaczej niż umowa o pracę, nie przedłuża się do porodu).', legal: 'art. 29 ust. 1 ustawy zasiłkowej' });
  }
  if (emp.title === 'UOP' && emp.pregnancyTermination === 'NARUSZENIE_PRAWA') {
    r.push({ id: 'naruszenie', severity: 'krytyczne', title: 'Rozwiązanie umowy z naruszeniem przepisów', body: 'Zasiłek macierzyński po porodzie przysługuje mimo ustania ubezpieczenia tylko wtedy, gdy naruszenie przepisów stwierdzi prawomocny wyrok sądu pracy. Odwołanie do sądu pracy od wypowiedzenia składa się w ciągu 21 dni od jego doręczenia.', legal: 'art. 30 ust. 1 pkt 2 ustawy zasiłkowej; art. 264 KP' });
  }

  // --- Tytuł ubezpieczenia
  if (emp.title === 'JDG' && emp.jdgVariant === 'ULGA_NA_START') {
    r.push({ id: 'ulga', severity: 'krytyczne', title: 'Ulga na start = brak zasiłków', body: 'Przez pierwsze 6 miesięcy działalności nie podlegasz ubezpieczeniom społecznym, więc nie masz prawa do zasiłku chorobowego, macierzyńskiego ani opiekuńczego. Możesz zrezygnować z ulgi w każdej chwili, składając zgłoszenie ZUS ZUA z dobrowolnym chorobowym — ochrona zacznie się od dnia wskazanego w zgłoszeniu (nie wstecz).', legal: 'art. 18 Prawa przedsiębiorców; art. 14 ust. 1 ustawy o sus' });
  }
  if ((emp.title === 'JDG' || (emp.title === 'ZLECENIE' && !e.isEmployee)) && e.sicknessInsured) {
    r.push({ id: 'zua', severity: 'krytyczne', title: 'Po zasiłku macierzyńskim złóż ponownie ZUS ZUA', body: 'Z chwilą nabycia prawa do zasiłku macierzyńskiego zostajesz automatycznie wyrejestrowana z dobrowolnego ubezpieczenia chorobowego. Po zakończeniu pobierania zasiłku musisz ponownie zgłosić się do chorobowego (ZUS ZUA) — inaczej kolejne L4 lub opieka nad dzieckiem nie będą płatne.', legal: 'art. 14 ust. 2 pkt 3 ustawy o sus' });
  }
  if (e.blockedByDebt) {
    r.push({ id: 'debt', severity: 'krytyczne', title: `Zadłużenie składkowe > ${DEBT_TOLERANCE.toFixed(2)} zł`, body: `Masz ${emp.contributionDebt.toFixed(2)} zł zaległości. Jeżeli w dniu powstania prawa do zasiłku dług przekracza 1% płacy minimalnej, zasiłek nie przysługuje do czasu spłaty całości. Po spłacie ZUS wypłaci zasiłek, ale prawo za dni sprzed spłaty przedawnia się po 6 miesiącach.`, legal: LEGAL.uz2a });
  } else if (emp.title === 'JDG' && emp.contributionDebt > 0) {
    r.push({ id: 'debt-small', severity: 'ostrzeżenie', title: 'Niewielka zaległość w składkach', body: `Zaległość ${emp.contributionDebt.toFixed(2)} zł mieści się w tolerancji 1% (${DEBT_TOLERANCE.toFixed(2)} zł), ale spłać ją przed porodem — każde przekroczenie blokuje zasiłek.`, legal: LEGAL.uz2a });
  }
  if (emp.title === 'ZLECENIE') {
    if (emp.concurrentUop && emp.concurrentUopSalary >= MIN_WAGE_2026) {
      r.push({ id: 'zbieg', severity: 'ostrzeżenie', title: 'Zbieg tytułów: zlecenie nie zwiększy zasiłku', body: 'Ponieważ z umowy o pracę masz co najmniej minimalne wynagrodzenie, ze zlecenia nie podlegasz ubezpieczeniom społecznym i nie możesz przystąpić do dobrowolnego chorobowego. Przychód ze zlecenia NIE wchodzi do podstawy zasiłku. Rozważ, czy część pracy nie powinna być wykonywana na UoP.', legal: 'art. 9 ust. 1 i 1a ustawy o sus' });
    } else if (emp.concurrentUop) {
      r.push({ id: 'zbieg-low', severity: 'informacja', title: 'Zbieg tytułów poniżej płacy minimalnej', body: 'Umowa o pracę daje mniej niż minimalne wynagrodzenie — zlecenie jest dodatkowym tytułem obowiązkowych ubezpieczeń, a chorobowe ze zlecenia możesz opłacać dobrowolnie.', legal: 'art. 9 ust. 1a ustawy o sus' });
    }
    if (p.person.isStudentUnder26) {
      r.push({ id: 'student', severity: 'krytyczne', title: 'Student do 26 lat — brak ubezpieczenia ze zlecenia', body: 'Zlecenie wykonywane przez ucznia/studenta przed ukończeniem 26 lat nie jest tytułem do ubezpieczeń społecznych — nie ma prawa do zasiłków.', legal: 'art. 6 ust. 4 ustawy o sus' });
    }
    if (!e.isEmployee && e.sicknessInsured && !emp.reportedWithin7Days) {
      r.push({ id: 'retro', severity: 'ostrzeżenie', title: 'Dobrowolne chorobowe nie działa wstecz', body: 'Zgłoszenie złożone po 7 dniach od zawarcia umowy obejmuje ochroną dopiero od dnia złożenia. Sprawdź datę objęcia w eZUS.', legal: 'art. 14 ust. 1 ustawy o sus' });
    }
  }

  // --- Mały ZUS+ / preferencyjny
  if (emp.title === 'JDG' && emp.jdgVariant === 'MALY_ZUS_PLUS') {
    if (emp.previousYearRevenue > JDG_BASES_2026.malyZusPlusRevenueLimit) {
      r.push({ id: 'mzp-rev', severity: 'krytyczne', title: 'Przekroczony limit przychodu małego ZUS+', body: `Przychód ${emp.previousYearRevenue.toLocaleString('pl-PL')} zł > 120 000 zł (proporcjonalnie przy niepełnym roku) — nie możesz korzystać z małego ZUS+.`, legal: 'art. 18c ustawy o sus' });
    }
    if (emp.previousYearActivityDays > 0 && emp.previousYearActivityDays < JDG_BASES_2026.malyZusPlusMinDaysPrevYear) {
      r.push({ id: 'mzp-days', severity: 'krytyczne', title: 'Działalność < 60 dni w poprzednim roku', body: 'Mały ZUS+ wymaga prowadzenia działalności co najmniej 60 dni w poprzednim roku kalendarzowym.', legal: 'art. 18c ust. 1 ustawy o sus' });
    }
    if (emp.malyZusPlusMonthsUsed >= JDG_BASES_2026.malyZusPlusMaxMonths) {
      r.push({ id: 'mzp-36', severity: 'ostrzeżenie', title: 'Wyczerpany limit 36 miesięcy małego ZUS+', body: 'Ulgę można stosować maksymalnie 36 miesięcy w każdym okresie 60 miesięcy.', legal: 'art. 18c ust. 6 ustawy o sus' });
    }
  }
  if (emp.title === 'JDG' && (emp.jdgVariant === 'MALY_ZUS_PLUS' || emp.jdgVariant === 'PREFERENCYJNY') && base.base > 0 && base.base < 2500) {
    r.push({ id: 'low-base', severity: 'ostrzeżenie', title: 'Niska podstawa = niski zasiłek', body: `Podstawa zasiłku ${base.base.toFixed(2)} zł wynika z obniżonych składek. Dobrowolne podwyższenie podstawy działa w pełni dopiero po 12 miesiącach (art. 48a — nadwyżka liczona w 1/12 za każdy miesiąc).`, legal: LEGAL.uz48a });
  }
  if (base.cappedAtMax) {
    r.push({ id: 'cap', severity: 'informacja', title: 'Podstawa ograniczona do maksimum', body: 'Przy dobrowolnym chorobowym podstawa zasiłku nie może przekroczyć 20 321,30 zł (250% prognozowanego przeciętnego wynagrodzenia po odliczeniu 13,71%).', legal: LEGAL.uz48 });
  }
  if (base.raisedToMinimum) {
    r.push({ id: 'min', severity: 'informacja', title: 'Podstawa podniesiona do minimum', body: 'Podstawa pracownika nie może być niższa niż minimalne wynagrodzenie po odliczeniu 13,71% (proporcjonalnie do etatu).', legal: LEGAL.uz45 });
  }
  if (base.excludedMonths.length) {
    r.push({ id: 'excluded', severity: 'informacja', title: `Miesiące wyłączone z podstawy: ${base.excludedMonths.length}`, body: base.excludedMonths.join('; '), legal: LEGAL.uz38 });
  }
  const mm = monthlyMaternity(base.base, p.plan.variant === 'USREDNIONY' ? 0.815 : 0.7, p.salary.usePit2);
  if (mm.toppedUp && e.maternityEligible) {
    r.push({ id: 'topup', severity: 'informacja', title: 'Zasiłek podwyższony do 1 000 zł', body: `Miesięczny zasiłek po zaliczce na PIT (${mm.net.toFixed(2)} zł) jest niższy niż świadczenie rodzicielskie — zostanie podwyższony do 1 000 zł (finansowanie z budżetu państwa).`, legal: LEGAL.uz31_3a });
  }

  // --- Ochrona pracownicy w ciąży
  if (e.isEmployee && f.situation === 'CIAZA') {
    r.push({ id: 'art177', severity: 'informacja', title: 'Ochrona przed wypowiedzeniem', body: 'W okresie ciąży i urlopu macierzyńskiego pracodawca nie może wypowiedzieć ani rozwiązać umowy (ani przygotowywać wypowiedzenia), poza wyjątkami (upadłość/likwidacja, dyscyplinarka za zgodą związków).', legal: LEGAL.art177 });
    if ((emp.contractType === 'OKRESLONY' || emp.contractType === 'PROBNY') && isValidISO(emp.contractEnd)) {
      r.push({ id: 'extend', severity: 'ostrzeżenie', title: 'Umowa przedłuży się do dnia porodu', body: `Umowa na czas określony / na okres próbny > 1 miesiąca, która rozwiązałaby się (${formatPL(emp.contractEnd)}) po upływie 3. miesiąca ciąży, ulega przedłużeniu do dnia porodu. Po porodzie zasiłek macierzyński wypłaci ZUS.`, legal: 'art. 177 § 3 KP' });
    }
    if (emp.contractType === 'ZASTEPSTWO') {
      r.push({ id: 'zastepstwo', severity: 'krytyczne', title: 'Umowa na zastępstwo NIE przedłuża się', body: 'Umowa zawarta w celu zastępstwa nieobecnego pracownika rozwiązuje się w terminie, mimo ciąży. Po ustaniu ubezpieczenia zasiłek chorobowy w ciąży przysługuje do 270 dni, a macierzyński — z ZUS.', legal: 'art. 177 § 3¹ KP' });
    }
    r.push({ id: 'art185', severity: 'informacja', title: 'Badania w ciąży w godzinach pracy — płatne', body: 'Masz prawo do zwolnienia od pracy na zalecone badania lekarskie, jeśli nie mogą odbyć się poza godzinami pracy, z zachowaniem wynagrodzenia.', legal: LEGAL.art185 });
  }

  // --- Zwolnienie w ciąży
  if (sick && sick.requestedDays > 0) {
    if (!p.plan.codeB) {
      r.push({ id: 'codeB', severity: 'ostrzeżenie', title: 'Brak kodu B na e-ZLA', body: 'Bez kodu B zasiłek wynosi 80% (zamiast 100%), a okres zasiłkowy 182 dni (zamiast 270). Poproś lekarza o wpisanie kodu B.', legal: LEGAL.uz11 });
    }
    if (sick.overLimitDays > 0) {
      r.push({ id: 'limit', severity: 'krytyczne', title: 'Przekroczony okres zasiłkowy', body: `Zwolnienie (${sick.requestedDays} dni) przekracza okres zasiłkowy ${sick.periodLimit} dni o ${sick.overLimitDays} dni — za te dni zasiłek nie przysługuje.`, legal: LEGAL.uz8 });
    }
    r.push({ id: 'ezla', severity: 'informacja', title: 'Kontrola e-ZLA: czynności incydentalne vs praca', body: 'W trakcie zwolnienia nie wykonuj pracy zarobkowej. Czynności incydentalne wymuszone okolicznościami (np. jednorazowe przekazanie dokumentów, podpis) nie są pracą zarobkową; wykonywanie poleceń pracodawcy lub stała aktywność zarobkowa — tak, i grozi utratą zasiłku za cały okres zwolnienia. ZUS i płatnik (>20 osób) mogą kontrolować prawidłowość wykorzystania L4.', legal: 'art. 17 i 68 ustawy zasiłkowej' });
    if (sick.periodLimit === SICKNESS_PERIOD_DAYS.pregnancy) {
      r.push({ id: 'newperiod', severity: 'informacja', title: 'Nowy okres zasiłkowy w ciąży', body: 'Okresy choroby sprzed ciąży (bez kodu B) nie wliczają się do okresu zasiłkowego w ciąży, nawet przy przerwie krótszej niż 61 dni.', legal: LEGAL.uz8 });
    }
  }
  if (!e.waitingPeriodSatisfied && e.sicknessInsured) {
    r.push({ id: 'waiting', severity: 'ostrzeżenie', title: 'Okres wyczekiwania na zasiłek chorobowy', body: `Ubezpieczenie trwa ${e.insuredDays} dni z wymaganych ${e.waitingPeriodDays}. Zasiłek chorobowy przysługuje dopiero po jego upływie — ale macierzyński i opiekuńczy bez wyczekiwania.`, legal: LEGAL.uz4 });
  }

  // --- Terminy rodzicielskie
  if (f.situation === 'PO_PORODZIE' && f.childOutcome === 'ZYWE' && isValidISO(f.birthDate)) {
    const left = diffDays(today, addDays(f.birthDate, 21));
    if (left >= 0) {
      r.push({ id: 'v21', severity: 'krytyczne', title: `Zostało ${left} dni na wniosek o 81,5%`, body: `Termin: ${formatPL(addDays(f.birthDate, 21))}. Po tym dniu obowiązuje wariant 100% + 70%.`, legal: LEGAL.uz31 });
    }
  }
  const par = parentalDimension(p);
  if (par.forfeitedWeeks > 0 && par.total > 0) {
    r.push({ id: 'nine', severity: 'ostrzeżenie', title: `${par.forfeitedWeeks} tyg. urlopu rodzicielskiego przepadnie`, body: 'Każdy z rodziców ma wyłączne, nieprzenoszalne prawo do 9 tygodni urlopu rodzicielskiego. Jeśli drugi rodzic ich nie wykorzysta, matka nie może ich przejąć.', legal: 'art. 182¹a § 3 KP' });
  }
  const sup = supplementaryLeave(p);
  if (sup.weeks > 0) {
    r.push({ id: 'sup', severity: 'ostrzeżenie', title: `Uzupełniający urlop macierzyński: ${sup.weeks} tyg. (100%)`, body: `${sup.explanation} Wniosek najpóźniej 21 dni przed końcem urlopu macierzyńskiego — przysługuje jednorazowo i bezpośrednio po nim.`, legal: LEGAL.art1802 });
  }
  if (f.otherParent.insured && !f.otherParent.takesPaternity && f.childOutcome === 'ZYWE') {
    r.push({ id: 'pat', severity: 'informacja', title: 'Urlop ojcowski niezaplanowany', body: '2 tygodnie płatne 100% — przepadają po ukończeniu przez dziecko 12 miesięcy.', legal: LEGAL.art1823 });
  }
  if (f.childOutcome !== 'ZYWE' && f.situation === 'PO_PORODZIE') {
    r.push({ id: 'funeral', severity: 'ostrzeżenie', title: 'Zasiłek pogrzebowy 7 000 zł', body: 'Przysługuje także przy martwym urodzeniu, bez względu na czas trwania ciąży. Wniosek Z-12 — 12 miesięcy od pochówku.', legal: 'art. 77 ustawy o emeryturach i rentach z FUS' });
  }
  if (f.documentsOrigin === 'UE_EFTA_UK') {
    r.push({ id: 'foreign', severity: 'informacja', title: 'Dokumenty z UE/EFTA/UK bez tłumaczenia', body: 'Zaświadczenia lekarskie i akty stanu cywilnego wystawione w językach urzędowych tych państw nie wymagają tłumaczenia na polski.', legal: '§ 8, 9, 14 rozporządzenia z 27.09.2026' });
  }
  if (e.payer === 'ZUS' && e.maternityEligible) {
    r.push({ id: 'akt', severity: 'informacja', title: 'Nie musisz dostarczać aktu urodzenia', body: 'Płatnikiem jest ZUS — wystarczą dane dziecka (PESEL, data i miejsce urodzenia). ZUS pobierze odpis z rejestru stanu cywilnego.', legal: '§ 13 ust. 2–3 rozporządzenia z 27.09.2026' });
  }
  // --- Szczególne sytuacje (przejęcie urlopu przez ojca)
  if (isTakeoverByFather(p)) {
    const meta = SPECIAL_CASES[f.specialCase];
    for (const [i, issue] of specialCaseIssues(p).entries()) {
      r.push({ id: `special-${i}`, severity: 'krytyczne', title: 'Sprawdź dane szczególnej sytuacji', body: issue, legal: meta.legal });
    }
    r.push({ id: 'special', severity: 'ostrzeżenie', title: 'Ojciec przejmuje część urlopu macierzyńskiego', body: `${meta.label}. Ojciec składa własny wniosek u swojego pracodawcy, a zasiłek za przejętą część liczy się od jego podstawy wymiaru. ${meta.minWeeksAfterBirth ? `Matka musi najpierw wykorzystać co najmniej ${meta.minWeeksAfterBirth} tygodni urlopu po porodzie.` : ''}`.trim(), legal: meta.legal });
    if (f.otherParent.insured && f.otherParent.takesPaternity && !buildTimeline(p, today).some((b) => b.kind === 'OJCOWSKI')) {
      r.push({ id: 'special-pat', severity: 'ostrzeżenie', title: 'Urlop ojcowski nie mieści się w planie', body: 'Urlop ojcowski nie może pokrywać się z przejętym urlopem macierzyńskim ani rodzicielskim ojca, a trzeba go wykorzystać do 12. miesiąca życia dziecka. Zaplanuj go w przerwie między urlopami albo skróć urlop rodzicielski ojca.', legal: LEGAL.art1823 });
    }
    if (f.otherParent.insured && f.otherParent.title !== 'UOP') {
      r.push({ id: 'special-nonemp', severity: 'informacja', title: 'Ojciec nie jest pracownikiem', body: 'Wnioski z rozporządzenia składa pracownik u pracodawcy. Ojciec na zleceniu lub w działalności przerywa działalność zarobkową i składa oświadczenie oraz wniosek o zasiłek u płatnika albo w ZUS.', legal: 'art. 29 ustawy zasiłkowej; § 7 rozporządzenia z 11.03.2025' });
    }
  }
  if (f.considersChildcareLeave) {
    r.push({ id: 'wychowawczy', severity: 'informacja', title: 'Urlop wychowawczy jest bezpłatny', body: 'Za urlop wychowawczy nie przysługuje zasiłek macierzyński. Wniosek składa się co najmniej 21 dni przed rozpoczęciem; zamiast urlopu można wnioskować o obniżenie wymiaru czasu pracy.', legal: '§ 19–20 rozporządzenia z 11.03.2025; art. 186–186⁷ KP' });
  }
  if (f.situation === 'ADOPCJA' && f.otherParent.takesPaternity && !f.adoptionFinalized) {
    r.push({ id: 'adopt-pat', severity: 'informacja', title: 'Urlop ojcowski po przysposobieniu', body: 'Przy adopcji urlop ojcowski przysługuje do 12 miesięcy od uprawomocnienia postanowienia o przysposobieniu (nie dłużej niż do 14. roku życia dziecka). Do wniosku dołącza się kopię tego postanowienia.', legal: 'art. 182³ § 1 pkt 2 KP; § 17 rozporządzenia z 11.03.2025' });
  }

  const order: Record<RiskSeverity, number> = { krytyczne: 0, 'ostrzeżenie': 1, informacja: 2 };
  return r.sort((a, b) => order[a.severity] - order[b.severity]);
}
