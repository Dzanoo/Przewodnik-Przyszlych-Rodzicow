import { useState } from 'react';
import { GENERAL_RULES, OUT_OF_SCOPE, docName } from '../data/requiredDocuments';
import { DESTINATION_LABELS, checklistToMarkdown, partTimeFormStatus, type Destination } from '../domain/documentGenerator';
import { formatPL } from '../domain/dateUtils';
import { useProfile } from '../state/ProfileContext';
import { Badge, Card, CopyButton, Icon, LegalTip, canExportFiles, downloadText, printText } from './ui';

export function Documents({ initialForm = null }: { initialForm?: string | null }) {
  const { derived, profile, today } = useProfile();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [formId, setFormId] = useState<string | null>(initialForm);
  const ptStatus = partTimeFormStatus(profile, derived.eligibility, today);
  const askedForPartTime = profile.plan.partTimeFraction > 0 || profile.employment.fullTimeFraction < 1;
  const items = derived.checklist;
  const forms = derived.forms;
  const form = forms.find((f) => f.id === formId) ?? forms[0];
  const done = items.filter((i) => checked[i.id] || i.waived).length;

  if (!derived.eligibility.sicknessInsured && !derived.fatherCarries) {
    return (
      <Card title="Dokumenty">
        <p>Bez ubezpieczenia chorobowego nie składasz wniosków o zasiłki z ubezpieczenia chorobowego. Możesz ubiegać się o świadczenie rodzicielskie (1 000 zł miesięcznie) — szczegóły na gov.pl. Jeśli ojciec dziecka jest ubezpieczony, w zakładce „Twoja sytuacja” wybierz szczególną sytuację, w której przejmuje on urlop.</p>
        {askedForPartTime && (
          <div className="status status-warn" role="status" style={{ marginTop: 16 }}>
            <strong>Wniosek o łączenie urlopu rodzicielskiego z pracą pojawi się, gdy:</strong>
            <ul>{ptStatus.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="stack-lg">
      <Card title="Wnioski do złożenia" subtitle="Dobrane do Twojej sytuacji na podstawie rozporządzenia z 11.03.2025 i Kodeksu pracy. Każdy wniosek ma gotowy wzór poniżej.">
        <ul className="scenario-list">
          {derived.scenarios.map((a) => {
            const left = a.deadline ? Math.round((Date.parse(a.deadline) - Date.parse(today)) / 86_400_000) : null;
            return (
              <li key={`${a.scenario.id}-${a.applicant}`}>
                <div className="scenario-head">
                  <strong>{a.scenario.nazwa}</strong>
                  <Badge tone={a.applicant === 'OJCIEC' ? 'ok' : 'info'}>{a.applicant === 'OJCIEC' ? 'składa ojciec' : 'składasz Ty'}</Badge>
                  <LegalTip legal={a.scenario.podstawa} />
                </div>
                <p className="small muted">
                  {a.scenario.termin_wniosku ? `Termin: ${a.scenario.termin_wniosku}.` : 'Termin: niezwłocznie.'}
                  {a.deadline && <> Najpóźniej <strong>{formatPL(a.deadline)}</strong>{left !== null && (left < 0 ? ` (minęło ${-left} dni temu)` : ` (za ${left} dni)`)}.</>}
                </p>
                {a.scenario.pola_wniosku.length > 0 && (
                  <p className="small">We wniosku: {a.scenario.pola_wniosku.join('; ')}.</p>
                )}
                {a.scenario.uwagi && <p className="small muted">{a.scenario.uwagi}</p>}
              </li>
            );
          })}
          {derived.scenarios.length === 0 && <li className="muted">Brak wniosków do złożenia przy obecnych danych.</li>}
        </ul>
      </Card>

      <Card
        title="Dokumenty do skompletowania"
        subtitle={`Masz ${done} z ${items.length}. Zasiłek wypłaca ${derived.fatherCarries ? 'płatnik ojca lub ZUS' : derived.eligibility.payer === 'ZUS' ? 'ZUS' : 'pracodawca'}.`}
        actions={
          <>
            <CopyButton text={checklistToMarkdown(items)} label="Kopiuj (Markdown)" />
            {canExportFiles && <button type="button" className="btn btn-ghost" onClick={() => downloadText('checklista-dokumentow.md', checklistToMarkdown(items))}><Icon name="download" size={16} /> .md</button>}
          </>
        }
      >
        <div className="progress" aria-label="Postęp kompletowania dokumentów"><div style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></div>
        {(Object.keys(DESTINATION_LABELS) as Destination[]).map((g) => {
          const rows = items.filter((i) => i.destination === g);
          if (!rows.length) return null;
          return (
            <div key={g} className="doc-group">
              <h4>{DESTINATION_LABELS[g].title}</h4>
              <p className="small muted">{DESTINATION_LABELS[g].desc}</p>
              <ul className="checklist">
                {rows.map((r) => (
                  <li key={r.id} className={r.waived ? 'waived' : ''}>
                    <label>
                      <input type="checkbox" checked={!!checked[r.id] || !!r.waived} disabled={!!r.waived} onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))} />
                      <span>
                        <strong>{r.name}</strong> {r.legal && <LegalTip legal={r.legal} />}
                        <span className="small block">Do: {r.reasons.join('; ')}</span>
                        {r.oneOf && <span className="small block"><Badge tone="info">wystarczy jeden</Badge> {r.oneOf.replace(/^Wystarczy jeden: /, '')}</span>}
                        {r.waived && <span className="small block waive"><Badge tone="ok">nie musisz dostarczać</Badge> {r.waived}</span>}
                        {r.note && !r.waived && <span className="small block muted">{r.note}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <details className="more">
          <summary>Zasady ogólne składania dokumentów</summary>
          <ul className="notes">
            {GENERAL_RULES.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </details>
      </Card>

      <Card title="Gotowe wnioski" subtitle={`Wypełnione danymi z kreatora. Brakujące pola są w [nawiasach kwadratowych].`}>
        {askedForPartTime && !ptStatus.ready && (
          <div className="status status-warn" role="status">
            <strong>Nie widzisz wniosku o łączenie urlopu rodzicielskiego z pracą? Pojawi się, gdy:</strong>
            <ul>{ptStatus.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
        <div className="forms-layout">
          <nav className="forms-nav" aria-label="Wnioski">
            {forms.map((f) => (
              <button key={f.id} type="button" className={form?.id === f.id ? 'on' : ''} onClick={() => setFormId(f.id)}>
                <Icon name="file" size={16} />
                <span>{f.title}{f.deadline && <span className="small block">termin: {formatPL(f.deadline)}</span>}</span>
              </button>
            ))}
          </nav>
          {form && (
            <div className="form-preview">
              <div className="form-toolbar">
                <span className="small muted">Podstawa: {form.legal}</span>
                <span className="spacer" />
                <CopyButton text={form.body} />
                {canExportFiles ? (
                  <>
                    <button type="button" className="btn btn-ghost" onClick={() => downloadText(`${form.id}.txt`, form.body, 'text/plain')}><Icon name="download" size={16} /> .txt</button>
                    <button type="button" className="btn btn-primary" onClick={() => printText(form.body, form.title)}><Icon name="print" size={16} /> Drukuj / PDF</button>
                  </>
                ) : (
                  <span className="small muted">W tym podglądzie druk i pobieranie są zablokowane — użyj „Kopiuj” albo uruchom aplikację lokalnie (npm run dev).</span>
                )}
              </div>
              <pre className="printable">{form.body}</pre>
            </div>
          )}
        </div>
      </Card>

      {OUT_OF_SCOPE.map((o) => (
        <Card key={o.id} title={o.nazwa} subtitle={o.podstawa + ' rozporządzenia z 11.03.2025'}>
          <p>{o.uwagi} Wniosek o urlop wychowawczy składa się co najmniej 21 dni przed jego rozpoczęciem; urlop trwa do 36 miesięcy i można go wykorzystać do końca roku, w którym dziecko kończy 6 lat.</p>
          {profile.family.considersChildcareLeave && <p className="small muted" style={{ marginTop: 8 }}>Zaznaczyłaś, że rozważasz urlop wychowawczy — zaplanuj go po urlopie rodzicielskim. Dokumenty: {docName('akt_urodzenia').toLowerCase()} (jeśli nie ma go w aktach osobowych).</p>}
        </Card>
      ))}
    </div>
  );
}
