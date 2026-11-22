import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SCENARIOS, createDefaultProfile } from '../../data/demoScenarios';
import { MIN_BENEFIT_BASE_FULL_TIME, MAX_VOLUNTARY_BENEFIT_BASE, DEBT_TOLERANCE, JDG_BASES_2026 } from '../constants2026';
import { computeEligibility, supplementaryLeave, parentalDimension, partTimeExtension, maternityDimension, buildTimeline, buildDeadlines } from '../eligibilityEngine';
import { benefitBase, nonEmployeeBase, periodAmount, compareVariants, careAllowance, pregnancySickness, evaluateMonth, rehabilitationBenefit, bridgingMaternity } from '../benefitCalculator';
import { applicableScenarios, buildChecklist, generateForms } from '../documentGenerator';
import { specialCaseIssues, fatherCarriesBenefit } from '../eligibilityEngine';
import { SCENARIOS } from '../../data/requiredDocuments';
import { auditRisks } from '../riskAuditor';

const TODAY = '2026-11-21';
const scen = (id: string) => DEMO_SCENARIOS.find((s) => s.id === id)!.build(TODAY);

test('stałe 2026', () => {
  assert.equal(MIN_BENEFIT_BASE_FULL_TIME, 4147.1);
  assert.equal(MAX_VOLUNTARY_BENEFIT_BASE, 20321.3);
  assert.equal(DEBT_TOLERANCE, 48.06);
  assert.equal(JDG_BASES_2026.preferentialMin, 1441.8);
  assert.equal(JDG_BASES_2026.standardMin, 5652);
});

test('art. 38: miesiące niepełne', () => {
  const half = evaluateMonth({ month: '2026-01', fixedPaid: 4000, fixedContract: 8000, variablePaid: 300, requiredDays: 20, workedDays: 10 });
  assert.equal(half.included, true);
  assert.equal(half.counted, 8000 + 600);
  const less = evaluateMonth({ month: '2026-02', fixedPaid: 2000, fixedContract: 8000, variablePaid: 0, requiredDays: 20, workedDays: 9 });
  assert.equal(less.included, false);
});

test('scenariusz 1: wcześniak 27 tc → 12 tyg. uzupełniającego, płatnik pracodawca', () => {
  const p = scen('preterm');
  const e = computeEligibility(p, TODAY);
  assert.equal(e.payer, 'PLATNIK');
  const sup = supplementaryLeave(p);
  assert.equal(sup.category, 'SKRAJNY_WCZESNIAK');
  assert.equal(sup.weeks, 12);
  const b = benefitBase(p, e);
  assert.equal(b.includedMonths, 11);
  // (10×8800 + 8600 uzupełniony)/11 ×0,8629 + 10800/12×0,8629
  const expected = ((10 * 8800 + (8200 + (310 / 11) * 21)) / 11) * 0.8629 + (10800 / 12) * 0.8629;
  assert.ok(Math.abs(b.base - expected) < 0.02, `${b.base} vs ${expected}`);
  const tl = buildTimeline(p, TODAY);
  assert.ok(tl.find((x) => x.kind === 'UZUPELNIAJACY'));
});

test('scenariusz 2: JDG art. 48a', () => {
  const p = scen('jdg48a');
  const e = computeEligibility(p, TODAY);
  assert.equal(e.payer, 'ZUS');
  assert.equal(e.blockedByDebt, false);
  const b = nonEmployeeBase(p);
  const pMin = 1441.8 * 0.8629;
  const pEx = (15000 - 1441.8) * 0.8629;
  assert.ok(Math.abs(b.base - (pMin + (pEx / 12) * 5)) < 0.01);
  const pDebt = { ...p, employment: { ...p.employment, contributionDebt: 60 } };
  assert.equal(computeEligibility(pDebt, TODAY).blockedByDebt, true);
  const risks = auditRisks(p, e, b, null, TODAY);
  assert.ok(risks.some((r) => r.id === 'zua'));
});

test('scenariusz 3: łączenie z pracą 1/2 etatu i porównanie wariantów', () => {
  const p = scen('shared');
  const par = parentalDimension(p);
  assert.equal(par.total, 41);
  assert.equal(par.motherWeeks, 32);
  const ext = partTimeExtension(p, par);
  assert.equal(ext.extensionWeeks, 16); // 16 × 0,5 / (1 − 0,5)
  const full = partTimeExtension({ ...p, plan: { ...p.plan, partTimeWeeks: 32 } }, par);
  assert.equal(full.motherTotalWeeks + par.fatherWeeks, 73);
  const cmp = compareVariants(p, TODAY, 9000, 8000);
  assert.ok(cmp.averaged.fatherTotal > 0);
  // ojciec: 9 tyg. 70% + 2 tyg. 100% w obu wariantach
  assert.equal(cmp.averaged.fatherTotal, cmp.variable.fatherTotal);
  assert.equal(computeEligibility(p, TODAY).payer, 'ZUS');
});

test('scenariusz 4: zbieg zlecenie+UoP, opiekuńczy', () => {
  const p = scen('zlecenie');
  const e = computeEligibility(p, TODAY);
  assert.equal(e.isEmployee, true);
  assert.equal(e.sicknessMandatory, true);
  const b = benefitBase(p, e);
  const care = careAllowance(p, e, b.base);
  assert.equal(care.eligible, true);
  assert.equal(care.grantedDays, 5);
  assert.ok(Math.abs(care.amount - Math.round(((b.base * 0.8) / 30) * 100) / 100 * 5) < 0.005);
  const sick = pregnancySickness(p, e, b.base);
  assert.equal(sick.employerDays, 27);
  assert.equal(sick.zusDays, 18);
});

test('wymiary: macierzyński, martwe urodzenie, adopcja', () => {
  const p = createDefaultProfile(TODAY);
  assert.equal(maternityDimension({ ...p, family: { ...p.family, childrenCount: 3 } }, TODAY).weeks, 33);
  const still = { ...p, family: { ...p.family, situation: 'PO_PORODZIE' as const, birthDate: TODAY, childOutcome: 'MARTWE' as const } };
  assert.equal(maternityDimension(still, TODAY).days, 56);
  const adopt = { ...p, family: { ...p.family, situation: 'ADOPCJA' as const, adoptionDate: TODAY, birthDate: '2019-12-20' } };
  assert.equal(maternityDimension(adopt, TODAY).weeks, 9);
});

test('kwota za okres: pełne miesiące = podstawa × %', () => {
  assert.equal(periodAmount(6000, 1, '2026-01-01', '2026-02-28'), 12000);
  assert.equal(periodAmount(6000, 1, '2026-01-01', '2026-01-10'), 2000);
});

test('ulga na start i student', () => {
  const p = createDefaultProfile(TODAY);
  const u = computeEligibility({ ...p, employment: { ...p.employment, title: 'JDG', jdgVariant: 'ULGA_NA_START' } }, TODAY);
  assert.equal(u.maternityEligible, false);
  const s = computeEligibility({ ...p, person: { ...p.person, isStudentUnder26: true }, employment: { ...p.employment, title: 'ZLECENIE' } }, TODAY);
  assert.equal(s.sicknessInsured, false);
});

test('dokumenty i terminy generują się dla wszystkich scenariuszy', () => {
  for (const s of DEMO_SCENARIOS) {
    const p = s.build(TODAY);
    const e = computeEligibility(p, TODAY);
    assert.ok(buildChecklist(p, e, TODAY).length > 0, s.id);
    assert.ok(generateForms(p, e, TODAY).length > 0, s.id);
    assert.ok(buildDeadlines(p, TODAY, e).length > 0, s.id);
  }
});

test('JSON: wszystkie scenariusze i dokumenty wczytane', () => {
  assert.equal(SCENARIOS.length, 21);
  for (const sc of SCENARIOS) for (const d of sc.dokumenty) assert.ok(d.length > 0);
});

test('przejęcie po 14 tyg.: podział macierzyńskiego, wnioski matki i ojca', () => {
  const p = scen('takeover');
  const e = computeEligibility(p, TODAY);
  const tl = buildTimeline(p, TODAY);
  const mother = tl.find((b) => b.kind === 'MACIERZYNSKI' && b.who === 'MATKA')!;
  const father = tl.find((b) => b.id === 'matF')!;
  assert.equal(father.who, 'OJCIEC');
  assert.equal(father.start, p.family.specialCaseDate);
  assert.ok(mother.end < father.start);
  assert.equal(Math.round((mother.weeks + father.weeks) * 7), 140);
  const ids = applicableScenarios(p, e, TODAY).map((a) => `${a.scenario.id}:${a.applicant}`);
  assert.ok(ids.includes('pracownik_rezygnacja_po_14_tyg:MATKA'));
  assert.ok(ids.includes('ojciec_przejecie_po_rezygnacji:OJCIEC'));
  const docs = buildChecklist(p, e, TODAY);
  assert.ok(docs.some((d) => d.docId === 'wniosek_lub_oswiadczenie_ojca_przejecie' && d.destination === 'PRACODAWCA'));
  assert.ok(docs.some((d) => d.docId === 'oswiadczenie_matki_rezygnacja' && d.destination === 'PRACODAWCA_OJCA'));
  assert.ok(generateForms(p, e, TODAY).some((f) => f.id === 'sc-ojciec_przejecie_po_rezygnacji-OJCIEC'));
  assert.equal(specialCaseIssues(p).length, 0);
  const tooEarly = { ...p, family: { ...p.family, specialCaseDate: p.family.birthDate } };
  assert.ok(specialCaseIssues(tooEarly).some((i) => i.includes('Najwcześniej')));
});

test('matka nieubezpieczona: zasiłek i urlop ojca, 9 tyg. matki przepada', () => {
  const base = createDefaultProfile(TODAY);
  const birth = '2026-10-01';
  const p = { ...base, employment: { ...base.employment, title: 'NIEUBEZPIECZONY' as const }, family: { ...base.family, situation: 'PO_PORODZIE' as const, birthDate: birth, specialCase: 'MATKA_NIEUB_ZGON' as const, specialCaseDate: '2026-10-20' } };
  assert.equal(fatherCarriesBenefit(p), true);
  const tl = buildTimeline(p, TODAY);
  assert.ok(tl.every((b) => b.who === 'OJCIEC'));
  const parF = tl.find((b) => b.kind === 'RODZICIELSKI')!;
  assert.equal(Math.round(parF.weeks), 32);
  const e = computeEligibility(p, TODAY);
  assert.ok(applicableScenarios(p, e, TODAY).some((a) => a.scenario.id === 'ojciec_matka_nieubezpieczona_zgon'));
  const cmp = compareVariants(p, TODAY, 0, 6000);
  assert.ok(cmp.variable.fatherTotal > 0 && cmp.variable.motherTotal === 0);
});

test('zgon matki: ojciec przejmuje także rodzicielski (z 9 tyg.)', () => {
  const p0 = scen('takeover');
  const p = { ...p0, family: { ...p0.family, specialCase: 'ZGON_MATKI' as const, specialCaseDate: addDaysT(p0.family.birthDate, 30) } };
  const tl = buildTimeline(p, TODAY);
  const par = tl.find((b) => b.kind === 'RODZICIELSKI')!;
  assert.equal(par.who, 'OJCIEC');
  assert.equal(Math.round(par.weeks), 41);
  assert.ok(!tl.some((b) => b.kind === 'RODZICIELSKI_9'));
});

test('szpital matki: matka wraca po wyjściu ze szpitala', () => {
  const p0 = scen('takeover');
  const d = addDaysT(p0.family.birthDate, 70);
  const p = { ...p0, family: { ...p0.family, specialCase: 'MATKA_SZPITAL' as const, specialCaseDate: d, specialCaseEndDate: addDaysT(d, 13) } };
  const tl = buildTimeline(p, TODAY);
  assert.ok(tl.some((b) => b.id === 'mat2' && b.who === 'MATKA'));
  assert.equal(Math.round(tl.find((b) => b.id === 'matF')!.weeks), 2);
});

function addDaysT(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test('brak ubezpieczenia: strata względem umowy o pracę za płacę minimalną', async () => {
  const { insuranceLoss } = await import('../benefitCalculator');
  const base = createDefaultProfile(TODAY);
  const p = { ...base, employment: { ...base.employment, title: 'NIEUBEZPIECZONY' as const } };
  const l = insuranceLoss(p, TODAY, 4806);
  assert.equal(l.base, 4147.1);
  assert.ok(Math.abs(l.uninsuredTotal - 12000) < 150, `świadczenie ${l.uninsuredTotal}`);
  assert.ok(l.insuredTotal > 35000 && l.insuredTotal < 45000, `zasiłek ${l.insuredTotal}`);
  assert.ok(Math.abs(l.loss - (l.insuredTotal - l.uninsuredTotal)) < 0.01);
  const twins = insuranceLoss({ ...p, family: { ...p.family, childrenCount: 2 } }, TODAY, 4806);
  assert.equal(twins.uninsuredWeeks, 65);
});

test('łączenie z pracą: puste tygodnie = cały urlop matki, wniosek się pojawia', () => {
  const p0 = createDefaultProfile(TODAY);
  const p = { ...p0, plan: { ...p0.plan, partTimeFraction: 0.5, partTimeWeeks: 0 } };
  const e = computeEligibility(p, TODAY);
  const ext = partTimeExtension(p, parentalDimension(p));
  assert.equal(ext.combinedWeeks, 32);
  assert.ok(generateForms(p, e, TODAY).some((f) => f.id === 'part-time'));
});

test('martwe urodzenie / zgon dziecka: wniosek, właściwy dokument i wzór wniosku', () => {
  const cases = [
    { outcome: 'MARTWE', scenario: 'martwe_urodzenie_lub_zgon_do_8_tyg', doc: 'akt_urodzenia_martwe_dziecko' },
    { outcome: 'ZGON_PRZED_8_TYG', scenario: 'martwe_urodzenie_lub_zgon_do_8_tyg', doc: 'akt_urodzenia' },
    { outcome: 'ZGON_PO_8_TYG', scenario: 'zgon_dziecka_po_8_tyg', doc: 'akt_urodzenia' },
  ] as const;
  for (const c of cases) {
    const p = createDefaultProfile(TODAY);
    p.family.situation = 'PO_PORODZIE';
    p.family.birthDate = '2027-01-10';
    p.family.childOutcome = c.outcome;
    if (c.outcome !== 'MARTWE') p.family.childDeathDate = c.outcome === 'ZGON_PO_8_TYG' ? '2027-04-20' : '2027-02-20';
    const e = computeEligibility(p, TODAY);
    const ids = applicableScenarios(p, e, TODAY).map((a) => a.scenario.id);
    assert.ok(ids.includes(c.scenario), `${c.outcome}: ${ids.join(',')}`);
    const docs = buildChecklist(p, e, TODAY).map((d) => d.docId);
    assert.ok(docs.includes(c.doc), `${c.outcome}: ${docs.join(',')}`);
    assert.ok(docs.includes('zus_z12'), c.outcome);
    const form = generateForms(p, e, TODAY).find((f) => f.id === `sc-${c.scenario}-MATKA`);
    assert.ok(form, c.outcome);
    assert.ok(form.body.includes('Data porodu: 10.01.2027'), c.outcome);
    const funeral = generateForms(p, e, TODAY).find((f) => f.id === 'funeral');
    assert.ok(funeral, `${c.outcome}: brak wzoru Z-12`);
    assert.ok(funeral.body.includes(c.outcome === 'MARTWE' ? 'urodzone martwe w dniu 10.01.2027' : 'zmarłe w dniu'), c.outcome);
  }
  // Przy żywym urodzeniu wzoru Z-12 nie ma.
  const live = createDefaultProfile(TODAY);
  assert.ok(!generateForms(live, computeEligibility(live, TODAY), TODAY).some((f) => f.id === 'funeral'));
});


test('świadczenie rehabilitacyjne: 100% w ciąży, 90%/75% poza ciążą, maks. 12 miesięcy (art. 18–19)', () => {
  const base = 6000;
  const preg = rehabilitationBenefit(base, 60, true)!;
  assert.equal(preg.rate, 1);
  assert.equal(preg.amount, Math.round(base / 30 * 60 * 100) / 100);
  const other = rehabilitationBenefit(base, 120, false)!;
  assert.equal(other.amount, Math.round((base * 0.9 / 30 * 90 + base * 0.75 / 30 * 30) * 100) / 100);
  assert.equal(rehabilitationBenefit(base, 1000, true)!.days, 360);
  assert.equal(rehabilitationBenefit(base, 0, true), null);
  // Zwolnienie dłuższe niż 270 dni z kodem B → nadwyżka liczona jako świadczenie rehabilitacyjne.
  const p = createDefaultProfile(TODAY);
  p.plan.codeB = true;
  p.plan.sickLeavePregnancyDays = 300;
  const e = computeEligibility(p, TODAY);
  const s = pregnancySickness(p, e, benefitBase(p, e).base);
  assert.equal(s.overLimitDays, 30);
  assert.equal(s.rehab?.days, 30);
});

test('zasiłek w wysokości zasiłku macierzyńskiego do dnia porodu (art. 30 ust. 3)', () => {
  const p = createDefaultProfile(TODAY);
  p.family.expectedDueDate = '2027-03-01';
  p.employment.pregnancyTermination = 'UPADLOSC_LIKWIDACJA';
  p.employment.terminationDate = '2027-01-31';
  const b = bridgingMaternity(p, 6000, TODAY)!;
  assert.equal(b.eligible, true);
  assert.equal(b.start, '2027-02-01');
  assert.equal(b.end, '2027-02-28');
  assert.equal(b.days, 28);
  assert.equal(b.amount, 5600);
  // Naruszenie przepisów — bez zasiłku do porodu, ale z informacją o wyroku i z kartą ryzyka.
  p.employment.pregnancyTermination = 'NARUSZENIE_PRAWA';
  assert.equal(bridgingMaternity(p, 6000, TODAY)!.eligible, false);
  const e = computeEligibility(p, TODAY);
  assert.ok(auditRisks(p, e, benefitBase(p, e), null, TODAY).some((r) => r.id === 'naruszenie'));
  // Bez ustania umowy — brak karty.
  assert.equal(bridgingMaternity(createDefaultProfile(TODAY), 6000, TODAY), null);
});

test('formularze po 24.10.2026: przedsiębiorczyni składa ZAM, bez Z-3b', () => {
  const sc = SCENARIOS.find((s) => s.id === 'nie_pracownik_dzialalnosc')!;
  assert.ok(sc.dokumenty.includes('zus_zam'));
  assert.ok(!JSON.stringify(SCENARIOS).includes('zus_z3b'));
});


test('martwe urodzenie i zgon przed 8. tygodniem: 100% także przy wybranym wariancie 81,5%', () => {
  for (const outcome of ['MARTWE', 'ZGON_PRZED_8_TYG'] as const) {
    const p = createDefaultProfile(TODAY);
    p.family.situation = 'PO_PORODZIE';
    p.family.birthDate = '2027-01-10';
    p.family.childOutcome = outcome;
    if (outcome !== 'MARTWE') p.family.childDeathDate = '2027-02-01';
    p.plan.variant = 'USREDNIONY';
    const mat = buildTimeline(p, TODAY).find((b) => b.kind === 'MACIERZYNSKI')!;
    assert.equal(mat.rate, 1, outcome);
  }
  // Żywe urodzenie z wariantem uśrednionym — bez zmian (81,5%).
  const live = createDefaultProfile(TODAY);
  live.plan.variant = 'USREDNIONY';
  assert.equal(buildTimeline(live, TODAY).find((b) => b.kind === 'MACIERZYNSKI')!.rate, 0.815);
});
