import { useState } from 'react';
import { buildSalaryMonths } from '../data/demoScenarios';
import { JDG_BASES_2026, LEGAL, MAX_VOLUNTARY_SICKNESS_BASE, MIN_WAGE_2026 } from '../domain/constants2026';
import { isValidISO } from '../domain/dateUtils';
import { SPECIAL_CASES, eventDate } from '../domain/eligibilityEngine';
import { jdgMinimumBase } from '../domain/benefitCalculator';
import type { ContractType, DocumentOrigin, InsuranceTitle, PregnancyTermination, JdgVariant, SalaryMonth, SpecialCase } from '../domain/types';
import { useProfile, useSection } from '../state/ProfileContext';
import { InsuranceLossSummary } from './InsuranceLoss';
import { STAGE_LABEL, StageStep, stageOf } from './StageStep';
import { Badge, Card, DateInput, Field, Icon, LegalTip, NumberInput, Segmented, Select, TextInput, Toggle, money } from './ui';

const STEPS = ['Etap', 'Status zawodowy', 'Sytuacja rodzinna', 'Wynagrodzenie / podstawa'] as const;
const LAST = STEPS.length - 1;

export function Wizard({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const { derived } = useProfile();
  return (
    <div className="wizard-grid">
      <div>
        <ol className="stepper" aria-label="Kroki kreatora">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''}>
              <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="step-no">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
                {s}
              </button>
            </li>
          ))}
        </ol>
        {step === 0 && <StageStep />}
        {step === 1 && <StepEmployment onShowLoss={onFinish} />}
        {step === 2 && <StepFamily onChangeStage={() => setStep(0)} />}
        {step === 3 && <StepSalary />}
        <div className="wizard-nav">
          <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Wstecz</button>
          {step < LAST ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>Dalej <Icon name="arrow" size={16} /></button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onFinish}>Pokaż wyliczenia <Icon name="arrow" size={16} /></button>
          )}
        </div>
      </div>
      <aside className="summary">
        <Card title="Kwalifikacja na żywo">
          <div className="kv">
            <span>Ubezpieczenie chorobowe</span>
            <Badge tone={derived.eligibility.sicknessInsured ? 'ok' : 'danger'}>{derived.eligibility.sicknessInsured ? (derived.eligibility.sicknessMandatory ? 'obowiązkowe' : 'dobrowolne') : 'brak'}</Badge>
            <span>Płatnik zasiłku <LegalTip legal={LEGAL.uz61} /></span>
            <Badge tone={derived.eligibility.sicknessInsured ? 'info' : 'neutral'}>{!derived.eligibility.sicknessInsured ? 'brak' : derived.eligibility.payer === 'ZUS' ? 'ZUS' : 'Pracodawca'}</Badge>
            <span>Zasiłek macierzyński</span>
            <Badge tone={derived.eligibility.maternityEligible ? 'ok' : 'danger'}>{derived.eligibility.maternityEligible ? 'przysługuje' : 'nie przysługuje'}</Badge>
            <span>Zasiłek chorobowy <LegalTip legal={LEGAL.uz4} /></span>
            <Badge tone={derived.eligibility.sicknessEligible ? 'ok' : 'warn'}>{derived.eligibility.sicknessEligible ? 'przysługuje' : derived.eligibility.waitingPeriodSatisfied ? 'nie' : `wyczekiwanie ${derived.eligibility.insuredDays}/${derived.eligibility.waitingPeriodDays} dni`}</Badge>
            <span>Podstawa wymiaru</span>
            <strong>{money(derived.base.base)}</strong>
          </div>
          <p className="muted small">{derived.eligibility.payerReason}</p>
          <ul className="notes">
            {derived.eligibility.notes.map((n, i) => (
              <li key={i}>{n.text} <LegalTip legal={n.legal} /></li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

/* ---------------- Krok 1 ---------------- */

function StepEmployment({ onShowLoss }: { onShowLoss: () => void }) {
  const [emp, setEmp] = useSection('employment');
  const [person, setPerson] = useSection('person');
  const { defaults, derived } = useProfile();
  const payerErr = emp.insuredAtPayer < 1 ? 'Podaj co najmniej 1 osobę.' : null;
  return (
    <Card title="Krok 2. Status zawodowy" subtitle="Tytuł ubezpieczenia decyduje o prawie do zasiłków, okresie wyczekiwania i płatniku.">
      <div className="grid-2">
        <Field label="Imię"><TextInput value={person.firstName} def={defaults.person.firstName} onChange={(v) => setPerson('firstName', v)} /></Field>
        <Field label="Nazwisko"><TextInput value={person.lastName} def={defaults.person.lastName} onChange={(v) => setPerson('lastName', v)} /></Field>
        <Field label="PESEL" hint="Opcjonalnie — trafi tylko do generowanych wniosków (dane zostają w przeglądarce)." error={person.pesel && !/^\d{11}$/.test(person.pesel) ? 'PESEL ma 11 cyfr.' : null}>
          <TextInput value={person.pesel} def={defaults.person.pesel} inputMode="numeric" maxLength={11} sanitize={(v) => v.replace(/\D/g, '')} onChange={(v) => setPerson('pesel', v)} />
        </Field>
        <Field label="Data urodzenia ubezpieczonej" legal="art. 92 § 1 pkt 1 KP — 14 dni wynagrodzenia chorobowego po 50. roku życia">
          <DateInput value={person.birthDate} def={defaults.person.birthDate} onChange={(v) => setPerson('birthDate', v)} />
        </Field>
      </div>

      <Field label="Tytuł ubezpieczenia">
        <Segmented<InsuranceTitle>
          ariaLabel="Tytuł ubezpieczenia"
          value={emp.title}
          onChange={(v) => setEmp('title', v)}
          options={[
            { value: 'UOP', label: 'Umowa o pracę' },
            { value: 'ZLECENIE', label: 'Umowa zlecenia' },
            { value: 'JDG', label: 'Działalność (JDG)' },
            { value: 'NIEUBEZPIECZONY', label: 'Brak ubezpieczenia' },
          ]}
        />
      </Field>

      {emp.title !== 'NIEUBEZPIECZONY' && (
        <div className="grid-2">
          <Field label={emp.title === 'JDG' ? 'Nazwa firmy' : 'Pracodawca / zleceniodawca'}>
            <TextInput value={emp.employerName} def={defaults.employment.employerName} onChange={(v) => setEmp('employerName', v)} />
          </Field>
          {emp.title !== 'JDG' && (
            <Field label="Liczba zgłoszonych do ubezp. chorobowego u płatnika" hint="Stan na 30 listopada poprzedniego roku. ≤ 20 → zasiłek wypłaca ZUS, > 20 → pracodawca." legal={LEGAL.uz61} error={payerErr}>
              <NumberInput value={emp.insuredAtPayer} def={defaults.employment.insuredAtPayer} min={0} onChange={(v) => setEmp('insuredAtPayer', Math.round(v))} suffix="osób" />
            </Field>
          )}
          <Field label="Początek ubezpieczenia chorobowego" legal={LEGAL.uz4}>
            <DateInput value={emp.insuranceStart} def={defaults.employment.insuranceStart} onChange={(v) => setEmp('insuranceStart', v)} />
          </Field>
        </div>
      )}

      {emp.title === 'UOP' && (
        <div className="grid-2">
          <Field label="Rodzaj umowy" legal={LEGAL.art177}>
            <Select<ContractType>
              value={emp.contractType}
              onChange={(v) => setEmp('contractType', v)}
              options={[
                { value: 'NIEOKRESLONY', label: 'Na czas nieokreślony' },
                { value: 'OKRESLONY', label: 'Na czas określony' },
                { value: 'PROBNY', label: 'Na okres próbny' },
                { value: 'ZASTEPSTWO', label: 'Na zastępstwo' },
              ]}
            />
          </Field>
          {emp.contractType !== 'NIEOKRESLONY' && (
            <Field label="Data końca umowy"><DateInput value={emp.contractEnd} def={defaults.employment.contractEnd} onChange={(v) => setEmp('contractEnd', v)} /></Field>
          )}
          <Field label="Czy umowa ustała w czasie ciąży?" legal={LEGAL.uz30} hint="Od tego zależy zasiłek do dnia porodu i prawo do zasiłku macierzyńskiego po porodzie.">
            <Select<PregnancyTermination>
              value={emp.pregnancyTermination}
              onChange={(v) => setEmp('pregnancyTermination', v)}
              options={[
                { value: 'BRAK', label: 'Nie, nadal pracuję' },
                { value: 'UPADLOSC_LIKWIDACJA', label: 'Tak — upadłość lub likwidacja pracodawcy' },
                { value: 'SMIERC_PRACODAWCY', label: 'Tak — umowa wygasła po śmierci pracodawcy' },
                { value: 'NARUSZENIE_PRAWA', label: 'Tak — rozwiązanie z naruszeniem przepisów' },
              ]}
            />
          </Field>
          {emp.pregnancyTermination !== 'BRAK' && (
            <Field label="Data ustania umowy"><DateInput value={emp.terminationDate} def={defaults.employment.terminationDate} onChange={(v) => setEmp('terminationDate', v)} /></Field>
          )}
          <Field label="Wymiar etatu" legal={LEGAL.uz45} hint="Twój etat w pracy (np. 0,5). Łączenie urlopu rodzicielskiego z pracą ustawisz w „Ile dostaniesz” → „Rodzicielski + praca”.">
            <NumberInput value={emp.fullTimeFraction} def={defaults.employment.fullTimeFraction} min={0.1} max={1} step={0.25} onChange={(v) => setEmp('fullTimeFraction', v)} />
          </Field>
        </div>
      )}

      {emp.title === 'ZLECENIE' && (
        <div className="stack">
          <Toggle label="Jestem uczniem / studentem do 26. roku życia" checked={person.isStudentUnder26} onChange={(v) => setPerson('isStudentUnder26', v)} legal="art. 6 ust. 4 ustawy o sus" />
          <Toggle label="Mam równocześnie umowę o pracę u innego pracodawcy (zbieg tytułów)" checked={emp.concurrentUop} onChange={(v) => setEmp('concurrentUop', v)} legal="art. 9 ust. 1a ustawy o sus" />
          {emp.concurrentUop && (
            <Field label="Wynagrodzenie z umowy o pracę (brutto)" hint={`≥ ${money(MIN_WAGE_2026)} → zlecenie nie jest tytułem do ubezpieczeń społecznych.`}>
              <NumberInput value={emp.concurrentUopSalary} def={defaults.employment.concurrentUopSalary} min={0} onChange={(v) => setEmp('concurrentUopSalary', v)} suffix="zł" />
            </Field>
          )}
          {!(emp.concurrentUop && emp.concurrentUopSalary >= MIN_WAGE_2026) && (
            <>
              <Toggle label="Przystąpiłam do dobrowolnego ubezpieczenia chorobowego" checked={emp.voluntarySickness} onChange={(v) => setEmp('voluntarySickness', v)} legal="art. 11 ust. 2 ustawy o sus" />
              <Toggle label="Zgłoszenie do ubezpieczeń złożono w ciągu 7 dni od zawarcia umowy" checked={emp.reportedWithin7Days} onChange={(v) => setEmp('reportedWithin7Days', v)} legal="art. 14 ust. 1 ustawy o sus" />
            </>
          )}
        </div>
      )}

      {emp.title === 'JDG' && (
        <>
          <div className="grid-2">
            <Field label="Wariant składek" legal="art. 18–18c ustawy o sus; art. 18 Prawa przedsiębiorców">
              <Select<JdgVariant>
                value={emp.jdgVariant}
                onChange={(v) => setEmp('jdgVariant', v)}
                options={[
                  { value: 'ULGA_NA_START', label: 'Ulga na start (6 mies.)' },
                  { value: 'PREFERENCYJNY', label: `Preferencyjny ZUS (24 mies., min. ${money(JDG_BASES_2026.preferentialMin)})` },
                  { value: 'MALY_ZUS_PLUS', label: 'Mały ZUS+ (przychód ≤ 120 000 zł)' },
                  { value: 'DUZY_ZUS', label: `Duży ZUS (min. ${money(JDG_BASES_2026.standardMin)})` },
                ]}
              />
            </Field>
            <Field label="Zadłużenie składkowe na dzień porodu" legal={LEGAL.uz2a} hint="Tolerancja: 48,06 zł (1% płacy minimalnej).">
              <NumberInput value={emp.contributionDebt} def={defaults.employment.contributionDebt} min={0} onChange={(v) => setEmp('contributionDebt', v)} suffix="zł" />
            </Field>
            {emp.jdgVariant === 'MALY_ZUS_PLUS' && (
              <>
                <Field label="Przychód w poprzednim roku"><NumberInput value={emp.previousYearRevenue} def={defaults.employment.previousYearRevenue} min={0} onChange={(v) => setEmp('previousYearRevenue', v)} suffix="zł" /></Field>
                <Field label="Dni działalności w poprzednim roku"><NumberInput value={emp.previousYearActivityDays} def={defaults.employment.previousYearActivityDays} min={0} max={366} onChange={(v) => setEmp('previousYearActivityDays', Math.round(v))} /></Field>
                <Field label="Wykorzystane miesiące małego ZUS+ (w oknie 60 mies.)"><NumberInput value={emp.malyZusPlusMonthsUsed} def={defaults.employment.malyZusPlusMonthsUsed} min={0} max={60} onChange={(v) => setEmp('malyZusPlusMonthsUsed', Math.round(v))} /></Field>
              </>
            )}
          </div>
          {emp.jdgVariant !== 'ULGA_NA_START' && (
            <Toggle label="Opłacam dobrowolną składkę chorobową (2,45%)" checked={emp.voluntarySickness} onChange={(v) => setEmp('voluntarySickness', v)} legal="art. 11 ust. 2 ustawy o sus" />
          )}
        </>
      )}

      {!derived.eligibility.sicknessInsured && <InsuranceLossSummary onShowDetails={onShowLoss} />}

      {emp.title !== 'NIEUBEZPIECZONY' && (
        <details className="more">
          <summary>Wyjątki od okresu wyczekiwania (zasiłek chorobowy) <LegalTip legal={LEGAL.uz4} /></summary>
          <div className="stack">
            <Toggle label="Absolwent zgłoszony w ciągu 90 dni od ukończenia szkoły / studiów" checked={emp.graduateWithin90Days} onChange={(v) => setEmp('graduateWithin90Days', v)} />
            <Toggle label="Co najmniej 10 lat obowiązkowego ubezpieczenia chorobowego" checked={emp.priorMandatory10Years} onChange={(v) => setEmp('priorMandatory10Years', v)} />
            <Toggle label="Niezdolność wskutek wypadku w drodze do/z pracy" checked={emp.commuteAccident} onChange={(v) => setEmp('commuteAccident', v)} />
          </div>
        </details>
      )}
    </Card>
  );
}

/* ---------------- Krok 2 ---------------- */

function StepFamily({ onChangeStage }: { onChangeStage: () => void }) {
  const [fam, setFam] = useSection('family');
  const { update, defaults } = useProfile();
  const setOther = <K extends keyof typeof fam.otherParent>(k: K, v: (typeof fam.otherParent)[K]) =>
    update((p) => ({ ...p, family: { ...p.family, otherParent: { ...p.family.otherParent, [k]: v } } }));
  const { profile } = useProfile();
  const stage = stageOf(profile);
  const adoption = stage === 'PRZYJECIE';
  const loss = stage === 'STRATA';
  const stageSubtitle = (
    <>
      Etap: <strong>{STAGE_LABEL[stage]}</strong>
      {adoption && ` (${fam.situation === 'ADOPCJA' ? 'adopcja' : 'rodzina zastępcza'})`}.{' '}
      <button type="button" className="link-btn" onClick={onChangeStage}>Zmień etap</button>
    </>
  );
  const weekErr = fam.pregnancyWeekAtBirth < 20 || fam.pregnancyWeekAtBirth > 44 ? 'Tydzień ciąży poza zakresem 20–44.' : null;
  const birthErr = fam.situation === 'PO_PORODZIE' && !isValidISO(fam.birthDate) ? 'Podaj datę porodu.' : null;
  const dueErr = fam.situation === 'CIAZA' && !isValidISO(fam.expectedDueDate) ? 'Podaj przewidywaną datę porodu.' : null;

  return (
    <Card title="Krok 3. Sytuacja rodzinna" subtitle={stageSubtitle}>
      <div className="grid-2">
        {stage === 'CIAZA' && (
          <Field label="Przewidywana data porodu" error={dueErr}><DateInput value={fam.expectedDueDate} def={defaults.family.expectedDueDate} onChange={(v) => setFam('expectedDueDate', v)} /></Field>
        )}
        {stage !== 'CIAZA' && (
          <Field label={adoption ? 'Data urodzenia dziecka' : 'Data porodu'} error={birthErr}><DateInput value={fam.birthDate} def={defaults.family.birthDate} onChange={(v) => setFam('birthDate', v)} /></Field>
        )}
        {loss && fam.childOutcome !== 'MARTWE' && (
          <Field label="Data zgonu dziecka"><DateInput value={fam.childDeathDate} def={defaults.family.childDeathDate} onChange={(v) => setFam('childDeathDate', v)} /></Field>
        )}
        {adoption && (
          <>
            <Field label="Data przyjęcia dziecka na wychowanie" legal={LEGAL.art183}><DateInput value={fam.adoptionDate} def={defaults.family.adoptionDate} onChange={(v) => setFam('adoptionDate', v)} /></Field>
            <Field label="Wiek dziecka w dniu przyjęcia"><NumberInput value={fam.childAgeYears} def={defaults.family.childAgeYears} min={0} max={14} onChange={(v) => setFam('childAgeYears', Math.round(v))} suffix="lat" /></Field>
          </>
        )}
        <Field label={adoption ? 'Liczba dzieci przyjętych jednocześnie' : 'Liczba dzieci urodzonych jednym porodem'} legal={LEGAL.art180}>
          <Select<string> value={String(Math.min(5, fam.childrenCount))} onChange={(v) => setFam('childrenCount', Number(v))} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 5 ? '5 i więcej' : String(n) }))} />
        </Field>
        {!adoption && (
          <Field label="Część urlopu przed porodem" hint="Maks. 6 tygodni — wliczane do wymiaru urlopu." legal="art. 180 § 2 KP">
            <NumberInput value={fam.prenatalWeeks} def={defaults.family.prenatalWeeks} min={0} max={6} onChange={(v) => setFam('prenatalWeeks', Math.round(v))} suffix="tyg." />
          </Field>
        )}
      </div>

      {fam.situation === 'PO_PORODZIE' && (
        <>
          {fam.childOutcome === 'ZYWE' && (
            <fieldset className="fieldset">
              <legend>Wcześniak / hospitalizacja dziecka <LegalTip legal={LEGAL.art1802} /></legend>
              <div className="grid-4">
                <Field label="Tydzień ciąży przy porodzie" error={weekErr}><NumberInput value={fam.pregnancyWeekAtBirth} def={defaults.family.pregnancyWeekAtBirth} min={20} max={44} onChange={(v) => setFam('pregnancyWeekAtBirth', Math.round(v))} /></Field>
                <Field label="Masa urodzeniowa"><NumberInput value={fam.birthWeightGrams} def={defaults.family.birthWeightGrams} min={0} max={7000} onChange={(v) => setFam('birthWeightGrams', Math.round(v))} suffix="g" /></Field>
                <Field label="Łączne dni w szpitalu" hint="Okresy sumuje się."><NumberInput value={fam.childHospitalDays} def={defaults.family.childHospitalDays} min={0} max={400} onChange={(v) => setFam('childHospitalDays', Math.round(v))} suffix="dni" /></Field>
                <Field label="Pierwszy dzień pobytu" hint="Liczony od porodu (dzień 1)."><NumberInput value={fam.childHospitalStartDay} def={defaults.family.childHospitalStartDay} min={1} max={120} onChange={(v) => setFam('childHospitalStartDay', Math.round(v))} /></Field>
              </div>
            </fieldset>
          )}
        </>
      )}

      <div className="stack">
        {!loss && <Toggle label="Dziecko ma zaświadczenie „Za życiem”" checked={fam.zaZyciem} onChange={(v) => setFam('zaZyciem', v)} legal="art. 182¹a § 1¹ KP" />}
        {adoption && <Toggle label="Odroczony obowiązek szkolny (granica 10 lat)" checked={fam.schoolDeferral} onChange={(v) => setFam('schoolDeferral', v)} legal={LEGAL.art183} />}
        {adoption && <Toggle label="Sąd wydał już prawomocne postanowienie o przysposobieniu" checked={fam.adoptionFinalized} onChange={(v) => setFam('adoptionFinalized', v)} legal="art. 182³ § 1 pkt 2 KP; § 17 rozporządzenia z 11.03.2025" />}
        {!loss && <Toggle label="Rozważam urlop wychowawczy po urlopie rodzicielskim" checked={fam.considersChildcareLeave} onChange={(v) => setFam('considersChildcareLeave', v)} legal="§ 19–20 rozporządzenia z 11.03.2025" />}
        <Field label="Dokumenty (akt urodzenia, zaświadczenia) wystawione">
          <Select<DocumentOrigin> value={fam.documentsOrigin} onChange={(v) => setFam('documentsOrigin', v)} options={[{ value: 'PL', label: 'w Polsce' }, { value: 'UE_EFTA_UK', label: 'w UE, EFTA/EOG, Szwajcarii lub państwie z umową o zabezpieczeniu społecznym (np. Wielka Brytania)' }, { value: 'INNE', label: 'w innym państwie' }]} />
        </Field>
      </div>

      {fam.situation === 'PO_PORODZIE' && fam.childOutcome === 'ZYWE' && <SpecialCaseFields />}

      {!loss && (
      <fieldset className="fieldset">
        <legend>Drugi rodzic</legend>
        <div className="grid-2">
          <Field label="Imię i nazwisko"><TextInput value={fam.otherParent.name} def={defaults.family.otherParent.name} onChange={(v) => setOther('name', v)} /></Field>
          <Field label="Podstawa wymiaru zasiłku drugiego rodzica" hint="Po odliczeniu 13,71% — do porównania wariantów."><NumberInput value={fam.otherParent.monthlyBase} def={defaults.family.otherParent.monthlyBase} min={0} onChange={(v) => setOther('monthlyBase', v)} suffix="zł" /></Field>
        </div>
        <div className="stack">
          <Toggle label="Drugi rodzic ma ubezpieczenie chorobowe" checked={fam.otherParent.insured} onChange={(v) => setOther('insured', v)} />
          {fam.otherParent.insured && (
            <Field label="Tytuł ubezpieczenia drugiego rodzica" hint="Wnioski urlopowe z rozporządzenia składa tylko pracownik.">
              <Select<InsuranceTitle> value={fam.otherParent.title} onChange={(v) => setOther('title', v)} options={[{ value: 'UOP', label: 'Umowa o pracę' }, { value: 'ZLECENIE', label: 'Umowa zlecenia' }, { value: 'JDG', label: 'Działalność (JDG)' }]} />
            </Field>
          )}
          {fam.otherParent.insured && (
            <>
              <Toggle label="Weźmie urlop ojcowski (2 tyg., 100%)" checked={fam.otherParent.takesPaternity} onChange={(v) => setOther('takesPaternity', v)} legal={LEGAL.art1823} />
              <Toggle label="Wykorzysta swoje nieprzenoszalne 9 tygodni rodzicielskiego (70%)" checked={fam.otherParent.takesNineWeeks} onChange={(v) => setOther('takesNineWeeks', v)} legal="art. 182¹a § 3 KP" />
            </>
          )}
        </div>
      </fieldset>
      )}
    </Card>
  );
}

/** Szczególne sytuacje z rozporządzenia z 11.03.2025 (§ 3–13): przejęcie urlopu macierzyńskiego przez ojca. */
function SpecialCaseFields() {
  const [fam, setFam] = useSection('family');
  const { profile, derived, defaults } = useProfile();
  const motherInsured = profile.employment.title !== 'NIEUBEZPIECZONY';
  const options = (Object.keys(SPECIAL_CASES) as SpecialCase[])
    .filter((k) => k === 'BRAK' || SPECIAL_CASES[k].motherInsured === motherInsured)
    .map((k) => ({ value: k, label: SPECIAL_CASES[k].label }));
  const meta = SPECIAL_CASES[fam.specialCase];
  return (
    <fieldset className="fieldset">
      <legend>Szczególna sytuacja <LegalTip legal="art. 180 § 4–17 KP; § 3–13 rozporządzenia z 11.03.2025" /></legend>
      <p className="small muted" style={{ marginBottom: 10 }}>
        {motherInsured
          ? 'Gdy matka rezygnuje z części urlopu, trafia do szpitala, umiera albo porzuca dziecko, pozostałą część urlopu macierzyńskiego może przejąć ojciec (lub inny członek najbliższej rodziny).'
          : 'Matka nie ma ubezpieczenia chorobowego (krok 1). W tych sytuacjach urlop macierzyński i zasiłek przysługują ubezpieczonemu ojcu.'}
      </p>
      <Field label="Sytuacja">
        <Select<SpecialCase> value={options.some((o) => o.value === fam.specialCase) ? fam.specialCase : 'BRAK'} onChange={(v) => setFam('specialCase', v)} options={options} />
      </Field>
      {fam.specialCase !== 'BRAK' && (
        <>
          <div className="grid-2">
            <Field label={meta.dateLabel} hint={meta.minWeeksAfterBirth ? `Najwcześniej po ${meta.minWeeksAfterBirth} tygodniach od porodu.` : undefined} legal={meta.legal}>
              <DateInput value={fam.specialCaseDate} def={defaults.family.specialCaseDate} onChange={(v) => setFam('specialCaseDate', v)} />
            </Field>
            {meta.endDateLabel && (
              <Field label={meta.endDateLabel}>
                <DateInput value={fam.specialCaseEndDate} def={defaults.family.specialCaseEndDate} onChange={(v) => setFam('specialCaseEndDate', v)} />
              </Field>
            )}
          </div>
          {derived.specialIssues.length > 0 && (
            <ul className="notes issues" role="alert">
              {derived.specialIssues.map((i) => <li key={i}>{i}</li>)}
            </ul>
          )}
        </>
      )}
    </fieldset>
  );
}

/* ---------------- Krok 3 ---------------- */

function StepSalary() {
  const { profile, update, today, derived, defaults } = useProfile();
  const s = profile.salary;
  const employee = derived.eligibility.isEmployee;
  const [quickFixed, setQuickFixed] = useState(7000);
  const [quickVar, setQuickVar] = useState(0);
  const [quickCount, setQuickCount] = useState(12);
  const setSalary = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => update((p) => ({ ...p, salary: { ...p.salary, [k]: v } }));
  const setMonth = (i: number, patch: Partial<SalaryMonth>) => setSalary('months', s.months.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  if (!derived.eligibility.sicknessInsured) {
    return <Card title="Krok 3. Wynagrodzenie / podstawa"><p>Bez ubezpieczenia chorobowego podstawa wymiaru zasiłku nie jest ustalana. Wróć do kroku 1, aby zmienić tytuł ubezpieczenia.</p></Card>;
  }

  if (!employee) {
    const min = jdgMinimumBase(profile) || JDG_BASES_2026.preferentialMin;
    return (
      <Card title="Krok 3. Podstawa wymiaru składki chorobowej" subtitle="Niepracownik: przeciętny przychód (podstawa składek) z 12 miesięcy, a przy krótszym ubezpieczeniu — algorytm art. 48a." actions={<LegalTip legal={`${LEGAL.uz48}; ${LEGAL.uz48a}`} />}>
        <div className="grid-3">
          <Field label="Pełne miesiące ubezpieczenia" hint="Maks. 12."><NumberInput value={quickCount} def={12} min={0} max={12} onChange={(v) => setQuickCount(Math.round(v))} /></Field>
          <Field label="Zadeklarowana podstawa / mies." hint={`Maks. ${money(MAX_VOLUNTARY_SICKNESS_BASE)}`}><NumberInput value={quickFixed} def={7000} min={0} onChange={setQuickFixed} suffix="zł" /></Field>
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <button type="button" className="btn btn-ghost" onClick={() => update((p) => ({ ...p, salary: { ...p.salary, declaredBases: Array(quickCount).fill(quickFixed), minimumBases: Array(quickCount).fill(min) } }))}>Wypełnij {quickCount} mies.</button>
          </div>
        </div>
        <table className="table">
          <thead><tr><th>Miesiąc</th><th>Zadeklarowana podstawa</th><th>Najniższa podstawa</th></tr></thead>
          <tbody>
            {s.declaredBases.map((d, i) => (
              <tr key={i}>
                <td>{i + 1}.</td>
                <td><NumberInput value={d} def={min} min={0} onChange={(v) => setSalary('declaredBases', s.declaredBases.map((x, j) => (j === i ? v : x)))} suffix="zł" /></td>
                <td><NumberInput value={s.minimumBases[i] ?? min} def={min} min={0} onChange={(v) => setSalary('minimumBases', s.declaredBases.map((_, j) => (j === i ? v : s.minimumBases[j] ?? min)))} suffix="zł" /></td>
              </tr>
            ))}
            {s.declaredBases.length === 0 && <tr><td colSpan={3} className="muted">Brak pełnych miesięcy — przyjęta zostanie najniższa podstawa.</td></tr>}
          </tbody>
        </table>
        <BaseSteps />
      </Card>
    );
  }

  const evDate = eventDate(profile, today);
  return (
    <Card title="Krok 3. Wynagrodzenie" subtitle="Pracownik: przeciętne wynagrodzenie z 12 pełnych miesięcy przed miesiącem zdarzenia, pomniejszone o 13,71%." actions={<LegalTip legal={`${LEGAL.uz36}; ${LEGAL.uz38}`} />}>
      <div className="grid-4">
        <Field label="Składniki stałe / mies."><NumberInput value={quickFixed} def={7000} min={0} onChange={setQuickFixed} suffix="zł" /></Field>
        <Field label="Składniki zmienne / mies."><NumberInput value={quickVar} def={0} min={0} onChange={setQuickVar} suffix="zł" /></Field>
        <Field label="Pełne miesiące" hint="< 12 przy krótszym stażu."><NumberInput value={quickCount} def={12} min={0} max={12} onChange={(v) => setQuickCount(Math.round(v))} /></Field>
        <div className="field">
          <span className="field-label">&nbsp;</span>
          <button type="button" className="btn btn-ghost" onClick={() => setSalary('months', buildSalaryMonths(evDate, quickCount, quickFixed, quickVar))}>Wypełnij tabelę</button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr><th>Miesiąc</th><th>Stałe wypłacone</th><th>Stałe z umowy</th><th>Zmienne</th><th>Dni robocze</th><th>Przepracowane</th><th>Status</th></tr>
          </thead>
          <tbody>
            {s.months.map((m, i) => {
              const excluded = m.workedDays * 2 < m.requiredDays;
              const partial = !excluded && m.workedDays < m.requiredDays;
              return (
                <tr key={m.month} className={excluded ? 'row-excluded' : ''}>
                  <td>{m.month}</td>
                  <td><NumberInput value={m.fixedPaid} def={m.fixedContract} min={0} onChange={(v) => setMonth(i, { fixedPaid: v })} /></td>
                  <td><NumberInput value={m.fixedContract} def={defaults.salary.months[0]?.fixedContract ?? 0} min={0} onChange={(v) => setMonth(i, { fixedContract: v })} /></td>
                  <td><NumberInput value={m.variablePaid} def={0} min={0} onChange={(v) => setMonth(i, { variablePaid: v })} /></td>
                  <td><NumberInput value={m.requiredDays} def={21} min={1} max={23} onChange={(v) => setMonth(i, { requiredDays: Math.round(v) })} /></td>
                  <td><NumberInput value={m.workedDays} def={m.requiredDays} min={0} max={m.requiredDays} onChange={(v) => setMonth(i, { workedDays: Math.round(v) })} /></td>
                  <td>{excluded ? <Badge tone="danger">wyłączony</Badge> : partial ? <Badge tone="warn">uzupełniony</Badge> : <Badge tone="ok">pełny</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid-4">
        {s.quarterlyBonuses.map((q, i) => (
          <Field key={i} label={`Premia kwartalna — kw. ${i + 1}`} legal={i === 0 ? LEGAL.uz42 : undefined}>
            <NumberInput value={q} def={0} min={0} onChange={(v) => setSalary('quarterlyBonuses', s.quarterlyBonuses.map((x, j) => (j === i ? v : x)) as [number, number, number, number])} suffix="zł" />
          </Field>
        ))}
        <Field label="Nagroda roczna / trzynastka" legal={LEGAL.uz42}><NumberInput value={s.annualBonus} def={defaults.salary.annualBonus} min={0} onChange={(v) => setSalary('annualBonus', v)} suffix="zł" /></Field>
      </div>
      <div className="stack">
        <Toggle label="Zasiłek macierzyński bezpośrednio po L4 w ciąży (przerwa < pełnego miesiąca)" checked={s.continuousWithPregnancySickLeave} onChange={(v) => setSalary('continuousWithPregnancySickLeave', v)} legal={LEGAL.uz43} />
        <Toggle label="Złożony PIT-2 (kwota zmniejszająca 300 zł) — do szacunku netto" checked={s.usePit2} onChange={(v) => setSalary('usePit2', v)} />
      </div>
      <BaseSteps />
    </Card>
  );
}

function BaseSteps() {
  const { derived } = useProfile();
  const b = derived.base;
  return (
    <div className="calc-box">
      <div className="calc-head">
        <span>Podstawa wymiaru zasiłku</span>
        <strong>{money(b.base)}</strong>
      </div>
      <p className="small">{b.method} <LegalTip legal={b.legal} /></p>
      <ol className="small steps">{b.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </div>
  );
}
