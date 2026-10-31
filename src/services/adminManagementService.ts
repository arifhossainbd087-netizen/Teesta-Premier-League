/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { AdminRecord } from '../types';

export const PRIMARY_ADMIN_EMAIL = 'arifhossainbd087@gmail.com';

/**
 * Checks if the given email corresponds to the permanent Primary Admin.
 */
export function isPrimaryAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
}

/**
 * Validates whether the email is a syntactically valid email address.
 */
export function isValidEmailAddress(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Ensures the primary admin record exists in Firestore.
 */
export async function ensurePrimaryAdminDoc(): Promise<void> {
  try {
    const primaryDocRef = doc(db, 'admins', PRIMARY_ADMIN_EMAIL.toLowerCase());
    const snap = await getDoc(primaryDocRef);
    if (!snap.exists()) {
      await setDoc(
        primaryDocRef,
        {
          email: PRIMARY_ADMIN_EMAIL.toLowerCase(),
          role: 'primary',
          status: 'active',
          addedBy: 'system',
          addedAt: new Date().toISOString(),
          displayName: 'Primary Admin (প্রধান অ্যাডমিন)',
          notes: 'Permanent Platform Super Administrator',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  } catch (error) {
    console.warn('Could not ensure primary admin doc (may be offline or restricted):', error);
  }
}

/**
 * Fetches all authorized admins from the /admins collection in Firestore.
 * Always guarantees the primary admin is included.
 */
export async function fetchAuthorizedAdmins(): Promise<AdminRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    const list: AdminRecord[] = [];
    let hasPrimary = false;

    snap.forEach(d => {
      const data = d.data() as Partial<AdminRecord>;
      const recordEmail = (data.email || d.id).toLowerCase();
      const isPrimary = recordEmail === PRIMARY_ADMIN_EMAIL.toLowerCase();
      if (isPrimary) hasPrimary = true;

      list.push({
        id: d.id,
        email: recordEmail,
        role: isPrimary ? 'primary' : (data.role || 'admin'),
        status: data.status || 'active',
        addedBy: data.addedBy || 'system',
        addedAt: data.addedAt || new Date().toISOString(),
        displayName: data.displayName || (isPrimary ? 'প্রধান অ্যাডমিন' : 'সহকারী অ্যাডমিন'),
        notes: data.notes || '',
        updatedAt: data.updatedAt,
      });
    });

    // Ensure permanent primary admin is always in list
    if (!hasPrimary) {
      list.unshift({
        id: PRIMARY_ADMIN_EMAIL.toLowerCase(),
        email: PRIMARY_ADMIN_EMAIL.toLowerCase(),
        role: 'primary',
        status: 'active',
        addedBy: 'system',
        addedAt: new Date().toISOString(),
        displayName: 'প্রধান অ্যাডমিন (Primary Admin)',
        notes: 'স্থায়ী সুপার অ্যাডমিনিস্ট্রেটর',
      });
    }

    return list;
  } catch (error) {
    console.error('Error fetching authorized admins:', error);
    // Fallback: return permanent primary admin
    return [
      {
        id: PRIMARY_ADMIN_EMAIL.toLowerCase(),
        email: PRIMARY_ADMIN_EMAIL.toLowerCase(),
        role: 'primary',
        status: 'active',
        addedBy: 'system',
        addedAt: new Date().toISOString(),
        displayName: 'প্রধান অ্যাডমিন (Primary Admin)',
        notes: 'স্থায়ী সুপার অ্যাডমিনিস্ট্রেটর',
      },
    ];
  }
}

/**
 * Subscribes to real-time updates of authorized admins in Firestore.
 */
export function subscribeToAuthorizedAdmins(
  onUpdate: (admins: AdminRecord[]) => void,
  onError?: (error: any) => void
): () => void {
  return onSnapshot(
    collection(db, 'admins'),
    snap => {
      const list: AdminRecord[] = [];
      let hasPrimary = false;

      snap.forEach(d => {
        const data = d.data() as Partial<AdminRecord>;
        const recordEmail = (data.email || d.id).toLowerCase();
        const isPrimary = recordEmail === PRIMARY_ADMIN_EMAIL.toLowerCase();
        if (isPrimary) hasPrimary = true;

        list.push({
          id: d.id,
          email: recordEmail,
          role: isPrimary ? 'primary' : (data.role || 'admin'),
          status: data.status || 'active',
          addedBy: data.addedBy || 'system',
          addedAt: data.addedAt || new Date().toISOString(),
          displayName: data.displayName || (isPrimary ? 'প্রধান অ্যাডমিন' : 'সহকারী অ্যাডমিন'),
          notes: data.notes || '',
          updatedAt: data.updatedAt,
        });
      });

      if (!hasPrimary) {
        list.unshift({
          id: PRIMARY_ADMIN_EMAIL.toLowerCase(),
          email: PRIMARY_ADMIN_EMAIL.toLowerCase(),
          role: 'primary',
          status: 'active',
          addedBy: 'system',
          addedAt: new Date().toISOString(),
          displayName: 'প্রধান অ্যাডমিন (Primary Admin)',
          notes: 'স্থায়ী সুপার অ্যাডমিনিস্ট্রেটর',
        });
      }

      onUpdate(list);
    },
    err => {
      console.warn('Real-time admin sync error:', err);
      if (onError) onError(err);
      // Still provide primary admin
      onUpdate([
        {
          id: PRIMARY_ADMIN_EMAIL.toLowerCase(),
          email: PRIMARY_ADMIN_EMAIL.toLowerCase(),
          role: 'primary',
          status: 'active',
          addedBy: 'system',
          addedAt: new Date().toISOString(),
          displayName: 'প্রধান অ্যাডমিন (Primary Admin)',
          notes: 'স্থায়ী সুপার অ্যাডমিনিস্ট্রেটর',
        },
      ]);
    }
  );
}

/**
 * Adds an additional admin. Strictly enforced: only the primary admin may add.
 */
export async function addAuthorizedAdmin(
  newAdminEmail: string,
  currentActorEmail: string,
  notes?: string
): Promise<{ success: boolean; message: string }> {
  const actorNorm = (currentActorEmail || '').trim().toLowerCase();
  if (actorNorm !== PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('শুধুমাত্র প্রধান অ্যাডমিন (arifhossainbd087@gmail.com) নতুন অ্যাডমিন যোগ করতে পারেন।');
  }

  const targetEmail = (newAdminEmail || '').trim().toLowerCase();
  if (!targetEmail) {
    throw new Error('অনুগ্রহ করে একটি জিমেইল ঠিকানা প্রদান করুন।');
  }

  if (!isValidEmailAddress(targetEmail)) {
    throw new Error('সঠিক জিমেইল ঠিকানা লিখুন (যেমন: example@gmail.com)।');
  }

  if (targetEmail === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('এই জিমেইলটি ইতিমধ্যে স্থায়ী প্রধান অ্যাডমিন হিসেবে সংরক্ষিত আছে।');
  }

  const docRef = doc(db, 'admins', targetEmail);
  const existing = await getDoc(docRef);

  if (existing.exists() && existing.data()?.status === 'active') {
    throw new Error('এই ব্যবহারকারী ইতিমধ্যে একজন সক্রিয় অ্যাডমিন হিসেবে নিবন্ধিত আছেন।');
  }

  const newAdminData = {
    email: targetEmail,
    role: 'admin',
    status: 'active',
    addedBy: PRIMARY_ADMIN_EMAIL.toLowerCase(),
    addedAt: new Date().toISOString(),
    displayName: targetEmail.split('@')[0],
    notes: notes?.trim() || 'অনুমোদিত সহকারী অ্যাডমিন',
    updatedAt: new Date().toISOString(),
  };

  await setDoc(docRef, newAdminData, { merge: true });

  // Log to audit trail
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action: 'ADMIN_GRANTED',
      actorEmail: PRIMARY_ADMIN_EMAIL.toLowerCase(),
      actorRole: 'primary_admin',
      details: `নতুন সহকারী অ্যাডমিন যোগ করা হয়েছে: ${targetEmail}`,
      timestamp: new Date().toISOString(),
    });
  } catch (auditErr) {
    console.warn('Audit log write error:', auditErr);
  }

  return {
    success: true,
    message: 'নতুন অ্যাডমিন সফলভাবে যোগ করা হয়েছে।',
  };
}

/**
 * Removes an additional admin's authorization.
 * Strictly enforced: only the primary admin can remove, and the primary admin cannot be removed.
 */
export async function removeAuthorizedAdmin(
  adminEmailToRemove: string,
  currentActorEmail: string
): Promise<{ success: boolean; message: string }> {
  const actorNorm = (currentActorEmail || '').trim().toLowerCase();
  if (actorNorm !== PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('শুধুমাত্র প্রধান অ্যাডমিন (arifhossainbd087@gmail.com) অন্য অ্যাডমিনকে অপসারণ করতে পারেন।');
  }

  const targetEmail = (adminEmailToRemove || '').trim().toLowerCase();
  if (targetEmail === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('প্রধান অ্যাডমিনকে অপসারণ করা সম্পূর্ণ নিষিদ্ধ এবং অসম্ভব।');
  }

  const docRef = doc(db, 'admins', targetEmail);
  await deleteDoc(docRef);

  // Log to audit trail
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action: 'ADMIN_REVOKED',
      actorEmail: PRIMARY_ADMIN_EMAIL.toLowerCase(),
      actorRole: 'primary_admin',
      details: `অ্যাডমিনের অনুমতি সফলভাবে বাতিল করা হয়েছে: ${targetEmail}`,
      timestamp: new Date().toISOString(),
    });
  } catch (auditErr) {
    console.warn('Audit log write error:', auditErr);
  }

  return {
    success: true,
    message: 'অ্যাডমিনের অনুমতি সফলভাবে বাতিল করা হয়েছে।',
  };
}
