import {
  doc,
  collection,
  getDoc,
  setDoc,
  runTransaction,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Player, RegistrationSettings } from '../types';

export const DEFAULT_REGISTRATION_SETTINGS: RegistrationSettings = {
  startFormNumber: 1,
  nextFormNumber: 1,
  prefix: 'ফরম নং:- ',
  labelBn: 'ফরম নং:- ',
  labelEn: 'Form No. ',
  digitFormat: 'bn',
  totalRegistrations: 0,
  lastAssignedNumber: null,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};

// Convert number to Bengali numeral string (e.g. 1 -> ১, 13 -> ১৩)
export function toBengaliDigits(num: number | string): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num)
    .split('')
    .map(ch => {
      const idx = parseInt(ch, 10);
      return !isNaN(idx) ? bnDigits[idx] : ch;
    })
    .join('');
}

// Format the display label for a given form number
export function formatFormDisplay(
  num: number,
  settings?: Partial<RegistrationSettings> | null,
  language: 'bn' | 'en' = 'bn'
): string {
  const currentSettings = { ...DEFAULT_REGISTRATION_SETTINGS, ...(settings || {}) };
  const digits = currentSettings.digitFormat === 'bn' ? toBengaliDigits(num) : String(num);

  if (language === 'en') {
    const prefixEn = currentSettings.labelEn || 'Form No. ';
    return `${prefixEn}${num}`;
  }

  const prefixBn = currentSettings.labelBn || currentSettings.prefix || 'ফরম নং:- ';
  return `${prefixBn}${digits}`;
}

// Fetch the current registration settings from Firestore
export async function getRegistrationSettings(): Promise<RegistrationSettings> {
  try {
    const settingsRef = doc(db, 'settings', 'registration');
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      return { ...DEFAULT_REGISTRATION_SETTINGS, ...(snap.data() as RegistrationSettings) };
    }
  } catch (err) {
    console.warn('Could not fetch registration settings, falling back to defaults:', err);
  }
  return { ...DEFAULT_REGISTRATION_SETTINGS };
}

// Ensure the registration settings document exists in Firestore
export async function ensureRegistrationSettingsExists(): Promise<RegistrationSettings> {
  const settingsRef = doc(db, 'settings', 'registration');
  try {
    const snap = await getDoc(settingsRef);
    if (!snap.exists()) {
      const initial = {
        ...DEFAULT_REGISTRATION_SETTINGS,
        updatedAt: new Date().toISOString(),
        updatedBy: 'initialization',
      };
      await setDoc(settingsRef, initial, { merge: true });
      return initial;
    }
    return { ...DEFAULT_REGISTRATION_SETTINGS, ...(snap.data() as RegistrationSettings) };
  } catch (err) {
    console.error('Error ensuring registration settings exist:', err);
    return { ...DEFAULT_REGISTRATION_SETTINGS };
  }
}

// Check if a specific form number has already been assigned to an existing player
export async function checkFormNumberConflict(
  targetNumber: number,
  seasonId?: string
): Promise<{ hasConflict: boolean; conflictingPlayer?: Player }> {
  try {
    const playersRef = collection(db, 'players');
    let q = seasonId
      ? query(playersRef, where('seasonId', '==', seasonId), where('formNumericValue', '==', targetNumber))
      : query(playersRef, where('formNumericValue', '==', targetNumber));

    const snap = await getDocs(q);
    if (!snap.empty) {
      const p = { ...(snap.docs[0].data() as Player), id: snap.docs[0].id };
      return { hasConflict: true, conflictingPlayer: p };
    }

    // Also check string match against standard prefixes
    const bnStr = `ফরম নং:- ${toBengaliDigits(targetNumber)}`;
    const enStr = `Form No. ${targetNumber}`;
    const stringCheckQ = seasonId
      ? query(playersRef, where('seasonId', '==', seasonId), where('formNumber', 'in', [bnStr, enStr]))
      : query(playersRef, where('formNumber', 'in', [bnStr, enStr]));

    const strSnap = await getDocs(stringCheckQ);
    if (!strSnap.empty) {
      const p = { ...(strSnap.docs[0].data() as Player), id: strSnap.docs[0].id };
      return { hasConflict: true, conflictingPlayer: p };
    }
  } catch (err) {
    console.error('Error checking form number conflict:', err);
  }
  return { hasConflict: false };
}

// Update registration settings (Admin only) with conflict validation
export async function updateRegistrationSettings(
  updates: Partial<RegistrationSettings>,
  adminEmail: string
): Promise<{ success: boolean; settings?: RegistrationSettings; error?: string }> {
  try {
    // 1. Validation
    if (typeof updates.startFormNumber === 'number' && updates.startFormNumber < 1) {
      return {
        success: false,
        error: 'প্রারম্ভিক ফরম নম্বর অবশ্যই ১ বা তার বেশি হতে হবে (Starting number must be >= 1).',
      };
    }

    if (typeof updates.nextFormNumber === 'number') {
      if (updates.nextFormNumber < 1) {
        return {
          success: false,
          error: 'পরবর্তী ফরম নম্বর অবশ্যই ১ বা তার বেশি হতে হবে (Next number must be >= 1).',
        };
      }

      // Check for conflict with existing registrations
      const conflict = await checkFormNumberConflict(updates.nextFormNumber);
      if (conflict.hasConflict && conflict.conflictingPlayer) {
        return {
          success: false,
          error: `ফরম নং ${updates.nextFormNumber} ইতোমধ্যে নিবন্ধিত খেলোয়াড় "${conflict.conflictingPlayer.name}" এর জন্য ব্যবহৃত হয়েছে। অন্য নম্বর নির্বাচন করুন।`,
        };
      }
    }

    const settingsRef = doc(db, 'settings', 'registration');
    const current = await getRegistrationSettings();

    const merged: RegistrationSettings = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail,
    };

    await setDoc(settingsRef, merged, { merge: true });

    // Audit Log
    try {
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        action: 'REGISTRATION_SETTINGS_UPDATED',
        actorEmail: adminEmail,
        actorRole: 'admin',
        details: `রেজিস্ট্রেশন ফরম সেটিংস আপডেট: শুরু=${merged.startFormNumber}, পরবর্তী=${merged.nextFormNumber}, প্রিফিক্স="${merged.prefix}"`,
        timestamp: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn('Failed to write audit log for registration settings update:', auditErr);
    }

    return { success: true, settings: merged };
  } catch (err: any) {
    console.error('Failed to update registration settings:', err);
    return {
      success: false,
      error: err?.message || 'রেজিস্ট্রেশন সেটিংস সেভ করতে ব্যর্থ হয়েছে।',
    };
  }
}

// Concurrency-Safe, Atomic Player Registration with Sequential Form Number Assignment
export async function registerPlayerWithAtomicFormNumber(
  playerPayload: Omit<Player, 'id' | 'formNumber' | 'formNumericValue' | 'registrationNumber' | 'createdAt'>,
  seasonId: string
): Promise<{
  success: boolean;
  player?: Player;
  assignedFormNumber?: string;
  assignedNumericValue?: number;
  registrationNumber?: string;
  error?: string;
}> {
  const settingsRef = doc(db, 'settings', 'registration');
  const playerRef = doc(collection(db, 'players'));
  const auditRef = doc(collection(db, 'auditLogs'));

  try {
    const result = await runTransaction(db, async transaction => {
      // 1. Authoritative read of counter settings inside transaction
      const settingsSnap = await transaction.get(settingsRef);
      let settings: RegistrationSettings;

      if (!settingsSnap.exists()) {
        settings = { ...DEFAULT_REGISTRATION_SETTINGS };
      } else {
        settings = { ...DEFAULT_REGISTRATION_SETTINGS, ...(settingsSnap.data() as RegistrationSettings) };
      }

      // Determine next sequential integer number
      const startNum = typeof settings.startFormNumber === 'number' && settings.startFormNumber >= 1
        ? settings.startFormNumber
        : 1;

      let assignedNumber = typeof settings.nextFormNumber === 'number' && settings.nextFormNumber >= startNum
        ? settings.nextFormNumber
        : startNum;

      // Calculate formatted string and next sequential number
      const formattedFormNumber = formatFormDisplay(assignedNumber, settings, 'bn');
      const serialSuffix = String(assignedNumber).padStart(3, '0');
      const regNumber = `TPL-S2-${serialSuffix}`;

      const nextNumber = assignedNumber + 1;
      const totalRegs = (settings.totalRegistrations || 0) + 1;

      // 2. Atomically advance counter in settings document
      transaction.set(
        settingsRef,
        {
          ...settings,
          nextFormNumber: nextNumber,
          totalRegistrations: totalRegs,
          lastAssignedNumber: assignedNumber,
          updatedAt: new Date().toISOString(),
          updatedBy: 'player_registration',
        },
        { merge: true }
      );

      // 3. Atomically write new player record
      const fullPlayer: Player = {
        ...playerPayload,
        id: playerRef.id,
        seasonId,
        formNumber: formattedFormNumber,
        formNumericValue: assignedNumber,
        registrationNumber: regNumber,
        createdAt: new Date().toISOString(),
      };

      transaction.set(playerRef, fullPlayer);

      // 4. Atomically record audit log
      transaction.set(auditRef, {
        seasonId,
        action: 'PLAYER_REGISTERED',
        actorEmail: playerPayload.phone || 'player',
        actorRole: 'player',
        details: `[${formattedFormNumber}] ${playerPayload.name} (${playerPayload.position}, ক্যাটাগরি: ${playerPayload.category || 'N/A'}) সফলভাবে নিবন্ধিত। সিরিয়াল: ${regNumber}`,
        timestamp: new Date().toISOString(),
      });

      return {
        player: fullPlayer,
        assignedFormNumber: formattedFormNumber,
        assignedNumericValue: assignedNumber,
        registrationNumber: regNumber,
      };
    });

    return {
      success: true,
      player: result.player,
      assignedFormNumber: result.assignedFormNumber,
      assignedNumericValue: result.assignedNumericValue,
      registrationNumber: result.registrationNumber,
    };
  } catch (err: any) {
    console.error('Atomic registration transaction failed:', err);
    return {
      success: false,
      error: err?.message || 'নিবন্ধন সম্পন্ন করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
    };
  }
}
