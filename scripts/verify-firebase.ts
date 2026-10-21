import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function runVerification() {
  console.log('--- STARTING FIREBASE / FIRESTORE VERIFICATION ---');
  console.log('Project ID:', firebaseConfig.projectId);
  console.log('Database ID:', firebaseConfig.firestoreDatabaseId);

  // 1. Connection Ping
  try {
    console.log('1. Testing connectivity to Firestore server...');
    const testDoc = await getDocFromServer(doc(db, 'settings', 'league'));
    console.log('✓ Firestore server connected successfully. Document exists:', testDoc.exists());
    if (testDoc.exists()) {
      console.log('  Settings data:', JSON.stringify(testDoc.data()));
    }
  } catch (err: any) {
    console.error('✗ Connectivity test encountered error:', err.message);
  }

  // 2. Test Public Read
  try {
    console.log('2. Testing public read permissions on teams & players...');
    const teamsSnap = await getDocs(collection(db, 'teams'));
    console.log(`✓ Public read teams successful. Found ${teamsSnap.size} teams.`);

    const playersSnap = await getDocs(collection(db, 'players'));
    console.log(`✓ Public read players successful. Found ${playersSnap.size} players.`);
  } catch (err: any) {
    console.error('✗ Read test error:', err.message);
  }

  // 3. Test Public Player Registration Write (Unauthenticated player application)
  try {
    console.log('3. Testing public player draft registration submission...');
    const testPlayerRef = doc(collection(db, 'players'));
    const testPayload = {
      id: testPlayerRef.id,
      name: 'Verification Test Player',
      banglaName: 'ভেরিফিকেশন টেস্ট প্লেয়ার',
      age: 21,
      position: 'Forward',
      phone: '01700-000000',
      area: 'রংপুর',
      jerseySize: 'L',
      prevClub: 'টেস্ট ক্লাব',
      regFee: 500,
      paymentMethod: 'Cash',
      paymentStatus: 'Pending',
      approvalStatus: 'pending',
      basePrice: 2000,
      auctionStatus: 'upcoming',
      createdAt: new Date().toISOString(),
    };
    await setDoc(testPlayerRef, testPayload);
    console.log('✓ Public player draft application write succeeded with ID:', testPlayerRef.id);

    // Verify it was written and readable
    const readBack = await getDoc(testPlayerRef);
    if (readBack.exists() && readBack.data().name === 'Verification Test Player') {
      console.log('✓ Verified persistent data storage: player was read back correctly.');
    } else {
      console.error('✗ Persistent read back mismatch.');
    }
  } catch (err: any) {
    console.error('✗ Player registration write error:', err.message);
  }

  // 4. Test Security Rule Protection (Unauthorized unauthenticated user attempting to modify admin settings or forge a sold outcome)
  try {
    console.log('4. Testing Security Rules: Attempting unauthorized write to settings/league without admin auth...');
    await setDoc(doc(db, 'settings', 'league'), { leagueName: 'Hacked League' });
    console.error('✗ VULNERABILITY DETECTED: Unauthorized write was allowed!');
  } catch (err: any) {
    if (err.message?.includes('permission-denied') || err.code === 'permission-denied') {
      console.log('✓ Security Rules ACTIVE: Unauthorized write correctly blocked with PERMISSION_DENIED!');
    } else {
      console.log('✓ Blocked with error:', err.message);
    }
  }

  // 5. Test Unauthorized attempt to delete a team
  try {
    console.log('5. Testing Security Rules: Attempting unauthorized modification of a team without admin auth...');
    await setDoc(doc(db, 'teams', 'unauthorized_team'), { name: 'Rogue Team', totalBudget: 999999 });
    console.error('✗ VULNERABILITY DETECTED: Unauthorized team creation was allowed!');
  } catch (err: any) {
    if (err.message?.includes('permission-denied') || err.code === 'permission-denied') {
      console.log('✓ Security Rules ACTIVE: Unauthorized team creation blocked with PERMISSION_DENIED!');
    } else {
      console.log('✓ Blocked with error:', err.message);
    }
  }

  console.log('--- VERIFICATION COMPLETE ---');
}

runVerification().catch(console.error);
