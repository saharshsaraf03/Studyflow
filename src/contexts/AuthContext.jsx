import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getCurrentSession, getUserAttributes,
  signOut as cognitoSignOut,
  handleOAuthCallback, createOAuthSession, refreshOAuthToken,
} from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    initAuth();
  }, []);

  async function initAuth() {
    setIsLoading(true);
    try {
      // Check for OAuth callback code in URL first
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (code) {
        // Remove code from URL immediately to prevent re-use on refresh
        window.history.replaceState({}, document.title, '/');

        const result = await handleOAuthCallback(code);
        const oauthUser = {
          email: result.user.email,
          name: result.user.name,
          sub: result.user.sub,
          _oauthTokens: result.tokens,
          _idToken: result.user.idToken,
          _accessToken: result.user.accessToken || result.tokens.access_token,
          _refreshToken: result.tokens.refresh_token,
        };
        // Persist OAuth session
        localStorage.setItem('sf_oauth_user', JSON.stringify({
          ...oauthUser,
          _expiresAt: Date.now() + (result.tokens.expires_in * 1000),
        }));
        setUser(oauthUser);
        setIsAuthenticated(true);
        setIsLoading(false);
        // Navigate to library after successful OAuth
        window.location.href = '/library';
        return;
      }

      // Check for existing OAuth session in localStorage
      const savedOAuth = localStorage.getItem('sf_oauth_user');
      if (savedOAuth) {
        const parsed = JSON.parse(savedOAuth);
        // Check token expiry
        if (parsed._expiresAt && Date.now() < parsed._expiresAt) {
          setUser(parsed);
          setIsAuthenticated(true);
          setIsLoading(false);
          return;
        } else {
          localStorage.removeItem('sf_oauth_user');
        }
      }

      // Standard Cognito session check
      const session = await getCurrentSession();
      const attrs = await getUserAttributes();
      setUser({
        email: attrs.email,
        name: attrs.name || attrs.email?.split('@')[0],
        sub: attrs.sub,
        _session: session,
      });
      setIsAuthenticated(true);
    } catch {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }

  function login(session, attributes) {
    setUser({
      email: attributes.email,
      name: attributes.name || attributes.email?.split('@')[0],
      sub: attributes.sub,
      _session: session,
    });
    setIsAuthenticated(true);
  }

  function loginWithOAuth(oauthResult) {
    const oauthUser = {
      email: oauthResult.user.email,
      name: oauthResult.user.name,
      sub: oauthResult.user.sub,
      _idToken: oauthResult.user.idToken,
      _accessToken: oauthResult.user.accessToken || oauthResult.tokens?.access_token,
      _refreshToken: oauthResult.tokens?.refresh_token,
      _expiresAt: Date.now() + (oauthResult.tokens.expires_in * 1000),
    };
    // Persist OAuth session
    localStorage.setItem('sf_oauth_user', JSON.stringify(oauthUser));
    setUser(oauthUser);
    setIsAuthenticated(true);
  }

  function logout() {
    cognitoSignOut();
    localStorage.removeItem('sf_oauth_user');
    setUser(null);
    setIsAuthenticated(false);
  }

  const isOAuthUser = Boolean(user?._idToken || user?._refreshToken);

  // Returns the OAuth user with fresh tokens, refreshing them if they are
  // expired or about to expire. Returns null if the session can't be refreshed.
  async function getFreshOAuthUser() {
    const expiresAt = user._expiresAt || 0;
    const needsRefresh = !user._idToken || !user._accessToken || Date.now() > expiresAt - 60_000;
    if (!needsRefresh || !user._refreshToken) return user;
    try {
      const tokens = await refreshOAuthToken(user._refreshToken);
      const refreshedUser = {
        ...user,
        _idToken: tokens.id_token,
        _accessToken: tokens.access_token || user._accessToken,
        _refreshToken: tokens.refresh_token || user._refreshToken,
        _expiresAt: Date.now() + (tokens.expires_in * 1000),
      };
      setUser(refreshedUser);
      localStorage.setItem('sf_oauth_user', JSON.stringify(refreshedUser));
      return refreshedUser;
    } catch {
      // Refresh failed — the OAuth session is no longer valid
      logout();
      return null;
    }
  }

  async function getToken() {
    // OAuth user — refresh the id token if it is expired or about to expire
    if (isOAuthUser) {
      const fresh = await getFreshOAuthUser();
      if (!fresh) return null;
      if (fresh._idToken) return fresh._idToken;
      if (fresh._oauthTokens?.id_token) return fresh._oauthTokens.id_token;
    }

    // Standard Cognito user
    try {
      const session = await getCurrentSession();
      return session.getIdToken().getJwtToken();
    } catch {
      return null;
    }
  }

  // Cognito access token (needed for user-pool APIs such as DeleteUser).
  async function getAccessToken() {
    if (isOAuthUser) {
      const fresh = await getFreshOAuthUser();
      if (!fresh) return null;
      return fresh._accessToken || fresh._oauthTokens?.access_token || null;
    }
    try {
      const session = await getCurrentSession();
      return session.getAccessToken().getJwtToken();
    } catch {
      return null;
    }
  }

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated,
      login, loginWithOAuth, logout, getToken, getAccessToken, isOAuthUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
