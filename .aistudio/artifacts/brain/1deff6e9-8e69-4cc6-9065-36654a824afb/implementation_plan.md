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
       • Live Auction Room                                  • Reorder Sections (Up/Down)
       • Players & Draft Pool                               • Show / Hide Toggles
       • Teams & Budget Tracker                             • Add Reusable Sections
       • Registration Form No. 13                           • Mobile vs Desktop Tweaks
       • Rules & League Info                                        │
       • Matches & Points Table                                     ▼
       • Admin Dashboard & Notice                      [ Visual Attribute Controls ]
                    │                                  • Headings, Subtitles, Badges
                    ▼                                  • Button Text (e.g. 'শেষ ডাক!')
       [ Dynamic Live Preview Canvas ]                 • Colors, Accents, Card Styles
       • Side-by-side or Floating Drawer               • Typography, Font Size, Spacing
       • Live toggle (Desktop / Mobile view)                        │
                    │                                               ▼
                    └──────────────────────────────────► [ Version & Publish Bar ]
                                                         • Save Draft (to Firestore)
                                                         • Discard / Restore Revisions
                                                         • Publish Live to Users
```

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
