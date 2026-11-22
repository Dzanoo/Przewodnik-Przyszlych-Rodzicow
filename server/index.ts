/**
 * Serwer HTTP dla REST API — bez dodatkowych zależności (node:http).
 * Uruchomienie: npm run api   (domyślnie http://localhost:3001)
 */
import { createServer, type IncomingMessage } from 'node:http';
import { API_VERSION, ENDPOINTS, route } from './app';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
const MAX_BODY_BYTES = 1_000_000;

class InvalidBody extends Error {}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new InvalidBody('Treść żądania jest za duża (maks. 1 MB).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new InvalidBody('Treść żądania nie jest poprawnym JSON-em.'));
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  let status: number;
  let body: unknown;
  try {
    const input = req.method === 'POST' ? await readBody(req) : undefined;
    ({ status, body } = route(req.method ?? 'GET', path, input));
  } catch (err) {
    status = err instanceof InvalidBody ? 400 : 500;
    body = { error: err instanceof InvalidBody ? err.message : 'Błąd serwera.' };
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
  console.log(`${req.method} ${path} → ${status}`);
});

server.listen(PORT, () => {
  console.log(`Przewodnik Przyszłych Rodziców — REST API v${API_VERSION} na http://localhost:${PORT}`);
  for (const e of ENDPOINTS) console.log(`  ${e}`);
});
