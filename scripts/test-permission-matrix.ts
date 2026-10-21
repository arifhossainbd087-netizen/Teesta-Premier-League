import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  terminate,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

interface TestResult {
  name: string;
  expected: 'ALLOW' | 'DENY';
  actual: 'ALLOW' | 'DENY';
  passed: boolean;
  notes: string;
}

const results: TestResult[] = [];

function recordResult(name: string, expected: 'ALLOW' | 'DENY', actual: 'ALLOW' | 'DENY', notes: string) {
  results.push({
    name,
    expected,
    actual,
    passed: expected === actual,
    notes,
  });
}

async function runTestSuite() {
  console.log('======================================================');
  console.log('   TPL S2 FIRESTORE SECURITY & PERMISSION TEST SUITE  ');
  console.log('======================================================\n');

  // Test 1: Public Read - Auction Current
  try {
    const snap = await getDoc(doc(db, 'auction', 'current'));
    recordResult('Public Read: /auction/current', 'ALLOW', 'ALLOW', `Status: ${snap.data()?.status || 'exists'}`);
  } catch (err: any) {
    recordResult('Public Read: /auction/current', 'ALLOW', 'DENY', err.message);
  }

  // Test 2: Public Read - Teams Scoreboard
  try {
    const snap = await getDocs(collection(db, 'teams'));
    recordResult('Public Read: /teams (Scoreboard)', 'ALLOW', 'ALLOW', `Found ${snap.size} teams`);
  } catch (err: any) {
    recordResult('Public Read: /teams (Scoreboard)', 'ALLOW', 'DENY', err.message);
  }

  // Test 3: Public Read - Players Draft
  try {
    const snap = await getDocs(collection(db, 'players'));
    recordResult('Public Read: /players (Draft Pool)', 'ALLOW', 'ALLOW', `Found ${snap.size} players`);
  } catch (err: any) {
    recordResult('Public Read: /players (Draft Pool)', 'ALLOW', 'DENY', err.message);
  }

  // Test 4: Public Read - Settings
  try {
    const snap = await getDoc(doc(db, 'settings', 'league'));
    recordResult('Public Read: /settings/league', 'ALLOW', 'ALLOW', `League: ${snap.data()?.leagueName}`);
  } catch (err: any) {
    recordResult('Public Read: /settings/league', 'ALLOW', 'DENY', err.message);
  }

  // Test 5: Public Read - Test Connection Ping
  try {
    const snap = await getDoc(doc(db, 'test', 'connection'));
    recordResult('Public Read: /test/connection (Boot Ping)', 'ALLOW', 'ALLOW', 'Handshake successful');
  } catch (err: any) {
    recordResult('Public Read: /test/connection (Boot Ping)', 'ALLOW', 'DENY', err.message);
  }

  // Test 6: Public Write - Player Registration Submission
  const tempPlayerRef = doc(collection(db, 'players'));
  try {
    await setDoc(tempPlayerRef, {
      id: tempPlayerRef.id,
      name: 'Public Test Applicant',
      age: 20,
      position: 'Midfielder',
      phone: '01799-999999',
      area: 'লালমনিরহাট',
      regFee: 500,
      paymentMethod: 'bKash',
      paymentStatus: 'Pending',
      approvalStatus: 'pending',
      basePrice: 2000,
      auctionStatus: 'upcoming',
      createdAt: new Date().toISOString(),
    });
    recordResult('Public Write: /players (Registration Form)', 'ALLOW', 'ALLOW', 'Submitted draft registration');
  } catch (err: any) {
    recordResult('Public Write: /players (Registration Form)', 'ALLOW', 'DENY', err.message);
  }

  // Test 7: Unauthorized Write - Unauthenticated attempt to modify league settings
  try {
    await updateDoc(doc(db, 'settings', 'league'), { leagueName: 'HACKED' });
    recordResult('Security Defense: Unauthenticated /settings write', 'DENY', 'ALLOW', 'FAILED: Unauthorized write was permitted');
  } catch (err: any) {
    recordResult('Security Defense: Unauthenticated /settings write', 'DENY', 'DENY', 'Blocked with PERMISSION_DENIED');
  }

  // Test 8: Unauthorized Write - Unauthenticated attempt to delete team
  try {
    await deleteDoc(doc(db, 'teams', 'team_thunders'));
    recordResult('Security Defense: Unauthenticated team deletion', 'DENY', 'ALLOW', 'FAILED: Team deletion permitted');
  } catch (err: any) {
    recordResult('Security Defense: Unauthenticated team deletion', 'DENY', 'DENY', 'Blocked with PERMISSION_DENIED');
  }

  // Test 9: Unauthorized Write - Unauthenticated attempt to declare auction SOLD
  try {
    await updateDoc(doc(db, 'auction', 'current'), {
      status: 'sold',
      highestBidderTeamName: 'Hacker Team',
    });
    recordResult('Security Defense: Unauthenticated SOLD trigger', 'DENY', 'ALLOW', 'FAILED: Status change was permitted');
  } catch (err: any) {
    recordResult('Security Defense: Unauthenticated SOLD trigger', 'DENY', 'DENY', 'Blocked with PERMISSION_DENIED');
  }

  // Test 10: Unauthorized Write - Unauthenticated attempt to approve player
  try {
    await updateDoc(tempPlayerRef, {
      approvalStatus: 'approved',
    });
    recordResult('Security Defense: Unauthenticated player approval', 'DENY', 'ALLOW', 'FAILED: Self-approval permitted');
  } catch (err: any) {
    recordResult('Security Defense: Unauthenticated player approval', 'DENY', 'DENY', 'Blocked with PERMISSION_DENIED');
  }

  // Cleanup test registration doc (Admin-only deletion will be blocked for unauthenticated, we log it)
  try {
    await deleteDoc(tempPlayerRef);
    console.log('Temp player deleted');
  } catch {
    // Expected: unauthenticated cannot delete players
  }

  await terminate(db);

  // Print Summary Table
  console.log('\n--- TEST RESULTS MATRIX ---');
  let passCount = 0;
  for (const r of results) {
    const symbol = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${symbol} | ${r.name.padEnd(52)} | Expected: ${r.expected.padEnd(5)} | Actual: ${r.actual.padEnd(5)} | ${r.notes}`);
    if (r.passed) passCount++;
  }

  console.log('\n======================================================');
  console.log(`TOTAL: ${results.length} | PASSED: ${passCount} | FAILED: ${results.length - passCount}`);
  console.log('======================================================');
}

runTestSuite().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
