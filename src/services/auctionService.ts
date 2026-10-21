import {
  doc,
  collection,
  runTransaction,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
  query,
  limit,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase/config';
import { AuctionState, Player, Team, LeagueSettings, Season } from '../types';

export const DEFAULT_SEASON_2: Season = {
  id: 'season-2-2026',
  name: 'Teesta Premier League Season 2 (২০২৬)',
  code: 'S2',
  year: 2026,
  status: 'active',
  isLiveAuctionActive: true,
  defaultBudget: 100000,
  defaultBasePrice: 2000,
  defaultMinIncrement: 1000,
  defaultTimerSeconds: 20,
  maxSquadSize: 15,
  regFeeAmount: 500,
  bKashNumber: '01712-345678',
  nagadNumber: '01912-345678',
  rocketNumber: '01812-345678',
  tournamentRules: 'তিস্তা প্রিমিয়ার লীগ সিজন ২ এর প্রতিটি দল ১৫ জন খেলোয়াড় ড্রাফট করতে পারবে। সর্বোচ্চ বাজেট ১ লক্ষ টাকা।',
  createdAt: new Date().toISOString(),
};

export const DEFAULT_SETTINGS: LeagueSettings = {
  leagueName: 'Teesta Premier League (TPL)',
  currentSeasonId: 'season-2-2026',
  season: 'Season 2 (২০২৬)',
  defaultBudget: 100000,
  defaultBasePrice: 2000,
  defaultMinIncrement: 1000,
  defaultTimerSeconds: 20,
  maxSquadSize: 15,
  regFeeAmount: 500,
  bKashNumber: '01712-345678',
  nagadNumber: '01912-345678',
  rocketNumber: '01812-345678',
  updatedAt: new Date().toISOString(),
};

/**
 * Atomic bid placement using Cloud Firestore Transactions.
 * Guarantees no two simultaneous bids overwrite each other,
 * validates budget and squad capacity in real-time.
 */
export async function placeAtomicBid(
  teamId: string,
  teamName: string,
  bidAmount: number,
  actorEmail?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    const teamDocRef = doc(db, 'teams', teamId);

    return await runTransaction(db, async transaction => {
      // 1. Read auction state
      const auctionSnap = await transaction.get(auctionDocRef);
      if (!auctionSnap.exists()) {
        throw new Error('কোনো সক্রিয় নিলাম সেশন পাওয়া যায়নি (No active auction found).');
      }

      const auctionData = auctionSnap.data() as AuctionState;

      // 2. Validate auction state
      if (auctionData.status !== 'active') {
        throw new Error('নিলাম বর্তমানে সক্রিয় নেই (Auction is not currently active).');
      }

      if (!auctionData.currentPlayerId) {
        throw new Error('কোনো খেলোয়াড় নিলামে নেই (No player is currently on auction).');
      }

      // 2b. Prevent bids in archived or inactive seasons
      if (auctionData.seasonId) {
        const seasonSnap = await transaction.get(doc(db, 'seasons', auctionData.seasonId));
        if (seasonSnap.exists()) {
          const seasonData = seasonSnap.data() as Season;
          if (seasonData.status === 'archived') {
            throw new Error('এই সিজনটি আর্কাইভ বা সমাপ্ত করা হয়েছে। কোনো নতুন ডাক গ্রহণযোগ্য নয় (Bids disabled in archived seasons).');
          }
          if (seasonData.isLiveAuctionActive === false) {
            throw new Error('এই সিজনটিতে লাইভ নিলাম বর্তমানে সক্রিয় নয় (Live auction is inactive for this season).');
          }
        }
      }

      // 3. Read team state
      const teamSnap = await transaction.get(teamDocRef);
      if (!teamSnap.exists()) {
        throw new Error('দলের তথ্য পাওয়া যায়নি (Team not found).');
      }
      const teamData = teamSnap.data() as Team;

      // 4. Validate bid amount
      const currentHighest = auctionData.currentBid || 0;
      // Allow flexible quick bid increments +20, +40, +50 (default minimum increment 20)
      const minStep = auctionData.minIncrement && auctionData.minIncrement <= 20 ? auctionData.minIncrement : 20;

      if (bidAmount < currentHighest + minStep && currentHighest > 0) {
        throw new Error(
          `ন্যূনতম বৃদ্ধি কমপক্ষে ৳${minStep.toLocaleString()} হতে হবে। পরবর্তী বৈধ ডাক ৳${(currentHighest + minStep).toLocaleString()} হতে হবে।`
        );
      }

      // 5. Validate team budget
      if (bidAmount > teamData.remainingBudget) {
        throw new Error(
          `দলের পর্যাপ্ত বাজেট নেই! অবশিষ্ট বাজেট: ৳${teamData.remainingBudget.toLocaleString()} (Insufficient team purse balance).`
        );
      }

      // 6. Validate squad size
      if (teamData.squadCount >= (teamData.maxSquad || 15)) {
        throw new Error(
          `দলের সর্বোচ্চ স্কোয়াড সীমা (${teamData.maxSquad || 15}) পূর্ণ হয়ে গেছে! (Team squad capacity reached).`
        );
      }

      // Dynamic timer extension: Each valid bid extends the countdown by 15-20s for competitive bidding
      // Bidding remains open until the administrator confirms 'শেষ ডাক!' (SOLD/UNSOLD).
      const timerExtensionSeconds = Math.max(15, auctionData.timerSeconds || 20);
      const newExpiry = Date.now() + timerExtensionSeconds * 1000;

      // 7. Atomic update auction state
      transaction.update(auctionDocRef, {
        currentBid: bidAmount,
        highestBidderTeamId: teamId,
        highestBidderTeamName: teamName,
        timerExpiresAt: newExpiry,
        updatedAt: new Date().toISOString(),
      });

      // 8. Add to bids subcollection
      const bidDocRef = doc(collection(db, 'auction', 'current', 'bids'));
      transaction.set(bidDocRef, {
        seasonId: auctionData.seasonId || 'season-2-2026',
        playerId: auctionData.currentPlayerId,
        teamId,
        teamName,
        amount: bidAmount,
        timestamp: Date.now(),
      });

      // 9. Append audit log
      const auditDocRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditDocRef, {
        seasonId: auctionData.seasonId || 'season-2-2026',
        action: 'BID_PLACED',
        actorId: teamId,
        actorEmail: actorEmail || teamName,
        actorRole: 'team',
        details: `${teamName} দল ৳${bidAmount.toLocaleString()} টাকায় ডাক প্রদান করেছে (খেলোয়াড়: ${auctionData.currentPlayerName})`,
        timestamp: new Date().toISOString(),
      });

      return { success: true, message: 'ডাক সফলভাবে গৃহীত হয়েছে!' };
    });
  } catch (err: unknown) {
    console.error('Bid transaction error:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'ডাক প্রদানে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Administrator marks current player as SOLD in an atomic transaction.
 * Deducts budget from winning team, adds player to squad, updates player status.
 */
export async function markCurrentPlayerSold(
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');

    return await runTransaction(db, async transaction => {
      const auctionSnap = await transaction.get(auctionDocRef);
      if (!auctionSnap.exists()) {
        throw new Error('নিলাম পাওয়া যায়নি');
      }
      const auctionData = auctionSnap.data() as AuctionState;

      if (!auctionData.currentPlayerId) {
        throw new Error('কোনো খেলোয়াড় নির্বাচিত নেই');
      }

      if (!auctionData.highestBidderTeamId) {
        throw new Error('কোনো দল এখনো ডাক দেয়নি! অবিক্রিত হিসেবে ঘোষণা করুন বা অপেক্ষা করুন।');
      }

      const playerDocRef = doc(db, 'players', auctionData.currentPlayerId);
      const teamDocRef = doc(db, 'teams', auctionData.highestBidderTeamId);

      const [playerSnap, teamSnap] = await Promise.all([
        transaction.get(playerDocRef),
        transaction.get(teamDocRef),
      ]);

      if (!playerSnap.exists() || !teamSnap.exists()) {
        throw new Error('খেলোয়াড় বা দলের তথ্য ডেটাবেসে মেলেনি');
      }

      const teamData = teamSnap.data() as Team;
      const finalPrice = auctionData.currentBid;

      if (teamData.remainingBudget < finalPrice) {
        throw new Error('দলের বাজেটের সাথে অসঙ্গতি পাওয়া গেছে');
      }

      // Update Player
      transaction.update(playerDocRef, {
        auctionStatus: 'sold',
        winningTeamId: teamData.id || auctionData.highestBidderTeamId,
        winningTeamName: teamData.name,
        finalPrice,
        updatedAt: new Date().toISOString(),
      });

      // Update Team Budget & Squad
      transaction.update(teamDocRef, {
        spentBudget: (teamData.spentBudget || 0) + finalPrice,
        remainingBudget: teamData.remainingBudget - finalPrice,
        squadCount: (teamData.squadCount || 0) + 1,
      });

      // Update Auction Room State
      transaction.update(auctionDocRef, {
        status: 'sold',
        updatedAt: new Date().toISOString(),
      });

      // Audit Log
      const auditDocRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditDocRef, {
        action: 'PLAYER_SOLD',
        actorEmail: adminEmail,
        actorRole: 'admin',
        details: `খেলোয়াড় ${auctionData.currentPlayerName} কে ৳${finalPrice.toLocaleString()} মূল্যে ${teamData.name} দলের কাছে বিক্রিত ঘোষণা করা হয়েছে।`,
        timestamp: new Date().toISOString(),
      });

      return { success: true, message: `অভিনন্দন! খেলোয়াড় ৳${finalPrice.toLocaleString()} মূল্যে বিক্রিত হয়েছে!` };
    });
  } catch (err: unknown) {
    console.error('Sold transaction error:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'বিক্রিত ঘোষণা করতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Administrator marks current player as UNSOLD.
 */
export async function markCurrentPlayerUnsold(
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');

    return await runTransaction(db, async transaction => {
      const auctionSnap = await transaction.get(auctionDocRef);
      if (!auctionSnap.exists()) throw new Error('নিলাম সেশন পাওয়া যায়নি');
      const auctionData = auctionSnap.data() as AuctionState;

      if (!auctionData.currentPlayerId) {
        throw new Error('কোনো খেলোয়াড় নির্বাচিত নেই');
      }

      const playerDocRef = doc(db, 'players', auctionData.currentPlayerId);
      transaction.update(playerDocRef, {
        auctionStatus: 'unsold',
        updatedAt: new Date().toISOString(),
      });

      transaction.update(auctionDocRef, {
        status: 'unsold',
        updatedAt: new Date().toISOString(),
      });

      const auditDocRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditDocRef, {
        action: 'PLAYER_UNSOLD',
        actorEmail: adminEmail,
        actorRole: 'admin',
        details: `খেলোয়াড় ${auctionData.currentPlayerName} অবিক্রিত (UNSOLD) ঘোষিত হয়েছেন।`,
        timestamp: new Date().toISOString(),
      });

      return { success: true, message: 'খেলোয়াড় অবিক্রিত (UNSOLD) হিসেবে সংরক্ষিত হয়েছে।' };
    });
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'অবিক্রিত ঘোষণা করতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Administrator loads a player onto the live auction stage.
 */
export async function loadPlayerToAuction(
  player: Player,
  timerSeconds: number = 20,
  minIncrement: number = 1000,
  adminEmail: string = 'admin'
) {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    const playerDocRef = doc(db, 'players', player.id);

    const expiresAt = Date.now() + timerSeconds * 1000;

    await updateDoc(playerDocRef, {
      auctionStatus: 'live',
      updatedAt: new Date().toISOString(),
    });

    await setDoc(auctionDocRef, {
      seasonId: player.seasonId || 'season-2-2026',
      status: 'active',
      currentPlayerId: player.id,
      currentPlayerName: player.name,
      currentPlayerPosition: player.position,
      currentPlayerAge: player.age,
      currentPlayerArea: player.area || '',
      currentPlayerPhoto: player.photoUrl || '',
      currentBasePrice: player.basePrice,
      currentBid: player.basePrice,
      highestBidderTeamId: null,
      highestBidderTeamName: null,
      minIncrement: minIncrement || 1000,
      timerSeconds: timerSeconds || 20,
      timerExpiresAt: expiresAt,
      updatedAt: new Date().toISOString(),
    });

    // Create Audit Log
    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId: player.seasonId || 'season-2-2026',
      action: 'AUCTION_STARTED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `${player.name} (${player.position}) এর নিলাম শুরু হয়েছে। ভিত্তিমূল্য: ৳${player.basePrice.toLocaleString()}`,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: `${player.name} এর লাইভ নিলাম শুরু হয়েছে!` };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'auction/current');
  }
}

/**
 * Toggle pause or resume on auction timer
 */
export async function toggleAuctionPause(currentStatus: string, remainingSeconds: number = 15) {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    if (currentStatus === 'active') {
      await updateDoc(auctionDocRef, {
        status: 'paused',
        timerExpiresAt: null,
        updatedAt: new Date().toISOString(),
      });
    } else if (currentStatus === 'paused') {
      await updateDoc(auctionDocRef, {
        status: 'active',
        timerExpiresAt: Date.now() + remainingSeconds * 1000,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'auction/current');
  }
}

/**
 * Reset / Restart the timer on current player
 */
export async function resetAuctionTimer(seconds: number = 20) {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    await updateDoc(auctionDocRef, {
      status: 'active',
      timerExpiresAt: Date.now() + seconds * 1000,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'auction/current');
  }
}

/**
 * Seed realistic Teesta Premier League teams, players, and settings
 * if the database has not yet been seeded.
 */
export async function seedInitialTplData(adminEmail: string): Promise<boolean> {
  try {
    // 0. Ensure default Season 2 exists in seasons collection
    const seasonDocRef = doc(db, 'seasons', DEFAULT_SEASON_2.id);
    await setDoc(seasonDocRef, DEFAULT_SEASON_2, { merge: true });

    // 1. Settings
    const settingsDocRef = doc(db, 'settings', 'league');
    await setDoc(settingsDocRef, DEFAULT_SETTINGS, { merge: true });

    // 2. Check if teams exist
    const teamsSnap = await getDocs(query(collection(db, 'teams'), limit(1)));
    if (teamsSnap.empty) {
      const demoTeams: Omit<Team, 'id'>[] = [
        {
          seasonId: DEFAULT_SEASON_2.id,
          name: 'তিস্তা থান্ডারস (Teesta Thunders)',
          ownerName: 'মো: আরিফ হোসেন',
          phone: '01712-111222',
          totalBudget: 100000,
          spentBudget: 0,
          remainingBudget: 100000,
          squadCount: 0,
          maxSquad: 15,
          color: '#10b981', // Emerald
          createdAt: new Date().toISOString(),
        },
        {
          name: 'রংপুর রাইডার্স এফসি (Rangpur Riders FC)',
          ownerName: 'আনিসুর রহমান',
          phone: '01712-333444',
          totalBudget: 100000,
          spentBudget: 0,
          remainingBudget: 100000,
          squadCount: 0,
          maxSquad: 15,
          color: '#3b82f6', // Blue
          createdAt: new Date().toISOString(),
        },
        {
          name: 'কুড়িগ্রাম কিংস (Kurigram Kings)',
          ownerName: 'মোস্তাফিজুর হক',
          phone: '01712-555666',
          totalBudget: 100000,
          spentBudget: 0,
          remainingBudget: 100000,
          squadCount: 0,
          maxSquad: 15,
          color: '#f59e0b', // Amber
          createdAt: new Date().toISOString(),
        },
        {
          name: 'লালমনিরহাট ওয়ারিয়র্স (Lalmonirhat Warriors)',
          ownerName: 'শাহরিয়ার কবির',
          phone: '01712-777888',
          totalBudget: 100000,
          spentBudget: 0,
          remainingBudget: 100000,
          squadCount: 0,
          maxSquad: 15,
          color: '#ec4899', // Pink/Rose
          createdAt: new Date().toISOString(),
        },
      ];

      for (const t of demoTeams) {
        const teamRef = doc(collection(db, 'teams'));
        await setDoc(teamRef, { ...t, id: teamRef.id });
      }
    }

    // 3. Check if players exist
    const playersSnap = await getDocs(query(collection(db, 'players'), limit(1)));
    if (playersSnap.empty) {
      const demoPlayers: Omit<Player, 'id'>[] = [
        {
          name: 'Rakibul Hasan',
          banglaName: 'রাকিবুল হাসান',
          age: 22,
          position: 'Forward',
          phone: '01711-223344',
          area: 'কাউনিয়া, রংপুর',
          jerseySize: 'L',
          prevClub: 'তিস্তা যুব একাদশ',
          regFee: 500,
          paymentMethod: 'bKash',
          paymentTrxId: 'BK9A7721X',
          paymentStatus: 'Paid',
          approvalStatus: 'approved',
          basePrice: 3000,
          auctionStatus: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'Tanvir Ahmed',
          banglaName: 'তানভীর আহমেদ',
          age: 24,
          position: 'Midfielder',
          phone: '01722-334455',
          area: 'রাজারহাট, কুড়িগ্রাম',
          jerseySize: 'M',
          prevClub: 'উত্তরবঙ্গ ফুটবল একাডেমি',
          regFee: 500,
          paymentMethod: 'Nagad',
          paymentTrxId: 'NG882190B',
          paymentStatus: 'Paid',
          approvalStatus: 'approved',
          basePrice: 2500,
          auctionStatus: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'Sabbir Hossain',
          banglaName: 'সাব্বির হোসেন',
          age: 21,
          position: 'Defender',
          phone: '01733-445566',
          area: 'হাতীবান্ধা, লালমনিরহাট',
          jerseySize: 'XL',
          prevClub: 'তিস্তা ব্যারেজ ক্লাব',
          regFee: 500,
          paymentMethod: 'bKash',
          paymentTrxId: 'BK441920Z',
          paymentStatus: 'Paid',
          approvalStatus: 'approved',
          basePrice: 2000,
          auctionStatus: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'Mehedi Hasan Miraz',
          banglaName: 'মেহেদী হাসান মিরাজ',
          age: 25,
          position: 'Goalkeeper',
          phone: '01744-556677',
          area: 'গঙ্গাচড়া, রংপুর',
          jerseySize: 'L',
          prevClub: 'রংপুর জেলা দল',
          regFee: 500,
          paymentMethod: 'bKash',
          paymentTrxId: 'BK110944P',
          paymentStatus: 'Paid',
          approvalStatus: 'approved',
          basePrice: 3500,
          auctionStatus: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'Ariful Islam',
          banglaName: 'আরিফুল ইসলাম',
          age: 23,
          position: 'Forward',
          phone: '01755-667788',
          area: 'পাটগ্রাম, লালমনিরহাট',
          jerseySize: 'M',
          prevClub: 'বুড়িমারী স্পোর্টিং',
          regFee: 500,
          paymentMethod: 'Cash',
          paymentStatus: 'Paid',
          approvalStatus: 'approved',
          basePrice: 2500,
          auctionStatus: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'Nazmul Shakib',
          banglaName: 'নাজমুল সাকিব',
          age: 20,
          position: 'Midfielder',
          phone: '01766-778899',
          area: 'উলিপুর, কুড়িগ্রাম',
          jerseySize: 'L',
          prevClub: 'ধরলা স্পোর্টস ক্লাব',
          regFee: 500,
          paymentMethod: 'Nagad',
          paymentTrxId: 'NG550291C',
          paymentStatus: 'Paid',
          approvalStatus: 'approved',
          basePrice: 2000,
          auctionStatus: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'Kamrul Hassan',
          banglaName: 'কামরুল হাসান',
          age: 26,
          position: 'Defender',
          phone: '01777-889900',
          area: 'পীরগাছা, রংপুর',
          jerseySize: 'XL',
          prevClub: 'পীরগাছা ফুটবল একাদশ',
          regFee: 500,
          paymentMethod: 'Rocket',
          paymentTrxId: 'RK992019A',
          paymentStatus: 'Paid',
          approvalStatus: 'approved',
          basePrice: 1500,
          auctionStatus: 'upcoming',
          createdAt: new Date().toISOString(),
        },
        {
          name: 'Jahidul Islam',
          banglaName: 'জাহিদুল ইসলাম',
          age: 22,
          position: 'Forward',
          phone: '01788-990011',
          area: 'তিস্তা ব্রিজ সংলগ্ন, লালমনিরহাট',
          jerseySize: 'M',
          prevClub: 'তিস্তা সূর্য তরুণ',
          regFee: 500,
          paymentMethod: 'bKash',
          paymentTrxId: 'BK339911W',
          paymentStatus: 'Pending',
          approvalStatus: 'pending',
          basePrice: 2000,
          auctionStatus: 'upcoming',
          createdAt: new Date().toISOString(),
        },
      ];

      for (const p of demoPlayers) {
        const playerRef = doc(collection(db, 'players'));
        await setDoc(playerRef, { seasonId: DEFAULT_SEASON_2.id, ...p, id: playerRef.id });
      }
    }

    // 4. Initial auction doc
    const auctionDocRef = doc(db, 'auction', 'current');
    await setDoc(
      auctionDocRef,
      {
        seasonId: DEFAULT_SEASON_2.id,
        status: 'idle',
        currentPlayerId: null,
        currentBasePrice: 2000,
        currentBid: 0,
        highestBidderTeamId: null,
        highestBidderTeamName: null,
        minIncrement: 1000,
        timerSeconds: 20,
        timerExpiresAt: null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Initial audit log
    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      action: 'SYSTEM_INITIALIZED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: 'তিস্তা প্রিমিয়ার লীগ সিজন ২ এর ডেটাবেস ও প্রাথমিক দল/খেলোয়াড় তালিকা সক্রিয় করা হয়েছে।',
      timestamp: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    console.error('Error seeding data:', error);
    return false;
  }
}

/**
 * Create a new tournament season permanently without deleting historical data.
 * Optionally copies team templates from a previous season with reset budgets.
 */
export async function createSeason(
  seasonData: Omit<Season, 'id' | 'createdAt' | 'updatedAt'>,
  copyTeamsFromSeasonId?: string,
  adminEmail: string = 'admin'
): Promise<{ success: boolean; seasonId: string; message: string }> {
  try {
    const rawId = `season-${seasonData.code.toLowerCase().replace(/[^a-z0-9]/g, '')}-${seasonData.year}`;
    const seasonRef = doc(db, 'seasons', rawId);

    // If season already exists, generate a safe unique ID
    const existingSnap = await getDocs(query(collection(db, 'seasons'), where('code', '==', seasonData.code), where('year', '==', seasonData.year)));
    const targetId = existingSnap.empty ? rawId : `${rawId}-${Date.now().toString().slice(-4)}`;
    const finalSeasonRef = doc(db, 'seasons', targetId);

    const newSeason: Season = {
      ...seasonData,
      id: targetId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(finalSeasonRef, newSeason);

    // Copy team templates if requested (WITHOUT copying old bids or old players)
    if (copyTeamsFromSeasonId) {
      const teamsSnap = await getDocs(collection(db, 'teams'));
      const oldTeams = teamsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Team))
        .filter(t => (t.seasonId || 'season-2-2026') === copyTeamsFromSeasonId);

      for (const t of oldTeams) {
        const newTeamRef = doc(collection(db, 'teams'));
        const clonedTeam: Team = {
          id: newTeamRef.id,
          seasonId: targetId,
          name: t.name,
          ownerName: t.ownerName,
          phone: t.phone || '',
          totalBudget: seasonData.defaultBudget,
          spentBudget: 0,
          remainingBudget: seasonData.defaultBudget,
          squadCount: 0,
          maxSquad: seasonData.maxSquadSize,
          logoUrl: t.logoUrl || '',
          color: t.color || '#10b981',
          userEmail: t.userEmail || '',
          createdAt: new Date().toISOString(),
        };
        await setDoc(newTeamRef, clonedTeam);
      }
    }

    // Audit log
    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId: targetId,
      action: 'SEASON_CREATED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `নতুন সিজন '${seasonData.name}' সফলভাবে তৈরি করা হয়েছে। বাজেট: ৳${seasonData.defaultBudget.toLocaleString()}`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      seasonId: targetId,
      message: `সিজন '${seasonData.name}' সফলভাবে তৈরি হয়েছে!`,
    };
  } catch (error) {
    console.error('Error creating season:', error);
    return {
      success: false,
      seasonId: '',
      message: error instanceof Error ? error.message : 'সিজন তৈরি করতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Activate a season for live auction and tournament management.
 * Enforces rule: only one intentionally selected active auction season at a time.
 */
export async function activateSeason(
  seasonId: string,
  adminEmail: string = 'admin'
): Promise<{ success: boolean; message: string }> {
  try {
    const seasonsSnap = await getDocs(collection(db, 'seasons'));
    const batch = writeBatch(db);

    // Deactivate live auction flag on all other seasons
    seasonsSnap.docs.forEach(docSnap => {
      if (docSnap.id === seasonId) {
        batch.update(docSnap.ref, {
          status: 'active',
          isLiveAuctionActive: true,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const data = docSnap.data() as Season;
        if (data.isLiveAuctionActive) {
          batch.update(docSnap.ref, {
            isLiveAuctionActive: false,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });

    // Update global settings
    const settingsRef = doc(db, 'settings', 'league');
    batch.update(settingsRef, {
      currentSeasonId: seasonId,
      updatedAt: new Date().toISOString(),
    });

    // Set auction room to idle for this season
    const auctionRef = doc(db, 'auction', 'current');
    batch.update(auctionRef, {
      seasonId,
      status: 'idle',
      currentPlayerId: null,
      currentBid: 0,
      highestBidderTeamId: null,
      highestBidderTeamName: null,
      timerExpiresAt: null,
      updatedAt: new Date().toISOString(),
    });

    await batch.commit();

    // Audit log
    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId,
      action: 'SEASON_ACTIVATED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `সিজন আইডি '${seasonId}' কে টুর্নামেন্ট ও লাইভ নিলামের জন্য সক্রিয় করা হয়েছে।`,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'সিজনটি সফলভাবে সক্রিয় করা হয়েছে!' };
  } catch (error) {
    console.error('Error activating season:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'সিজন সক্রিয় করতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Archive a season permanently, preserving all historical rosters, bids and prices.
 * Prevents further bids and lock auction for this season.
 */
export async function archiveSeason(
  seasonId: string,
  adminEmail: string = 'admin'
): Promise<{ success: boolean; message: string }> {
  try {
    const seasonRef = doc(db, 'seasons', seasonId);
    await updateDoc(seasonRef, {
      status: 'archived',
      isLiveAuctionActive: false,
      updatedAt: new Date().toISOString(),
    });

    // If current auction was on this season, set to idle
    const auctionRef = doc(db, 'auction', 'current');
    await updateDoc(auctionRef, {
      status: 'idle',
      currentPlayerId: null,
      currentBid: 0,
      highestBidderTeamId: null,
      highestBidderTeamName: null,
      timerExpiresAt: null,
      updatedAt: new Date().toISOString(),
    });

    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId,
      action: 'SEASON_ARCHIVED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `সিজন আইডি '${seasonId}' আর্কাইভ (সংরক্ষিত) করা হয়েছে। এতে নতুন কোনো ডাক বা পরিবর্তন বন্ধ থাকবে।`,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'সিজনটি সফলভাবে আর্কাইভ করা হয়েছে।' };
  } catch (error) {
    console.error('Error archiving season:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'সিজন আর্কাইভ করতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Update parameters of a season (budgets, timer, base price, increment, etc.)
 */
export async function updateSeasonConfig(
  seasonId: string,
  updates: Partial<Season>,
  adminEmail: string = 'admin'
): Promise<{ success: boolean; message: string }> {
  try {
    const seasonRef = doc(db, 'seasons', seasonId);
    await setDoc(
      seasonRef,
      {
        ...updates,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId,
      action: 'SEASON_UPDATED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `সিজন '${seasonId}' এর কনফিগারেশন আপডেট করা হয়েছে।`,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'সিজন সেটিংস সফলভাবে সংরক্ষিত হয়েছে।' };
  } catch (error) {
    console.error('Error updating season config:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'সিজন আপডেট করতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Ensures Season 2 exists in the seasons collection so the app is never uninitialized.
 * Checks for admin privileges and document existence before writing.
 */
export async function ensureDefaultSeasonExists(isAdminUser: boolean = false): Promise<void> {
  // Only attempt write if admin user is confirmed or auth matches master admin
  if (!isAdminUser) {
    const email = auth.currentUser?.email?.toLowerCase();
    if (email !== 'arifhossainbd087@gmail.com') {
      return;
    }
  }

  try {
    const seasonDocRef = doc(db, 'seasons', DEFAULT_SEASON_2.id);
    const snap = await getDoc(seasonDocRef);
    if (!snap.exists()) {
      await setDoc(seasonDocRef, DEFAULT_SEASON_2);
    }
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Note on season check:', err?.message || err);
    }
  }
}

/**
 * Executes 'শেষ ডাক!' (Final Call / Hammer Down) on the current player atomically.
 * Idempotent: stops bidding, confirms Sold or Unsold, deducts budget safely,
 * and automatically loads the next eligible player in the queue.
 * If no eligible players remain, transitions the auction stage into 'completed'.
 */
export async function executeFinalCallAndAdvance(
  adminEmail: string,
  seasonId: string = 'season-2-2026',
  forceUnsold: boolean = false
): Promise<{
  success: boolean;
  message: string;
  result: 'sold' | 'unsold' | 'already_settled';
  finalPrice?: number;
  winningTeamName?: string;
  nextPlayerName?: string | null;
  auctionCompleted?: boolean;
}> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');

    // Step A: Atomic finalize of current player
    const finalizeOutcome = await runTransaction(db, async transaction => {
      const auctionSnap = await transaction.get(auctionDocRef);
      if (!auctionSnap.exists()) {
        throw new Error('নিলাম সেশন পাওয়া যায়নি (No active auction found).');
      }
      const auctionData = auctionSnap.data() as AuctionState;

      // Idempotency: if already settled, don't run twice!
      if (auctionData.status === 'sold' || auctionData.status === 'unsold' || auctionData.status === 'completed') {
        return {
          alreadySettled: true,
          result: (auctionData.status === 'sold' ? 'sold' : 'unsold') as 'sold' | 'unsold',
          currentPlayerId: auctionData.currentPlayerId,
          currentPlayerName: auctionData.currentPlayerName,
          finalPrice: auctionData.currentBid || 0,
          winningTeamName: auctionData.highestBidderTeamName || '',
        };
      }

      if (!auctionData.currentPlayerId) {
        throw new Error('স্টেজে কোনো খেলোয়াড় উপস্থিত নেই (No player on stage).');
      }

      const playerDocRef = doc(db, 'players', auctionData.currentPlayerId);
      const isSold = !forceUnsold && Boolean(auctionData.highestBidderTeamId && auctionData.currentBid > 0);

      if (isSold && auctionData.highestBidderTeamId) {
        const teamDocRef = doc(db, 'teams', auctionData.highestBidderTeamId);
        const [playerSnap, teamSnap] = await Promise.all([
          transaction.get(playerDocRef),
          transaction.get(teamDocRef),
        ]);

        if (!playerSnap.exists() || !teamSnap.exists()) {
          throw new Error('খেলোয়াড় বা দলের তথ্য ডেটাবেসে মেলেনি (Player or Team missing).');
        }

        const teamData = teamSnap.data() as Team;
        const finalPrice = auctionData.currentBid;

        if (teamData.remainingBudget < finalPrice) {
          throw new Error(`দলের বাজেটের সাথে অসঙ্গতি পাওয়া গেছে! অবশিষ্ট বাজেট: ৳${teamData.remainingBudget.toLocaleString()}`);
        }

        // Update Player to SOLD
        transaction.update(playerDocRef, {
          auctionStatus: 'sold',
          winningTeamId: teamData.id || auctionData.highestBidderTeamId,
          winningTeamName: teamData.name,
          finalPrice,
          updatedAt: new Date().toISOString(),
        });

        // Update Team Budget & Squad
        transaction.update(teamDocRef, {
          spentBudget: (teamData.spentBudget || 0) + finalPrice,
          remainingBudget: teamData.remainingBudget - finalPrice,
          squadCount: (teamData.squadCount || 0) + 1,
        });

        // Update Auction State
        transaction.update(auctionDocRef, {
          status: 'sold',
          timerExpiresAt: null,
          updatedAt: new Date().toISOString(),
        });

        // Audit Log
        const auditDocRef = doc(collection(db, 'auditLogs'));
        transaction.set(auditDocRef, {
          seasonId: auctionData.seasonId || seasonId,
          action: 'PLAYER_SOLD',
          actorEmail: adminEmail,
          actorRole: 'admin',
          details: `[শেষ ডাক!] খেলোয়াড় ${auctionData.currentPlayerName} কে ৳${finalPrice.toLocaleString()} মূল্যে ${teamData.name} দলের কাছে বিক্রিত ঘোষণা করা হয়েছে।`,
          timestamp: new Date().toISOString(),
        });

        return {
          alreadySettled: false,
          result: 'sold' as const,
          currentPlayerId: auctionData.currentPlayerId,
          currentPlayerName: auctionData.currentPlayerName,
          finalPrice,
          winningTeamName: teamData.name,
        };
      } else {
        // UNSOLD outcome
        transaction.update(playerDocRef, {
          auctionStatus: 'unsold',
          updatedAt: new Date().toISOString(),
        });

        transaction.update(auctionDocRef, {
          status: 'unsold',
          timerExpiresAt: null,
          updatedAt: new Date().toISOString(),
        });

        const auditDocRef = doc(collection(db, 'auditLogs'));
        transaction.set(auditDocRef, {
          seasonId: auctionData.seasonId || seasonId,
          action: 'PLAYER_UNSOLD',
          actorEmail: adminEmail,
          actorRole: 'admin',
          details: `[শেষ ডাক!] খেলোয়াড় ${auctionData.currentPlayerName} অবিক্রিত (UNSOLD) হিসেবে নিলাম সমাপ্ত হয়েছে।`,
          timestamp: new Date().toISOString(),
        });

        return {
          alreadySettled: false,
          result: 'unsold' as const,
          currentPlayerId: auctionData.currentPlayerId,
          currentPlayerName: auctionData.currentPlayerName,
          finalPrice: 0,
          winningTeamName: '',
        };
      }
    });

    if (finalizeOutcome.alreadySettled) {
      return {
        success: true,
        result: 'already_settled',
        message: 'এই খেলোয়াড়ের ডাক পূর্বেই সংরক্ষিত হয়েছে।',
      };
    }

    // Step B: Query next eligible player in the auction queue for this season
    const playersSnap = await getDocs(collection(db, 'players'));
    const allPlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Player));

    // Eligible players: approved, not sold, not the one just finalized, matching season
    const eligibleNext = allPlayers.filter(p => {
      const matchSeason = (p.seasonId || 'season-2-2026') === seasonId;
      const isApproved = p.approvalStatus === 'approved';
      const isPendingAuction = p.auctionStatus === 'upcoming' || !p.auctionStatus;
      const isDifferent = p.id !== finalizeOutcome.currentPlayerId;
      return matchSeason && isApproved && isPendingAuction && isDifferent;
    });

    // Step C: If next eligible player found, load them onto stage
    if (eligibleNext.length > 0) {
      const nextPlayer = eligibleNext[0];
      // Get season config for default timer & increment
      let timerSec = 20;
      let minInc = 1000;
      try {
        const sSnap = await getDoc(doc(db, 'seasons', seasonId));
        if (sSnap.exists()) {
          const sData = sSnap.data() as Season;
          if (sData.defaultTimerSeconds) timerSec = sData.defaultTimerSeconds;
          if (sData.defaultMinIncrement) minInc = sData.defaultMinIncrement;
        }
      } catch (e) {
        // use defaults
      }

      await loadPlayerToAuction(nextPlayer, timerSec, minInc, adminEmail);

      const outcomeMsg = finalizeOutcome.result === 'sold'
        ? `[শেষ ডাক!] ${finalizeOutcome.currentPlayerName} ৳${finalizeOutcome.finalPrice?.toLocaleString()} টাকায় ${finalizeOutcome.winningTeamName} দলের কাছে বিক্রিত হয়েছে! পরবর্তী খেলোয়াড় ${nextPlayer.name} স্টেজে এসেছে।`
        : `[শেষ ডাক!] ${finalizeOutcome.currentPlayerName} অবিক্রিত (UNSOLD) হয়েছে। পরবর্তী খেলোয়াড় ${nextPlayer.name} স্টেজে এসেছে।`;

      return {
        success: true,
        result: finalizeOutcome.result,
        finalPrice: finalizeOutcome.finalPrice,
        winningTeamName: finalizeOutcome.winningTeamName,
        nextPlayerName: nextPlayer.name,
        auctionCompleted: false,
        message: outcomeMsg,
      };
    } else {
      // Step D: No eligible players remain -> Auction Completed state!
      await updateDoc(auctionDocRef, {
        status: 'completed',
        currentPlayerId: null,
        currentPlayerName: null,
        timerExpiresAt: null,
        updatedAt: new Date().toISOString(),
      });

      const auditDocRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditDocRef, {
        seasonId,
        action: 'AUCTION_COMPLETED',
        actorEmail: adminEmail,
        actorRole: 'admin',
        details: `সিজন '${seasonId}' এর সমস্ত অনুমোদিত খেলোয়াড়ের লাইভ অকশন সম্পন্ন হয়েছে।`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        result: finalizeOutcome.result,
        finalPrice: finalizeOutcome.finalPrice,
        winningTeamName: finalizeOutcome.winningTeamName,
        nextPlayerName: null,
        auctionCompleted: true,
        message: 'অকশন সফলভাবে সমাপ্ত হয়েছে! আর কোনো ড্রাফট খেলোয়াড় বাকি নেই (Auction Completed).',
      };
    }
  } catch (err: unknown) {
    console.error('Final call error:', err);
    return {
      success: false,
      result: 'unsold',
      message: err instanceof Error ? err.message : 'শেষ ডাক প্রক্রিয়াকরণে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Safely resets the Live Auction stage back to idle.
 * Useful if the stage is stuck or after a test run.
 * Preserves all player records, teams, and budgets intact.
 */
export async function cleanAuctionStage(
  adminEmail: string = 'admin',
  seasonId: string = 'season-2-2026'
): Promise<{ success: boolean; message: string }> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    await updateDoc(auctionDocRef, {
      status: 'idle',
      currentPlayerId: null,
      currentPlayerName: null,
      currentPlayerPosition: null,
      currentPlayerAge: null,
      currentPlayerArea: null,
      currentBasePrice: 0,
      currentBid: 0,
      highestBidderTeamId: null,
      highestBidderTeamName: null,
      timerExpiresAt: null,
      updatedAt: new Date().toISOString(),
    });

    // Record audit log
    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId,
      action: 'AUCTION_STAGE_CLEANED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: 'অ্যাডমিন কর্তৃক লাইভ নিলাম স্টেজ সফলভাবে রিসেট ও ক্লিন করা হয়েছে।',
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'নিলাম স্টেজ সফলভাবে রিসেট করা হয়েছে।' };
  } catch (err: any) {
    console.error('Error cleaning auction stage:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'নিলাম স্টেজ রিসেট করতে ব্যর্থ হয়েছে।',
    };
  }
}

/**
 * Safely re-auctions a player (returns to upcoming draft pool).
 * If the player was previously sold, atomically refunds the purchasing team's purse
 * and decrements squad count to eliminate double budget deduction issues.
 */
export async function reAuctionPlayer(
  playerId: string,
  adminEmail: string = 'admin',
  seasonId: string = 'season-2-2026'
): Promise<{ success: boolean; message: string }> {
  try {
    const playerRef = doc(db, 'players', playerId);

    return await runTransaction(db, async transaction => {
      const pSnap = await transaction.get(playerRef);
      if (!pSnap.exists()) {
        throw new Error('খেলোয়াড়ের তথ্য পাওয়া যায়নি।');
      }
      const pData = pSnap.data() as Player;

      // Check if currently on active stage
      const auctionRef = doc(db, 'auction', 'current');
      const aSnap = await transaction.get(auctionRef);
      if (aSnap.exists()) {
        const aData = aSnap.data() as AuctionState;
        if (aData.currentPlayerId === playerId && aData.status === 'active') {
          throw new Error('এই খেলোয়াড় বর্তমানে সক্রিয় নিলাম স্টেজে আছেন। প্রথমে নিলাম থামান।');
        }
      }

      // If player was sold, refund the purchasing team's budget
      if (pData.auctionStatus === 'sold' && pData.winningTeamId && pData.finalPrice) {
        const teamRef = doc(db, 'teams', pData.winningTeamId);
        const tSnap = await transaction.get(teamRef);
        if (tSnap.exists()) {
          const tData = tSnap.data() as Team;
          const refundAmount = pData.finalPrice;
          transaction.update(teamRef, {
            spentBudget: Math.max(0, (tData.spentBudget || 0) - refundAmount),
            remainingBudget: (tData.remainingBudget || 0) + refundAmount,
            squadCount: Math.max(0, (tData.squadCount || 0) - 1),
          });
        }
      }

      // Reset player to upcoming
      transaction.update(playerRef, {
        auctionStatus: 'upcoming',
        winningTeamId: null,
        winningTeamName: null,
        finalPrice: null,
        updatedAt: new Date().toISOString(),
      });

      // Audit Log
      const auditRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditRef, {
        seasonId,
        action: 'PLAYER_RE_AUCTIONED',
        actorEmail: adminEmail,
        actorRole: 'admin',
        details: `খেলোয়াড় ${pData.name} কে পুনরায় নিলাম পুলে (upcoming) ফিরিয়ে নেওয়া হয়েছে এবং দলের বাজেট সমন্বয় করা হয়েছে।`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `${pData.name} কে সফলভাবে পুনরায় নিলাম পুলে পাঠানো হয়েছে এবং দলের বাজেট ফেরত দেওয়া হয়েছে।`,
      };
    });
  } catch (err: any) {
    console.error('Re-auction error:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'রি-অকশন সম্পন্ন করতে ব্যর্থ হয়েছে।',
    };
  }
}

/**
 * Safely deletes a player with budget reconciliation and audit logging.
 * Prevents deleting a player currently on the live auction stage.
 * If player was sold, refunds the purchasing team's budget before deleting.
 */
export async function safeDeletePlayer(
  playerId: string,
  playerName: string,
  adminEmail: string = 'admin',
  seasonId: string = 'season-2-2026'
): Promise<{ success: boolean; message: string }> {
  try {
    const playerRef = doc(db, 'players', playerId);
    const auctionRef = doc(db, 'auction', 'current');

    return await runTransaction(db, async transaction => {
      // 1. Check live auction state
      const aSnap = await transaction.get(auctionRef);
      if (aSnap.exists()) {
        const aData = aSnap.data() as AuctionState;
        if (aData.currentPlayerId === playerId && (aData.status === 'active' || aData.status === 'paused')) {
          throw new Error('এই খেলোয়াড় বর্তমানে লাইভ নিলামে রয়েছেন! নিলাম শেষ না করে খেলোয়াড় মোছা যাবে না।');
        }
      }

      // 2. Read player data
      const pSnap = await transaction.get(playerRef);
      if (!pSnap.exists()) {
        throw new Error('খেলোয়াড়ের তথ্য ডেটাবেসে পাওয়া যায়নি।');
      }
      const pData = pSnap.data() as Player;

      // 3. If sold, refund the purchasing team's purse
      if (pData.auctionStatus === 'sold' && pData.winningTeamId && pData.finalPrice) {
        const teamRef = doc(db, 'teams', pData.winningTeamId);
        const tSnap = await transaction.get(teamRef);
        if (tSnap.exists()) {
          const tData = tSnap.data() as Team;
          transaction.update(teamRef, {
            spentBudget: Math.max(0, (tData.spentBudget || 0) - pData.finalPrice),
            remainingBudget: (tData.remainingBudget || 0) + pData.finalPrice,
            squadCount: Math.max(0, (tData.squadCount || 0) - 1),
          });
        }
      }

      // 4. Delete player
      transaction.delete(playerRef);

      // 5. Append audit log
      const auditRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditRef, {
        seasonId,
        action: 'PLAYER_DELETED',
        actorEmail: adminEmail,
        actorRole: 'admin',
        details: `খেলোয়াড় ${pData.name} কে ডাটাবেস থেকে নিরাপদভাবে মুছে ফেলা হয়েছে (পূর্ববর্তী স্ট্যাটাস: ${pData.auctionStatus || 'upcoming'})।`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `${playerName} কে নিরাপদভাবে মুছে ফেলা হয়েছে এবং প্রয়োজনীয় বাজেট সমন্বয় করা হয়েছে।`,
      };
    });
  } catch (err: any) {
    console.error('Safe delete player error:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'খেলোয়াড় মুছতে ব্যর্থ হয়েছে।',
    };
  }
}




