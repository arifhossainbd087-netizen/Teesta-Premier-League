/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, updateDoc, setDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Season, Team, Player, LeagueSettings } from '../types';

/**
 * Audit log helper to record administrative text and field changes.
 */
async function recordEditAudit(
  action: string,
  details: string,
  actorEmail: string = 'admin'
) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action,
      details,
      actorEmail,
      actorRole: 'admin',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Non-fatal if audit logging fails
    console.warn('Audit log write error:', err);
  }
}

/**
 * Updates a field in the Seasons collection and syncs with League settings.
 */
export async function updateSeasonField(
  seasonId: string,
  field: keyof Season,
  value: any,
  actorEmail: string = 'admin'
): Promise<void> {
  if (!seasonId) throw new Error('Invalid season ID');
  if (field === 'id') throw new Error('Season ID is protected and cannot be modified');

  let sanitizedValue = value;
  if (
    field === 'defaultBudget' ||
    field === 'defaultBasePrice' ||
    field === 'defaultMinIncrement' ||
    field === 'defaultTimerSeconds' ||
    field === 'maxSquadSize' ||
    field === 'regFeeAmount' ||
    field === 'year'
  ) {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      throw new Error(`মানটি অবশ্যই একটি সঠিক ধনাত্মক সংখ্যা হতে হবে (Must be a positive number).`);
    }
    sanitizedValue = num;
  } else if (typeof value === 'string') {
    sanitizedValue = value.trim();
  }

  const seasonRef = doc(db, 'seasons', seasonId);
  await setDoc(
    seasonRef,
    {
      [field]: sanitizedValue,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Sync to settings/league if primary field changed
  try {
    const settingsRef = doc(db, 'settings', 'league');
    const syncPayload: Partial<LeagueSettings> = {
      updatedAt: new Date().toISOString(),
    };
    if (field === 'name') syncPayload.leagueName = sanitizedValue;
    if (field === 'defaultBudget') syncPayload.defaultBudget = sanitizedValue;
    if (field === 'defaultBasePrice') syncPayload.defaultBasePrice = sanitizedValue;
    if (field === 'defaultMinIncrement') syncPayload.defaultMinIncrement = sanitizedValue;
    if (field === 'defaultTimerSeconds') syncPayload.defaultTimerSeconds = sanitizedValue;
    if (field === 'regFeeAmount') syncPayload.regFeeAmount = sanitizedValue;
    if (field === 'bKashNumber') syncPayload.bKashNumber = sanitizedValue;
    if (field === 'nagadNumber') syncPayload.nagadNumber = sanitizedValue;
    if (field === 'rocketNumber') syncPayload.rocketNumber = sanitizedValue;

    if (Object.keys(syncPayload).length > 1) {
      await setDoc(settingsRef, syncPayload, { merge: true });
    }
  } catch (syncErr) {
    console.warn('Settings sync error:', syncErr);
  }

  const auditAction = field === 'regFeeAmount' ? 'REGISTRATION_FEE_UPDATED' : 'SEASON_FIELD_UPDATE';
  const auditDetails =
    field === 'regFeeAmount'
      ? `সিজন [${seasonId}] এর পূর্বনির্ধারিত নিবন্ধন ফি ৳${sanitizedValue} নির্ধারণ করা হয়েছে।`
      : `সিজন [${seasonId}] এর ফিল্ড "${String(field)}" পরিবর্তিত হয়েছে: "${sanitizedValue}"`;

  await recordEditAudit(auditAction, auditDetails, actorEmail);
}

/**
 * Updates a field in a Team record.
 * Handles safe budget calculation preserving spentBudget.
 */
export async function updateTeamField(
  teamId: string,
  field: keyof Team,
  value: any,
  currentTeam?: Team,
  actorEmail: string = 'admin'
): Promise<void> {
  if (!teamId) throw new Error('Invalid team ID');
  if (field === 'id') throw new Error('Team ID is immutable');

  const teamRef = doc(db, 'teams', teamId);

  if (field === 'totalBudget') {
    const newBudget = Number(value);
    if (isNaN(newBudget) || newBudget < 0) {
      throw new Error('বাজেট অবশ্যই ধনাত্মক সংখ্যা হতে হবে (Budget must be positive).');
    }
    const spent = currentTeam?.spentBudget || 0;
    const remaining = Math.max(0, newBudget - spent);

    await updateDoc(teamRef, {
      totalBudget: newBudget,
      remainingBudget: remaining,
      updatedAt: new Date().toISOString(),
    });

    await recordEditAudit(
      'TEAM_BUDGET_UPDATE',
      `দলের [${currentTeam?.name || teamId}] বাজেট পরিবর্তিত হয়েছে: ${newBudget} (অবশিষ্ট: ${remaining})`,
      actorEmail
    );
    return;
  }

  let sanitizedValue = value;
  if (field === 'maxSquad') {
    const num = Number(value);
    if (isNaN(num) || num < 1) {
      throw new Error('স্কোয়াড সংখ্যা কমপক্ষে ১ হতে হবে (Squad limit must be at least 1).');
    }
    sanitizedValue = num;
  } else if (typeof value === 'string') {
    sanitizedValue = value.trim();
  }

  await updateDoc(teamRef, {
    [field]: sanitizedValue,
    updatedAt: new Date().toISOString(),
  });

  await recordEditAudit(
    'TEAM_FIELD_UPDATE',
    `দলের [${currentTeam?.name || teamId}] ফিল্ড "${String(field)}" পরিবর্তিত হয়েছে: "${sanitizedValue}"`,
    actorEmail
  );
}

/**
 * Updates current live auction player name on the active room screen.
 */
export async function updateAuctionCurrentPlayerName(
  name: string,
  actorEmail: string = 'admin'
): Promise<void> {
  const auctionRef = doc(db, 'auction', 'current');
  await updateDoc(auctionRef, {
    currentPlayerName: name.trim(),
    updatedAt: new Date().toISOString(),
  });
  await recordEditAudit('AUCTION_PLAYER_NAME_UPDATE', `নিলামের খেলোয়াড়ের নাম হালনাগাদ: ${name.trim()}`, actorEmail);
}

// Protected Player fields that must only be changed via dedicated auction/workflow forms
const PROTECTED_PLAYER_FIELDS: (keyof Player)[] = [
  'id',
  'winningTeamId',
  'winningTeamName',
  'finalPrice',
  'auctionStatus',
];

/**
 * Updates a field in a Player record.
 * Rejects protected auction-calculated keys to prevent accidental corruption.
 */
export async function updatePlayerField(
  playerId: string,
  field: keyof Player,
  value: any,
  actorEmail: string = 'admin'
): Promise<void> {
  if (!playerId) throw new Error('Invalid player ID');

  if (PROTECTED_PLAYER_FIELDS.includes(field)) {
    throw new Error(
      `ফিল্ড "${String(field)}" সরাসরি টেক্সট এডিট করা যাবে না। অনুগ্রহ করে নিলাম বা প্লেয়ার ম্যানেজমেন্ট অপশন ব্যবহার করুন।`
    );
  }

  let sanitizedValue = value;
  if (field === 'age' || field === 'basePrice' || field === 'regFee') {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      throw new Error('সংখ্যাটি অবশ্যই ধনাত্মক হতে হবে (Must be a positive number).');
    }
    sanitizedValue = num;
  } else if (typeof value === 'string') {
    sanitizedValue = value.trim();
  }

  const playerRef = doc(db, 'players', playerId);
  await updateDoc(playerRef, {
    [field]: sanitizedValue,
    updatedAt: new Date().toISOString(),
  });

  await recordEditAudit(
    'PLAYER_FIELD_UPDATE',
    `খেলোয়াড়ের [${playerId}] ফিল্ড "${String(field)}" পরিবর্তিত হয়েছে: "${sanitizedValue}"`,
    actorEmail
  );
}

/**
 * Updates auction room parameter (minIncrement, timerSeconds, etc.)
 */
export async function updateAuctionSetting(
  field: 'minIncrement' | 'timerSeconds' | 'currentBasePrice',
  value: number,
  seasonId?: string,
  actorEmail: string = 'admin'
): Promise<void> {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    throw new Error('মানটি অবশ্যই ধনাত্মক সংখ্যা হতে হবে (Must be greater than 0).');
  }

  const auctionRef = doc(db, 'auction', 'current');
  await updateDoc(auctionRef, {
    [field]: num,
    updatedAt: new Date().toISOString(),
  });

  // Sync with default in current season if applicable
  if (seasonId) {
    try {
      const seasonRef = doc(db, 'seasons', seasonId);
      const seasonField =
        field === 'minIncrement'
          ? 'defaultMinIncrement'
          : field === 'timerSeconds'
          ? 'defaultTimerSeconds'
          : 'defaultBasePrice';
      await updateDoc(seasonRef, {
        [seasonField]: num,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Season default update error:', e);
    }
  }

  await recordEditAudit(
    'AUCTION_SETTING_UPDATE',
    `নিলামের সেটিং "${field}" পরিবর্তিত হয়েছে: ${num}`,
    actorEmail
  );
}
