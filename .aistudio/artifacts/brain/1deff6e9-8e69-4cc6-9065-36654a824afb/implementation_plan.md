# Implementation Plan: Visual Page Editor & Website Customizer for TPL S2

## 1. User Journey Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ADMIN CUSTOMIZER WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

 [ Authorized Admin Sign-in ] ────► [ Admin Panel / Customizer Tab ]
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
       [ Page Selector Dropdown ]                           [ Section Manager Panel ]
       • Live Auction Room (Redesigned Stadium Display)     • Reorder Sections (Up/Down)
       • Players & Draft Pool                               • Show / Hide Toggles
       • Teams & Budget Tracker                             • Add Reusable Sections
       • Registration Form No. 13 (Form No. 1 Start)        • Mobile vs Desktop Tweaks
       • Rules & League Info                                        │
       • Matches & Points Table                                     ▼
       • Admin Dashboard & Notice                      [ Visual Attribute Controls ]
                    │                                  • Headings, Subtitles, Badges
                    ▼                                  • Button Text (e.g. 'শেষ ডাক!')
       [ Dynamic Live Preview Canvas ]                 • Colors, Accents, Card Styles
       • Side-by-side or Floating Drawer               • Typography, Font Size, Spacing
       • Live toggle (Desktop / Mobile view)           • Photo Placement & Size
       • Stadium Projector / Fullscreen Mode                        │
                    │                                               ▼
                    └──────────────────────────────────► [ Version & Publish Bar ]
                                                         • Save Draft (to Firestore / Local)
                                                         • Discard / Restore Revisions
                                                         • Publish Live to Users (`settings/auctionDisplay`)
```

---

## Completed: TPL Season 2 Live Auction Display Redesign & Admin Customizer
- **Stadium-Grade Reference Display**:
  - Prominent Player Portrait Card on the left with high-resolution photo, form number badge (e.g. "ফরম নং ১"), category badge, and registration ID.
  - Large-format typography for Current Highest Bid (`formatBDT(currentBid)`) engineered for distance legibility on large screens/projectors (customizable from Large up to Monumental 8xl).
  - Prominent Leading Team card displaying team logo/crest, team name, and remaining budget (`formatBDT(remainingBudget)`).
  - Real-time countdown timer synchronized with Firestore `timerExpiresAt` with urgent pulsating "শেষ ডাক! / LAST CALL!" warning at $\le 5$ seconds.
  - Master hammer controls ("শেষ ডাক! - বিক্রিত ও পরবর্তী খেলোয়াড়") with atomic transaction processing, budget reduction, and auto-advancement.
  - Theater/Projector mode toggle for full-screen stadium and LED presentations without navigation clutter.
- **Admin Customizer Panel (`AuctionDisplayCustomizerModal.tsx`)**:
  - Photo size & placement (Left, Center, Split; Normal, Large, Extra Large, Full Height).
  - Toggles for display fields (Form Number, Player ID, Position, Category, Age, Base Price, Min Step, Area, Previous Club).
  - Theme presets (Dark Stadium, Midnight Navy, Emerald Glow, Onyx Gold, Deep Slate) & Accent color palette.
  - Section visibility controls (Bids Feed, Teams Purse, Quick Bid Console, Rules Notice, Projector Watermark).
  - Real-time live preview, Save Draft, and Publish to Firestore (`settings/auctionDisplay`).

---

## Completed: Admin-Controlled Form Number Editing & Sequential Control
- **Super Admin Form Number Editing (`arifhossainbd087@gmail.com`)**:
  - Direct edit icon beside player form number badge on each player card in `PlayerManagement.tsx`.
  - Dedicated `FormNumberEditModal` displaying player portrait, name, current form number, and positive integer input.
  - Also directly editable inside standard Player Edit modal for Super Admin.
  - Strict duplicate checking within the tournament/season preventing two players from having the same number.
  - Real-time synchronization to Firestore `players` document, `auction/current` board, and audit logging.
- **Super Admin Manual Sequential Control & Unused Number Reuse**:
  - Removed unwanted `maxExisting + 1` auto-overwrite in `ensureRegistrationSettingsExists()` so values configured by Super Admin (e.g. 3, 8, 41, 50) persist reliably across reloads.
  - Registration transaction validates duplicates against active season players and assigns the exact requested candidate when available.
  - Automatically advances to `assignedNumber + 1` sequentially.
  - Supports reusing numbers released from player deletions without rejecting gaps.


---

## 2. Layout, Visual Styling & Theme System

### Visual Palette & Design System
- **Dominant Neutral (60%)**: Deep rich obsidian `#030712` (slate-950) with subtle slate-900 `#0f172a` surfaces.
- **Structural Surfaces (30%)**: Hairline borders (`border-slate-800`), clean 1px card separators, and crisp neutral card backgrounds with zero visual clutter.
- **High-Intent Accents (10%)**:
  - Emerald `#10B981` (primary action points, live statuses, published badge).
  - Amber `#F59E0B` (draft indicators, warnings, countdown highlights).
  - Indigo/Purple `#8B5CF6` (admin customizer toolbar and control handles).
  - Rose `#EF4444` (unsold status, discard drafts, access restrictions).

### Typography Hierarchy
- **Display & Headings**: `Plus Jakarta Sans` / `Outfit` (`text-xl` to `text-3xl`, font-bold, `tracking-tight`).
- **Body & Controls**: `Plus Jakarta Sans` / `DM Sans` (`text-xs` to `text-sm`, leading-relaxed).
- **Telemetry & Financial Figures**: Strict tabular numerals (`font-mono tabular-nums`) for all countdowns, auction bids, team budgets, and registration fees.

### Editor Interface Experience
- **Split Workspace**: Left-side configuration inspector drawer (320px–380px) and right-side interactive preview canvas with instant hot-reloading of visual styles.
- **Device Viewport Toggle**: Switch instantly between **Desktop (1440px wide canvas)** and **Mobile (375px phone screen frame)** to ensure flawless responsive rendering.
- **Section Drag & Ordering**: Reorder visual blocks (e.g. Hero Banner, Bidding Console, Hammer Controls, Recent Bids Feed, Rules Strip) via intuitive move controls and visibility toggles.

---

## 3. System Architecture & Data Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYSTEM ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────┘

                 ┌──────────────────────────────────────────┐
                 │       Authorized Platform Admin          │
                 └────────────────────┬─────────────────────┘
                                      │
                                      ▼
                ┌───────────────────────────────────────────┐
                │        PageCustomizerContext.tsx          │
                │  - Current Active Config (Published)      │
                │  - Draft Working Config (Local/Draft doc) │
                │  - Preview Mode Toggle (Live vs Draft)    │
                │  - Version History & Restore API          │
                └─────────────────────┬─────────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
┌────────────────────────┐                             ┌────────────────────────┐
│  Cloud Firestore Docs  │                             │   Client Rendering     │
│  • settings/customizer │◄── Published live config ───┤   Components:          │
│  • customizer/draft    │◄── Working draft config     │   • Header.tsx         │
│  • customizerRevisions │◄── Version history stack    │   • LiveAuctionRoom    │
└────────────────────────┘                             │   • PlayerRegistration │
                                                       │   • TeamManagement     │
                                                       │   • FeeAndRefundReport │
                                                       │   • TournamentMatches  │
                                                       └────────────────────────┘
```

### Firestore Schema Specification

#### Document: `settings/customizer` (Published Configuration)
```typescript
interface PageCustomizerConfig {
  version: number;
  updatedAt: string;
  updatedBy: string;
  theme: {
    primaryColor: string;       // e.g. '#10b981'
    accentColor: string;        // e.g. '#8b5cf6'
    surfaceColor: string;       // e.g. '#0f172a'
    borderRadius: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    fontSizeScale: 'compact' | 'normal' | 'comfortable';
  };
  pages: {
    auction: {
      title: string;
      subtitle: string;
      finalCallButtonLabel: string;        // 'শেষ ডাক!' or customizable
      finalCallButtonStyle: 'gradient' | 'solid' | 'neon';
      showRecentBidsFeed: boolean;
      showQuickBidButtons: boolean;
      quickBidValues: [number, number, number]; // [20, 40, 50]
      playerCardLayout: 'standard' | 'compact' | 'expanded';
      sectionsOrder: string[];             // ['playerCard', 'biddingConsole', 'recentBids', 'rules']
      sectionsVisibility: Record<string, boolean>;
    };
    players: {
      title: string;
      subtitle: string;
      showCategoryFilter: boolean;
      showPositionBadges: boolean;
      sectionsVisibility: Record<string, boolean>;
    };
    teams: {
      title: string;
      subtitle: string;
      showBudgetBars: boolean;
      sectionsVisibility: Record<string, boolean>;
    };
    registration: {
      formTitle: string;
      formSubtitle: string;
      noticeText: string;
      submitButtonText: string;
      showPhotoUpload: boolean;
      showPreviousClub: boolean;
    };
    rules: {
      title: string;
      content: string;
    };
    matches: {
      title: string;
      subtitle: string;
      showVenue: boolean;
      showGoalScorers: boolean;
    };
  };
}
```

---

## 4. Protected Business Logic & Security Boundary

To satisfy **Requirement 4 (Protect Critical Operations)**:
1. **Zero Coupling to Financial or Auction Logic**:
   - Changing the "শেষ ডাক!" button label, font, or color will **only** alter display properties. The underlying transaction logic in `executeFinalCallAndAdvance` remains authoritative, atomic, and immutable.
   - Quick Bid button labels and styling are decoupled from Firestore bid validations (`bidAmount < currentHighest + minStep`, `bidAmount > remainingBudget`).
   - Registration fee numerical values and team budget calculations are strictly governed by `seasons/{seasonId}` and cannot be modified via purely visual styling edits.
2. **Access Control**:
   - Only users with verified `isAdmin === true` can access the Page Customizer and edit settings.
   - Non-admin visitors and team managers receive read-only rendering of the published configuration.
3. **Draft Safety & Fallback**:
   - If no custom configuration exists, the app seamlessly falls back to the current default styling without breaking.
   - Draft changes are isolated so admins can experiment safely without affecting live spectators.

---

## 5. Verification Plan & Test Strategy

### Automated Verification
- Script `scripts/test-customizer-config.ts` verifying:
  1. Default configuration fallback sanity.
  2. Draft save and publish persistence in Firestore.
  3. Reversion to previous version stack.
  4. Separation of visual properties from atomic bid transactions.
- TypeScript check (`npm run lint` / `tsc --noEmit`) with 0 errors.
- Vite production build (`npm run build`) verification.

### Manual & Interactive Validation
1. Open Admin Control Center ➔ Switch to Website Customizer tab.
2. Edit "শেষ ডাক!" button label (e.g., test change to "শেষ ডাক! (SOLD/ADVANCE)").
3. Toggle section visibility and reorder Live Auction blocks.
4. Toggle Desktop vs Mobile preview canvas.
5. Save as draft ➔ Verify spectator view remains unchanged.
6. Click Publish ➔ Verify changes apply to live page.
7. Click "Restore Default / Previous Revision" ➔ Confirm clean restoration.

---

## 6. Resolved Runtime & Permission Fixes
- **Audit Logs Listener Protection**: Resolved runtime Firestore permission error (`Missing or insufficient permissions` on path `auditLogs`). App.tsx now checks `isAdmin` prior to attaching `onSnapshot` query subscriptions on `auditLogs`. Unauthenticated visitors and general spectators are safeguarded from querying admin-restricted collections.

---

## 7. Completed: Public Auction Player Visibility Fix
- **Root Cause Identified**:
  - `LiveAuctionRoom.tsx` & `ProjectorAuctionBoard.tsx` formerly looked up the active player solely within `approvedPlayers` (`players.filter(p => p.seasonId === currentSeasonId && p.approvalStatus === 'approved')`).
  - When an admin staged a player who was still pending approval or registered under an unassigned season (e.g., DEMO `TPL-S2-103`), the public spectator view failed the lookup and showed "নিলাম স্টেজে কোনো খেলোয়াড় নেই".
  - Additionally, spectator clients were not auto-syncing their active season when the committee loaded a player belonging to a specific season ID.
- **Resolution**:
  - Automatically synchronize public viewer `currentSeasonId` to `auctionState.seasonId` whenever an auction player is on stage.
  - Persisted authoritative display values `currentPlayerFormNumber` and `currentPlayerRegistrationNumber` directly on `auction/current`.
  - Added comprehensive fallback: `approvedPlayers.find(...) || allPlayers.find(...) || fallback to auctionState fields`.
  - Both Public View and Fullscreen Projector Board now immediately render the identical active player card as the Admin Preview.

---

## 8. Completed: Overall Auction Time Limit System
- **Mandatory Per-Player Countdown Removed**:
  - Eliminated automatic countdown expiration and forced per-player timer cutoffs.
  - Replaced with admin-controlled **Overall Auction Timer** with persistent Firebase state (`overallDurationSeconds`, `overallTimerExpiresAt`, `overallTimerRemaining`, `overallTimerStatus`).
- **Synchronized Shared Countdown Across Devices**:
  - Shared server-time reference calculation ensuring all devices (Admin, Projector, Public Spectators, Team Managers) display the exact same remaining time.
  - Admin controls: Start ("নিলাম শুরু করুন"), Pause ("বিরতি"), and Resume ("পুনরায় শুরু").
  - Presets: ১০ মিনিট (600s), ৩০ মিনিট (1800s), ১ ঘণ্টা (3600s), and custom duration input in minutes (1–480 min).
- **Time Expiration & Manual Committee Finalization**:
  - When overall time expires, all bids are immediately blocked across all clients, displaying: `"⚠️ নিলামের সময় সমাপ্ত হয়েছে। আর কোনো নতুন ডাক গ্রহণ করা হবে না।"`.
  - Automatic sold is strictly prohibited; the authorized admin executes manual final calls:
    - `"শেষ ডাক! (বিক্রিত ঘোষণা)"` if valid bids were received.
    - `"অবিক্রিত ঘোষণা"` (UNSOLD) if no bids were received.
  - Committee can safely clean accidental bids (`"ক্লিন / বিড রিসেট"` or `"ক্লিন / রি-অকশন রিসেট"`) which restores team purse balances and squad counts exactly once.
