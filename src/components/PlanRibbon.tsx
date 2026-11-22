import { addDays, diffDays, formatPL } from '../domain/dateUtils';
import type { LeaveBlock } from '../domain/types';
import { useProfile } from '../state/ProfileContext';
import { money } from './ui';
import { useInsuranceLoss } from './InsuranceLoss';

/** Kolory rodzajów urlopu — paleta zweryfikowana pod kątem daltonizmu (dataviz validate_palette). */
export const KIND_META: Record<LeaveBlock['kind'], { label: string; cls: string }> = {
  PRZED_PORODEM: { label: 'Przed porodem', cls: 'w-pre' },
  MACIERZYNSKI: { label: 'Macierzyński', cls: 'w-mat' },
  NA_WARUNKACH: { label: 'Na warunkach macierzyńskiego', cls: 'w-mat' },
  UZUPELNIAJACY: { label: 'Uzupełniający', cls: 'w-sup' },
  RODZICIELSKI: { label: 'Rodzicielski', cls: 'w-par' },
  RODZICIELSKI_9: { label: '9 tygodni drugiego rodzica', cls: 'w-nine' },
  OJCOWSKI: { label: 'Ojcowski', cls: 'w-pat' },
};

/**
 * Plan tygodni: każdy kwadrat to jeden tydzień urlopu. Dwa pasma — matka i drugi rodzic.
 * Główny element wizualny aplikacji: urlopy w Kodeksie pracy liczy się w tygodniach.
 */
export function PlanRibbon({ onOpenTimeline }: { onOpenTimeline: () => void }) {
  const { derived, profile, today } = useProfile();
  const blocks = derived.timeline;
  if (!derived.planVisible && !derived.eligibility.sicknessInsured) return <UninsuredRibbon />;
  if (!derived.planVisible) {
    return (
      <section className="ribbon ribbon-empty" aria-label="Plan urlopów">
        <h1 className="ribbon-title">Uzupełnij profil, a zobaczysz swój plan urlopów tydzień po tygodniu.</h1>
        <p className="ribbon-lead">{derived.eligibility.notes[0]?.text ?? 'Zacznij od statusu zawodowego.'}</p>
      </section>
    );
  }
  const start = blocks.reduce((m, b) => (b.start < m ? b.start : m), blocks[0].start);
  const end = blocks.reduce((m, b) => (b.end > m ? b.end : m), blocks[0].end);
  const totalWeeks = Math.ceil((diffDays(start, end) + 1) / 7);
  const lanes: { key: 'mother' | 'father'; label: string; filter: (b: LeaveBlock) => boolean }[] = [
    { key: 'mother', label: profile.person.firstName || 'Matka', filter: (b) => b.who !== 'OJCIEC' },
    { key: 'father', label: profile.family.otherParent.name.split(' ')[0] || 'Drugi rodzic', filter: (b) => b.who === 'OJCIEC' },
  ];
  const variant = profile.plan.variant === 'USREDNIONY' ? derived.comparison.averaged : derived.comparison.variable;
  const todayWeek = today >= start && today <= end ? Math.floor(diffDays(start, today) / 7) : -1;
  const usedKinds = Array.from(new Set(blocks.map((b) => b.kind)));

  const cellKind = (lane: (typeof lanes)[number], week: number): LeaveBlock | undefined => {
    const weekStart = addDays(start, week * 7);
    const weekMid = addDays(weekStart, 3);
    return blocks.filter(lane.filter).find((b) => b.start <= weekMid && b.end >= weekStart);
  };

  return (
    <section className="ribbon" aria-label="Plan urlopów tydzień po tygodniu">
      <div className="ribbon-head">
        <div>
          <h1 className="ribbon-title">
            {totalWeeks} tygodni z dzieckiem
          </h1>
          <p className="ribbon-lead">
            Od {formatPL(start)} do {formatPL(end)}. Zasiłki dla rodziny w wybranym wariancie: <strong>{money(variant.familyTotal)}</strong> brutto, wypłaca {derived.fatherCarries ? 'płatnik ojca' : derived.eligibility.payer === 'ZUS' ? 'ZUS' : 'pracodawca'}.
          </p>
        </div>
        <button type="button" className="btn btn-quiet" onClick={onOpenTimeline}>Zobacz daty i terminy</button>
      </div>

      <div className="weeks" style={{ ['--weeks' as string]: totalWeeks }}>
        {lanes.map((lane) => {
          const anyBlock = blocks.some(lane.filter);
          return (
            <div className="weeks-lane" key={lane.key}>
              <span className="weeks-who">{lane.label}</span>
              <div className="weeks-row" role="img" aria-label={`${lane.label}: ${blocks.filter(lane.filter).map((b) => `${b.label} ${formatPL(b.start)}–${formatPL(b.end)}`).join('; ') || 'brak urlopu'}`}>
                {Array.from({ length: totalWeeks }, (_, w) => {
                  const b = cellKind(lane, w);
                  return (
                    <i
                      key={w}
                      className={`wk ${b ? KIND_META[b.kind].cls : 'wk-off'} ${w === todayWeek ? 'wk-today' : ''}`}
                      title={b ? `Tydzień ${w + 1}: ${b.label}` : `Tydzień ${w + 1}`}
                    />
                  );
                })}
                {!anyBlock && <span className="weeks-none">bez urlopu w tym okresie</span>}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="weeks-legend">
        {usedKinds.map((k) => (
          <li key={k}><i className={`wk ${KIND_META[k].cls}`} />{KIND_META[k].label}</li>
        ))}
        {todayWeek >= 0 && <li><i className="wk wk-off wk-today" />Ten tydzień</li>}
      </ul>
    </section>
  );
}

/** Pas planu dla osoby bez ubezpieczenia chorobowego: od razu pokazuje, ile traci. */
function UninsuredRibbon() {
  const loss = useInsuranceLoss();
  return (
    <section className="ribbon" aria-label="Brak ubezpieczenia chorobowego">
      <h1 className="ribbon-title">{money(loss.loss)} mniej na rękę</h1>
      <p className="ribbon-lead">
        Tyle tracisz bez ubezpieczenia chorobowego w porównaniu z umową o pracę za {money(loss.salaryGross)} brutto: świadczenie rodzicielskie to {money(loss.uninsuredTotal)}, a zasiłek macierzyński dałby {money(loss.insuredTotal)}.
      </p>
    </section>
  );
}
