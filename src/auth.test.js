import { beforeEach, describe, expect, test, vi } from 'vitest';

const calls = [];
const tokenJson = JSON.stringify({
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: Date.now() + 60000,
});

vi.mock('@capacitor/browser', () => ({ Browser: {} }));
vi.mock('@capacitor/app', () => ({ App: {} }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => {
      calls.push('get');
      return { value: tokenJson };
    }),
    remove: vi.fn(async () => {
      calls.push('remove');
    }),
    set: vi.fn(),
  },
}));

describe('signOut', () => {
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = vi.fn(async () => {
      calls.push('fetch');
      return { ok: true };
    });
  });

  test('removes local tokens before attempting remote revocation', async () => {
    const { signOut } = await import('./auth.js');

    await signOut();

    expect(calls).toEqual(['get', 'remove', 'fetch']);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/revoke?token=refresh-token',
      { method: 'POST' },
    );
  });
});
