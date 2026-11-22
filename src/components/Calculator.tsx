import { useState } from 'react';
import { CARE_LIMITS, LEGAL, PARENTAL_PART_TIME_CAPS } from '../domain/constants2026';
import { dailyRate, type VariantResult } from '../domain/benefitCalculator';
import { careReasonLabel, partTimeFormStatus } from '../domain/documentGenerator';
import { formatPL } from '../domain/dateUtils';
import type { CareReason } from '../domain/types';
import { useProfile, useSection } from '../state/ProfileContext';
import { InsuranceLossPanel } from './InsuranceLoss';
import { Badge, Card, Field, LegalTip, NumberInput, Segmented, Select, Stat, Toggle, money, pct, weeks } from './ui';

type Sub = 'zasilki' | 'warianty' | 'praca' | 'opiekunczy';

export function Calculator({ onOpenDocs }: { onOpenDocs?: () => void }) {
  const [sub, setSub] = useState<Sub>('warianty');
  const { derived } = useProfile();
  return (
    <div className="stack-lg">
      {!derived.eligibility.sicknessInsured && <InsuranceLossPanel />}
      {!derived.eligibility.sicknessInsured && !derived.fatherCarries ? null : <CalculatorSections sub={sub} setSub={setSub} onOpenDocs={onOpenDocs} />}
    </div>
  );
}

function CalculatorSections({ sub, setSub, onOpenDocs }: { sub: Sub; setSub: (s: Sub) => void; onOpenDocs?: () => void }) {
  return (
    <>
      <Segmented<Sub>
        ariaLabel="Sekcje kalkulatora"
        value={sub}
        onChange={setSub}
        options={[
          { value: 'warianty', label: 'Porównywarka 81,5% vs 100%/70%' },
          { value: 'zasilki', label: 'Zasiłek w ciąży i macierzyński' },
          { value: 'praca', label: 'Rodzicielski + praca' },
          { value: 'opiekunczy', label: 'Zasiłek opiekuńczy' },
        ]}
      />
      <HeadlineStats />
      {sub === 'zasilki' && <Benefits />}
      {sub === 'warianty' && <Variants />}
      {sub === 'praca' && <PartTime onOpenDocs={onOpenDocs} />}
      {sub === 'opiekunczy' && <Care />}
    </>
  );
}

function HeadlineStats() {
  const { derived } = useProfile();
  const { monthly, base, eligibility } = derived;
  if (!eligibility.maternityEligible && derived.fatherCarries) {
    return (
      <div className="demo-banner">
        Matka nie ma ubezpieczenia chorobowego, więc zasiłek macierzyński pobiera ojciec od podstawy {money(derived.fatherBase)} (art. 180 § 15–17 KP). Kwoty ojca znajdziesz w porównywarce i na osi czasu.
      </div>
    );
  }
  if (!eligibility.sicknessInsured) return null; // panel „Ile tracisz bez ubezpieczenia” pokazuje szczegóły
  if (!eligibility.maternityEligible) {
    return (
      <div className="alert alert-danger" role="alert">
        Zasiłek macierzyński nie przysługuje w tym profilu. {eligibility.notes[0]?.text}
      </div>
    );
  }
  return (
    <div className="stats">
      <Stat label="Podstawa wymiaru" value={money(base.base)} sub={`stawka dzienna 100%: ${money(dailyRate(base.base, 1))}`} />
      <Stat label="Macierzyński 100% / mies." value={money(monthly.full.gross)} sub={`ok. ${money(monthly.full.net)} netto`} />
      <Stat label="Wariant 81,5% / mies." value={money(monthly.averaged.gross)} sub={`ok. ${money(monthly.averaged.netAfterTopUp)} netto${monthly.averaged.toppedUp ? ' (podwyższony)' : ''}`} />
      <Stat label="Rodzicielski 70% / mies." value={money(monthly.parental.gross)} sub={`ok. ${money(monthly.parental.netAfterTopUp)} netto${monthly.parental.toppedUp ? ' (podwyższony)' : ''}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Benefits() {
  const { derived, profile, defaults } = useProfile();
  const [plan, setPlan] = useSection('plan');
  const s = derived.sickness;
  const e = derived.eligibility;
  return (
    <div className="grid-2 align-start">
      <Card title="Zasiłek chorobowy w ciąży" subtitle="Wynagrodzenie chorobowe (pracodawca) i zasiłek chorobowy (ZUS / płatnik)." actions={<LegalTip legal={`${LEGAL.art92}; ${LEGAL.uz11}; ${LEGAL.uz8}`} />}>
        <div className="grid-2">
          <Field label="Długość zwolnienia w ciąży"><NumberInput value={plan.sickLeavePregnancyDays} def={defaults.plan.sickLeavePregnancyDays} min={0} max={400} onChange={(v) => setPlan('sickLeavePregnancyDays', Math.round(v))} suffix="dni" /></Field>
          {e.isEmployee && <Field label="Dni L4 wykorzystane wcześniej w tym roku"><NumberInput value={plan.sickDaysUsedThisYear} def={defaults.plan.sickDaysUsedThisYear} min={0} max={365} onChange={(v) => setPlan('sickDaysUsedThisYear', Math.round(v))} suffix="dni" /></Field>}
        </div>
        <Toggle label="Kod B na e-ZLA (ciąża)" checked={plan.codeB} onChange={(v) => setPlan('codeB', v)} legal={LEGAL.uz11} />
        <div className="stats stats-sm">
          <Stat label="Stawka" value={pct(s.rate)} sub={`okres zasiłkowy ${s.periodLimit} dni`} />
          <Stat label="Stawka dzienna" value={money(s.dailyRate)} />
          {e.isEmployee && <Stat label={`Pracodawca (${s.employerDays} dni)`} value={money(s.employerAmount)} />}
          <Stat label={`Zasiłek (${s.zusDays} dni)`} value={money(s.zusAmount)} sub={e.payer === 'ZUS' ? 'wypłaca ZUS' : 'wypłaca pracodawca'} tone={e.sicknessEligible ? undefined : 'warn'} />
          <Stat label="Razem netto (szac.)" value={money(s.netEstimate)} />
        </div>
        <ul className="notes">{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <fieldset className="fieldset">
          <legend>Świadczenie rehabilitacyjne <LegalTip legal={LEGAL.uz18} /></legend>
          {s.rehab ? (
            <>
              <div className="stats stats-sm">
                <Stat label="Okres" value={`${s.rehab.days} dni`} sub="maks. 12 miesięcy" />
                <Stat label="Stawka" value={s.rehab.inPregnancy ? '100%' : '90% → 75%'} sub={s.rehab.inPregnancy ? 'niezdolność w ciąży' : '90% przez 3 miesiące, potem 75%'} />
                <Stat label="Kwota brutto (szac.)" value={money(s.rehab.amount)} sub="bez kwartalnej waloryzacji podstawy" />
              </div>
              <p className="small">Przyznaje ZUS na wniosek, po orzeczeniu lekarza orzecznika, że dalsze leczenie lub rehabilitacja rokują powrót do pracy. Do wniosku dołączasz zaświadczenie o stanie zdrowia od lekarza prowadzącego (wystawione nie wcześniej niż miesiąc przed złożeniem wniosku), a pracownik także wywiad zawodowy z miejsca pracy.</p>
            </>
          ) : (
            <p className="small muted">Jeśli niezdolność do pracy potrwa dłużej niż okres zasiłkowy ({s.periodLimit} dni), możesz wnioskować o świadczenie rehabilitacyjne. W ciąży wynosi ono 100% podstawy i przysługuje najdłużej 12 miesięcy. Wpisz dłuższe zwolnienie, żeby zobaczyć wyliczenie.</p>
          )}
        </fieldset>
      </Card>

      {derived.bridging && (
        <Card title="Zasiłek w wysokości zasiłku macierzyńskiego" subtitle="Gdy w czasie ciąży umowa o pracę ustała z przyczyn leżących po stronie pracodawcy." actions={<LegalTip legal={LEGAL.uz30} />}>
          {derived.bridging.eligible ? (
            <div className="stats stats-sm">
              <Stat label="Okres" value={derived.bridging.days ? `${derived.bridging.days} dni` : '—'} sub={derived.bridging.start ? `${formatPL(derived.bridging.start)} – ${formatPL(derived.bridging.end)}` : 'podaj datę ustania umowy'} />
              <Stat label="Stawka" value="100%" sub="jak zasiłek macierzyński" />
              <Stat label="Kwota brutto (szac.)" value={money(derived.bridging.amount)} sub="wypłaca ZUS" />
            </div>
          ) : (
            <p><Badge tone="warn">Zasiłek do dnia porodu nie przysługuje</Badge></p>
          )}
          <ul className="notes">{derived.bridging.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          {derived.bridging.eligible && <p className="small" style={{ marginTop: 12 }}>Wniosek składasz w ZUS na formularzu ZAM, zaznaczając, że pracodawca ogłosił upadłość, likwidację albo zmarł.</p>}
        </Card>
      )}

      <Card title="Wymiar urlopów" subtitle="Wyliczone z profilu (Kodeks pracy).">
        <table className="table">
          <tbody>
            <tr><th>Urlop macierzyński {profile.family.situation === 'ADOPCJA' || profile.family.situation === 'RODZINA_ZASTEPCZA' ? '(na warunkach)' : ''}</th><td>{weeks(derived.maternity.weeks)}</td><td><LegalTip legal={derived.maternity.legal} /></td></tr>
            <tr><th>Uzupełniający urlop macierzyński</th><td>{derived.supplementary.weeks ? weeks(derived.supplementary.weeks) : '—'} {derived.supplementary.weeks > 0 && <Badge tone="info">100%</Badge>}</td><td><LegalTip legal={LEGAL.art1802} /></td></tr>
            <tr><th>Urlop rodzicielski (łącznie)</th><td>{derived.parental.total ? weeks(derived.parental.total) : '—'}</td><td><LegalTip legal={LEGAL.art1821a} /></td></tr>
            <tr><th>— w tym część matki</th><td>{weeks(derived.partTime.motherTotalWeeks)}</td><td /></tr>
            <tr><th>— nieprzenoszalne 9 tyg. drugiego rodzica</th><td>{derived.parental.fatherWeeks ? weeks(derived.parental.fatherWeeks) : <Badge tone="warn">przepada</Badge>}</td><td><LegalTip legal="art. 182¹a § 3 KP" /></td></tr>
            <tr><th>Urlop ojcowski</th><td>{profile.family.otherParent.takesPaternity && profile.family.otherParent.insured ? '2 tyg. (100%)' : '—'}</td><td><LegalTip legal={LEGAL.art1823} /></td></tr>
          </tbody>
        </table>
        <p className="small muted">{derived.maternity.note} {derived.supplementary.weeks > 0 ? derived.supplementary.explanation : ''}</p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const COLORS = { MATKA: '#2F69B3', OJCIEC: '#14876A' } as const;

function Variants() {
  const { derived, profile } = useProfile();
  const [plan, setPlan] = useSection('plan');
  const { averaged, variable, better, difference } = derived.comparison;
  const max = Math.max(averaged.familyTotal, variable.familyTotal, 1);

  return (
    <div className="stack-lg">
      <Card
        title="Ile łącznie otrzyma rodzina?"
        subtitle="Suma zasiłków brutto za wszystkie zaplanowane urlopy obojga rodziców (macierzyński, uzupełniający, rodzicielski, 9 tyg. drugiego rodzica, ojcowski)."
        actions={<LegalTip legal={`${LEGAL.uz31}; ${LEGAL.uz31_4}`} />}
      >
        <div className="variant-controls">
          <Field label="Twój wariant">
            <Segmented ariaLabel="Wybrany wariant" value={plan.variant} onChange={(v) => setPlan('variant', v)} options={[{ value: 'USREDNIONY', label: '81,5% (wniosek ≤ 21 dni)' }, { value: 'ZMIENNY', label: '100% + 70%' }]} />
          </Field>
          <Toggle label="Symuluj wyrównanie do 100% — brak rodzicielskiego w 1. roku życia dziecka" checked={plan.simulateNoParentalFirstYear} onChange={(v) => setPlan('simulateNoParentalFirstYear', v)} legal={LEGAL.uz31_4} />
        </div>
        <VariantBars rows={[averaged, variable]} max={max} />
        <div className="legend" aria-hidden="true">
          <span><i style={{ background: COLORS.MATKA }} /> Matka</span>
          <span><i style={{ background: COLORS.OJCIEC }} /> Drugi rodzic</span>
        </div>
        <div className={`verdict ${better === plan.variant ? 'ok' : 'warn'}`}>
          {difference < 1
            ? 'Oba warianty dają praktycznie tę samą łączną kwotę — wybierz według potrzeb płynności.'
            : <>Korzystniejszy łącznie: <strong>{better === 'USREDNIONY' ? 'wariant 81,5%' : 'wariant 100% + 70%'}</strong> — różnica {money(difference)}. {better !== plan.variant && 'Wybrany przez Ciebie wariant jest mniej korzystny.'}</>}
          {' '}Wariant 100% + 70% daje więcej pieniędzy na początku (macierzyński 100%), 81,5% — równe raty przez cały okres.
        </div>
        {profile.plan.simulateNoParentalFirstYear && averaged.equalisation > 0 && (
          <p className="small">Wyrównanie z art. 31 ust. 4: <strong>{money(averaged.equalisation)}</strong> — gdy w 1. roku życia dziecka nie pobierano zasiłku za urlop rodzicielski (w symulacji pominięto rodzicielski matki).</p>
        )}
      </Card>
      <div className="grid-2 align-start">
        <VariantTable v={averaged} title="Wariant uśredniony 81,5%" />
        <VariantTable v={variable} title="Wariant 100% + 70%" />
      </div>
    </div>
  );
}

function VariantBars({ rows, max }: { rows: VariantResult[]; max: number }) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const W = 1000, rowH = 44, labelW = 120, H = rows.length * rowH + 4;
  const scale = (v: number) => ((W - labelW - 150) * v) / max;
  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Porównanie łącznej kwoty zasiłków w dwóch wariantach">
        {rows.map((r, i) => {
          const y = 8 + i * rowH;
          const mw = scale(r.motherTotal);
          const fw = scale(r.fatherTotal);
          return (
            <g key={r.variant}>
              <text x={0} y={y + 20} className="chart-label">{r.variant === 'USREDNIONY' ? '81,5%' : '100% + 70%'}</text>
              <rect x={labelW} y={y + 4} width={Math.max(0, mw - 1)} height={24} rx={4} fill={COLORS.MATKA}
                onMouseMove={(e) => setHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `Matka: ${money(r.motherTotal)}` })} />
              {fw > 0 && (
                <rect x={labelW + mw + 1} y={y + 4} width={Math.max(0, fw - 1)} height={24} rx={4} fill={COLORS.OJCIEC}
                  onMouseMove={(e) => setHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `Drugi rodzic: ${money(r.fatherTotal)}` })} />
              )}
              <text x={labelW + mw + fw + 8} y={y + 21} className="chart-value">{money(r.familyTotal)}</text>
            </g>
          );
        })}
      </svg>
      {hover && <div className="tooltip" style={{ left: hover.x + 12, top: hover.y - 8 }}>{hover.text}</div>}
    </div>
  );
}

function VariantTable({ v, title }: { v: VariantResult; title: string }) {
  return (
    <Card title={title}>
      <table className="table">
        <thead><tr><th>Okres</th><th>Stawka</th><th className="num">Kwota</th></tr></thead>
        <tbody>
          {v.lines.map((l) => (
            <tr key={l.id}>
              <td>
                <span className="dot" style={{ background: COLORS[l.who === 'OJCIEC' ? 'OJCIEC' : 'MATKA'] }} />
                {l.label}
                {l.start && <span className="muted small block">{formatPL(l.start)} – {formatPL(l.end)}</span>}
              </td>
              <td>{l.rate ? `${l.id === 'par' && Math.abs(l.rate - 0.815) > 1e-6 && Math.abs(l.rate - 0.7) > 1e-6 ? 'śr. ' : ''}${pct(l.rate)}` : '—'}</td>
              <td className="num">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th colSpan={2}>Matka</th><td className="num">{money(v.motherTotal)}</td></tr>
          <tr><th colSpan={2}>Drugi rodzic</th><td className="num">{money(v.fatherTotal)}</td></tr>
          <tr className="total"><th colSpan={2}>Razem rodzina</th><td className="num">{money(v.familyTotal)}</td></tr>
        </tfoot>
      </table>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function PartTimeStatus({ onOpenDocs }: { onOpenDocs?: () => void }) {
  const { profile, derived, today } = useProfile();
  const st = partTimeFormStatus(profile, derived.eligibility, today);
  if (st.ready) {
    return (
      <div className="status status-ok" role="status">
        <span>Wniosek o łączenie urlopu z pracą jest gotowy do wydruku w zakładce „Co złożyć”.</span>
        {onOpenDocs && <button type="button" className="btn btn-primary" onClick={onOpenDocs}>Otwórz wniosek</button>}
      </div>
    );
  }
  return (
    <div className="status status-warn" role="status">
      <strong>Wniosek o łączenie urlopu z pracą pojawi się, gdy:</strong>
      <ul>{st.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
    </div>
  );
}

function PartTime({ onOpenDocs }: { onOpenDocs?: () => void }) {
  const { derived, profile } = useProfile();
  const [plan, setPlan] = useSection('plan');
  const par = derived.parental;
  const ext = derived.partTime;
  const rate = profile.plan.variant === 'USREDNIONY' ? 0.815 : 0.7;
  const fullMonthly = derived.motherBase * rate;
  const reduced = fullMonthly * (1 - plan.partTimeFraction);
  if (!derived.eligibility.isEmployee) {
    return <Card title="Łączenie urlopu rodzicielskiego z pracą"><PartTimeStatus /><p style={{ marginTop: 16 }}>Łączenie urlopu z pracą u pracodawcy udzielającego urlopu dotyczy pracowników. Przedsiębiorca / zleceniobiorca może podjąć działalność w trakcie zasiłku — zasiłek obniża się wtedy proporcjonalnie do wymiaru (art. 31 ust. 2a ustawy zasiłkowej).</p></Card>;
  }
  const totalWithFather = ext.motherTotalWeeks + par.fatherWeeks;
  return (
    <Card title="Łączenie urlopu rodzicielskiego z pracą (maks. 1/2 etatu)" subtitle="Urlop wydłuża się proporcjonalnie do wymiaru pracy; zasiłek maleje proporcjonalnie." actions={<LegalTip legal={`art. 182¹e KP; ${LEGAL.art1821f}`} />}>
      <PartTimeStatus onOpenDocs={onOpenDocs} />
      <div className="slider-row">
        <label htmlFor="pt">Wymiar pracy: <strong>{Math.round(plan.partTimeFraction * 100)}% etatu</strong></label>
        <input id="pt" type="range" min={0} max={50} step={5} value={Math.round(plan.partTimeFraction * 100)} onChange={(e) => setPlan('partTimeFraction', Number(e.target.value) / 100)} />
      </div>
      <div className="grid-2">
        <Field label="Liczba tygodni łączenia (część matki)" hint={`Puste pole = cały urlop rodzicielski matki (${par.motherWeeks} tyg.).`}>
          <NumberInput value={plan.partTimeWeeks} def={0} placeholder={String(par.motherWeeks)} min={0} max={par.motherWeeks} onChange={(v) => setPlan('partTimeWeeks', Math.round(v))} suffix="tyg." />
        </Field>
        <div className="field"><span className="field-label">&nbsp;</span>
          <Toggle label="Łącz z pracą także część powstałą z wydłużenia (§ 7)" checked={plan.combineExtension} onChange={(v) => setPlan('combineExtension', v)} legal="art. 182¹f § 7 KP" />
        </div>
      </div>
      <div className="stats">
        <Stat label="Wydłużenie urlopu" value={`+${weeks(ext.extensionWeeks)}`} sub={plan.combineExtension ? `(${weeks(ext.combinedWeeks)} × ${pct(plan.partTimeFraction)}) ÷ (1 − ${pct(plan.partTimeFraction)})` : `${weeks(ext.combinedWeeks)} × ${pct(plan.partTimeFraction)}`} />
        <Stat label="Rodzicielski matki" value={weeks(ext.motherTotalWeeks)} sub={`bazowo ${weeks(par.motherWeeks)}`} />
        <Stat label="Cały rodzicielski (z 9 tyg. ojca)" value={weeks(totalWithFather)} sub={`limit ${par.cap} tyg.`} tone={ext.cappedAt ? 'warn' : undefined} />
        <Stat label="Zasiłek w okresie łączenia / mies." value={money(reduced)} sub={`zamiast ${money(fullMonthly)} (${pct(rate)})`} />
      </div>
      <TimeBar par={par.motherWeeks} combined={ext.combinedWeeks} ext={ext.extensionWeeks} father={par.fatherWeeks} cap={par.cap} />
      <p className="small muted">Łączna kwota zasiłku za rodzicielski pozostaje taka sama — rozkłada się na dłuższy okres. Limity: {PARENTAL_PART_TIME_CAPS.single}/{PARENTAL_PART_TIME_CAPS.multiple} tyg., przy „Za życiem” {PARENTAL_PART_TIME_CAPS.zaZyciemSingle}/{PARENTAL_PART_TIME_CAPS.zaZyciemMultiple} tyg. Pracodawca może odmówić z przyczyn organizacyjnych (informacja w 7 dni).</p>
    </Card>
  );
}

function TimeBar({ par, combined, ext, father, cap }: { par: number; combined: number; ext: number; father: number; cap: number }) {
  const segs = [
    { w: par - combined, label: 'urlop pełny', cls: 'seg-full' },
    { w: combined, label: 'urlop + praca', cls: 'seg-work' },
    { w: ext, label: 'wydłużenie', cls: 'seg-ext' },
    { w: father, label: '9 tyg. ojca', cls: 'seg-father' },
  ].filter((s) => s.w > 0);
  return (
    <div className="timebar" role="img" aria-label="Struktura urlopu rodzicielskiego w tygodniach">
      {segs.map((s) => (
        <div key={s.label} className={`seg ${s.cls}`} style={{ width: `${(s.w / cap) * 100}%` }} title={`${s.label}: ${s.w.toFixed(1)} tyg.`}>
          <span>{s.label}: {Number.isInteger(s.w) ? s.w : s.w.toFixed(1)} tyg.</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Care() {
  const { derived, defaults } = useProfile();
  const [care, setCare] = useSection('care');
  const c = derived.care;
  const pools = [
    { label: 'Dzieci do 14 lat / zdrowe do 8 lat', used: care.usedPool60, limit: CARE_LIMITS.childUnder14OrHealthyUnder8, key: 'usedPool60' as const },
    { label: 'Dziecko z niepełnosprawnością 14–18 lat', used: care.usedPool30, limit: CARE_LIMITS.disabledChild14to18, key: 'usedPool30' as const },
    { label: 'Dziecko > 14 lat / inny członek rodziny', used: care.usedPool14, limit: CARE_LIMITS.otherFamilyOrChildOver14, key: 'usedPool14' as const },
  ];
  const familyUsed = care.usedPool60 + care.usedPool30 + care.usedPool14;
  const reasons: CareReason[] = ['CHORE_DZIECKO_DO_14', 'ZAMKNIECIE_PLACOWKI', 'PORÓD_LUB_SZPITAL_OPIEKUNA', 'CHORE_DZIECKO_NIEPELNOSPRAWNE_14_18', 'CHORE_DZIECKO_POWYZEJ_14', 'INNY_CZLONEK_RODZINY'];
  return (
    <div className="grid-2 align-start">
      <Card title="Kalkulator zasiłku opiekuńczego (80%)" actions={<LegalTip legal={LEGAL.uz32} />}>
        <Field label="Powód opieki">
          <Select<CareReason> value={care.reason} onChange={(v) => setCare('reason', v)} options={reasons.map((r) => ({ value: r, label: careReasonLabel(r) }))} />
        </Field>
        <div className="grid-2">
          <Field label="Wiek dziecka / osoby"><NumberInput value={care.childAgeYears} def={defaults.care.childAgeYears} min={0} max={99} onChange={(v) => setCare('childAgeYears', Math.round(v))} suffix="lat" /></Field>
          <Field label="Wnioskowane dni"><NumberInput value={care.daysRequested} def={defaults.care.daysRequested} min={0} max={60} onChange={(v) => setCare('daysRequested', Math.round(v))} suffix="dni" /></Field>
          {care.reason === 'ZAMKNIECIE_PLACOWKI' && (
            <Field label="Ile dni wcześniej powiadomiono o zamknięciu?" hint="Musi być mniej niż 7 dni."><NumberInput value={care.facilityNoticeDays} def={defaults.care.facilityNoticeDays} min={0} max={60} onChange={(v) => setCare('facilityNoticeDays', Math.round(v))} suffix="dni" /></Field>
          )}
        </div>
        <Toggle label="Jest inny domownik, który może zapewnić opiekę" checked={care.otherCarerAvailable} onChange={(v) => setCare('otherCarerAvailable', v)} legal="art. 34 ustawy zasiłkowej" />
        <div className="stats stats-sm">
          <Stat label="Przysługuje" value={c.eligible ? `${c.grantedDays} dni` : 'nie'} tone={c.eligible ? undefined : 'danger'} />
          <Stat label="Stawka dzienna (80%)" value={money(c.dailyRate)} />
          <Stat label="Kwota brutto" value={money(c.amount)} />
        </div>
        <ul className="notes">{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </Card>
      <Card title="Limity w roku kalendarzowym" subtitle={`Łącznie maks. 60 dni na rodzinę — wykorzystano ${familyUsed}.`}>
        {pools.map((p) => (
          <div key={p.key} className="pool">
            <div className="pool-head"><span>{p.label}</span><span>{p.used}/{p.limit} dni</span></div>
            <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={p.limit} aria-valuenow={p.used} aria-label={p.label}>
              <div style={{ width: `${Math.min(100, (p.used / p.limit) * 100)}%` }} />
            </div>
            <Field label="Wykorzystane dni"><NumberInput value={p.used} def={defaults.care[p.key]} min={0} max={p.limit} onChange={(v) => setCare(p.key, Math.round(v))} /></Field>
          </div>
        ))}
        <div className="pool">
          <div className="pool-head"><strong>Łączny limit rodziny</strong><span>{familyUsed}/60 dni</span></div>
          <div className="meter total"><div style={{ width: `${Math.min(100, (familyUsed / 60) * 100)}%` }} /></div>
        </div>
      </Card>
    </div>
  );
}
