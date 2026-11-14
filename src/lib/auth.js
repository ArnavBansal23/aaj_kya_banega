import {
  browserLocalPersistence,
  onAuthStateChanged as subscribeToAuthState,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';

// Start persistence setup immediately, and wait for it before signing in or
// observing the current user so the session is stored locally on this device.
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence);

function withAuthError(context, error) {
  const wrappedError = new Error(`${context}: ${error.message}`, { cause: error });
  wrappedError.code = error.code;
  return wrappedError;
}

export async function signIn(email, password) {
  try {
    await authPersistenceReady;
    return await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (error) {
    throw withAuthError('Unable to sign in', error);
  }
}

export async function logOut() {
  try {
    await authPersistenceReady;
    await signOut(auth);
  } catch (error) {
    throw withAuthError('Unable to log out', error);
  }
}

export function onAuthStateChange(callback, onError) {
  let unsubscribe = () => {};
  let cancelled = false;

  authPersistenceReady
    .then(() => {
      if (!cancelled) {
        unsubscribe = subscribeToAuthState(auth, callback, onError);
      }
    })
    .catch((error) => {
      if (onError) onError(withAuthError('Unable to observe authentication state', error));
    });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
