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
import {
  db,
  auth,
  handleFirestoreError,
  OperationType,
  isQuotaExceededError,
  formatFriendlyErrorMessage,
} from '../firebase/config';
import { AuctionState, Player, Team, LeagueSettings, Season } from '../types';
import { generateAndSavePoster } from './posterService';

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

      // 2c. Validate overall auction time limit (Requirement: overall time limit, no per-player auto-reset)
      const now = Date.now();
      const isOverallExpired =
        auctionData.overallTimerStatus === 'expired' ||
        (auctionData.overallTimerStatus === 'running' &&
          auctionData.overallTimerExpiresAt &&
          now >= auctionData.overallTimerExpiresAt);

      if (isOverallExpired) {
        throw new Error('নিলামের নির্ধারিত সামগ্রিক সময় সমাপ্ত হয়েছে। আর কোনো নতুন ডাক গ্রহণ করা হবে না।');
      }

      if (auctionData.overallTimerStatus === 'paused') {
        throw new Error('নিলামের সামগ্রিক সময় বর্তমানে সাময়িক স্থগিত (Paused) রয়েছে। নতুন ডাক দিতে অ্যাডমিন কর্তৃক পুনরায় চালু করতে হবে।');
      }

      // 3. Read team state
      const teamSnap = await transaction.get(teamDocRef);
      if (!teamSnap.exists()) {
        throw new Error('দলের তথ্য পাওয়া যায়নি (Team not found).');
      }
      const teamData = teamSnap.data() as Team;

      // 3b. Verify authenticated caller identity and team binding
      const authenticatedUser = auth.currentUser;
      if (!authenticatedUser || !authenticatedUser.email) {
        throw new Error('ডাক দেওয়ার জন্য অনুগ্রহ করে আপনার দলের অনুমোদিত Gmail অ্যাকাউন্ট দিয়ে লগইন করুন (Authentication required).');
      }

      const verifiedUserEmail = (authenticatedUser.email || '').trim().toLowerCase();
      const isSuperAdmin = verifiedUserEmail === 'arifhossainbd087@gmail.com';
      let isAuthorizedAdminUser = isSuperAdmin;
      if (!isAuthorizedAdminUser) {
        const adminDocSnap = await transaction.get(doc(db, 'admins', verifiedUserEmail));
        if (adminDocSnap.exists() && adminDocSnap.data().status === 'active') {
          isAuthorizedAdminUser = true;
        }
      }

      // If caller is NOT an admin, they MUST be the authorized manager for this specific target team
      if (!isAuthorizedAdminUser) {
        const teamAssignedEmail = (teamData.loginEmail || teamData.userEmail || '').trim().toLowerCase();
        if (!teamAssignedEmail) {
          throw new Error(`"${teamData.name}" দলের জন্য কোনো ম্যানেজার ইমেইল বরাদ্দ করা নেই। অ্যাডমিন কর্তৃক লগইন ইমেইল নির্ধারণ না করা পর্যন্ত ডাক প্রদান নিষ্ক্রিয় থাকবে।`);
        }
        if (verifiedUserEmail !== teamAssignedEmail) {
          throw new Error('আপনার অ্যাকাউন্টে বরাদ্দকৃত দল ছাড়া অন্য দলের হয়ে ডাক দেওয়া যাবে না।');
        }
      }

      // 4. Validate bid amount
      const currentHighest = auctionData.currentBid || 0;
      // Respect configured minimum increment (allows any non-negative whole number, e.g. 0, 20, 50, 100, 150, 500, 1000)
      const minStep =
        typeof auctionData.minIncrement === 'number' && !isNaN(auctionData.minIncrement) && auctionData.minIncrement >= 0
          ? Math.floor(auctionData.minIncrement)
          : 0;

      if (currentHighest > 0 && bidAmount < currentHighest + minStep) {
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

      // 6. Atomic update auction state (overall timer continues without per-player extension)
      transaction.update(auctionDocRef, {
        currentBid: bidAmount,
        highestBidderTeamId: teamId,
        highestBidderTeamName: teamName,
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
        actorEmail: verifiedUserEmail,
        actorRole: isAuthorizedAdminUser ? 'admin' : 'team',
        details: `${teamName} দল ৳${bidAmount.toLocaleString()} টাকায় ডাক প্রদান করেছে (ম্যানেজার: ${verifiedUserEmail}, খেলোয়াড়: ${auctionData.currentPlayerName})`,
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
 * Persistently uses the saved timer duration.
 * Does NOT start the countdown automatically when the player appears on the board.
 * The stage is active for bidding if overall auction timer is running.
 */
export async function loadPlayerToAuction(
  player: Player,
  timerSeconds?: number,
  minIncrement: number = 1000,
  adminEmail: string = 'admin'
) {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    const playerDocRef = doc(db, 'players', player.id);

    // Ensure player is present and marked live in players collection
    await setDoc(
      playerDocRef,
      {
        ...player,
        auctionStatus: 'live',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Inspect current auction state to check overall timer status and preserve overall settings
    let isOverallRunning = false;
    let resolvedSeason = player.seasonId || 'season-2-2026';
    try {
      const curSnap = await getDoc(auctionDocRef);
      if (curSnap.exists()) {
        const curData = curSnap.data() as AuctionState;
        resolvedSeason = curData.seasonId || resolvedSeason;
        isOverallRunning =
          curData.overallTimerStatus === 'running' &&
          Boolean(curData.overallTimerExpiresAt && Date.now() < curData.overallTimerExpiresAt);
      }
    } catch {
      // Non-fatal fallback
    }

    // Authoritative form number and registration number
    const resolvedFormNumber =
      player.formNumber ||
      (typeof player.formNumericValue === 'number' && player.formNumericValue > 0
        ? `ফরম নং ${player.formNumericValue}`
        : '');
    const resolvedRegNumber =
      player.registrationNumber ||
      (player.id ? `TPL-S2-${player.id.slice(-4).toUpperCase()}` : 'TPL-S2-001');

    // Load player onto board: status is 'active' if overall timer is already running, else 'paused' (ready/standby)
    await setDoc(
      auctionDocRef,
      {
        seasonId: resolvedSeason,
        status: isOverallRunning ? 'active' : 'paused',
        currentPlayerId: player.id,
        currentPlayerName: player.name,
        currentPlayerPosition: player.position,
        currentPlayerCategory: player.category || 'A',
        currentPlayerAge: player.age,
        currentPlayerArea: player.area || player.union || '',
        currentPlayerPhoto: player.photoUrl || '',
        currentPlayerFormNumber: resolvedFormNumber,
        currentPlayerRegistrationNumber: resolvedRegNumber,
        currentBasePrice: player.basePrice,
        currentBid: player.basePrice,
        highestBidderTeamId: null,
        highestBidderTeamName: null,
        minIncrement:
          typeof minIncrement === 'number' && !isNaN(minIncrement) && minIncrement >= 0
            ? Math.floor(minIncrement)
            : 100,
        timerExpiresAt: null, // Legacy per-player countdown removed
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Create Audit Log
    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId: resolvedSeason,
      action: 'AUCTION_PLAYER_LOADED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `${player.name} (${player.position}, ${resolvedFormNumber}) নিলাম স্টেজে প্রস্তুত হয়েছে। সামগ্রিক টাইমার স্ট্যাটাস: ${isOverallRunning ? 'চলমান (ডাক সক্রিয়)' : 'স্ট্যান্ডবাই'}।`,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: `${player.name} (${resolvedFormNumber}) সফলভাবে নিলাম স্টেজে প্রস্তুত হয়েছে!` };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'auction/current');
  }
}

/**
 * Admin action: Starts the overall auction timer.
 * Starts only when the authorized admin clicks the "নিলাম শুরু করুন" control.
 * Persistently saves duration, start epoch, and running status to Firebase.
 */
export async function startOverallAuctionTimer(
  durationSeconds?: number,
  adminEmail: string = 'admin',
  seasonId: string = 'season-2-2026'
): Promise<{ success: boolean; message: string }> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    const curSnap = await getDoc(auctionDocRef);
    const curData = curSnap.exists() ? (curSnap.data() as AuctionState) : null;

    const chosenDuration =
      durationSeconds && durationSeconds > 0
        ? durationSeconds
        : curData?.overallDurationSeconds || curData?.overallTimerRemaining || 1800;

    const expiresAt = Date.now() + chosenDuration * 1000;

    await setDoc(
      auctionDocRef,
      {
        seasonId: curData?.seasonId || seasonId,
        overallDurationSeconds: chosenDuration,
        overallTimerExpiresAt: expiresAt,
        overallTimerRemaining: chosenDuration,
        overallTimerStatus: 'running',
        // If a player is already on stage and not settled, activate bidding stage
        status:
          curData?.currentPlayerId && curData.status !== 'sold' && curData.status !== 'unsold'
            ? 'active'
            : curData?.status || 'idle',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId: curData?.seasonId || seasonId,
      action: 'OVERALL_AUCTION_TIMER_STARTED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `সামগ্রিক নিলাম টাইমার চালু করা হয়েছে (সময়সীমা: ${Math.round(chosenDuration / 60)} মিনিট / ${chosenDuration} সেকেন্ড)।`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: `সামগ্রিক নিলাম সময়সীমা (${Math.round(chosenDuration / 60)} মিনিট) সফলভাবে শুরু হয়েছে!`,
    };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tpl:quota-exceeded', { detail: { error } }));
      }
      return {
        success: false,
        message: formatFriendlyErrorMessage(error),
      };
    }
    console.error('Error starting overall auction timer:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'সামগ্রিক নিলাম টাইমার শুরু করতে ব্যর্থ হয়েছে',
    };
  }
}

/**
 * Admin action: Pauses the overall auction timer.
 * Freezes the countdown, saves remaining time in Firebase, and blocks bids.
 */
export async function pauseOverallAuctionTimer(
  adminEmail: string = 'admin',
  seasonId: string = 'season-2-2026'
): Promise<{ success: boolean; message: string; remainingSeconds: number }> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    const curSnap = await getDoc(auctionDocRef);
    if (!curSnap.exists()) {
      return { success: false, message: 'নিলাম সেশন পাওয়া যায়নি', remainingSeconds: 0 };
    }
    const curData = curSnap.data() as AuctionState;

    let remaining = curData.overallTimerRemaining || curData.overallDurationSeconds || 1800;
    if (curData.overallTimerExpiresAt) {
      remaining = Math.max(0, Math.ceil((curData.overallTimerExpiresAt - Date.now()) / 1000));
    }

    await setDoc(
      auctionDocRef,
      {
        overallTimerExpiresAt: null,
        overallTimerRemaining: remaining,
        overallTimerStatus: remaining === 0 ? 'expired' : 'paused',
        status: curData.status === 'active' ? 'paused' : curData.status,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId: curData.seasonId || seasonId,
      action: 'OVERALL_AUCTION_TIMER_PAUSED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `সামগ্রিক নিলাম সাময়িক স্থগিত (Paused) করা হয়েছে। অবশিষ্ট সময়: ${Math.floor(remaining / 60)}মিনিট ${remaining % 60}সেকেন্ড।`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: `নিলাম সাময়িক স্থগিত করা হয়েছে (অবশিষ্ট সময়: ${Math.floor(remaining / 60)}মিনিট ${remaining % 60}সেকেন্ড)।`,
      remainingSeconds: remaining,
    };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tpl:quota-exceeded', { detail: { error } }));
      }
      return {
        success: false,
        message: formatFriendlyErrorMessage(error),
        remainingSeconds: 0,
      };
    }
    console.error('Error pausing overall auction timer:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'টাইমার স্থগিত করতে ত্রুটি হয়েছে',
      remainingSeconds: 0,
    };
  }
}

/**
 * Admin action: Resumes the overall auction timer from saved remaining time.
 * Refreshing or reconnecting will NOT extend or reset time.
 */
export async function resumeOverallAuctionTimer(
  adminEmail: string = 'admin',
  seasonId: string = 'season-2-2026'
): Promise<{ success: boolean; message: string }> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    const curSnap = await getDoc(auctionDocRef);
    if (!curSnap.exists()) {
      return { success: false, message: 'নিলাম সেশন পাওয়া যায়নি' };
    }
    const curData = curSnap.data() as AuctionState;

    const remaining =
      typeof curData.overallTimerRemaining === 'number' && curData.overallTimerRemaining > 0
        ? curData.overallTimerRemaining
        : curData.overallDurationSeconds || 1800;

    if (remaining <= 0) {
      return { success: false, message: 'নিলামের সময় পূর্বেই সমাপ্ত হয়েছে।' };
    }

    const expiresAt = Date.now() + remaining * 1000;

    await setDoc(
      auctionDocRef,
      {
        overallTimerExpiresAt: expiresAt,
        overallTimerRemaining: remaining,
        overallTimerStatus: 'running',
        status:
          curData.currentPlayerId && curData.status !== 'sold' && curData.status !== 'unsold'
            ? 'active'
            : curData.status,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId: curData.seasonId || seasonId,
      action: 'OVERALL_AUCTION_TIMER_RESUMED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `সামগ্রিক নিলাম পুনরায় চালু করা হয়েছে (অবশিষ্ট সময়: ${Math.floor(remaining / 60)}মিনিট ${remaining % 60}সেকেন্ড)।`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: `নিলাম পুনরায় চালু হয়েছে (অবশিষ্ট সময়: ${Math.floor(remaining / 60)}মিনিট ${remaining % 60}সেকেন্ড)।`,
    };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tpl:quota-exceeded', { detail: { error } }));
      }
      return {
        success: false,
        message: formatFriendlyErrorMessage(error),
      };
    }
    console.error('Error resuming overall auction timer:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'টাইমার পুনরায় চালু করতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Admin action: Sets the overall auction duration setting (e.g. 10m, 30m, 1h, or custom).
 */
export async function setOverallAuctionDuration(
  durationSeconds: number,
  adminEmail: string = 'admin',
  seasonId: string = 'season-2-2026'
): Promise<{ success: boolean; message: string }> {
  try {
    const sec = Math.max(60, Math.round(Number(durationSeconds)));
    const auctionDocRef = doc(db, 'auction', 'current');
    const curSnap = await getDoc(auctionDocRef);
    const curData = curSnap.exists() ? (curSnap.data() as AuctionState) : null;

    const isRunning =
      curData?.overallTimerStatus === 'running' &&
      Boolean(curData?.overallTimerExpiresAt && Date.now() < curData.overallTimerExpiresAt);

    // If running, recalculate new expiry from right now
    const expiresAt = isRunning ? Date.now() + sec * 1000 : null;

    await setDoc(
      auctionDocRef,
      {
        overallDurationSeconds: sec,
        overallTimerRemaining: sec,
        overallTimerExpiresAt: expiresAt,
        overallTimerStatus: isRunning ? 'running' : curData?.overallTimerStatus === 'paused' ? 'paused' : 'idle',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return {
      success: true,
      message: `সামগ্রিক নিলামের সময়সীমা ${Math.round(sec / 60)} মিনিটে নির্ধারিত হয়েছে।`,
    };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tpl:quota-exceeded', { detail: { error } }));
      }
      return {
        success: false,
        message: formatFriendlyErrorMessage(error),
      };
    }
    console.error('Error setting overall duration:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'সময়সীমা নির্ধারণ করতে সমস্যা হয়েছে',
    };
  }
}

/**
 * Marks overall timer as expired in Firebase when deadline reached
 */
export async function markOverallAuctionExpired(): Promise<void> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');
    await setDoc(
      auctionDocRef,
      {
        overallTimerStatus: 'expired',
        overallTimerExpiresAt: null,
        overallTimerRemaining: 0,
        status: 'paused',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Notice setting overall auction expired:', err);
  }
}

/**
 * Starts the countdown timer for the current player on stage using saved duration (legacy fallback).
 */
export async function startAuctionCountdown(
  seconds?: number,
  adminEmail: string = 'admin'
): Promise<{ success: boolean; message: string }> {
  return await startOverallAuctionTimer(seconds, adminEmail);
}

/**
 * Toggle pause or resume on auction timer
 */
export async function toggleAuctionPause(currentStatus: string, remainingSeconds?: number) {
  if (currentStatus === 'active') {
    await pauseOverallAuctionTimer('admin');
  } else {
    await resumeOverallAuctionTimer('admin');
  }
}

/**
 * Reset / Restart the timer on current player using saved duration
 */
export async function resetAuctionTimer(seconds?: number) {
  await startOverallAuctionTimer(seconds, 'admin');
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
/**
 * Executes 'শেষ ডাক!' (Final Call / Hammer Down) or Automatic Expiration Assignment.
 * Idempotent: stops bidding, confirms Sold or Unsold, deducts budget safely,
 * and automatically loads the next eligible player in the queue.
 * If no eligible players remain, transitions the auction stage into 'completed'.
 */
/**
 * Executes auction finalization (when countdown expires or admin triggers final call).
 * Idempotent:
 * - If at least one valid bid exists: marks player SOLD, deducts budget exactly once, increments squad count.
 * - If no valid bid exists: marks player UNSOLD.
 * - Prevents duplicate assignments or duplicate budget deductions if page refreshes or multiple clients run.
 * - Does NOT automatically start the next player's auction, preserving the final result clearly on the board.
 */
export async function executeFinalCallAndAdvance(
  adminEmail: string,
  seasonId: string = 'season-2-2026',
  forceUnsold: boolean = false,
  expectedPlayerId?: string
): Promise<{
  success: boolean;
  message: string;
  result: 'sold' | 'unsold' | 'already_settled';
  finalPrice?: number;
  winningTeamName?: string;
  nextPlayerName?: string | null;
  auctionCompleted?: boolean;
  alreadySettled?: boolean;
}> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');

    // Atomic transaction for idempotent auction finalization
    const finalizeOutcome = await runTransaction(db, async transaction => {
      const auctionSnap = await transaction.get(auctionDocRef);
      if (!auctionSnap.exists()) {
        throw new Error('নিলাম সেশন পাওয়া যায়নি (No active auction found).');
      }
      const auctionData = auctionSnap.data() as AuctionState;

      // 1. Idempotency Check: if auction is already settled, abort immediately without duplicate deduction
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

      if (expectedPlayerId && auctionData.currentPlayerId !== expectedPlayerId) {
        return {
          alreadySettled: true,
          result: 'already_settled' as const,
          currentPlayerId: auctionData.currentPlayerId,
          currentPlayerName: auctionData.currentPlayerName,
          finalPrice: auctionData.currentBid || 0,
          winningTeamName: auctionData.highestBidderTeamName || '',
        };
      }

      if (!auctionData.currentPlayerId) {
        throw new Error('স্টেজে কোনো খেলোয়াড় উপস্থিত নেই (No player on stage).');
      }

      // 2. Read Player Document
      const playerDocRef = doc(db, 'players', auctionData.currentPlayerId);
      const playerSnap = await transaction.get(playerDocRef);
      if (!playerSnap.exists()) {
        throw new Error('খেলোয়াড়ের তথ্য ডেটাবেসে পাওয়া যায়নি।');
      }
      const playerData = playerSnap.data() as Player;

      // 3. Check if player was already marked sold or unsold
      if (playerData.auctionStatus === 'sold' || playerData.auctionStatus === 'unsold') {
        return {
          alreadySettled: true,
          result: (playerData.auctionStatus === 'sold' ? 'sold' : 'unsold') as 'sold' | 'unsold',
          currentPlayerId: auctionData.currentPlayerId,
          currentPlayerName: playerData.name || auctionData.currentPlayerName,
          finalPrice: playerData.finalPrice || auctionData.currentBid || 0,
          winningTeamName: playerData.winningTeamName || auctionData.highestBidderTeamName || '',
        };
      }

      // 4. Determine outcome: Valid bid requires highestBidderTeamId and currentBid > 0
      const hasValidBid = Boolean(auctionData.highestBidderTeamId && (auctionData.currentBid || 0) > 0);
      const isSold = !forceUnsold && hasValidBid;

      if (isSold && auctionData.highestBidderTeamId) {
        const teamDocRef = doc(db, 'teams', auctionData.highestBidderTeamId);
        const teamSnap = await transaction.get(teamDocRef);

        if (!teamSnap.exists()) {
          throw new Error('বিজয়ী দলের তথ্য ডেটাবেসে মেলেনি (Winning team not found).');
        }

        const teamData = teamSnap.data() as Team;
        const finalPrice = auctionData.currentBid;

        if (teamData.remainingBudget < finalPrice) {
          throw new Error(`দলের বাজেটের সাথে অসঙ্গতি পাওয়া গেছে! অবশিষ্ট বাজেট: ৳${teamData.remainingBudget.toLocaleString()}`);
        }

        // Deduct budget and increment squad count exactly ONCE
        const newSpentBudget = (teamData.spentBudget || 0) + finalPrice;
        const newRemainingBudget = teamData.remainingBudget - finalPrice;
        const newSquadCount = (teamData.squadCount || 0) + 1;

        transaction.update(teamDocRef, {
          spentBudget: newSpentBudget,
          remainingBudget: newRemainingBudget,
          squadCount: newSquadCount,
          updatedAt: new Date().toISOString(),
        });

        // Update Player to SOLD
        transaction.update(playerDocRef, {
          auctionStatus: 'sold',
          winningTeamId: teamData.id || auctionData.highestBidderTeamId,
          winningTeamName: teamData.name,
          finalPrice,
          updatedAt: new Date().toISOString(),
        });

        // Update Auction State to SOLD (keep player and final result clearly visible on board)
        transaction.update(auctionDocRef, {
          status: 'sold',
          timerExpiresAt: null,
          currentBid: finalPrice,
          highestBidderTeamId: teamData.id || auctionData.highestBidderTeamId,
          highestBidderTeamName: teamData.name,
          updatedAt: new Date().toISOString(),
        });

        // Audit Log
        const auditDocRef = doc(collection(db, 'auditLogs'));
        transaction.set(auditDocRef, {
          seasonId: auctionData.seasonId || seasonId,
          action: 'PLAYER_SOLD',
          actorEmail: adminEmail,
          actorRole: 'admin',
          details: `[নিলাম নিষ্পত্তি] খেলোয়াড় ${playerData.name} কে ৳${finalPrice.toLocaleString()} মূল্যে ${teamData.name} দলের কাছে বিক্রিত ঘোষণা করা হয়েছে।`,
          timestamp: new Date().toISOString(),
        });

        return {
          alreadySettled: false,
          result: 'sold' as const,
          currentPlayerId: auctionData.currentPlayerId,
          currentPlayerName: playerData.name,
          finalPrice,
          winningTeamName: teamData.name,
          playerData: {
            id: playerData.id,
            name: playerData.name,
            banglaName: playerData.banglaName,
            photoUrl: playerData.photoUrl,
            position: playerData.position,
            category: playerData.category,
            formNumber: playerData.formNumber,
            registrationNumber: playerData.registrationNumber,
          },
          winningTeamData: {
            id: teamData.id,
            name: teamData.name,
            logoUrl: teamData.logoUrl,
          },
        };
      } else {
        // UNSOLD outcome: No valid bid placed before timer reached zero
        transaction.update(playerDocRef, {
          auctionStatus: 'unsold',
          winningTeamId: null,
          winningTeamName: null,
          finalPrice: null,
          updatedAt: new Date().toISOString(),
        });

        transaction.update(auctionDocRef, {
          status: 'unsold',
          timerExpiresAt: null,
          highestBidderTeamId: null,
          highestBidderTeamName: null,
          updatedAt: new Date().toISOString(),
        });

        const auditDocRef = doc(collection(db, 'auditLogs'));
        transaction.set(auditDocRef, {
          seasonId: auctionData.seasonId || seasonId,
          action: 'PLAYER_UNSOLD',
          actorEmail: adminEmail,
          actorRole: 'admin',
          details: `[নিলাম নিষ্পত্তি] খেলোয়াড় ${playerData.name} অবিক্রিত (UNSOLD) হিসেবে নিলাম সমাপ্ত হয়েছে।`,
          timestamp: new Date().toISOString(),
        });

        return {
          alreadySettled: false,
          result: 'unsold' as const,
          currentPlayerId: auctionData.currentPlayerId,
          currentPlayerName: playerData.name,
          finalPrice: 0,
          winningTeamName: '',
          playerData: {
            id: playerData.id,
            name: playerData.name,
            banglaName: playerData.banglaName,
            photoUrl: playerData.photoUrl,
            position: playerData.position,
            category: playerData.category,
            formNumber: playerData.formNumber,
            registrationNumber: playerData.registrationNumber,
          },
          winningTeamData: null,
        };
      }
    });

    if (finalizeOutcome.alreadySettled) {
      return {
        success: true,
        alreadySettled: true,
        result: finalizeOutcome.result,
        finalPrice: finalizeOutcome.finalPrice,
        winningTeamName: finalizeOutcome.winningTeamName,
        message: 'এই খেলোয়াড়ের ডাক পূর্বেই সংরক্ষিত হয়েছে।',
      };
    }

    // Automatic non-blocking poster generation upon auction finalization
    if (finalizeOutcome.playerData) {
      generateAndSavePoster({
        player: finalizeOutcome.playerData,
        status: finalizeOutcome.result,
        finalPrice: finalizeOutcome.finalPrice,
        winningTeam: finalizeOutcome.winningTeamData,
        season: {
          id: seasonId,
          name: 'Teesta Premier League Season 2',
        },
      }).catch(posterErr => {
        console.warn('Background poster generation notice:', posterErr);
      });
    }

    const outcomeMsg = finalizeOutcome.result === 'sold'
      ? `খেলোয়াড় ${finalizeOutcome.currentPlayerName} ৳${finalizeOutcome.finalPrice?.toLocaleString()} মূল্যে ${finalizeOutcome.winningTeamName} দলের কাছে বিক্রিত (SOLD) হয়েছে!`
      : `খেলোয়াড় ${finalizeOutcome.currentPlayerName} অবিক্রিত (UNSOLD) হিসেবে নির্ধারিত হয়েছে।`;

    return {
      success: true,
      alreadySettled: false,
      result: finalizeOutcome.result,
      finalPrice: finalizeOutcome.finalPrice,
      winningTeamName: finalizeOutcome.winningTeamName,
      auctionCompleted: false,
      message: outcomeMsg,
    };
  } catch (err: unknown) {
    console.error('Final call error:', err);
    return {
      success: false,
      result: 'unsold',
      message: err instanceof Error ? err.message : 'নিষ্পত্তি প্রক্রিয়াকরণে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Admin action: Cleans / Resets accidental or mistaken bids on current player.
 * Cancels active countdown, restores starting base price, clears highest bidder,
 * and deletes unfinalized bids for this player.
 * Does NOT delete any players, teams, registration data, or completed auction records.
 * Rejects if the player is already finalized.
 */
/**
 * Admin action: Safely cleans, reverses, or resets auction state for the current player.
 * Requirement 3:
 * - If player was SOLD: Atomically reverses the exact transaction: restores deducted amount to winning team's
 *   remaining budget, decrements squad count, removes team assignment from player, and sets player ready for re-auction.
 * - If player was UNSOLD: Safely resets player to ready/standby state for re-auction without inventing any refund.
 * - If auction is IN PROGRESS: Cancels active countdown, clears mistaken bids, and restores starting base price.
 * - Idempotent: Checks actual status to prevent duplicate refunds or double deductions.
 * - Preserves player records, photos, IDs, categories, and completed auction audit logs.
 */
export async function cleanCurrentPlayerBids(
  adminEmail: string,
  seasonId: string = 'season-2-2026'
): Promise<{
  success: boolean;
  message: string;
  actionTaken?: 'refunded_sold' | 'reset_unsold' | 'cleaned_in_progress';
  refundedAmount?: number;
  refundedTeamName?: string;
}> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');

    const result = await runTransaction(db, async transaction => {
      const auctionSnap = await transaction.get(auctionDocRef);
      if (!auctionSnap.exists()) {
        throw new Error('কোনো সক্রিয় নিলাম সেশন পাওয়া যায়নি।');
      }
      const auctionData = auctionSnap.data() as AuctionState;

      if (!auctionData.currentPlayerId) {
        throw new Error('স্টেজে কোনো খেলোয়াড় উপস্থিত নেই।');
      }

      const playerDocRef = doc(db, 'players', auctionData.currentPlayerId);
      const playerSnap = await transaction.get(playerDocRef);
      if (!playerSnap.exists()) {
        throw new Error('খেলোয়াড়ের তথ্য ডেটাবেসে পাওয়া যায়নি।');
      }
      const playerData = playerSnap.data() as Player;

      const startingBasePrice = playerData.basePrice || auctionData.currentBasePrice || 2000;
      let actionTaken: 'refunded_sold' | 'reset_unsold' | 'cleaned_in_progress' = 'cleaned_in_progress';
      let refundedAmount = 0;
      let refundedTeamName = '';

      // Case 1: Player was SOLD (Safely reverse sale transaction)
      if (auctionData.status === 'sold' || playerData.auctionStatus === 'sold') {
        const winningTeamId = playerData.winningTeamId || auctionData.highestBidderTeamId;
        const finalPrice = playerData.finalPrice || auctionData.currentBid || 0;

        if (winningTeamId && finalPrice > 0) {
          const teamDocRef = doc(db, 'teams', winningTeamId);
          const teamSnap = await transaction.get(teamDocRef);

          if (teamSnap.exists()) {
            const teamData = teamSnap.data() as Team;
            refundedAmount = finalPrice;
            refundedTeamName = teamData.name;

            // Atomically restore remainingBudget, reduce spentBudget, and decrement squadCount
            transaction.update(teamDocRef, {
              spentBudget: Math.max(0, (teamData.spentBudget || 0) - finalPrice),
              remainingBudget: (teamData.remainingBudget || 0) + finalPrice,
              squadCount: Math.max(0, (teamData.squadCount || 0) - 1),
              updatedAt: new Date().toISOString(),
            });
          }
        }

        // Reset player document to ready for re-auction
        transaction.update(playerDocRef, {
          auctionStatus: 'live',
          winningTeamId: null,
          winningTeamName: null,
          finalPrice: null,
          updatedAt: new Date().toISOString(),
        });

        // Reset auction room stage back to ready/standby for this player
        transaction.update(auctionDocRef, {
          status: 'paused',
          currentBid: startingBasePrice,
          highestBidderTeamId: null,
          highestBidderTeamName: null,
          timerExpiresAt: null,
          updatedAt: new Date().toISOString(),
        });

        // Append Audit Log
        const auditDocRef = doc(collection(db, 'auditLogs'));
        transaction.set(auditDocRef, {
          seasonId: auctionData.seasonId || seasonId,
          action: 'AUCTION_RE_AUCTION_REVERSED',
          actorEmail: adminEmail,
          actorRole: 'admin',
          details: `[ক্লিন / রি-অকশন রিসেট] বিক্রিত খেলোয়াড় '${playerData.name}'-এর বিক্রয় লেনদেন নিরাপদভাবে বাতিল করা হয়েছে। দল '${refundedTeamName}'-কে ৳${refundedAmount.toLocaleString()} ফেরত ও স্কোয়াড সংখ্যা ১ কমানো হয়েছে। খেলোয়াড় পুনরায় নিলাম স্টেজে প্রস্তুত।`,
          timestamp: new Date().toISOString(),
        });

        actionTaken = 'refunded_sold';
      }
      // Case 2: Player was UNSOLD (Reset back to ready for re-auction)
      else if (auctionData.status === 'unsold' || playerData.auctionStatus === 'unsold') {
        transaction.update(playerDocRef, {
          auctionStatus: 'live',
          winningTeamId: null,
          winningTeamName: null,
          finalPrice: null,
          updatedAt: new Date().toISOString(),
        });

        transaction.update(auctionDocRef, {
          status: 'paused',
          currentBid: startingBasePrice,
          highestBidderTeamId: null,
          highestBidderTeamName: null,
          timerExpiresAt: null,
          updatedAt: new Date().toISOString(),
        });

        const auditDocRef = doc(collection(db, 'auditLogs'));
        transaction.set(auditDocRef, {
          seasonId: auctionData.seasonId || seasonId,
          action: 'AUCTION_UNSOLD_RE_AUCTION',
          actorEmail: adminEmail,
          actorRole: 'admin',
          details: `[ক্লিন / রি-অকশন রিসেট] অবিক্রিত খেলোয়াড় '${playerData.name}'-কে পুনরায় নিলাম স্টেজে প্রস্তুত করা হয়েছে (ভিত্তিমূল্য: ৳${startingBasePrice.toLocaleString()})।`,
          timestamp: new Date().toISOString(),
        });

        actionTaken = 'reset_unsold';
      }
      // Case 3: Auction was In-Progress (active or paused) with accidental bids
      else {
        transaction.update(auctionDocRef, {
          status: 'paused',
          currentBid: startingBasePrice,
          highestBidderTeamId: null,
          highestBidderTeamName: null,
          timerExpiresAt: null,
          updatedAt: new Date().toISOString(),
        });

        const auditDocRef = doc(collection(db, 'auditLogs'));
        transaction.set(auditDocRef, {
          seasonId: auctionData.seasonId || seasonId,
          action: 'BID_RESET_CLEANED',
          actorEmail: adminEmail,
          actorRole: 'admin',
          details: `[ক্লিন / বিড রিসেট] খেলোয়াড় '${playerData.name}'-এর অনাকাঙ্ক্ষিত ডাকসমূহ বাতিল করে প্রারম্ভিক ভিত্তিমূল্য ৳${startingBasePrice.toLocaleString()}-এ ফিরিয়ে নেওয়া হয়েছে (কাউন্টডাউন স্ট্যান্ডবাই)।`,
          timestamp: new Date().toISOString(),
        });

        actionTaken = 'cleaned_in_progress';
      }

      return {
        playerName: playerData.name || auctionData.currentPlayerName,
        playerId: auctionData.currentPlayerId,
        startingBasePrice,
        actionTaken,
        refundedAmount,
        refundedTeamName,
      };
    });

    // Also delete any unfinalized temporary bids in subcollection
    try {
      const bidsQuery = query(
        collection(db, 'auction', 'current', 'bids'),
        where('playerId', '==', result.playerId)
      );
      const bidsSnap = await getDocs(bidsQuery);
      if (!bidsSnap.empty) {
        const batch = writeBatch(db);
        bidsSnap.forEach(bDoc => batch.delete(bDoc.ref));
        await batch.commit();
      }
    } catch (cleanBidsErr) {
      console.warn('Note: Could not clean subcollection bids:', cleanBidsErr);
    }

    let successMsg = '';
    if (result.actionTaken === 'refunded_sold') {
      successMsg = `খেলোয়াড় '${result.playerName}'-এর বিক্রয় বাতিল ও দল '${result.refundedTeamName}'-কে ৳${result.refundedAmount.toLocaleString()} বাজেট ফেরত দেওয়া হয়েছে। খেলোয়াড় পুনরায় নিলামের জন্য প্রস্তুত।`;
    } else if (result.actionTaken === 'reset_unsold') {
      successMsg = `খেলোয়াড় '${result.playerName}'-কে সফলভাবে প্রারম্ভিক ভিত্তিমূল্যে (৳${result.startingBasePrice.toLocaleString()}) পুনরায় নিলামের জন্য প্রস্তুত করা হয়েছে।`;
    } else {
      successMsg = `খেলোয়াড় '${result.playerName}'-এর ভুল ডাক বাতিল করে প্রারম্ভিক ভিত্তিমূল্যে ফিরিয়ে আনা হয়েছে।`;
    }

    return {
      success: true,
      message: successMsg,
      actionTaken: result.actionTaken,
      refundedAmount: result.refundedAmount,
      refundedTeamName: result.refundedTeamName,
    };
  } catch (err: unknown) {
    console.error('Error cleaning mistaken bids:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'বিড ক্লিন করতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Admin action: Updates the auction countdown duration persistently in Firebase.
 * Supports presets (15, 20, 30, 60s, etc.) or any custom duration (3 to 300s).
 * Persists immediately to auction/current, seasons collection, and league settings
 * so the configuration survives browser refresh, logout, or session restart.
 */
export async function updateAuctionTimerDuration(
  seconds: number,
  seasonId: string = 'season-2-2026',
  adminEmail: string = 'admin'
): Promise<{ success: boolean; message: string }> {
  try {
    const sec = Math.round(Number(seconds));
    if (isNaN(sec) || sec < 3 || sec > 300) {
      return {
        success: false,
        message: 'কাউন্টডাউন সময়কাল ৩ থেকে ৩০০ সেকেন্ডের মধ্যে হতে হবে (Duration must be between 3 and 300 seconds).',
      };
    }

    const auctionDocRef = doc(db, 'auction', 'current');
    const seasonDocRef = doc(db, 'seasons', seasonId);
    const settingsDocRef = doc(db, 'settings', 'league');

    // 1. Persist in auction/current
    await setDoc(
      auctionDocRef,
      {
        timerSeconds: sec,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // 2. Persist in seasons collection
    try {
      await setDoc(
        seasonDocRef,
        {
          defaultTimerSeconds: sec,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {
      // ignore if missing
    }

    // 3. Persist in settings/league
    try {
      await setDoc(
        settingsDocRef,
        {
          defaultTimerSeconds: sec,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {
      // ignore
    }

    // 4. Audit Log
    const auditDocRef = doc(collection(db, 'auditLogs'));
    await setDoc(auditDocRef, {
      seasonId,
      action: 'TIMER_DURATION_CONFIGURED',
      actorEmail: adminEmail,
      actorRole: 'admin',
      details: `কাউন্টডাউন টাইমার সময়কাল ${sec} সেকেন্ড নির্ধারণ করা হয়েছে (Firebase এ সংরক্ষিত)।`,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: `কাউন্টডাউন সময়কাল সফলভাবে ${sec} সেকেন্ড নির্ধারণ করা হয়েছে (Firebase এ সংরক্ষিত)।`,
    };
  } catch (err: any) {
    console.error('Error updating auction timer duration:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'টাইমার পরিবর্তন করতে ত্রুটি হয়েছে',
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
      let cleanAuctionBoard = false;
      if (aSnap.exists()) {
        const aData = aSnap.data() as AuctionState;
        if (aData.currentPlayerId === playerId) {
          if (aData.status === 'active' || aData.status === 'paused') {
            throw new Error('এই খেলোয়াড় বর্তমানে লাইভ নিলামে রয়েছেন! নিলাম শেষ না করে খেলোয়াড় মোছা যাবে না।');
          }
          cleanAuctionBoard = true;
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

      // If player was on current auction board, reset board back to idle
      if (cleanAuctionBoard) {
        transaction.update(auctionRef, {
          status: 'idle',
          currentPlayerId: null,
          currentPlayerName: null,
          currentPlayerPosition: null,
          currentPlayerCategory: null,
          currentPlayerAge: null,
          currentPlayerArea: null,
          currentPlayerPhoto: null,
          currentBasePrice: 0,
          currentBid: 0,
          highestBidderTeamId: null,
          highestBidderTeamName: null,
          timerExpiresAt: null,
          updatedAt: new Date().toISOString(),
        });
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

/**
 * Admin removes the current player from the Live Auction Board.
 * - Sets the player's auctionStatus back to 'upcoming' (available in draft list),
 *   preserving all registrations, photos, form numbers, categories, base prices.
 * - Does NOT mark the player SOLD or UNSOLD.
 * - Does NOT deduct or refund any team budget.
 * - Cleans the auction board back to idle.
 * - Logs the action to audit trail.
 */
export async function removePlayerFromAuctionBoard(
  adminEmail: string = 'admin',
  seasonId: string = 'season-2-2026'
): Promise<{ success: boolean; message: string }> {
  try {
    const auctionDocRef = doc(db, 'auction', 'current');

    const result = await runTransaction(db, async transaction => {
      const aSnap = await transaction.get(auctionDocRef);
      if (!aSnap.exists()) {
        throw new Error('কোনো সক্রিয় নিলাম সেশন পাওয়া যায়নি।');
      }

      const aData = aSnap.data() as AuctionState;
      const playerId = aData.currentPlayerId;

      if (!playerId) {
        throw new Error('বর্তমানে নিলাম বোর্ডে কোনো খেলোয়াড় নেই।');
      }

      const playerDocRef = doc(db, 'players', playerId);
      const pSnap = await transaction.get(playerDocRef);

      let playerName = aData.currentPlayerName || 'খেলোয়াড়';
      if (pSnap.exists()) {
        const pData = pSnap.data() as Player;
        playerName = pData.name || playerName;

        // If player is not already sold, return to upcoming draft pool
        if (pData.auctionStatus !== 'sold') {
          transaction.update(playerDocRef, {
            auctionStatus: 'upcoming',
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // Reset auction board back to idle (standby for next player selection)
      transaction.update(auctionDocRef, {
        status: 'idle',
        currentPlayerId: null,
        currentPlayerName: null,
        currentPlayerPosition: null,
        currentPlayerCategory: null,
        currentPlayerAge: null,
        currentPlayerArea: null,
        currentPlayerPhoto: null,
        currentBasePrice: 0,
        currentBid: 0,
        highestBidderTeamId: null,
        highestBidderTeamName: null,
        timerExpiresAt: null,
        updatedAt: new Date().toISOString(),
      });

      // Audit Log
      const auditRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditRef, {
        seasonId: aData.seasonId || seasonId,
        action: 'AUCTION_PLAYER_REMOVED_FROM_BOARD',
        actorEmail: adminEmail,
        actorRole: 'admin',
        details: `খেলোয়াড় "${playerName}" কে নিলাম বোর্ড থেকে সরিয়ে ড্রাফট তালিকায় (upcoming) ফিরিয়ে নেওয়া হয়েছে।`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `খেলোয়াড় "${playerName}" কে সফলভাবে নিলাম বোর্ড থেকে সরানো হয়েছে।`,
      };
    });

    // Clean transient bids from auction/current/bids subcollection
    try {
      const bidsSnap = await getDocs(collection(db, 'auction', 'current', 'bids'));
      if (!bidsSnap.empty) {
        const batch = writeBatch(db);
        bidsSnap.forEach(bDoc => {
          batch.delete(bDoc.ref);
        });
        await batch.commit();
      }
    } catch (bidsErr) {
      console.warn('Notice cleaning bids on removePlayerFromAuctionBoard:', bidsErr);
    }

    return result;
  } catch (err: any) {
    console.error('Error removing player from auction board:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'নিলাম বোর্ড থেকে খেলোয়াড় সরাতে ব্যর্থ হয়েছে।',
    };
  }
}

/**
 * Admin action: Manually add any player to a team's squad without squad size limits.
 * Requirement:
 * - Admin can add 16th, 20th, or any number of players.
 * - Prevents adding the same player to the same team more than once (duplicate guard).
 * - Does NOT alter the team's remaining budget or spent budget (only live auction does that).
 * - Updates player's winningTeamId, winningTeamName, and auctionStatus: 'sold'.
 * - Increments team's squadCount.
 * - Restricted to authorized admins.
 */
export async function manualAddPlayerToSquad(
  teamId: string,
  playerId: string,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    const teamDocRef = doc(db, 'teams', teamId);
    const playerDocRef = doc(db, 'players', playerId);

    const result = await runTransaction(db, async transaction => {
      const teamSnap = await transaction.get(teamDocRef);
      if (!teamSnap.exists()) {
        throw new Error('দলটি ডেটাবেসে খুঁজে পাওয়া যায়নি (Team not found).');
      }

      const playerSnap = await transaction.get(playerDocRef);
      if (!playerSnap.exists()) {
        throw new Error('খেলোয়াড়টি ডেটাবেসে খুঁজে পাওয়া যায়নি (Player not found).');
      }

      const teamData = teamSnap.data() as Team;
      const playerData = playerSnap.data() as Player;

      // Duplicate guard: Prevent adding the same player to the same team's squad more than once
      if (playerData.winningTeamId === teamId) {
        throw new Error(`খেলোয়াড় "${playerData.name}" ইতিমধ্যেই "${teamData.name}" দলের স্কোয়াডে যুক্ত আছেন!`);
      }

      // If player was in another team, handle previous team's squadCount decrement
      if (playerData.winningTeamId && playerData.winningTeamId !== teamId) {
        const prevTeamRef = doc(db, 'teams', playerData.winningTeamId);
        const prevTeamSnap = await transaction.get(prevTeamRef);
        if (prevTeamSnap.exists()) {
          const prevTeamData = prevTeamSnap.data() as Team;
          transaction.update(prevTeamRef, {
            squadCount: Math.max(0, (prevTeamData.squadCount || 1) - 1),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // 1. Update Player Record: link to this team, keep budget unaffected
      transaction.update(playerDocRef, {
        winningTeamId: teamId,
        winningTeamName: teamData.name,
        auctionStatus: 'sold',
        finalPrice:
          playerData.finalPrice !== undefined && playerData.finalPrice !== null
            ? playerData.finalPrice
            : (playerData.basePrice || 0),
        updatedAt: new Date().toISOString(),
      });

      // 2. Update Team Record: increment squadCount without modifying spentBudget or remainingBudget
      const updatedSquadCount = (teamData.squadCount || 0) + 1;
      transaction.update(teamDocRef, {
        squadCount: updatedSquadCount,
        updatedAt: new Date().toISOString(),
      });

      // 3. Audit Log
      const auditRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditRef, {
        action: 'ADMIN_MANUAL_SQUAD_ADD',
        actorEmail: adminEmail,
        actorRole: 'admin',
        teamId,
        teamName: teamData.name,
        playerId,
        playerName: playerData.name,
        details: `অ্যাডমিন "${adminEmail}" খেলোয়াড় "${playerData.name}" কে ম্যানুয়ালি "${teamData.name}" দলের স্কোয়াডে যুক্ত করেছেন (নতুন স্কোয়াড সংখ্যা: ${updatedSquadCount} জন)।`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `খেলোয়াড় "${playerData.name}" কে সফলভাবে "${teamData.name}" দলের স্কোয়াডে যুক্ত করা হয়েছে (মোট স্কোয়াড: ${updatedSquadCount} জন)।`,
      };
    });

    return result;
  } catch (err: any) {
    console.error('Error in manualAddPlayerToSquad:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'খেলোয়াড় স্কোয়াডে যুক্ত করতে সমস্যা হয়েছে।',
    };
  }
}

/**
 * Admin action: Manually remove a player from a team's squad.
 * Resets player to upcoming draft pool and decrements squadCount without changing team budget.
 */
export async function manualRemovePlayerFromSquad(
  teamId: string,
  playerId: string,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    const teamDocRef = doc(db, 'teams', teamId);
    const playerDocRef = doc(db, 'players', playerId);

    const result = await runTransaction(db, async transaction => {
      const teamSnap = await transaction.get(teamDocRef);
      const playerSnap = await transaction.get(playerDocRef);

      if (!teamSnap.exists() || !playerSnap.exists()) {
        throw new Error('দল বা খেলোয়াড়ের তথ্য পাওয়া যায়নি।');
      }

      const teamData = teamSnap.data() as Team;
      const playerData = playerSnap.data() as Player;

      // 1. Reset player assignment
      transaction.update(playerDocRef, {
        winningTeamId: null,
        winningTeamName: null,
        auctionStatus: 'upcoming',
        updatedAt: new Date().toISOString(),
      });

      // 2. Decrement team squadCount
      const updatedSquadCount = Math.max(0, (teamData.squadCount || 1) - 1);
      transaction.update(teamDocRef, {
        squadCount: updatedSquadCount,
        updatedAt: new Date().toISOString(),
      });

      // 3. Audit Log
      const auditRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditRef, {
        action: 'ADMIN_MANUAL_SQUAD_REMOVE',
        actorEmail: adminEmail,
        actorRole: 'admin',
        teamId,
        teamName: teamData.name,
        playerId,
        playerName: playerData.name,
        details: `অ্যাডমিন "${adminEmail}" খেলোয়াড় "${playerData.name}" কে "${teamData.name}" দলের স্কোয়াড থেকে অপসারণ করেছেন।`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `খেলোয়াড় "${playerData.name}" কে "${teamData.name}" দলের স্কোয়াড থেকে অপসারণ করা হয়েছে।`,
      };
    });

    return result;
  } catch (err: any) {
    console.error('Error in manualRemovePlayerFromSquad:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'খেলোয়াড় অপসারণ করতে ব্যর্থ হয়েছে।',
    };
  }
}




