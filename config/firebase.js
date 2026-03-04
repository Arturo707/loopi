import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// ─────────────────────────────────────────────────────────────
//  TODO: Replace these with your Firebase project credentials.
//  1. Go to https://console.firebase.google.com
//  2. Create a new project → Add a web app
//  3. Enable Google sign-in under Authentication → Sign-in method
//  4. Add your Vercel domain to Authentication → Settings → Authorized domains
//  5. Paste your config values below (or use EXPO_PUBLIC_ env vars)
// ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'YOUR_APP_ID',
};

const mask = (v) => (v && !v.startsWith('YOUR_') ? `${v.slice(0, 8)}…` : `MISSING (got: "${v}")`);
console.log('[Firebase] Config values in use:');
console.log('  apiKey      :', mask(firebaseConfig.apiKey));
console.log('  authDomain  :', firebaseConfig.authDomain);
console.log('  projectId   :', firebaseConfig.projectId);
console.log('  appId       :', firebaseConfig.appId);

const missing = Object.entries(firebaseConfig).filter(([, v]) => v.startsWith('YOUR_')).map(([k]) => k);
if (missing.length) {
  console.error('[Firebase] ❌ Env vars not loaded — still using placeholders for:', missing);
  console.error('[Firebase]    Make sure .env is at the project root and the dev server was restarted with --clear');
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
