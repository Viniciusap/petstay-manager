const revokedJtis = new Map<string, number>();

export function revoke(jti: string, expMs: number): void {
  revokedJtis.set(jti, expMs);
}

export function isRevoked(jti: string): boolean {
  if (!revokedJtis.has(jti)) return false;
  const exp = revokedJtis.get(jti)!;
  if (Date.now() > exp) {
    revokedJtis.delete(jti);
    return false;
  }
  return true;
}
