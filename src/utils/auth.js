import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';

const POOL_DATA = {
  UserPoolId: 'ap-south-1_5qo8gZ9cS',
  ClientId: '5e14397oapv9ubug1p2um2c3ie',
};

const userPool = new CognitoUserPool(POOL_DATA);

// Sign up a new user
export function signUp(email, password, name) {
  return new Promise((resolve, reject) => {
    const attributeList = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'name', Value: name }),
    ];

    userPool.signUp(email, password, attributeList, null, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Confirm signup with verification code
export function confirmSignUp(email, code) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Sign in
export function signIn(email, password) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

// Sign out
export function signOut() {
  const currentUser = userPool.getCurrentUser();
  if (currentUser) currentUser.signOut();
}

// Get current authenticated user session
export function getCurrentSession() {
  return new Promise((resolve, reject) => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      reject(new Error('No user'));
      return;
    }

    currentUser.getSession((err, session) => {
      if (err) reject(err);
      else resolve(session);
    });
  });
}

// Get current user attributes (name, email, etc.)
export function getUserAttributes() {
  return new Promise((resolve, reject) => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      reject(new Error('No user'));
      return;
    }

    currentUser.getSession((err, session) => {
      if (err) { reject(err); return; }

      currentUser.getUserAttributes((err, attributes) => {
        if (err) reject(err);
        else {
          const attrs = {};
          attributes.forEach(attr => {
            attrs[attr.Name] = attr.Value;
          });
          resolve(attrs);
        }
      });
    });
  });
}

// Resend confirmation code
export function resendConfirmationCode(email) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.resendConfirmationCode((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Forgot password — initiate
export function forgotPassword(email) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.forgotPassword({
      onSuccess: (result) => resolve(result),
      onFailure: (err) => reject(err),
    });
  });
}

// Forgot password — confirm with code and new password
export function confirmForgotPassword(email, code, newPassword) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

// ── Google OAuth via Cognito Hosted UI ───────────────────────────────────────

const COGNITO_DOMAIN = 'https://ap-south-15qo8gz9cs.auth.ap-south-1.amazoncognito.com';
const OAUTH_CLIENT_ID = '5e14397oapv9ubug1p2um2c3ie';

/**
 * Redirect to Cognito's Google OAuth endpoint.
 * Cognito handles Google login and redirects back with ?code=...
 */
export function signInWithGoogle() {
  const redirectUri = window.location.origin;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    identity_provider: 'Google',
    scope: 'email openid profile',
  });
  window.location.href = `${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 * Called on page load when ?code= is in the URL (after Google redirect).
 * Returns { tokens, user: { sub, email, name, idToken, accessToken } }
 */
export async function handleOAuthCallback(code) {
  const redirectUri = window.location.origin;
  const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error_description || 'OAuth token exchange failed');
  }

  const tokens = await response.json();

  // Decode id_token payload (base64url) to extract user attributes
  const parts = tokens.id_token.split('.');
  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

  return {
    tokens,
    user: {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email?.split('@')[0] || 'User',
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    },
  };
}

/**
 * Get session for OAuth users (stores tokens in memory via AuthContext).
 * Returns a mock session object compatible with getToken() in AuthContext.
 */
export function createOAuthSession(idToken) {
  return {
    getIdToken: () => ({ getJwtToken: () => idToken }),
  };
}
