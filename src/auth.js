import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'cycle.gcal.tokens';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

export class AuthRequired extends Error {}

function redirectUri(clientId) {
  const reversed = `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}`;
  return `${reversed}:/oauth2redirect`;
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(verifierBytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

async function saveTokens(tokens) {
  await Preferences.set({ key: TOKEN_KEY, value: JSON.stringify(tokens) });
}

async function loadTokens() {
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value ? JSON.parse(value) : null;
}

export async function isSignedIn() {
  return !!(await loadTokens());
}

export async function signOut() {
  const tokens = await loadTokens();
  if (tokens?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token)}`, {
      method: 'POST',
    }).catch(() => {});
  }
  await Preferences.remove({ key: TOKEN_KEY });
}

export async function signIn(clientId) {
  const { verifier, challenge } = await pkcePair();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(clientId),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const code = await new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;
    const sub = App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.includes('oauth2redirect')) return;
      settled = true;
      clearTimeout(timeoutId);
      (await sub).remove();
      Browser.close().catch(() => {});
      const redirect = new URL(url.replace(/^[^:]+:\//, 'https://x/'));
      const authCode = redirect.searchParams.get('code');
      authCode ? resolve(authCode) : reject(new AuthRequired(redirect.searchParams.get('error') || 'denied'));
    });

    timeoutId = setTimeout(async () => {
      if (settled) return;
      settled = true;
      (await sub).remove();
      reject(new AuthRequired('timeout'));
    }, 5 * 60 * 1000);

    Browser.open({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }).catch(async (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      (await sub).remove();
      reject(error);
    });
  });

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(clientId),
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new AuthRequired(tok.error || 'token exchange failed');
  await saveTokens({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
  });
}

export async function getAccessToken(clientId) {
  const tokens = await loadTokens();
  if (!tokens) throw new AuthRequired('not signed in');
  if (Date.now() < tokens.expires_at) return tokens.access_token;

  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) {
    await Preferences.remove({ key: TOKEN_KEY });
    throw new AuthRequired(tok.error || 'refresh failed');
  }

  const next = {
    ...tokens,
    access_token: tok.access_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
  };
  await saveTokens(next);
  return next.access_token;
}
