/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, getDocFromCache, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { db, isQuotaExceededError } from '../firebase/config';
import { TeamLineup, Team, Player, PlayerPosition } from '../types';

/**
 * Default formation structure helper
 */
export function getFormationSlots(formation: string): { gk: number; def: number; mid: number; fwd: number } {
  switch (formation) {
    case '4-3-3':
      return { gk: 1, def: 4, mid: 3, fwd: 3 };
    case '4-4-2':
      return { gk: 1, def: 4, mid: 4, fwd: 2 };
    case '3-4-3':
      return { gk: 1, def: 3, mid: 4, fwd: 3 };
    case '3-5-2':
      return { gk: 1, def: 3, mid: 5, fwd: 2 };
    case '4-2-3-1':
      return { gk: 1, def: 4, mid: 5, fwd: 1 };
    case '5-3-2':
      return { gk: 1, def: 5, mid: 3, fwd: 2 };
    default:
      // Adaptive default
      return { gk: 1, def: 4, mid: 3, fwd: 3 };
  }
}

/**
 * Fetch lineup from Firestore for a specific team with resilient cache fallback
 */
export async function getTeamLineup(teamId: string): Promise<TeamLineup | null> {
  try {
    const docRef = doc(db, 'teamLineups', teamId);
    let snap;
    try {
      snap = await getDoc(docRef);
    } catch (readErr) {
      if (isQuotaExceededError(readErr)) {
        snap = await getDocFromCache(docRef);
      } else {
        throw readErr;
      }
    }
    if (snap && snap.exists()) {
      const data = snap.data() as TeamLineup;
      try {
        localStorage.setItem(`tpl_cached_lineup_${teamId}`, JSON.stringify(data));
      } catch {}
      return data;
    }
    return null;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      try {
        const cached = localStorage.getItem(`tpl_cached_lineup_${teamId}`);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    console.warn('Notice reading team lineup:', error);
    return null;
  }
}

/**
 * Real-time listener for team lineup with offline cache recovery
 */
export function listenToTeamLineup(
  teamId: string,
  callback: (lineup: TeamLineup | null) => void
): () => void {
  const docRef = doc(db, 'teamLineups', teamId);

  // Check initial cache first so UI renders immediately
  try {
    const cached = localStorage.getItem(`tpl_cached_lineup_${teamId}`);
    if (cached) {
      callback(JSON.parse(cached));
    }
  } catch {}

  return onSnapshot(
    docRef,
    docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data() as TeamLineup;
        try {
          localStorage.setItem(`tpl_cached_lineup_${teamId}`, JSON.stringify(data));
        } catch {}
        callback(data);
      } else {
        callback(null);
      }
    },
    error => {
      if (isQuotaExceededError(error)) {
        try {
          const cached = localStorage.getItem(`tpl_cached_lineup_${teamId}`);
          if (cached) {
            callback(JSON.parse(cached));
            return;
          }
        } catch {}
      }
      console.warn('Real-time lineup subscription notice:', error);
    }
  );
}

/**
 * Save lineup configuration in Firestore
 */
export async function saveTeamLineup(
  lineup: TeamLineup,
  adminEmail: string = 'admin'
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'teamLineups', lineup.teamId);
    const payload: TeamLineup = {
      ...lineup,
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail,
    };
    await setDoc(docRef, payload, { merge: true });

    // Update local cache immediately
    try {
      localStorage.setItem(`tpl_cached_lineup_${lineup.teamId}`, JSON.stringify(payload));
    } catch {}

    // Record Audit Log
    try {
      const auditRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditRef, {
        seasonId: lineup.seasonId || 'season-2-2026',
        action: 'TEAM_LINEUP_UPDATED',
        actorEmail: adminEmail,
        actorRole: 'admin',
        details: `দল (${lineup.teamId}) এর স্কোয়াড লাইনআপ সফলভাবে হালনাগাদ করা হয়েছে (ফর্মেশন: ${lineup.formation})`,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return { success: true };
  } catch (err: any) {
    console.error('Error saving team lineup:', err);
    return {
      success: false,
      error: err?.message || 'লাইনআপ সংরক্ষণ করতে ব্যর্থ হয়েছে।',
    };
  }
}

/**
 * Auto-generate an initial tactical lineup based on actual assigned squad players
 */
export function buildDefaultLineup(team: Team, teamPlayers: Player[]): TeamLineup {
  // Sort players by position priority: GK first, then Defenders, Midfielders, Forwards
  const positionWeight: Record<PlayerPosition, number> = {
    Goalkeeper: 0,
    Defender: 1,
    Midfielder: 2,
    Forward: 3,
  };

  const sorted = [...teamPlayers].sort((a, b) => {
    const wA = positionWeight[a.position] ?? 2;
    const wB = positionWeight[b.position] ?? 2;
    return wA - wB;
  });

  // Pick up to 11 players for Starting XI, rest for bench
  const startingXI = sorted.slice(0, 11);
  const bench = sorted.slice(11);

  return {
    teamId: team.id,
    seasonId: team.seasonId || 'season-2-2026',
    formation: '4-3-3',
    startingPlayerIds: startingXI.map(p => p.id),
    benchPlayerIds: bench.map(p => p.id),
    captainId: startingXI[0]?.id || null,
    viceCaptainId: startingXI[1]?.id || null,
    managerName: team.ownerName || 'টিম ম্যানেজার',
    posterTitle: `${team.name} Squad Lineup`,
    customPositions: {},
    customNames: {},
    customPhotos: {},
    customOrder: startingXI.map(p => p.id),
    updatedAt: new Date().toISOString(),
    updatedBy: 'initial_build',
  };
}
