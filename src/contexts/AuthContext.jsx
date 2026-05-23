import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentSession, getUserAttributes, signOut as cognitoSignOut } from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // { email, name, sub }
  const [isLoading, setIsLoading] = useState(true); // true while checking session
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      await getCurrentSession();
      const attrs = await getUserAttributes();
      setUser({
        email: attrs.email,
        name: attrs.name || attrs.email.split('@')[0],
        sub: attrs.sub,
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
      name: attributes.name || attributes.email.split('@')[0],
      sub: attributes.sub,
    });
    setIsAuthenticated(true);
  }

  function logout() {
    cognitoSignOut();
    setUser(null);
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
