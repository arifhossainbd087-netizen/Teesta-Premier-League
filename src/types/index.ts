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
  timerSeconds: number;
  timerExpiresAt: number | null;
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
