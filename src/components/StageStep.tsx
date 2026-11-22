import type { ChildOutcome, FamilySituation, Profile } from '../domain/types';
import { useProfile } from '../state/ProfileContext';
import { Card, Icon, Segmented } from './ui';

/** Etap, od którego rodzic zaczyna. Wynika wprost z profilu — nie jest osobnym stanem. */
export type Stage = 'CIAZA' | 'PO_PORODZIE' | 'PRZYJECIE' | 'STRATA';

export function stageOf(p: Profile): Stage {
  const f = p.family;
  if (f.situation === 'ADOPCJA' || f.situation === 'RODZINA_ZASTEPCZA') return 'PRZYJECIE';
  if (f.situation === 'PO_PORODZIE' && f.childOutcome !== 'ZYWE') return 'STRATA';
  if (f.situation === 'PO_PORODZIE') return 'PO_PORODZIE';
  return 'CIAZA';
}

export const STAGE_LABEL: Record<Stage, string> = {
  CIAZA: 'Spodziewam się dziecka',
  PO_PORODZIE: 'Dziecko już jest z nami',
  PRZYJECIE: 'Przyjmujemy dziecko na wychowanie',
  STRATA: 'Straciliśmy dziecko',
};

const STAGE_DESC: Record<Stage, string> = {
  CIAZA: 'Policzymy, od kiedy możesz iść na urlop, ile wyniesie zasiłek i co złożyć jeszcze przed porodem.',
  PO_PORODZIE: 'Ułożymy urlopy po porodzie, podział z drugim rodzicem i terminy wniosków.',
  PRZYJECIE: 'Adopcja albo rodzina zastępcza: urlop na warunkach macierzyńskiego i dokumenty z sądu.',
  STRATA: 'Urlop i zasiłek po martwym urodzeniu lub śmierci dziecka oraz zasiłek pogrzebowy. Zapytamy tylko o to, co niezbędne.',
};

/**
 * Znak etapu z kwadratów tygodni — tego samego motywu, co pas planu i oś czasu.
 * pre = urlop przed porodem, mat = macierzyński, par = rodzicielski, off = jeszcze nie teraz.
 */
const GLYPH: Record<Exclude<Stage, 'STRATA'>, ('pre' | 'mat' | 'par' | 'off')[]> = {
  CIAZA: ['pre', 'pre', 'off', 'off', 'off', 'off', 'off', 'off'],
  PO_PORODZIE: ['mat', 'mat', 'mat', 'mat', 'mat', 'par', 'par', 'par'],
  PRZYJECIE: ['off', 'off', 'mat', 'mat', 'mat', 'mat', 'par', 'par'],
};

function Glyph({ stage }: { stage: Stage }) {
  // Przy stracie dziecka bez znaku: kafel ma być cichy i nie kojarzyć się z planem urlopów.
  if (stage === 'STRATA') return null;
  return (
    <span className="stage-glyph" aria-hidden="true">
      {GLYPH[stage].map((k, i) => (
        <i key={i} className={`w w-${k}`} />
      ))}
    </span>
  );
}

export function StageStep() {
  const { profile, update } = useProfile();
  const stage = stageOf(profile);
  const f = profile.family;

  const choose = (s: Stage) => {
    if (s === stage) return;
    update((p) => {
      const fam = p.family;
      const next: { situation: FamilySituation; childOutcome: ChildOutcome } =
        s === 'CIAZA' ? { situation: 'CIAZA', childOutcome: 'ZYWE' }
        : s === 'PO_PORODZIE' ? { situation: 'PO_PORODZIE', childOutcome: 'ZYWE' }
        : s === 'PRZYJECIE' ? { situation: 'ADOPCJA', childOutcome: 'ZYWE' }
        : { situation: 'PO_PORODZIE', childOutcome: 'MARTWE' };
      // Przy stracie dziecka nie pokazujemy przejęcia urlopu przez ojca ani dalszych urlopów.
      return { ...p, family: { ...fam, ...next, specialCase: s === 'STRATA' ? 'BRAK' : fam.specialCase } };
    });
  };
  const setFam = <K extends keyof Profile['family']>(k: K, v: Profile['family'][K]) =>
    update((p) => ({ ...p, family: { ...p.family, [k]: v } }));

  const tile = (s: Stage) => (
    <button
      key={s}
      type="button"
      role="radio"
      aria-checked={stage === s}
      className={`stage-tile${stage === s ? ' on' : ''}${s === 'STRATA' ? ' stage-tile-quiet' : ''}`}
      onClick={() => choose(s)}
    >
      <Glyph stage={s} />
      <span className="stage-text">
        <strong>{STAGE_LABEL[s]}</strong>
        <span>{STAGE_DESC[s]}</span>
      </span>
      {stage === s && <span className="stage-check"><Icon name="check" size={16} /></span>}
    </button>
  );

  return (
    <Card title="Od czego zaczynamy?" subtitle="Wybierz, co dziś najlepiej opisuje Waszą sytuację. Kolejne pytania dopasujemy do tej odpowiedzi; możesz ją zmienić w każdej chwili.">
      <div className="stage-grid" role="radiogroup" aria-label="Etap">
        {(['CIAZA', 'PO_PORODZIE', 'PRZYJECIE'] as const).map(tile)}
        {tile('STRATA')}
      </div>

      {stage === 'PRZYJECIE' && (
        <div className="stage-follow">
          <p className="stage-follow-q">Jaka to forma?</p>
          <Segmented<FamilySituation>
            ariaLabel="Forma przyjęcia dziecka"
            value={f.situation}
            onChange={(v) => setFam('situation', v)}
            options={[
              { value: 'ADOPCJA', label: 'Adopcja' },
              { value: 'RODZINA_ZASTEPCZA', label: 'Rodzina zastępcza (niezawodowa)' },
            ]}
          />
        </div>
      )}

      {stage === 'STRATA' && (
        <div className="stage-follow stage-follow-quiet">
          <p className="stage-follow-q">Co się wydarzyło?</p>
          <Segmented<ChildOutcome>
            ariaLabel="Przebieg"
            value={f.childOutcome}
            onChange={(v) => setFam('childOutcome', v)}
            options={[
              { value: 'MARTWE', label: 'Dziecko urodziło się martwe' },
              { value: 'ZGON_PRZED_8_TYG', label: 'Zmarło przed 8. tygodniem życia' },
              { value: 'ZGON_PO_8_TYG', label: 'Zmarło po 8. tygodniu życia' },
            ]}
          />
          <p className="small">
            W kolejnych krokach zapytamy o pracę, datę porodu i zarobki. Pominiemy pytania o dalsze urlopy i podział opieki.
          </p>
          <p className="small muted">
            Z pytaniami o formalności możesz napisać do ZUS na mama@zus.pl albo zadzwonić pod <span className="nowrap">22 560 16 00</span>.
          </p>
        </div>
      )}
    </Card>
  );
}
