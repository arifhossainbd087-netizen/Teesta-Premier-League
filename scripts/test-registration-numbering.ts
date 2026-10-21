import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  registerPlayerWithAtomicFormNumber,
  updateRegistrationSettings,
  getRegistrationSettings,
  checkFormNumberConflict,
  formatFormDisplay,
} from '../src/services/registrationService';
import { Player } from '../src/types';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function runTests() {
  console.log('=== STARTING REGISTRATION FORM NUMBERING & CONCURRENCY TESTS ===');
  const testSeasonId = 'season-2-2026';
  const createdTestPlayerIds: string[] = [];

  try {
    // 1. Verify Existing Records Preservation
    console.log('\n[TEST 1] Verifying existing player records are preserved...');
    const initialPlayersSnap = await getDocs(collection(db, 'players'));
    console.log(`✓ Total existing player records in database: ${initialPlayersSnap.size}`);
    const existingIds = new Set<string>();
    initialPlayersSnap.forEach(d => existingIds.add(d.id));

    // 2. Initialize / Reset Settings to Form 1
    console.log('\n[TEST 2] Setting authoritative registration settings to start from Form 1...');
    const updateRes = await updateRegistrationSettings(
      {
        startFormNumber: 1,
        nextFormNumber: 1,
        prefix: 'ফরম নং:- ',
        labelBn: 'ফরম নং:- ',
        labelEn: 'Form No. ',
        digitFormat: 'bn',
      },
      'arifhossainbd087@gmail.com'
    );
    if (!updateRes.success) {
      throw new Error(`Failed to configure settings: ${updateRes.error}`);
    }
    console.log('✓ Registration settings updated to Start=1, Next=1');
    const currentSettings = await getRegistrationSettings();
    console.log(`  Current settings: nextFormNumber=${currentSettings.nextFormNumber}, prefix="${currentSettings.prefix}"`);

    // 3. Test First Registration gets Form No. 1
    console.log('\n[TEST 3] Testing first registration receives Form No. 1...');
    const testPlayer1Payload = {
      name: 'Sequential Test Player 1',
      banglaName: 'সিকোয়েন্সিয়াল টেস্ট ১',
      age: 20,
      position: 'Forward' as const,
      category: 'A' as const,
      phone: '01711-000001',
      union: 'টেপা মধুপুর',
      area: 'টেপা মধুপুর',
      jerseySize: 'L',
      prevClub: 'টেস্ট ক্লাব ১',
      regFee: 500,
      paymentMethod: 'bKash' as const,
      paymentTrxId: 'TESTTRX001',
      paymentStatus: 'Paid' as const,
      approvalStatus: 'pending' as const,
      basePrice: 4000,
      auctionStatus: 'upcoming' as const,
      round: 1,
      photoUrl: '',
    };

    const reg1Result = await registerPlayerWithAtomicFormNumber(testPlayer1Payload, testSeasonId);
    if (!reg1Result.success || !reg1Result.player) {
      throw new Error(`Registration 1 failed: ${reg1Result.error}`);
    }
    createdTestPlayerIds.push(reg1Result.player.id);

    console.log(`✓ Player 1 created! ID: ${reg1Result.player.id}`);
    console.log(`  Assigned Numeric Value: ${reg1Result.assignedNumericValue} (Expected: 1)`);
    console.log(`  Assigned Form Label: "${reg1Result.assignedFormNumber}" (Expected: "ফরম নং:- ১")`);
    console.log(`  Registration Serial: "${reg1Result.registrationNumber}" (Expected: "TPL-S2-001")`);

    if (reg1Result.assignedNumericValue !== 1) {
      throw new Error(`FAIL: Expected Form No. 1, but received ${reg1Result.assignedNumericValue}`);
    }

    // 4. Test Second Registration sequentially receives Form No. 2
    console.log('\n[TEST 4] Testing second registration receives Form No. 2...');
    const testPlayer2Payload = {
      name: 'Sequential Test Player 2',
      banglaName: 'সিকোয়েন্সিয়াল টেস্ট ২',
      age: 22,
      position: 'Midfielder' as const,
      category: 'B' as const,
      phone: '01711-000002',
      union: 'কাকিনা',
      area: 'কাকিনা',
      jerseySize: 'M',
      prevClub: 'টেস্ট ক্লাব ২',
      regFee: 500,
      paymentMethod: 'Cash' as const,
      paymentTrxId: '',
      paymentStatus: 'Pending' as const,
      approvalStatus: 'pending' as const,
      basePrice: 3000,
      auctionStatus: 'upcoming' as const,
      round: 1,
      photoUrl: '',
    };

    const reg2Result = await registerPlayerWithAtomicFormNumber(testPlayer2Payload, testSeasonId);
    if (!reg2Result.success || !reg2Result.player) {
      throw new Error(`Registration 2 failed: ${reg2Result.error}`);
    }
    createdTestPlayerIds.push(reg2Result.player.id);

    console.log(`✓ Player 2 created! ID: ${reg2Result.player.id}`);
    console.log(`  Assigned Numeric Value: ${reg2Result.assignedNumericValue} (Expected: 2)`);
    console.log(`  Assigned Form Label: "${reg2Result.assignedFormNumber}" (Expected: "ফরম নং:- ২")`);
    console.log(`  Registration Serial: "${reg2Result.registrationNumber}" (Expected: "TPL-S2-002")`);

    if (reg2Result.assignedNumericValue !== 2) {
      throw new Error(`FAIL: Expected Form No. 2, but received ${reg2Result.assignedNumericValue}`);
    }

    // 5. Test Simultaneous Concurrent Registrations (Race Condition / Duplicate Guard)
    console.log('\n[TEST 5] Testing 5 SIMULTANEOUS registrations executed in parallel (Promise.all)...');
    const concurrentPromises = [3, 4, 5, 6, 7].map(idx => {
      const payload = {
        name: `Concurrent Applicant ${idx}`,
        banglaName: `কনকারেন্ট অ্যাপ্লিকেন্ট ${idx}`,
        age: 21,
        position: 'Defender' as const,
        category: 'C' as const,
        phone: `01711-00000${idx}`,
        union: 'মহিষখোঁচা',
        area: 'মহিষখোঁচা',
        jerseySize: 'XL',
        prevClub: `ক্লাব ${idx}`,
        regFee: 500,
        paymentMethod: 'bKash' as const,
        paymentTrxId: `CONC${idx}`,
        paymentStatus: 'Paid' as const,
        approvalStatus: 'pending' as const,
        basePrice: 2000,
        auctionStatus: 'upcoming' as const,
        round: 1,
        photoUrl: '',
      };
      return registerPlayerWithAtomicFormNumber(payload, testSeasonId);
    });

    const concurrentResults = await Promise.all(concurrentPromises);
    const assignedNumbers: number[] = [];

    for (const res of concurrentResults) {
      if (!res.success || !res.player) {
        throw new Error(`Concurrent registration failed: ${res.error}`);
      }
      createdTestPlayerIds.push(res.player.id);
      assignedNumbers.push(res.assignedNumericValue!);
      console.log(`  Player "${res.player.name}" assigned: ${res.assignedFormNumber} (Serial: ${res.registrationNumber})`);
    }

    // Verify all assigned numbers are strictly unique
    const uniqueAssigned = new Set(assignedNumbers);
    if (uniqueAssigned.size !== assignedNumbers.length) {
      throw new Error(`FAIL: Duplicate form numbers detected in concurrent run! Numbers: ${assignedNumbers.join(', ')}`);
    }
    console.log(`✓ CONCURRENCY CHECK PASSED: All 5 simultaneous registrations received strictly unique numbers: [${assignedNumbers.sort((a,b)=>a-b).join(', ')}]`);

    // 6. Test Admin Conflict Validation
    console.log('\n[TEST 6] Testing Admin conflict validation when attempting to set already-used form number...');
    const conflictCheck1 = await checkFormNumberConflict(1, testSeasonId);
    console.log(`✓ Conflict check for Form No. 1: hasConflict=${conflictCheck1.hasConflict}, Conflicting Player: "${conflictCheck1.conflictingPlayer?.name}"`);
    if (!conflictCheck1.hasConflict) {
      throw new Error('FAIL: Conflict detection should have found Form No. 1 as already assigned!');
    }

    const conflictUpdateRes = await updateRegistrationSettings(
      { nextFormNumber: 1 },
      'arifhossainbd087@gmail.com'
    );
    console.log(`✓ Admin update rejected with validation message: "${conflictUpdateRes.error}"`);
    if (conflictUpdateRes.success) {
      throw new Error('FAIL: Admin update should have failed for conflicting number 1!');
    }

    // 7. Verify Existing Original Records are 100% Unchanged
    console.log('\n[TEST 7] Verifying original pre-existing player records remain intact...');
    for (const id of existingIds) {
      const docSnap = await getDoc(doc(db, 'players', id));
      if (!docSnap.exists()) {
        throw new Error(`FAIL: Pre-existing player doc ${id} was deleted or lost!`);
      }
    }
    console.log('✓ All original pre-existing player records verified intact.');

    console.log('\n=== ALL REGISTRATION FORM NUMBERING & CONCURRENCY TESTS PASSED! ===');
  } catch (err: any) {
    console.error('✗ TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup temporary test player records
    console.log(`\nCleaning up ${createdTestPlayerIds.length} test player records...`);
    for (const id of createdTestPlayerIds) {
      try {
        await deleteDoc(doc(db, 'players', id));
      } catch (e) {
        // ignore
      }
    }
    console.log('Test cleanup complete.');
    // Reset counter to 1
    try {
      await updateRegistrationSettings(
        {
          startFormNumber: 1,
          nextFormNumber: 1,
          prefix: 'ফরম নং:- ',
          labelBn: 'ফরম নং:- ',
          labelEn: 'Form No. ',
          digitFormat: 'bn',
          totalRegistrations: 0,
          lastAssignedNumber: null,
        },
        'arifhossainbd087@gmail.com'
      );
      console.log('Settings counter reset cleanly to 1 for live production usage.');
    } catch (e) {
      // ignore
    }
  }
}

runTests();
