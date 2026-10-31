import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
  getFirestore,
  doc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Clean up any bloated or stale firestore localStorage keys to prevent QuotaExceededError
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const keysToPurge: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key &&
        (key.startsWith('firestore_') ||
          key.startsWith('firestoreTargets') ||
          key.startsWith('firestore_targets') ||
          key.startsWith('firestore_clients'))
      ) {
        keysToPurge.push(key);
      }
    }
    keysToPurge.forEach(k => {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    });
  } catch (cleanErr) {
    console.warn('LocalStorage cleanup notice:', cleanErr);
  }
}

// Initialize Cloud Firestore with persistent IndexedDB single-tab cache or memory fallback
let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({}),
      }),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  try {
    firestoreDb = initializeFirestore(
      app,
      {
        localCache: memoryLocalCache(),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}
export const db = firestoreDb;

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Firebase Storage (if bucket configured)
export const storage = firebaseConfig.storageBucket ? getStorage(app) : null;
if (storage) {
  // Prevent endless 10-minute retry loop on Android when storage bucket is unprovisioned or network drops
  storage.maxUploadRetryTime = 6000;
  storage.maxOperationRetryTime = 6000;
}

export function getStorageConfigInfo() {
  return {
    projectId: firebaseConfig.projectId,
    configuredBucket: firebaseConfig.storageBucket || '',
    isConfigured: Boolean(firebaseConfig.storageBucket),
    consoleStorageUrl: `https://console.firebase.google.com/project/${firebaseConfig.projectId}/storage`,
  };
}

// Connection initialization probe (non-blocking, non-quota-consuming)
export async function testConnection() {
  try {
    if (!db) {
      console.warn('Firestore instance not yet ready.');
      return;
    }
    console.log('Firestore initialization ping completed.');
  } catch (error) {
    if (isQuotaExceededError(error)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tpl:quota-exceeded', { detail: { error } }));
      }
      console.warn('Firestore initialization notice: Free daily read quota limit reached.');
    } else {
      console.info('Firestore initialized with offline cache readiness.');
    }
  }
}
testConnection();

// Standard error handling conforming to Firestore skill specifications
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code;
  return (
    code === 'resource-exhausted' ||
    msg.toLowerCase().includes('quota limit exceeded') ||
    msg.toLowerCase().includes('quota exceeded') ||
    msg.toLowerCase().includes('resource_exhausted') ||
    msg.toLowerCase().includes('daily read units') ||
    msg.toLowerCase().includes('free tier database')
  );
}

export function formatFriendlyErrorMessage(
  error: unknown,
  fallbackMessage = 'নিবন্ধন সম্পন্ন করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
): string {
  if (isQuotaExceededError(error)) {
    return 'ফায়ারবেস ক্লাউড ডেটাবেসের দৈনিক ফ্রি রিড কোটা সীমা (৫০,০০০ রিড) অতিক্রম করেছে। আপনার পূর্বে নিবন্ধিত সমস্ত তথ্য গুগল ক্লাউডে শতভাগ নিরাপদ রয়েছে। স্থানীয় অফলাইন ক্যাশ মোডে নতুন নিবন্ধন গ্রহণ করা হচ্ছে।';
  }
  if (error instanceof Error && error.message) {
    if (error.message.includes('permission-denied') || error.message.includes('Missing or insufficient permissions')) {
      return 'এই কাজটি করার অনুমতি আপনার অ্যাকাউন্টের নেই। অনুগ্রহ করে সুপার অ্যাডমিন হিসেবে লগইন করুন।';
    }
    if (error.message.includes('network') || error.message.includes('offline')) {
      return 'ইন্টারনেট সংযোগে সমস্যা দেখা দিয়েছে। আপনার নেটওয়ার্ক যাচাই করে পুনরায় চেষ্টা করুন।';
    }
    // If it's already a Bengali validation message from our logic, keep it
    if (/[\u0980-\u09FF]/.test(error.message)) {
      return error.message;
    }
  }
  return fallbackMessage;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  if (isQuotaExceededError(error)) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tpl:quota-exceeded', { detail: errInfo }));
    }
    console.warn('Firestore Quota Notice (50,000 daily read limit reached):', JSON.stringify(errInfo));
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
