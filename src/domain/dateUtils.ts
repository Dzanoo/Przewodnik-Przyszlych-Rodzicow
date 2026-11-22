/** Operacje na datach w UTC (bez wpływu stref czasowych). Format wejścia/wyjścia: `YYYY-MM-DD`. */

const DAY_MS = 86_400_000;

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isValidISO(iso: string | undefined | null): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return toISO(parseISO(iso)) === iso;
}

export function addDays(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + days * DAY_MS));
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, Math.round(weeks * 7));
}

export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toISO(target);
}

/** Liczba dni od `a` do `b` (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS);
}

/** Pełne lata ukończone w dniu `on`. */
export function ageInYears(birthISO: string, onISO: string): number {
  const b = parseISO(birthISO);
  const o = parseISO(onISO);
  let age = o.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    o.getUTCMonth() < b.getUTCMonth() || (o.getUTCMonth() === b.getUTCMonth() && o.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Ostatni dzień roku kalendarzowego, w którym dziecko kończy `years` lat. */
export function endOfYearChildTurns(birthISO: string, years: number): string {
  const b = parseISO(birthISO);
  return `${b.getUTCFullYear() + years}-12-31`;
}

export function formatPL(iso: string): string {
  if (!isValidISO(iso)) return '—';
  const d = parseISO(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

export function maxISO(a: string, b: string): string {
  return a > b ? a : b;
}

export function minISO(a: string, b: string): string {
  return a < b ? a : b;
}

/** Miesiąc `YYYY-MM` przesunięty o `delta`. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
