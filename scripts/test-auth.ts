import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function testAuthProviders() {
  console.log('Testing Anonymous Auth...');
  try {
    const cred = await signInAnonymously(auth);
    console.log('✓ Anonymous Auth is ENABLED. Signed in UID:', cred.user.uid);
  } catch (err: any) {
    console.log('✗ Anonymous Auth is not enabled:', err.code, err.message);
  }
}

testAuthProviders().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
