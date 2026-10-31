/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { AuctionDisplayConfig } from '../types';

export const DEFAULT_AUCTION_DISPLAY_CONFIG: AuctionDisplayConfig = {
  photoPlacement: 'left',
  photoSize: 'xlarge',
  photoBorderAccent: true,

  visibleFields: {
    formNumber: true,
    playerId: true,
    position: true,
    category: true,
    age: true,
    basePrice: true,
    minIncrement: true,
    area: true,
    prevClub: true,
  },

  themeMode: 'dark-stadium',
  accentColor: 'emerald',
  fontScale: 'large',
  bidTypographySize: 'jumbo',

  layoutAlignment: 'balanced',
  containerSpacing: 'comfortable',

  teamLogoPlacement: 'prominent-badge',
  countdownStyle: 'digital-clock',

  showBidsFeed: true,
  showTeamsPurse: true,
  showQuickBidButtons: true,
  showRulesCard: true,
  showProjectorWatermark: true,

  isPublished: true,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};

const LOCAL_STORAGE_KEY = 'tpl_auction_display_config';

/**
 * Loads the current auction display configuration from Firestore or local storage.
 */
export async function getAuctionDisplayConfig(): Promise<AuctionDisplayConfig> {
  try {
    const docRef = doc(db, 'settings', 'auctionDisplay');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as AuctionDisplayConfig;
      // Merge with defaults in case new fields were added
      const merged: AuctionDisplayConfig = {
        ...DEFAULT_AUCTION_DISPLAY_CONFIG,
        ...data,
        visibleFields: {
          ...DEFAULT_AUCTION_DISPLAY_CONFIG.visibleFields,
          ...(data.visibleFields || {}),
        },
      };
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
      return merged;
    }
  } catch (err) {
    console.warn('Could not read auctionDisplay setting from Firestore, falling back to local storage:', err);
  }

  // Fallback to local storage if available
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (local) {
      return JSON.parse(local);
    }
  } catch {
    // ignore
  }

  return DEFAULT_AUCTION_DISPLAY_CONFIG;
}

/**
 * Saves or publishes auction display configuration to Firestore and local storage.
 */
export async function saveAuctionDisplayConfig(
  config: AuctionDisplayConfig,
  adminEmail: string,
  publishToFirestore: boolean = true
): Promise<{ success: boolean; message: string }> {
  const updated: AuctionDisplayConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
    updatedBy: adminEmail,
    isPublished: publishToFirestore,
  };

  // Always save locally so preview & offline state is immediate
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save to local storage', e);
  }

  if (publishToFirestore) {
    try {
      const docRef = doc(db, 'settings', 'auctionDisplay');
      await setDoc(docRef, updated, { merge: true });
      return {
        success: true,
        message: 'ডিসপ্লে কনফিগারেশন ক্লাউডে সফলভাবে প্রকাশিত হয়েছে।',
      };
    } catch (err: any) {
      console.error('Failed to save auction display settings to Firestore:', err);
      return {
        success: false,
        message: err?.message || 'ক্লাউডে ডিসপ্লে সেটিংস সংরক্ষণে ত্রুটি হয়েছে।',
      };
    }
  }

  return {
    success: true,
    message: 'ড্রাফট হিসেবে লোকাল প্রিভিউতে সংরক্ষিত হয়েছে।',
  };
}

/**
 * Listens to realtime updates to the auction display configuration from Firestore.
 */
export function listenToAuctionDisplayConfig(
  callback: (config: AuctionDisplayConfig) => void
): () => void {
  const docRef = doc(db, 'settings', 'auctionDisplay');

  const unsubscribe = onSnapshot(
    docRef,
    docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AuctionDisplayConfig;
        const merged: AuctionDisplayConfig = {
          ...DEFAULT_AUCTION_DISPLAY_CONFIG,
          ...data,
          visibleFields: {
            ...DEFAULT_AUCTION_DISPLAY_CONFIG.visibleFields,
            ...(data.visibleFields || {}),
          },
        };
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // ignore
        }
        callback(merged);
      } else {
        // Fall back to local storage or defaults
        try {
          const local = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (local) {
            callback(JSON.parse(local));
            return;
          }
        } catch {
          // ignore
        }
        callback(DEFAULT_AUCTION_DISPLAY_CONFIG);
      }
    },
    error => {
      console.warn('auctionDisplay subscription error, using local fallback:', error);
      try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (local) {
          callback(JSON.parse(local));
          return;
        }
      } catch {
        // ignore
      }
      callback(DEFAULT_AUCTION_DISPLAY_CONFIG);
    }
  );

  return unsubscribe;
}
