import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getCurrentSession, getUserAttributes,
  signOut as cognitoSignOut,
  handleOAuthCallback, createOAuthSession,
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
        window.history.replaceState({}, document.title, window.location.pathname);

        const result = await handleOAuthCallback(code);
        const oauthUser = {
          email: result.user.email,
          name: result.user.name,
          sub: result.user.sub,
          _oauthTokens: result.tokens,
          _idToken: result.user.idToken,
        };
        setUser(oauthUser);
        setIsAuthenticated(true);
        setIsLoading(false);
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

  async function getToken() {
    // OAuth user — return stored id token
    if (user?._idToken) return user._idToken;
    if (user?._oauthTokens?.id_token) return user._oauthTokens.id_token;

    // Standard Cognito user
    try {
      const session = await getCurrentSession();
      return session.getIdToken().getJwtToken();
    } catch {
      return null;
    }
  }

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated,
      login, loginWithOAuth, logout, getToken,
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
