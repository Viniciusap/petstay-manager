import { createHash } from 'node:crypto';

// Payload serialized as JSON to prevent pipe-injection collisions.
export function generateHash(token: string, nomeDigitado: string, timestamp: string): string {
  const payload = JSON.stringify({ token, nomeDigitado, timestamp });
  return createHash('sha256').update(payload).digest('hex');
}

export function verifyHash(hash: string, token: string, nomeDigitado: string, timestamp: string): boolean {
  return generateHash(token, nomeDigitado, timestamp) === hash;
}
