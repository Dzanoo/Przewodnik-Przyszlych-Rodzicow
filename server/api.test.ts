import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from './app';

const TODAY = '2026-11-21';

test('GET /api/health', () => {
  const r = route('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal((r.body as { status: string }).status, 'ok');
});

test('GET /api/parameters zwraca stałe 2026', () => {
  const r = route('GET', '/api/parameters');
  assert.equal((r.body as { MIN_BENEFIT_BASE_FULL_TIME: number }).MIN_BENEFIT_BASE_FULL_TIME, 4147.1);
});

test('POST /api/calculate: częściowy profil uzupełniany domyślnym', () => {
  const r = route('POST', '/api/calculate', { today: TODAY, profile: { employment: { title: 'JDG' } } });
  assert.equal(r.status, 200);
  const body = r.body as { profile: { employment: { title: string; insuredAtPayer: number } }; results: { eligibility: { payer: string } } };
  assert.equal(body.profile.employment.title, 'JDG');
  assert.equal(body.profile.employment.insuredAtPayer, 45); // z profilu domyślnego
  assert.equal(body.results.eligibility.payer, 'ZUS');
});

test('POST /api/documents: martwe urodzenie → wniosek i wzór Z-12', () => {
  const r = route('POST', '/api/documents', {
    today: TODAY,
    profile: { family: { situation: 'PO_PORODZIE', birthDate: '2027-01-10', childOutcome: 'MARTWE' } },
  });
  const body = r.body as { scenarios: { scenario: { id: string } }[]; forms: { id: string }[] };
  assert.ok(body.scenarios.some((s) => s.scenario.id === 'martwe_urodzenie_lub_zgon_do_8_tyg'));
  assert.ok(body.forms.some((f) => f.id === 'funeral'));
});

test('błędy: 400, 404, 405', () => {
  assert.equal(route('POST', '/api/calculate', 'tekst').status, 400);
  assert.equal(route('POST', '/api/calculate', { profile: [] }).status, 400);
  assert.equal(route('GET', '/api/nieistnieje').status, 404);
  assert.equal(route('GET', '/api/calculate').status, 405);
});

test('nieznane pola i złe typy w profilu są ignorowane', () => {
  const r = route('POST', '/api/calculate', { today: TODAY, profile: { hack: 1, family: { childrenCount: 'dwa' } } });
  const body = r.body as { profile: { family: { childrenCount: number } } & Record<string, unknown> };
  assert.equal(body.profile.family.childrenCount, 1);
  assert.equal('hack' in body.profile, false);
});
