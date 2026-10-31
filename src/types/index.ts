/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'team' | 'viewer' | 'scorer' | 'owner';

export type PlayerPosition = 'Forward' | 'Midfielder' | 'Defender' | 'Goalkeeper';

export type PlayerCategory = 'A' | 'B' | 'C' | 'D';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type AuctionStatus = 'upcoming' | 'live' | 'sold' | 'unsold' | 'withdrawn';

export type PaymentStatus = 'Paid' | 'Pending' | 'Refunded';

export type PaymentMethod = 'bKash' | 'Nagad' | 'Rocket' | 'Cash';

export type SeasonStatus = 'active' | 'archived' | 'draft';

export interface Season {
  id: string; // e.g. "season-2-2026", "season-3-2027"
  name: string; // "Teesta Premier League Season 2 (২০২৬)"
  code: string; // "S2", "S3"
  year: number; // 2026, 2027
  status: SeasonStatus;
  isLiveAuctionActive: boolean; // Only one active auction season
  defaultBudget: number;
  defaultBasePrice: number;
  defaultMinIncrement: number;
  defaultTimerSeconds: number;
  maxSquadSize: number;
  regFeeAmount: number;
  bKashNumber: string;
  nagadNumber: string;
  rocketNumber: string;
  tournamentRules?: string;
  announcement?: string;
  refundPolicy?: string;
  contactEmail?: string;
  contactPhone?: string;
  footerText?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Player {
  id: string;
  seasonId?: string; // Links player to specific season
  name: string;
  banglaName?: string;
  age: number;
  position: PlayerPosition;
  category?: PlayerCategory;
  phone: string;
  area: string; // Union / Address
  union?: string; // Explicit Union field for Form 13
  formNumber?: string; // e.g. "ফরম নং:- ১"
  formNumericValue?: number; // Integer form serial e.g. 1, 2, 3
  registrationNumber?: string; // Serial No. e.g. "TPL-S2-001"
  jerseySize?: string;
  prevClub?: string;
  regFee: number;
  paymentMethod: PaymentMethod;
  paymentTrxId?: string;
  paymentStatus: PaymentStatus;
  approvalStatus: ApprovalStatus;
  basePrice: number;
  auctionStatus: AuctionStatus;
  winningTeamId?: string | null;
  winningTeamName?: string | null;
  finalPrice?: number | null;
  photoUrl?: string;
  round?: number;
  withdrawn?: boolean;
  withdrawnReason?: string;
  isTestRecord?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Team {
  id: string; // Links team to specific season
  seasonId?: string;
  name: string;
  banglaName?: string;
  ownerName: string;
  phone?: string;
  totalBudget: number;
  spentBudget: number;
  remainingBudget: number;
  squadCount: number;
  maxSquad: number;
  logoUrl?: string;
  color?: string;
  userId?: string; // Associated Firebase Auth user UID or team identifier
  userEmail?: string;
  loginEmail?: string; // Authorized Gmail address for team manager authentication
  createdAt: string;
  updatedAt?: string;
}

export interface AuctionState {
  id?: string;
  seasonId?: string;
  status: 'idle' | 'active' | 'paused' | 'sold' | 'unsold' | 'completed';
  currentPlayerId: string | null;
  currentPlayerName?: string;
  currentPlayerPosition?: PlayerPosition;
  currentPlayerCategory?: PlayerCategory;
  currentPlayerAge?: number;
  currentPlayerArea?: string;
  currentPlayerPhoto?: string;
  currentBasePrice: number;
  currentBid: number;
  highestBidderTeamId: string | null;
  highestBidderTeamName: string | null;
  minIncrement: number;
  timerSeconds?: number;
  timerExpiresAt?: number | null;
  // Overall Auction Timer Fields (Requirement: shared time limit across tournament)
  overallDurationSeconds?: number; // Configured total duration in seconds (e.g. 600, 1800, 3600)
  overallTimerExpiresAt?: number | null; // Shared server-synced epoch timestamp when timer reaches 0
  overallTimerRemaining?: number; // Remaining seconds when paused or before start
  overallTimerStatus?: 'idle' | 'running' | 'paused' | 'expired'; // Overall timer status
  currentPlayerFormNumber?: string; // Authoritative form number e.g. "ফরম নং ১০৩" or "TPL-S2-103"
  currentPlayerRegistrationNumber?: string; // Authoritative serial registration number
  updatedAt: string;
}

export interface Bid {
  id: string;
  seasonId?: string;
  playerId: string;
  teamId: string;
  teamName: string;
  amount: number;
  timestamp: number;
}

export interface AuditLog {
  id: string;
  seasonId?: string;
  action: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  details: string;
  timestamp: string;
}

export interface LeagueSettings {
  leagueName: string;
  currentSeasonId?: string;
  season: string;
  defaultBudget: number;
  defaultBasePrice: number;
  defaultMinIncrement: number;
  defaultTimerSeconds: number;
  maxSquadSize: number;
  regFeeAmount: number;
  bKashNumber: string;
  nagadNumber: string;
  rocketNumber: string;
  updatedAt: string;
}

// Match & Tournament Operations (Section 16)
export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled';

export interface MatchFixture {
  id: string;
  seasonId: string;
  matchNumber: number;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamLogo?: string;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamLogo?: string;
  matchDate: string; // YYYY-MM-DD
  matchTime: string; // HH:mm
  venue: string;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  notes?: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StandingRow {
  teamId: string;
  teamName: string;
  teamColor?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

// Problem Reporting & Feedback (Section 15)
export type ProblemCategory =
  | 'Player Registration'
  | 'Player Information'
  | 'Player Image Upload'
  | 'Auction and Bidding'
  | 'Team Budget'
  | 'Login and Account'
  | 'Match Fixtures and Scores'
  | 'Other';

export type ReportStatus = 'New' | 'In Progress' | 'Resolved' | 'Rejected';

export interface ProblemReport {
  id: string;
  seasonId?: string;
  title: string;
  description: string;
  category: ProblemCategory;
  reporterName?: string;
  reporterEmail?: string;
  reporterPhone?: string;
  pageUrl?: string;
  screenshotUrl?: string;
  status: ReportStatus;
  adminNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

// Registration Settings & Form Number Counter
export interface RegistrationSettings {
  startFormNumber: number; // Initial sequential start (default: 1)
  nextFormNumber: number; // Next sequential form number to assign (e.g. 1, 2, 3...)
  prefix: string; // Default prefix e.g. "ফরম নং:- "
  labelBn: string; // Bangla label e.g. "ফরম নং:- "
  labelEn: string; // English label e.g. "Form No. "
  digitFormat: 'bn' | 'en'; // Bengali digits (১, ২) or English (1, 2)
  totalRegistrations: number; // Total processed registrations count
  lastAssignedNumber: number | null; // Most recently assigned integer number
  updatedAt: string;
  updatedBy: string;
}

// Live Auction Display Configuration (Admin customizable)
export interface AuctionDisplayConfig {
  // Photo placement and dimensions
  photoPlacement: 'left' | 'center' | 'split';
  photoSize: 'normal' | 'large' | 'xlarge' | 'full';
  photoBorderAccent: boolean;

  // Information fields visibility
  visibleFields: {
    formNumber: boolean;
    playerId: boolean;
    position: boolean;
    category: boolean;
    age: boolean;
    basePrice: boolean;
    minIncrement: boolean;
    area: boolean;
    prevClub: boolean;
  };

  // Theme, Colors & Typography
  themeMode: 'dark-stadium' | 'midnight-navy' | 'emerald-glow' | 'onyx-gold' | 'deep-slate';
  accentColor: 'emerald' | 'amber' | 'cyan' | 'rose' | 'purple' | 'blue';
  fontScale: 'standard' | 'large' | 'extra-large';
  bidTypographySize: 'large' | 'huge' | 'jumbo' | 'monumental';

  // Panel layout & alignment
  layoutAlignment: 'balanced' | 'focus-photo' | 'focus-bid';
  containerSpacing: 'compact' | 'comfortable' | 'spacious';

  // Logo & Countdown Presentation
  teamLogoPlacement: 'beside-name' | 'prominent-badge' | 'corner-crest';
  countdownStyle: 'digital-clock' | 'pulse-pill' | 'circular-badge';

  // Sections visibility
  showBidsFeed: boolean;
  showTeamsPurse: boolean;
  showQuickBidButtons: boolean;
  showRulesCard: boolean;
  showProjectorWatermark: boolean;

  // Persistence metadata
  updatedAt?: string;
  updatedBy?: string;
  isPublished?: boolean;
}

// Multi-Admin Authorization Record
export interface AdminRecord {
  id: string; // Document ID (normalized email)
  email: string; // Exact Gmail address
  role: 'primary' | 'admin'; // Primary Admin vs Assistant Admin
  status: 'active' | 'revoked'; // Authorization status
  addedBy: string; // Email of the admin who granted access
  addedAt: string; // ISO timestamp
  notes?: string; // Optional description or purpose
  displayName?: string; // Optional display name
  updatedAt?: string;
}

// Team Lineup and Poster Configuration (Inspired by professional squad poster / Real Sociedad)
export interface TeamLineup {
  id?: string;
  teamId: string;
  seasonId?: string;
  formation: string; // '4-3-3' | '4-4-2' | '3-4-3' | '3-5-2' | '4-2-3-1' | 'adaptive'
  startingPlayerIds: string[];
  benchPlayerIds: string[];
  captainId?: string | null;
  viceCaptainId?: string | null;
  managerName?: string;
  posterTitle?: string;
  customPositions?: Record<string, PlayerPosition>;
  customNames?: Record<string, string>;
  customPhotos?: Record<string, string>;
  customOrder?: string[];
  updatedAt: string;
  updatedBy: string;
}

// Auction Poster Entity (Automatic SOLD / UNSOLD Poster Gallery)
export interface AuctionPoster {
  id: string; // Document ID: e.g. `${seasonId}_${playerId}_${status}_${timestamp}`
  playerId: string;
  playerName: string;
  playerBanglaName?: string;
  playerPhoto?: string;
  playerPosition?: string;
  playerCategory?: string;
  playerFormNumber?: string;
  playerRegistrationNumber?: string;
  seasonId: string;
  seasonName?: string;
  status: 'sold' | 'unsold';
  finalPrice?: number | null;
  winningTeamId?: string | null;
  winningTeamName?: string | null;
  winningTeamLogo?: string | null;
  tournamentLogo?: string;
  posterUrl: string; // Firebase Storage download URL or high-res Data URL fallback
  storagePath?: string;
  createdAt: string; // ISO timestamp
  hidden?: boolean; // Admin hide/unhide control
  caption?: string; // Social media ready text
}
