import {
  doc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  getDocs,
  getDocFromCache,
  getDocsFromCache,
  query,
  where,
} from 'firebase/firestore';
import { db, isQuotaExceededError, formatFriendlyErrorMessage } from '../firebase/config';
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

// Fetch the current registration settings from Firestore with resilient cache fallback
export async function getRegistrationSettings(): Promise<RegistrationSettings> {
  const settingsRef = doc(db, 'settings', 'registration');
  try {
    let snap;
    try {
      snap = await getDoc(settingsRef);
    } catch (readErr) {
      if (isQuotaExceededError(readErr)) {
        snap = await getDocFromCache(settingsRef);
      } else {
        throw readErr;
      }
    }
    if (snap && snap.exists()) {
      const data = { ...DEFAULT_REGISTRATION_SETTINGS, ...(snap.data() as RegistrationSettings) };
      try {
        localStorage.setItem('tpl_cached_settings', JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (err) {
    console.warn('Could not fetch registration settings from server/cache, trying localStorage:', err);
  }

  // Fallback to localStorage
  try {
    const cached = localStorage.getItem('tpl_cached_settings');
    if (cached) {
      return { ...DEFAULT_REGISTRATION_SETTINGS, ...JSON.parse(cached) };
    }
  } catch {}

  return { ...DEFAULT_REGISTRATION_SETTINGS };
}

// Extract numeric integer from Bengali or English numeral string
export function parseNumericFormValue(formStr?: string | number | null): number {
  if (typeof formStr === 'number') return Math.max(0, Math.floor(formStr));
  if (!formStr) return 0;

  const bnToEnMap: Record<string, string> = {
    '০': '0',
    '১': '1',
    '২': '2',
    '৩': '3',
    '৪': '4',
    '৫': '5',
    '৬': '6',
    '৭': '7',
    '৮': '8',
    '৯': '9',
  };

  const converted = String(formStr)
    .split('')
    .map(ch => bnToEnMap[ch] || ch)
    .join('');

  const match = converted.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

// Find highest existing form number across all registered players with cache resilience
export async function getMaxExistingPlayerFormNumber(): Promise<number> {
  try {
    let snap;
    try {
      snap = await getDocs(collection(db, 'players'));
    } catch (readErr) {
      if (isQuotaExceededError(readErr)) {
        snap = await getDocsFromCache(collection(db, 'players'));
      } else {
        throw readErr;
      }
    }
    let maxNum = 0;
    if (snap) {
      snap.forEach(d => {
        const data = d.data();
        const num =
          typeof data.formNumericValue === 'number' && !isNaN(data.formNumericValue)
            ? data.formNumericValue
            : parseNumericFormValue(data.formNumber);
        if (num > maxNum) maxNum = num;
      });
    }
    return maxNum;
  } catch (err) {
    // Fallback to localStorage cached players
    try {
      const cached = localStorage.getItem('tpl_cached_players');
      if (cached) {
        const list: Player[] = JSON.parse(cached);
        return list.reduce((max, p) => {
          const num =
            typeof p.formNumericValue === 'number' && p.formNumericValue > 0
              ? p.formNumericValue
              : parseNumericFormValue(p.formNumber);
          return Math.max(max, num);
        }, 0);
      }
    } catch {}
    return 0;
  }
}

// Ensure the registration settings document exists in Firestore and is synced with highest player number
export async function ensureRegistrationSettingsExists(): Promise<RegistrationSettings> {
  const settingsRef = doc(db, 'settings', 'registration');
  try {
    let snap;
    try {
      snap = await getDoc(settingsRef);
    } catch (readErr) {
      if (isQuotaExceededError(readErr)) {
        snap = await getDocFromCache(settingsRef);
      } else {
        throw readErr;
      }
    }

    if (!snap || !snap.exists()) {
      const maxExisting = await getMaxExistingPlayerFormNumber();
      const initial: RegistrationSettings = {
        ...DEFAULT_REGISTRATION_SETTINGS,
        nextFormNumber: Math.max(1, maxExisting + 1),
        lastAssignedNumber: maxExisting > 0 ? maxExisting : null,
        updatedAt: new Date().toISOString(),
        updatedBy: 'initialization',
      };
      try {
        await setDoc(settingsRef, initial, { merge: true });
      } catch (wErr) {
        console.warn('Could not write initial settings:', wErr);
      }
      try {
        localStorage.setItem('tpl_cached_settings', JSON.stringify(initial));
      } catch {}
      return initial;
    }

    const currentData = snap.data() as RegistrationSettings;
    const result = { ...DEFAULT_REGISTRATION_SETTINGS, ...currentData };
    try {
      localStorage.setItem('tpl_cached_settings', JSON.stringify(result));
    } catch {}
    return result;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      console.warn('Registration settings check: Quota limit reached, using cached settings.');
    } else {
      console.warn('Registration settings notice, using default settings:', err);
    }
    try {
      const cached = localStorage.getItem('tpl_cached_settings');
      if (cached) {
        return { ...DEFAULT_REGISTRATION_SETTINGS, ...JSON.parse(cached) };
      }
    } catch {}
    return { ...DEFAULT_REGISTRATION_SETTINGS };
  }
}

// Check if a specific form number has already been assigned to an existing player
export async function checkFormNumberConflict(
  targetNumber: number,
  seasonId?: string,
  excludePlayerId?: string
): Promise<{ hasConflict: boolean; conflictingPlayer?: Player }> {
  try {
    const targetInt = Math.floor(Number(targetNumber));
    if (isNaN(targetInt) || targetInt < 1) return { hasConflict: false };

    const playersRef = collection(db, 'players');
    const targetSeason = seasonId || 'season-2-2026';
    const q = query(playersRef, where('seasonId', '==', targetSeason));

    let snap;
    try {
      snap = await getDocs(q);
    } catch (qErr) {
      if (isQuotaExceededError(qErr)) {
        try {
          snap = await getDocsFromCache(q);
        } catch {}
      }
    }

    const bnStr = `ফরম নং:- ${toBengaliDigits(targetInt)}`;
    const bnStrNoSpace = `ফরম নং:-${toBengaliDigits(targetInt)}`;
    const enStr = `Form No. ${targetInt}`;

    if (snap && !snap.empty) {
      for (const docSnap of snap.docs) {
        if (excludePlayerId && docSnap.id === excludePlayerId) continue;
        const data = docSnap.data() as Player;
        const numericVal =
          typeof data.formNumericValue === 'number' && !isNaN(data.formNumericValue) && data.formNumericValue > 0
            ? Math.floor(data.formNumericValue)
            : parseNumericFormValue(data.formNumber);

        if (numericVal === targetInt) {
          return { hasConflict: true, conflictingPlayer: { ...data, id: docSnap.id } };
        }

        if (
          data.formNumber &&
          (data.formNumber.trim() === bnStr ||
            data.formNumber.trim() === bnStrNoSpace ||
            data.formNumber.trim() === enStr ||
            data.formNumber.trim().endsWith(` ${targetInt}`) ||
            data.formNumber.trim().endsWith(` ${toBengaliDigits(targetInt)}`) ||
            data.formNumber.trim().endsWith(`-${targetInt}`) ||
            data.formNumber.trim().endsWith(`-${toBengaliDigits(targetInt)}`))
        ) {
          return { hasConflict: true, conflictingPlayer: { ...data, id: docSnap.id } };
        }
      }
    } else {
      // Fallback: check localStorage cached players
      try {
        const cached = localStorage.getItem('tpl_cached_players');
        if (cached) {
          const list: Player[] = JSON.parse(cached);
          for (const p of list) {
            if (excludePlayerId && p.id === excludePlayerId) continue;
            if (p.seasonId && p.seasonId !== targetSeason) continue;
            const numericVal =
              typeof p.formNumericValue === 'number' && !isNaN(p.formNumericValue) && p.formNumericValue > 0
                ? Math.floor(p.formNumericValue)
                : parseNumericFormValue(p.formNumber);
            if (numericVal === targetInt) {
              return { hasConflict: true, conflictingPlayer: p };
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error('Error checking form number conflict:', err);
  }
  return { hasConflict: false };
}

// Update registration settings (Super Admin only: arifhossainbd087@gmail.com) with conflict validation
export async function updateRegistrationSettings(
  updates: Partial<RegistrationSettings>,
  adminEmail: string,
  seasonId?: string
): Promise<{ success: boolean; settings?: RegistrationSettings; error?: string }> {
  try {
    // 0. Super Admin authorization
    const cleanEmail = (adminEmail || '').trim().toLowerCase();
    if (cleanEmail !== 'arifhossainbd087@gmail.com') {
      return {
        success: false,
        error: 'শুধুমাত্র প্রধান সুপার অ্যাডমিন (arifhossainbd087@gmail.com) রেজিস্ট্রেশন ও ফরম নম্বর সেটিংস পরিবর্তন করতে পারবেন।',
      };
    }

    // 1. Validation
    if (typeof updates.startFormNumber === 'number' && updates.startFormNumber < 1) {
      return {
        success: false,
        error: 'প্রারম্ভিক ফরম নম্বর অবশ্যই ১ বা তার বেশি হতে হবে (Starting number must be >= 1).',
      };
    }

    if (typeof updates.nextFormNumber === 'number') {
      const nextNum = Math.floor(updates.nextFormNumber);
      if (nextNum < 1) {
        return {
          success: false,
          error: 'পরবর্তী ফরম নম্বর অবশ্যই ১ বা তার বেশি হতে হবে (Next number must be >= 1).',
        };
      }

      // Check for conflict with existing registrations in this tournament/season
      const targetSeason = seasonId || 'season-2-2026';
      const conflict = await checkFormNumberConflict(nextNum, targetSeason);
      if (conflict.hasConflict && conflict.conflictingPlayer) {
        return {
          success: false,
          error: `ফরম নং ${toBengaliDigits(nextNum)} (${nextNum}) ইতোমধ্যে এই সিজনে নিবন্ধিত খেলোয়াড় "${conflict.conflictingPlayer.name}" এর জন্য ব্যবহৃত হয়েছে। অনুগ্রহ করে একটি খালি নম্বর নির্বাচন করুন।`,
        };
      }
      updates.nextFormNumber = nextNum;
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
  const targetSeason = seasonId || 'season-2-2026';

  try {
    // 1. Read existing player form numbers in this season to validate uniqueness
    const occupiedNumbers = new Map<number, string>();
    const seasonQuery = query(collection(db, 'players'), where('seasonId', '==', targetSeason));
    let existingPlayersSnap;
    try {
      existingPlayersSnap = await getDocs(seasonQuery);
    } catch (readErr) {
      if (isQuotaExceededError(readErr)) {
        try {
          existingPlayersSnap = await getDocsFromCache(seasonQuery);
        } catch {}
      }
    }

    if (existingPlayersSnap && !existingPlayersSnap.empty) {
      existingPlayersSnap.forEach(d => {
        const p = d.data() as Player;
        const num =
          typeof p.formNumericValue === 'number' && !isNaN(p.formNumericValue) && p.formNumericValue > 0
            ? Math.floor(p.formNumericValue)
            : parseNumericFormValue(p.formNumber);
        if (num > 0) occupiedNumbers.set(num, p.name || 'অজ্ঞাত');
      });
    }

    // Always merge with localStorage cached players to be doubly certain
    try {
      const cached = localStorage.getItem('tpl_cached_players');
      if (cached) {
        const list: Player[] = JSON.parse(cached);
        list.forEach(p => {
          if (!targetSeason || p.seasonId === targetSeason) {
            const num =
              typeof p.formNumericValue === 'number' && !isNaN(p.formNumericValue) && p.formNumericValue > 0
                ? Math.floor(p.formNumericValue)
                : parseNumericFormValue(p.formNumber);
            if (num > 0 && !occupiedNumbers.has(num)) {
              occupiedNumbers.set(num, p.name || 'অজ্ঞাত');
            }
          }
        });
      }
    } catch {}

    let result: {
      player: Player;
      assignedFormNumber: string;
      assignedNumericValue: number;
      registrationNumber: string;
    };

    // 2. Authoritative assignment attempt
    try {
      result = await runTransaction(db, async transaction => {
        const settingsSnap = await transaction.get(settingsRef);
        let settings: RegistrationSettings;

        if (!settingsSnap.exists()) {
          settings = { ...DEFAULT_REGISTRATION_SETTINGS };
        } else {
          settings = { ...DEFAULT_REGISTRATION_SETTINGS, ...(settingsSnap.data() as RegistrationSettings) };
        }

        // Respect the exact positive integer chosen by the Super Admin without forced clamping to startFormNumber
        const requestedNumber =
          typeof settings.nextFormNumber === 'number' && settings.nextFormNumber >= 1
            ? Math.floor(settings.nextFormNumber)
            : (typeof settings.startFormNumber === 'number' && settings.startFormNumber >= 1
                ? Math.floor(settings.startFormNumber)
                : 1);

        // Validate duplicates: if requestedNumber is already occupied in this tournament/season, reject
        if (occupiedNumbers.has(requestedNumber)) {
          const conflictingName = occupiedNumbers.get(requestedNumber);
          throw new Error(
            `নির্ধারিত ফরম নং ${toBengaliDigits(requestedNumber)} (${requestedNumber}) ইতোমধ্যে এই সিজনে খেলোয়াড় "${conflictingName}" এর জন্য ব্যবহৃত হচ্ছে। অনুগ্রহ করে সুপার অ্যাডমিন সেটিংস থেকে একটি খালি ফরম নম্বর নির্ধারণ করুন।`
          );
        }

        const assignedNumber = requestedNumber;
        const formattedFormNumber = formatFormDisplay(assignedNumber, settings, 'bn');
        const serialSuffix = String(assignedNumber).padStart(3, '0');
        const regNumber = `TPL-S2-${serialSuffix}`;

        // Advance nextFormNumber to the next available unassigned positive integer
        let nextNumber = assignedNumber + 1;
        while (occupiedNumbers.has(nextNumber)) {
          nextNumber++;
        }
        const totalRegs = (settings.totalRegistrations || 0) + 1;

        // 3. Atomically advance counter in settings document
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

        // 4. Atomically write new player record
        const fullPlayer: Player = {
          ...playerPayload,
          id: playerRef.id,
          seasonId: targetSeason,
          formNumber: formattedFormNumber,
          formNumericValue: assignedNumber,
          registrationNumber: regNumber,
          createdAt: new Date().toISOString(),
        };

        transaction.set(playerRef, fullPlayer);

        // 5. Atomically record audit log
        transaction.set(auditRef, {
          seasonId: targetSeason,
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
    } catch (txnErr: any) {
      // Re-throw duplicate/validation errors so user is notified accurately
      if (txnErr?.message && /[\u0980-\u09FF]/.test(txnErr.message)) {
        throw txnErr;
      }

      // If transaction failed due to server quota limit, use resilient write mode:
      if (isQuotaExceededError(txnErr)) {
        console.warn('Transaction read blocked by daily quota. Falling back to resilient direct registration write...');
        const settings = await getRegistrationSettings();
        let requestedNumber =
          typeof settings.nextFormNumber === 'number' && settings.nextFormNumber >= 1
            ? Math.floor(settings.nextFormNumber)
            : 1;

        while (occupiedNumbers.has(requestedNumber)) {
          requestedNumber++;
        }

        const assignedNumber = requestedNumber;
        const formattedFormNumber = formatFormDisplay(assignedNumber, settings, 'bn');
        const serialSuffix = String(assignedNumber).padStart(3, '0');
        const regNumber = `TPL-S2-${serialSuffix}`;

        let nextNumber = assignedNumber + 1;
        while (occupiedNumbers.has(nextNumber)) {
          nextNumber++;
        }

        const fullPlayer: Player = {
          ...playerPayload,
          id: playerRef.id,
          seasonId: targetSeason,
          formNumber: formattedFormNumber,
          formNumericValue: assignedNumber,
          registrationNumber: regNumber,
          createdAt: new Date().toISOString(),
        };

        // Write directly using setDoc (Firestore local cache commits locally & syncs when quota resets)
        await setDoc(playerRef, fullPlayer);
        await setDoc(
          settingsRef,
          {
            ...settings,
            nextFormNumber: nextNumber,
            totalRegistrations: (settings.totalRegistrations || 0) + 1,
            lastAssignedNumber: assignedNumber,
            updatedAt: new Date().toISOString(),
            updatedBy: 'player_registration_quota_fallback',
          },
          { merge: true }
        );

        result = {
          player: fullPlayer,
          assignedFormNumber: formattedFormNumber,
          assignedNumericValue: assignedNumber,
          registrationNumber: regNumber,
        };
      } else {
        throw txnErr;
      }
    }

    // Update local cache and dispatch event so App and PlayerManagement immediately display the player
    try {
      const cached = localStorage.getItem('tpl_cached_players');
      const list: Player[] = cached ? JSON.parse(cached) : [];
      if (!list.some(p => p.id === result.player.id)) {
        list.push(result.player);
        localStorage.setItem('tpl_cached_players', JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('tpl:players-updated', { detail: list }));
      }
    } catch {}

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
      error: formatFriendlyErrorMessage(err, 'নিবন্ধন সম্পন্ন করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'),
    };
  }
}

// Update an existing player's form number (Super Admin only: arifhossainbd087@gmail.com)
export async function updatePlayerFormNumber(
  playerId: string,
  newFormNumber: number,
  seasonId: string,
  adminEmail: string
): Promise<{
  success: boolean;
  error?: string;
  updatedPlayer?: {
    formNumber: string;
    formNumericValue: number;
    registrationNumber: string;
  };
}> {
  try {
    // 1. Strict Super Admin email authorization
    const cleanEmail = (adminEmail || '').trim().toLowerCase();
    if (cleanEmail !== 'arifhossainbd087@gmail.com') {
      return {
        success: false,
        error: 'শুধুমাত্র প্রধান সুপার অ্যাডমিন (arifhossainbd087@gmail.com) খেলোয়াড়ের ফরম নম্বর পরিবর্তন করতে পারবেন।',
      };
    }

    // 2. Positive integer validation
    const intNumber = Math.floor(Number(newFormNumber));
    if (isNaN(intNumber) || intNumber < 1) {
      return {
        success: false,
        error: 'ফরম নম্বর অবশ্যই ১ বা তার বেশি ধনাত্মক পূর্ণসংখ্যা হতে হবে (উদা: ৪, ১২, ৪১)।',
      };
    }

    // 3. Duplicate check for this tournament/season
    const conflict = await checkFormNumberConflict(intNumber, seasonId, playerId);
    if (conflict.hasConflict && conflict.conflictingPlayer) {
      return {
        success: false,
        error: `ফরম নং ${toBengaliDigits(intNumber)} (${intNumber}) ইতোমধ্যে খেলোয়াড় "${conflict.conflictingPlayer.name}" এর জন্য ব্যবহৃত হয়েছে। অন্য নম্বর নির্বাচন করুন।`,
      };
    }

    // 4. Compute formatted string and registration serial number
    const settings = await getRegistrationSettings();
    const formattedFormNumber = formatFormDisplay(intNumber, settings, 'bn');
    const serialSuffix = String(intNumber).padStart(3, '0');
    const regNumber = `TPL-S2-${serialSuffix}`;

    // 5. Update player document in Firestore
    const playerRef = doc(db, 'players', playerId);
    await updateDoc(playerRef, {
      formNumber: formattedFormNumber,
      formNumericValue: intNumber,
      registrationNumber: regNumber,
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail,
    });

    // 6. Update auction board if this player is currently loaded on live auction board
    try {
      const auctionRef = doc(db, 'auction', 'current');
      const auctionSnap = await getDoc(auctionRef);
      if (auctionSnap.exists()) {
        const aData = auctionSnap.data();
        if (aData.currentPlayerId === playerId) {
          await updateDoc(auctionRef, {
            currentPlayerFormNumber: formattedFormNumber,
            currentPlayerFormNumericValue: intNumber,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (auctionErr) {
      console.warn('Could not update live auction board with player form number edit:', auctionErr);
    }

    // 7. Audit Log
    try {
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        seasonId,
        action: 'PLAYER_FORM_NUMBER_UPDATED',
        actorEmail: adminEmail,
        actorRole: 'super_admin',
        details: `খেলোয়াড় (${playerId}) এর ফরম নম্বর পরিবর্তন করে ${formattedFormNumber} (${regNumber}) করা হয়েছে।`,
        timestamp: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn('Failed to write audit log for player form number update:', auditErr);
    }

    return {
      success: true,
      updatedPlayer: {
        formNumber: formattedFormNumber,
        formNumericValue: intNumber,
        registrationNumber: regNumber,
      },
    };
  } catch (err: any) {
    console.error('Failed to update player form number:', err);
    return {
      success: false,
      error: err?.message || 'ফরম নম্বর আপডেট করতে ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
    };
  }
}
