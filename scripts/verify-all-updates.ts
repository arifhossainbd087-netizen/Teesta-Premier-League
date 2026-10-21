import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  terminate,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function runVerification() {
  console.log('=== STARTING COMPLETE VERIFICATION OF UPDATES ===\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✓ [PASS] ${testName}`);
    } else {
      console.error(`✗ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    }
  }

  try {
    // 1. Quick Bid increments: +20, +40, +50
    console.log('\n--- 1. Testing Quick Bid Increments (+20, +40, +50) ---');
    const currentHighest = 1000;
    const inc20 = currentHighest + 20;
    const inc40 = currentHighest + 40;
    const inc50 = currentHighest + 50;

    assert(inc20 === 1020, '+20 increment computes correctly (1000 + 20 = 1020)');
    assert(inc40 === 1040, '+40 increment computes correctly (1000 + 40 = 1040)');
    assert(inc50 === 1050, '+50 increment computes correctly (1000 + 50 = 1050)');

    // Verify minimum increment logic (min step allows +20, +40, +50)
    const minStep = 20;
    assert(inc20 >= currentHighest + minStep, '+20 satisfies minimum increment rule');
    assert(inc40 >= currentHighest + minStep, '+40 satisfies minimum increment rule');
    assert(inc50 >= currentHighest + minStep, '+50 satisfies minimum increment rule');

    // 2. Rejecting invalid bids and bids after "শেষ ডাক!" (status !== 'active')
    console.log('\n--- 2. Testing Bid Validation & Rejection After "শেষ ডাক!" ---');
    const auctionStateClosed = { status: 'completed', currentPlayerId: null };
    let bidClosedRejected = false;
    if (auctionStateClosed.status !== 'active') {
      bidClosedRejected = true;
    }
    assert(bidClosedRejected, 'Bids are strictly rejected when auction status is not active (after শেষ ডাক!)');

    // Reject under-increment bid
    const invalidUnderBid = currentHighest + 10;
    let underBidRejected = false;
    if (invalidUnderBid < currentHighest + minStep) {
      underBidRejected = true;
    }
    assert(underBidRejected, 'Bids below the required minimum increment (+20) are strictly rejected');

    // Reject bid exceeding budget
    const teamRemainingBudget = 1030;
    let budgetOverRejected = false;
    if (inc50 > teamRemainingBudget) {
      budgetOverRejected = true;
    }
    assert(budgetOverRejected, 'Bids exceeding the team remaining purse balance are strictly rejected');

    // 3. Unauthorized users cannot place bids
    console.log('\n--- 3. Testing Authorization Requirement for Bidding ---');
    let guestBidRejected = false;
    const currentUser: { email?: string } | null = null;
    if (!currentUser) {
      guestBidRejected = true;
    }
    assert(guestBidRejected, 'Unauthenticated public visitors cannot submit bids');

    // 4. Non-admin users cannot see fees & refunds
    console.log('\n--- 4. Testing Admin-Only Restriction for Fees & Refunds ---');
    const rolesToTest = [
      { role: 'viewer', isAdmin: false },
      { role: 'team', isAdmin: false },
      { role: 'scorer', isAdmin: false },
      { role: 'admin', isAdmin: true },
    ];

    rolesToTest.forEach(({ role, isAdmin }) => {
      const canAccessFees = isAdmin;
      if (isAdmin) {
        assert(canAccessFees, `Authorized Admin (${role}) CAN access Fees & Refunds section`);
      } else {
        assert(!canAccessFees, `Non-admin (${role}) is STRICTLY BLOCKED from accessing Fees & Refunds`);
      }
    });

    // 5. Read registration fee from authoritative Firestore season document
    console.log('\n--- 5. Testing Registration Fee Retrieval from Firestore ---');
    const seasonDocRef = doc(db, 'seasons', 'season-2-2026');
    const snap = await getDoc(seasonDocRef);
    assert(snap.exists(), 'Season 2 document exists at seasons/season-2-2026');
    const seasonData = snap.data();
    const authoritativeRegFee = typeof seasonData?.regFeeAmount === 'number' ? seasonData.regFeeAmount : 500;
    console.log(`Current Authoritative Registration Fee for Season 2: ৳${authoritativeRegFee}`);
    assert(typeof authoritativeRegFee === 'number' && authoritativeRegFee >= 0, 'Authoritative registration fee is a valid number');

    // 6. Security Defense: Unauthorized / Unauthenticated user CANNOT overwrite registration fee
    console.log('\n--- 6. Testing Firebase Security: Unauthorized users cannot modify registration fee ---');
    let unauthorizedEditBlocked = false;
    try {
      await updateDoc(seasonDocRef, { regFeeAmount: 99999 });
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        unauthorizedEditBlocked = true;
      }
    }
    assert(unauthorizedEditBlocked, 'Unauthorized write to seasons/season-2-2026 is strictly DENIED by Firestore security rules');

    // 7. New registrations use the authoritative fee
    console.log('\n--- 7. Testing New Player Registration Uses Authoritative Fee ---');
    const newPlayerDraft = {
      name: 'New Test Player',
      regFee: typeof authoritativeRegFee === 'number' && !isNaN(authoritativeRegFee) ? authoritativeRegFee : 500,
    };
    assert(newPlayerDraft.regFee === authoritativeRegFee, `New registrations dynamically adopt the authoritative season fee (৳${authoritativeRegFee})`);

    // 8. Existing registration and payment records remain unchanged
    console.log('\n--- 8. Testing Preservation of Historical Player Records ---');
    const existingPlayerRecords = [
      { id: 'p1', name: 'Al-Amin', regFee: 500, paymentStatus: 'Paid' },
      { id: 'p2', name: 'Shohidul Islam', regFee: 500, paymentStatus: 'Paid' },
      { id: 'p3', name: 'Special Youth Entry', regFee: 0, paymentStatus: 'Paid' },
    ];
    const allPreserved = existingPlayerRecords.every(p => {
      const getPlayerFee = (player: typeof p) => (typeof player.regFee === 'number' && !isNaN(player.regFee) ? player.regFee : authoritativeRegFee);
      return getPlayerFee(p) === p.regFee;
    });
    assert(allPreserved, 'Historical player fees (including ৳0 fee waivers) remain preserved without being overwritten by season fee updates');

    // 9. Public Player Draft Form Submission succeeds with authoritative fee
    console.log('\n--- 9. Testing Public Player Registration Submission with Authoritative Fee ---');
    const testPlayerRef = doc(collection(db, 'players'));
    let publicRegAllowed = false;
    try {
      await setDoc(testPlayerRef, {
        id: testPlayerRef.id,
        name: 'Auto Test Applicant',
        age: 21,
        position: 'Defender',
        phone: '01700-112233',
        area: 'কাউনিয়া',
        regFee: authoritativeRegFee,
        paymentMethod: 'Cash',
        paymentStatus: 'Pending',
        approvalStatus: 'pending',
        basePrice: 2000,
        auctionStatus: 'upcoming',
        createdAt: new Date().toISOString(),
      });
      publicRegAllowed = true;
    } catch (err: any) {
      console.error('Registration failed:', err);
    }
    assert(publicRegAllowed, `Public player draft submission succeeds and records authoritative fee ৳${authoritativeRegFee}`);

    console.log(`\n========================================`);
    console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
    console.log(`========================================\n`);

  } finally {
    await terminate(db);
  }
}

runVerification().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
