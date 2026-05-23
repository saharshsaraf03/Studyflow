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
