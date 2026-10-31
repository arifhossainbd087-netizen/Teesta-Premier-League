import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, isQuotaExceededError } from '../firebase/config';
import { AuctionPoster, Player, Team, Season } from '../types';
import { formatBDT } from '../utils/formatters';
import { diagnosticLogger } from '../utils/debugLogger';

export interface PosterGenerationInput {
  player: {
    id: string;
    name: string;
    banglaName?: string;
    photoUrl?: string;
    position?: string;
    category?: string;
    formNumber?: string;
    registrationNumber?: string;
  };
  status: 'sold' | 'unsold';
  finalPrice?: number | null;
  winningTeam?: {
    id: string;
    name: string;
    logoUrl?: string;
  } | null;
  season: {
    id: string;
    name: string;
    year?: number;
    code?: string;
  };
  forceRegenerate?: boolean;
}

/**
 * Helper to safely load an image with CORS handling and timeout
 */
function loadImageSafely(src: string, timeoutMs: number = 4000): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    if (!src) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let timer: NodeJS.Timeout | null = setTimeout(() => {
      timer = null;
      resolve(null);
    }, timeoutMs);

    img.onload = () => {
      if (timer) clearTimeout(timer);
      resolve(img);
    };

    img.onerror = () => {
      if (timer) clearTimeout(timer);
      // Retry without crossOrigin if external URL blocks CORS
      const fallbackImg = new Image();
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.onerror = () => resolve(null);
      fallbackImg.src = src;
    };

    img.src = src;
  });
}

/**
 * Draws rounded rectangle helper on canvas
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Core Canvas Engine: Generates High-Resolution 1080x1350 Sports Poster
 */
export async function renderPosterCanvas(input: PosterGenerationInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize 2D canvas context');

  const { player, status, finalPrice, winningTeam, season } = input;
  const isSold = status === 'sold';

  // 1. BASE BACKGROUND: Deep dramatic stadium obsidian & midnight tone
  const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
  if (isSold) {
    bgGrad.addColorStop(0, '#040d12');
    bgGrad.addColorStop(0.3, '#071f1a');
    bgGrad.addColorStop(0.7, '#051318');
    bgGrad.addColorStop(1, '#02070a');
  } else {
    bgGrad.addColorStop(0, '#120406');
    bgGrad.addColorStop(0.3, '#1f090d');
    bgGrad.addColorStop(0.7, '#140508');
    bgGrad.addColorStop(1, '#080203');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1350);

  // 2. STADIUM LIGHTING & SPOTLIGHT BEAMS
  const radialLight = ctx.createRadialGradient(540, 360, 40, 540, 360, 600);
  if (isSold) {
    radialLight.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    radialLight.addColorStop(0.5, 'rgba(20, 184, 166, 0.15)');
    radialLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    radialLight.addColorStop(0, 'rgba(239, 68, 68, 0.30)');
    radialLight.addColorStop(0.5, 'rgba(244, 63, 94, 0.12)');
    radialLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }
  ctx.fillStyle = radialLight;
  ctx.fillRect(0, 0, 1080, 900);

  // Geometric stadium speed angles
  ctx.save();
  ctx.strokeStyle = isSold ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
  ctx.lineWidth = 2;
  for (let i = -200; i < 1400; i += 120) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 300, 1350);
    ctx.stroke();
  }
  ctx.restore();

  // Subtle pitch grass grid at bottom
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let y = 1000; y < 1350; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1080, y);
    ctx.stroke();
  }
  ctx.restore();

  // 3. HEADER: Tournament Crest & League Branding
  ctx.save();
  // Gold badge pill
  drawRoundedRect(ctx, 340, 42, 400, 42, 21);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OFFICIAL AUCTION POSTER • ' + (season.code || 'TPL S2'), 540, 68);
  ctx.restore();

  // League Title
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 36px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(season.name || 'TEESTA PREMIER LEAGUE 2026', 540, 125);

  ctx.fillStyle = isSold ? '#34d399' : '#f87171';
  ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('তিস্তা প্রিমিয়ার লীগ অফিসিয়াল নিলাম কার্ড', 540, 152);

  // 4. PLAYER HERO PORTRAIT (Center Frame)
  const portraitX = 540 - 200;
  const portraitY = 185;
  const portraitWidth = 400;
  const portraitHeight = 440;

  ctx.save();
  // Shield / Card Outer Glow
  ctx.shadowColor = isSold ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)';
  ctx.shadowBlur = 35;
  drawRoundedRect(ctx, portraitX, portraitY, portraitWidth, portraitHeight, 32);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = isSold ? '#10b981' : '#ef4444';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  // Draw player photo or initial placeholder inside clip
  ctx.save();
  drawRoundedRect(ctx, portraitX, portraitY, portraitWidth, portraitHeight, 32);
  ctx.clip();

  let playerImg: HTMLImageElement | null = null;
  if (player.photoUrl) {
    playerImg = await loadImageSafely(player.photoUrl);
  }

  if (playerImg) {
    // Aspect-fit center crop
    const imgRatio = playerImg.width / playerImg.height;
    const frameRatio = portraitWidth / portraitHeight;
    let sWidth = playerImg.width;
    let sHeight = playerImg.height;
    let sx = 0;
    let sy = 0;

    if (imgRatio > frameRatio) {
      sWidth = playerImg.height * frameRatio;
      sx = (playerImg.width - sWidth) / 2;
    } else {
      sHeight = playerImg.width / frameRatio;
      sy = (playerImg.height - sHeight) / 2;
    }

    ctx.drawImage(playerImg, sx, sy, sWidth, sHeight, portraitX, portraitY, portraitWidth, portraitHeight);

    // Subtle bottom vignette over player photo for text contrast
    const photoGrad = ctx.createLinearGradient(0, portraitY + 280, 0, portraitY + portraitHeight);
    photoGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    photoGrad.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
    ctx.fillStyle = photoGrad;
    ctx.fillRect(portraitX, portraitY, portraitWidth, portraitHeight);
  } else {
    // Elegant Sports Silhouette Placeholder
    const placeGrad = ctx.createLinearGradient(portraitX, portraitY, portraitX, portraitY + portraitHeight);
    placeGrad.addColorStop(0, '#1e293b');
    placeGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = placeGrad;
    ctx.fillRect(portraitX, portraitY, portraitWidth, portraitHeight);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 120px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name.charAt(0).toUpperCase() || 'P', 540, portraitY + 220);
  }
  ctx.restore();

  // 5. PLAYER BADGES (Form Number & Position Pill)
  const badgeY = 645;
  const formText = player.formNumber || 'ফরম নং ১';
  const posText = player.position || 'খেলোয়াড়';

  ctx.save();
  // Form number pill
  drawRoundedRect(ctx, 320, badgeY, 200, 38, 19);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formText, 420, badgeY + 19);

  // Position pill
  drawRoundedRect(ctx, 560, badgeY, 200, 38, 19);
  ctx.fillStyle = isSold ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)';
  ctx.fill();
  ctx.strokeStyle = isSold ? '#10b981' : '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = isSold ? '#a7f3d0' : '#fde68a';
  ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(posText, 660, badgeY + 19);
  ctx.restore();

  // 6. PROMINENT PLAYER NAME
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 46px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 15;
  ctx.fillText(player.name, 540, 740);

  if (player.banglaName && player.banglaName !== player.name) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(player.banglaName, 540, 775);
  }

  // 7. STATUS HERO BANNER (SOLD or UNSOLD)
  const statusBannerY = 815;

  if (isSold) {
    // SOLD BANNER
    ctx.save();
    // Huge 3D Emerald / Gold SOLD Banner
    const bannerGrad = ctx.createLinearGradient(140, statusBannerY, 940, statusBannerY);
    bannerGrad.addColorStop(0, '#059669');
    bannerGrad.addColorStop(0.5, '#10b981');
    bannerGrad.addColorStop(1, '#059669');

    ctx.shadowColor = 'rgba(16, 185, 129, 0.7)';
    ctx.shadowBlur = 30;
    drawRoundedRect(ctx, 140, statusBannerY, 800, 85, 24);
    ctx.fillStyle = bannerGrad;
    ctx.fill();
    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 52px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText('★ SOLD / বিক্রিত ★', 540, statusBannerY + 42);
    ctx.restore();

    // 8. WINNING TEAM & FINAL PRICE CARD (Side-by-side or stacked prominent display)
    const cardY = 925;
    drawRoundedRect(ctx, 90, cardY, 900, 290, 28);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Left Column: Winning Team
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ক্রেতা দল (WINNING TEAM):', 130, cardY + 48);

    // Winning Team Logo & Name
    let teamImg: HTMLImageElement | null = null;
    if (winningTeam?.logoUrl) {
      teamImg = await loadImageSafely(winningTeam.logoUrl);
    }

    const teamLogoX = 130;
    const teamLogoY = cardY + 70;
    const teamLogoSize = 80;

    ctx.save();
    ctx.beginPath();
    ctx.arc(teamLogoX + teamLogoSize / 2, teamLogoY + teamLogoSize / 2, teamLogoSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.clip();

    if (teamImg) {
      ctx.drawImage(teamImg, teamLogoX, teamLogoY, teamLogoSize, teamLogoSize);
    } else {
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(winningTeam?.name?.charAt(0) || 'T', teamLogoX + teamLogoSize / 2, teamLogoY + teamLogoSize / 2);
    }
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 32px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(winningTeam?.name || 'নির্বাচিত দল', teamLogoX + teamLogoSize + 25, cardY + 120);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('অফিসিয়াল স্কোয়াড চুক্তি সম্পন্ন', teamLogoX + teamLogoSize + 25, cardY + 148);

    // Vertical Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(560, cardY + 30);
    ctx.lineTo(560, cardY + 260);
    ctx.stroke();

    // Right Column: Monumental Price Box
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('চূড়ান্ত নিলাম মূল্য (FINAL PRICE):', 590, cardY + 58);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '900 64px "Plus Jakarta Sans", sans-serif';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText(formatBDT(finalPrice || 0), 590, cardY + 145);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('নিলামে সর্বোচ্চ বিডের ভিত্তিতে নিশ্চিত', 590, cardY + 185);
  } else {
    // UNSOLD BANNER
    ctx.save();
    const bannerGrad = ctx.createLinearGradient(140, statusBannerY, 940, statusBannerY);
    bannerGrad.addColorStop(0, '#991b1b');
    bannerGrad.addColorStop(0.5, '#dc2626');
    bannerGrad.addColorStop(1, '#991b1b');

    ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
    ctx.shadowBlur = 25;
    drawRoundedRect(ctx, 140, statusBannerY, 800, 85, 24);
    ctx.fillStyle = bannerGrad;
    ctx.fill();
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 52px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText('UNSOLD / অবিক্রিত', 540, statusBannerY + 42);
    ctx.restore();

    // Unsold Notice Box
    const cardY = 930;
    drawRoundedRect(ctx, 140, cardY, 800, 240, 28);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f87171';
    ctx.font = '900 32px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('এই রাউন্ডে কোনো বৈধ ডাক পাওয়া যায়নি', 540, cardY + 80);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('পরবর্তী রাউন্ড ড্রাফটের জন্য সংরক্ষিত', 540, cardY + 130);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('খেলোয়াড় পুনরায় নিলাম বা অতিরিক্ত দলে অন্তর্ভুক্তির জন্য বিবেচনাধীন থাকবেন।', 540, cardY + 175);
  }

  // 9. FOOTER WATERMARK & AUTHENTICITY STAMP
  ctx.save();
  ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
  ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TEESTA PREMIER LEAGUE • SEASON 2 OFFICIAL PLAYER AUCTION', 540, 1275);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.font = '13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('তিস্তা প্রিমিয়ার লীগ পরিচালনা কমিটি কর্তৃক অনুমোদিত ও সংরক্ষিত', 540, 1302);
  ctx.restore();

  return canvas;
}

/**
 * Converts a Canvas to a PNG Blob
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to PNG Blob'));
      }
    }, 'image/png');
  });
}

/**
 * Generates and stores an automatic SOLD or UNSOLD Poster
 * Idempotent, safe retry, non-blocking to auction flow.
 */
export async function generateAndSavePoster(
  input: PosterGenerationInput
): Promise<{ success: boolean; poster?: AuctionPoster; error?: string }> {
  try {
    const { player, status, finalPrice, winningTeam, season, forceRegenerate } = input;
    const seasonId = season.id || 'season-2-2026';
    const timestamp = Date.now();
    const posterDocId = `${seasonId}_${player.id}_${status}`;

    // 1. Idempotency Check: if poster already exists and not forced, return existing
    if (!forceRegenerate) {
      try {
        const existingQuery = query(
          collection(db, 'posters'),
          where('playerId', '==', player.id),
          where('seasonId', '==', seasonId),
          where('status', '==', status),
          limit(1)
        );
        diagnosticLogger.queryExecuted(`posters?player=${player.id}&status=${status}`, 'getDocs');
        const snap = await getDocs(existingQuery);
        if (!snap.empty) {
          const existingData = snap.docs[0].data() as AuctionPoster;
          // If sold, check if price matches
          if (status !== 'sold' || existingData.finalPrice === finalPrice) {
            return { success: true, poster: existingData };
          }
        }
      } catch (checkErr) {
        console.warn('Idempotency check notice:', checkErr);
      }
    }

    // 2. Render Canvas
    const canvas = await renderPosterCanvas(input);
    const blob = await canvasToBlob(canvas);
    const dataUrlFallback = canvas.toDataURL('image/png', 0.92);

    let finalPosterUrl = dataUrlFallback;
    let storagePath: string | undefined = undefined;

    // 3. Upload to Firebase Storage if available
    if (storage) {
      try {
        storagePath = `posters/${seasonId}/${posterDocId}_${timestamp}.png`;
        const storageRef = ref(storage, storagePath);
        const metadata = {
          contentType: 'image/png',
          customMetadata: {
            playerId: player.id,
            playerName: player.name,
            status,
            seasonId,
          },
        };
        await uploadBytes(storageRef, blob, metadata);
        finalPosterUrl = await getDownloadURL(storageRef);
      } catch (uploadErr) {
        console.warn('Storage upload fallback to Data URL:', uploadErr);
        // Data URL fallback remains safe and high-resolution
      }
    }

    // 4. Construct Poster Entity
    const posterRecord: AuctionPoster = {
      id: posterDocId,
      playerId: player.id,
      playerName: player.name,
      playerBanglaName: player.banglaName || '',
      playerPhoto: player.photoUrl || '',
      playerPosition: player.position || '',
      playerCategory: player.category || '',
      playerFormNumber: player.formNumber || '',
      playerRegistrationNumber: player.registrationNumber || '',
      seasonId,
      seasonName: season.name || 'Teesta Premier League Season 2',
      status,
      finalPrice: status === 'sold' ? finalPrice || 0 : null,
      winningTeamId: status === 'sold' ? winningTeam?.id || null : null,
      winningTeamName: status === 'sold' ? winningTeam?.name || null : null,
      winningTeamLogo: status === 'sold' ? winningTeam?.logoUrl || null : null,
      posterUrl: finalPosterUrl,
      storagePath,
      createdAt: new Date().toISOString(),
      hidden: false,
      caption:
        status === 'sold'
          ? `🎉 [TPL SEASON 2] খেলোয়াড় ${player.name} (${player.formNumber || ''}) কে ৳${formatBDT(
              finalPrice || 0
            )} মূল্যে "${winningTeam?.name || 'দল'}" দলে আনুষ্ঠানিকভাবে নিশ্চিত করা হয়েছে! #TPL2026 #AuctionSold`
          : `⚠️ [TPL SEASON 2] খেলোয়াড় ${player.name} (${player.formNumber || ''}) অবিক্রিত (UNSOLD) হিসেবে নির্ধারিত হয়েছেন। #TPL2026 #AuctionUnsold`,
    };

    // 5. Save to Firestore `posters` collection with merge: true
    try {
      const posterDocRef = doc(db, 'posters', posterDocId);
      await setDoc(posterDocRef, posterRecord, { merge: true });
    } catch (saveErr) {
      console.warn('Firestore poster metadata save notice:', saveErr);
      // Even if Firestore save is throttled by quota, cache in localStorage
      try {
        const cached = localStorage.getItem('tpl_cached_posters');
        const list: AuctionPoster[] = cached ? JSON.parse(cached) : [];
        const filtered = list.filter(p => p.id !== posterDocId);
        filtered.unshift(posterRecord);
        localStorage.setItem('tpl_cached_posters', JSON.stringify(filtered.slice(0, 30)));
      } catch {}
    }

    return { success: true, poster: posterRecord };
  } catch (err: any) {
    console.error('Poster generation error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'পোস্টার তৈরিতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Subscribes to the posters collection in Firestore with caching & quota resiliency
 */
export function subscribeToPosters(
  seasonId: string,
  callback: (posters: AuctionPoster[]) => void
): () => void {
  // Read local cache first for instant display
  try {
    const cached = localStorage.getItem('tpl_cached_posters');
    if (cached) {
      callback(JSON.parse(cached));
    }
  } catch {}

  const posterQuery = query(
    collection(db, 'posters'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );

  const listenerId = diagnosticLogger.listenerAttached('posters');

  const unsubscribe = onSnapshot(
    posterQuery,
    snap => {
      const list: AuctionPoster[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });

      // Filter by season if provided
      const filtered = seasonId ? list.filter(p => !p.seasonId || p.seasonId === seasonId) : list;
      callback(filtered);

      // Cache lightweight version
      try {
        localStorage.setItem('tpl_cached_posters', JSON.stringify(filtered.slice(0, 50)));
      } catch {}
    },
    error => {
      if (isQuotaExceededError(error)) {
        try {
          const cached = localStorage.getItem('tpl_cached_posters');
          if (cached) {
            callback(JSON.parse(cached));
          }
        } catch {}
      }
      console.warn('Posters subscription notice:', error);
    }
  );

  return () => {
    diagnosticLogger.listenerDetached(listenerId);
    unsubscribe();
  };
}

/**
 * Admin Action: Toggle hidden state of a poster
 */
export async function togglePosterVisibility(
  posterId: string,
  hidden: boolean,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    const docRef = doc(db, 'posters', posterId);
    await updateDoc(docRef, {
      hidden,
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail,
    });
    return {
      success: true,
      message: hidden ? 'পোস্টারটি গ্যালারি থেকে লুকানো হয়েছে।' : 'পোস্টারটি গ্যালারিতে দৃশ্যমান করা হয়েছে।',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'স্ট্যাটাস পরিবর্তনে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Admin Action: Delete a poster from Firestore & Storage
 */
export async function deletePoster(
  poster: AuctionPoster,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Delete Firestore record
    const docRef = doc(db, 'posters', poster.id);
    await deleteDoc(docRef);

    // Delete Storage file if path exists
    if (storage && poster.storagePath) {
      try {
        const fileRef = ref(storage, poster.storagePath);
        await deleteObject(fileRef);
      } catch (stErr) {
        console.warn('Storage file deletion notice:', stErr);
      }
    }

    return {
      success: true,
      message: 'পোস্টারটি সফলভাবে মুছে ফেলা হয়েছে।',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'পোস্টার মুছতে ত্রুটি হয়েছে',
    };
  }
}

/**
 * Trigger browser file download of high-res poster image
 */
export async function downloadPosterImage(poster: AuctionPoster): Promise<void> {
  try {
    const filename = `TPL_S2_${poster.status.toUpperCase()}_${poster.playerName.replace(/\s+/g, '_')}.png`;

    // If it's a remote URL, fetch as blob to force download
    if (poster.posterUrl.startsWith('http')) {
      try {
        const response = await fetch(poster.posterUrl);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        return;
      } catch {
        // Fallback to direct anchor download
      }
    }

    const a = document.createElement('a');
    a.href = poster.posterUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('Download error:', err);
    window.open(poster.posterUrl, '_blank');
  }
}

/**
 * Social media share using Web Share API or copy link
 */
export async function sharePoster(
  poster: AuctionPoster
): Promise<{ method: 'native' | 'clipboard' | 'download_only'; message: string }> {
  const shareText =
    poster.caption ||
    `[TPL SEASON 2] ${poster.playerName} - ${poster.status === 'sold' ? `SOLD (${formatBDT(poster.finalPrice || 0)})` : 'UNSOLD'}`;

  // Check if Web Share API with files or URL is supported
  if (navigator.share) {
    try {
      // Attempt file share if blob available
      if (poster.posterUrl.startsWith('data:image/png')) {
        const res = await fetch(poster.posterUrl);
        const blob = await res.blob();
        const file = new File([blob], `${poster.playerName}_poster.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `TPL Season 2 - ${poster.playerName}`,
            text: shareText,
            files: [file],
          });
          return { method: 'native', message: 'সফলভাবে সোশ্যাল মিডিয়ায় শেয়ার করা হয়েছে!' };
        }
      }

      await navigator.share({
        title: `TPL Season 2 - ${poster.playerName}`,
        text: shareText,
        url: poster.posterUrl.startsWith('http') ? poster.posterUrl : window.location.href,
      });
      return { method: 'native', message: 'সফলভাবে শেয়ার করা হয়েছে!' };
    } catch (shareErr) {
      if ((shareErr as Error)?.name === 'AbortError') {
        return { method: 'native', message: 'শেয়ার বাতিল করা হয়েছে' };
      }
    }
  }

  // Fallback to Clipboard copy
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(
        `${shareText}\n\nপোস্টার দেখুন: ${poster.posterUrl.startsWith('http') ? poster.posterUrl : window.location.href}`
      );
      return {
        method: 'clipboard',
        message: 'শেয়ারিং টেক্সট ও লিংক ক্লিপবোর্ডে কপি হয়েছে! ফেসবুক বা অন্যান্য প্ল্যাটফর্মে পেস্ট করতে পারেন।',
      };
    } catch {}
  }

  return {
    method: 'download_only',
    message: 'পোস্টারটি ডাউনলোড করে সরাসরি ফেসবুকে পোস্ট করুন।',
  };
}
