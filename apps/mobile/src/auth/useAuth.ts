import { useCallback, useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { config } from '../config';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = 'orgmate.tokens';
const SCOPES = ['openid', 'profile', 'offline_access', config.apiScope];
const EXPIRY_SKEW_MS = 60_000;

export const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`,
  tokenEndpoint: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
  endSessionEndpoint: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/logout`,
};

export const redirectUri = AuthSession.makeRedirectUri({ scheme: 'orgmate', path: 'auth' });

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
}

let cached: StoredTokens | undefined;

function toStored(response: AuthSession.TokenResponse): StoredTokens {
  const lifetime = (response.expiresIn ?? 3600) * 1000;
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    idToken: response.idToken,
    expiresAt: Date.now() + lifetime,
  };
}

async function persist(tokens: StoredTokens): Promise<void> {
  cached = tokens;
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

async function restore(): Promise<StoredTokens | undefined> {
  if (cached) {
    return cached;
  }
  const raw = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!raw) {
    return undefined;
  }
  cached = JSON.parse(raw) as StoredTokens;
  return cached;
}

export async function clearTokens(): Promise<void> {
  cached = undefined;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Returns a valid access token, silently refreshing when it is close to expiry. */
export async function getAccessToken(): Promise<string | undefined> {
  const tokens = await restore();
  if (!tokens) {
    return undefined;
  }
  if (Date.now() < tokens.expiresAt - EXPIRY_SKEW_MS) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    await clearTokens();
    return undefined;
  }

  try {
    const refreshed = await AuthSession.refreshAsync(
      { clientId: config.clientId, refreshToken: tokens.refreshToken, scopes: SCOPES },
      discovery,
    );
    const next = toStored(refreshed);
    next.refreshToken = next.refreshToken ?? tokens.refreshToken;
    await persist(next);
    return next.accessToken;
  } catch {
    await clearTokens();
    return undefined;
  }
}

function readName(idToken: string | undefined): string | undefined {
  if (!idToken) {
    return undefined;
  }
  try {
    const payload = idToken.split('.')[1];
    if (!payload) {
      return undefined;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(globalThis.atob(normalized)) as {
      name?: string;
      preferred_username?: string;
    };
    return claims.name ?? claims.preferred_username;
  } catch {
    return undefined;
  }
}

export interface AuthState {
  isReady: boolean;
  isSignedIn: boolean;
  displayName: string | undefined;
  error: string | undefined;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [isReady, setIsReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.clientId,
      scopes: SCOPES,
      redirectUri,
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery,
  );

  useEffect(() => {
    void (async () => {
      const token = await getAccessToken();
      setIsSignedIn(Boolean(token));
      setDisplayName(readName(cached?.idToken));
      setIsReady(true);
    })();
  }, []);

  const signIn = useCallback(async () => {
    setError(undefined);
    if (!request) {
      setError('인증 요청을 준비하지 못했습니다.');
      return;
    }

    const result = await promptAsync();
    if (result.type !== 'success' || !result.params.code) {
      if (result.type === 'error') {
        setError(result.params.error_description ?? '로그인에 실패했습니다.');
      }
      return;
    }

    try {
      const response = await AuthSession.exchangeCodeAsync(
        {
          clientId: config.clientId,
          code: result.params.code,
          redirectUri,
          extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
        },
        discovery,
      );
      await persist(toStored(response));
      setIsSignedIn(true);
      setDisplayName(readName(response.idToken));
    } catch (cause) {
      setError(`토큰 교환 실패: ${String(cause)}`);
    }
  }, [promptAsync, request]);

  const signOut = useCallback(async () => {
    await clearTokens();
    setIsSignedIn(false);
    setDisplayName(undefined);
  }, []);

  return { isReady, isSignedIn, displayName, error, signIn, signOut };
}
