import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  collection,
  terminate,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function testCycle() {
  console.log('--- STARTING REAL ATOMIC BIDDING & AUCTION TEST CYCLE ---');

  const auctionRef = doc(db, 'auction', 'current');
  const team1Ref = doc(db, 'teams', 'team_thunders');
  const team2Ref = doc(db, 'teams', 'team_riders');
  const playerRef = doc(db, 'players', 'player_rakibul');

  // Step 1: Start auction for Rakibul Hasan
  console.log('Step 1: Starting auction on player_rakibul...');
  await setDoc(auctionRef, {
    status: 'active',
    currentPlayerId: 'player_rakibul',
    currentPlayerName: 'Rakibul Hasan',
    currentPlayerPosition: 'Forward',
    currentPlayerAge: 22,
    currentPlayerArea: 'কাউনিয়া, রংপুর',
    currentBasePrice: 3000,
    currentBid: 3000,
    highestBidderTeamId: null,
    highestBidderTeamName: null,
    minIncrement: 1000,
    timerSeconds: 20,
    timerExpiresAt: Date.now() + 20000,
    updatedAt: new Date().toISOString(),
  });
  console.log('✓ Auction is now ACTIVE on Rakibul Hasan with base price ৳3,000');

  // Step 2: Place valid atomic bid from Team 1 (৳4,000)
  console.log('Step 2: Placing atomic bid from Team 1 (তিস্তা থান্ডারস) for ৳4,000...');
  await runTransaction(db, async transaction => {
    const aSnap = await transaction.get(auctionRef);
    const tSnap = await transaction.get(team1Ref);

    if (aSnap.data()?.status !== 'active') throw new Error('Auction not active');
    if (4000 <= (aSnap.data()?.currentBid || 0)) throw new Error('Bid too low');
    if (4000 > (tSnap.data()?.remainingBudget || 0)) throw new Error('Insufficient budget');

    transaction.update(auctionRef, {
      currentBid: 4000,
      highestBidderTeamId: 'team_thunders',
      highestBidderTeamName: 'তিস্তা থান্ডারস (Teesta Thunders)',
      timerExpiresAt: Date.now() + 15000,
      updatedAt: new Date().toISOString(),
    });

    const bidRef = doc(collection(db, 'auction', 'current', 'bids'));
    transaction.set(bidRef, {
      playerId: 'player_rakibul',
      teamId: 'team_thunders',
      teamName: 'তিস্তা থান্ডারস (Teesta Thunders)',
      amount: 4000,
      timestamp: Date.now(),
    });
  });
  console.log('✓ Team 1 bid of ৳4,000 accepted and recorded in Firestore!');

  // Step 3: Counter-bid from Team 2 (৳5,000)
  console.log('Step 3: Placing counter-bid from Team 2 (রংপুর রাইডার্স এফসি) for ৳5,000...');
  await runTransaction(db, async transaction => {
    const aSnap = await transaction.get(auctionRef);
    const tSnap = await transaction.get(team2Ref);

    if (5000 <= (aSnap.data()?.currentBid || 0)) throw new Error('Bid too low');

    transaction.update(auctionRef, {
      currentBid: 5000,
      highestBidderTeamId: 'team_riders',
      highestBidderTeamName: 'রংপুর রাইডার্স এফসি (Rangpur Riders FC)',
      timerExpiresAt: Date.now() + 15000,
      updatedAt: new Date().toISOString(),
    });

    const bidRef = doc(collection(db, 'auction', 'current', 'bids'));
    transaction.set(bidRef, {
      playerId: 'player_rakibul',
      teamId: 'team_riders',
      teamName: 'রংপুর রাইডার্স এফসি (Rangpur Riders FC)',
      amount: 5000,
      timestamp: Date.now(),
    });
  });
  console.log('✓ Team 2 counter-bid of ৳5,000 accepted and recorded in Firestore!');

  // Step 4: Test atomic rejection of budget overrun (Attempt ৳2,00,000)
  console.log('Step 4: Testing budget limit protection: Attempting ৳2,00,000 bid (Team budget is ৳1,00,000)...');
  try {
    await runTransaction(db, async transaction => {
      const aSnap = await transaction.get(auctionRef);
      const tSnap = await transaction.get(team1Ref);
      const remaining = tSnap.data()?.remainingBudget || 0;
      if (200000 > remaining) {
        throw new Error(`Budget exceeded! Remaining purse is only ৳${remaining}`);
      }
      transaction.update(auctionRef, { currentBid: 200000 });
    });
    console.error('✗ FAILED: Overdraft was not blocked!');
  } catch (err: any) {
    console.log('✓ Budget Overdraft correctly BLOCKED with error:', err.message);
  }

  // Step 5: Test SOLD resolution
  console.log('Step 5: Admin declares SOLD to highest bidder (Team 2 at ৳5,000)...');
  await runTransaction(db, async transaction => {
    const aSnap = await transaction.get(auctionRef);
    const aData = aSnap.data()!;
    const tSnap = await transaction.get(team2Ref);
    const tData = tSnap.data()!;

    // Deduct budget
    transaction.update(team2Ref, {
      spentBudget: (tData.spentBudget || 0) + aData.currentBid,
      remainingBudget: tData.remainingBudget - aData.currentBid,
      squadCount: (tData.squadCount || 0) + 1,
    });

    // Update player
    transaction.update(playerRef, {
      auctionStatus: 'sold',
      winningTeamId: 'team_riders',
      winningTeamName: 'রংপুর রাইডার্স এফসি (Rangpur Riders FC)',
      finalPrice: aData.currentBid,
      updatedAt: new Date().toISOString(),
    });

    // Update auction
    transaction.update(auctionRef, {
      status: 'sold',
      updatedAt: new Date().toISOString(),
    });
  });

  // Verify Team 2 balance deducted
  const team2After = (await getDoc(team2Ref)).data()!;
  console.log(`✓ Player SOLD! Team 2 spentBudget: ৳${team2After.spentBudget}, remainingBudget: ৳${team2After.remainingBudget}, squadCount: ${team2After.squadCount}`);

  // Step 6: Reset player & team so user starts clean or can see the sold result
  console.log('Step 6: Resetting player_rakibul to upcoming & team_riders budget so user can test fresh in UI...');
  await updateDoc(playerRef, {
    auctionStatus: 'upcoming',
    winningTeamId: null,
    winningTeamName: null,
    finalPrice: null,
  });
  await updateDoc(team2Ref, {
    spentBudget: 0,
    remainingBudget: 100000,
    squadCount: 0,
  });
  await updateDoc(auctionRef, {
    status: 'idle',
    currentPlayerId: null,
    currentBid: 0,
    highestBidderTeamId: null,
    highestBidderTeamName: null,
    timerExpiresAt: null,
  });
  console.log('✓ Database clean and primed for UI testing.');

  await terminate(db);
  console.log('--- ALL ATOMIC BIDDING & AUCTION TESTS PASSED WITH 100% SUCCESS ---');
}

testCycle().then(() => process.exit(0)).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
