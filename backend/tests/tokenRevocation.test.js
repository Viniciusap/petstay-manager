describe('tokenRevocation', () => {
  let revocation;

  beforeEach(() => {
    jest.resetModules();
    revocation = require('../src/utils/tokenRevocation');
  });

  it('revoke() + isRevoked() → true for active jti', () => {
    revocation.revoke('jti-active', Date.now() + 60000);
    expect(revocation.isRevoked('jti-active')).toBe(true);
  });

  it('isRevoked() → false for unknown jti', () => {
    expect(revocation.isRevoked('jti-unknown')).toBe(false);
  });

  it('isRevoked() → false for already-expired token', () => {
    revocation.revoke('jti-expired', Date.now() - 1000);
    expect(revocation.isRevoked('jti-expired')).toBe(false);
  });

  it('expired jti auto-removed from blacklist on check', () => {
    revocation.revoke('jti-cleanup', Date.now() - 1000);
    revocation.isRevoked('jti-cleanup');
    expect(revocation.isRevoked('jti-cleanup')).toBe(false);
  });

  it('can revoke multiple jtis independently', () => {
    revocation.revoke('jti-a', Date.now() + 60000);
    revocation.revoke('jti-b', Date.now() + 60000);
    revocation.revoke('jti-c', Date.now() - 1000);
    expect(revocation.isRevoked('jti-a')).toBe(true);
    expect(revocation.isRevoked('jti-b')).toBe(true);
    expect(revocation.isRevoked('jti-c')).toBe(false);
  });
});
