import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
  terminate,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function seed() {
  console.log('Seeding initial tournament data...');

  // 1. Teams
  const demoTeams = [
    {
      id: 'team_thunders',
      name: 'তিস্তা থান্ডারস (Teesta Thunders)',
      ownerName: 'মো: আরিফ হোসেন',
      phone: '01712-111222',
      totalBudget: 100000,
      spentBudget: 0,
      remainingBudget: 100000,
      squadCount: 0,
      maxSquad: 15,
      color: '#10b981',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'team_riders',
      name: 'রংপুর রাইডার্স এফসি (Rangpur Riders FC)',
      ownerName: 'আনিসুর রহমান',
      phone: '01712-333444',
      totalBudget: 100000,
      spentBudget: 0,
      remainingBudget: 100000,
      squadCount: 0,
      maxSquad: 15,
      color: '#3b82f6',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'team_kings',
      name: 'কুড়িগ্রাম কিংস (Kurigram Kings)',
      ownerName: 'মোস্তাফিজুর হক',
      phone: '01712-555666',
      totalBudget: 100000,
      spentBudget: 0,
      remainingBudget: 100000,
      squadCount: 0,
      maxSquad: 15,
      color: '#f59e0b',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'team_warriors',
      name: 'লালমনিরহাট ওয়ারিয়র্স (Lalmonirhat Warriors)',
      ownerName: 'শাহরিয়ার কবির',
      phone: '01712-777888',
      totalBudget: 100000,
      spentBudget: 0,
      remainingBudget: 100000,
      squadCount: 0,
      maxSquad: 15,
      color: '#ec4899',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const t of demoTeams) {
    await setDoc(doc(db, 'teams', t.id), t);
    console.log(`✓ Team seeded: ${t.name}`);
  }

  // 2. Players
  const demoPlayers = [
    {
      id: 'player_rakibul',
      name: 'Rakibul Hasan',
      banglaName: 'রাকিবুল হাসান',
      age: 22,
      position: 'Forward',
      phone: '01711-223344',
      area: 'কাউনিয়া, রংপুর',
      jerseySize: 'L',
      prevClub: 'তিস্তা যুব একাদশ',
      regFee: 500,
      paymentMethod: 'bKash',
      paymentTrxId: 'BK9A7721X',
      paymentStatus: 'Paid',
      approvalStatus: 'approved',
      basePrice: 3000,
      auctionStatus: 'upcoming',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'player_tanvir',
      name: 'Tanvir Ahmed',
      banglaName: 'তানভীর আহমেদ',
      age: 24,
      position: 'Midfielder',
      phone: '01722-334455',
      area: 'রাজারহাট, কুড়িগ্রাম',
      jerseySize: 'M',
      prevClub: 'উত্তরবঙ্গ ফুটবল একাডেমি',
      regFee: 500,
      paymentMethod: 'Nagad',
      paymentTrxId: 'NG882190B',
      paymentStatus: 'Paid',
      approvalStatus: 'approved',
      basePrice: 2500,
      auctionStatus: 'upcoming',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'player_sabbir',
      name: 'Sabbir Hossain',
      banglaName: 'সাব্বির হোসেন',
      age: 21,
      position: 'Defender',
      phone: '01733-445566',
      area: 'হাতীবান্ধা, লালমনিরহাট',
      jerseySize: 'XL',
      prevClub: 'তিস্তা ব্যারেজ ক্লাব',
      regFee: 500,
      paymentMethod: 'bKash',
      paymentTrxId: 'BK441920Z',
      paymentStatus: 'Paid',
      approvalStatus: 'approved',
      basePrice: 2000,
      auctionStatus: 'upcoming',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'player_miraz',
      name: 'Mehedi Hasan Miraz',
      banglaName: 'মেহেদী হাসান মিরাজ',
      age: 25,
      position: 'Goalkeeper',
      phone: '01744-556677',
      area: 'গঙ্গাচড়া, রংপুর',
      jerseySize: 'L',
      prevClub: 'রংপুর জেলা দল',
      regFee: 500,
      paymentMethod: 'bKash',
      paymentTrxId: 'BK110944P',
      paymentStatus: 'Paid',
      approvalStatus: 'approved',
      basePrice: 3500,
      auctionStatus: 'upcoming',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const p of demoPlayers) {
    await setDoc(doc(db, 'players', p.id), p);
    console.log(`✓ Player seeded: ${p.name}`);
  }

  // 3. Auction Current State
  await setDoc(doc(db, 'auction', 'current'), {
    status: 'idle',
    currentPlayerId: null,
    currentBasePrice: 2500,
    currentBid: 0,
    highestBidderTeamId: null,
    highestBidderTeamName: null,
    minIncrement: 1000,
    timerSeconds: 20,
    timerExpiresAt: null,
    updatedAt: new Date().toISOString(),
  });
  console.log('✓ Auction initial state seeded');

  // 4. League Settings (creates master settings doc)
  await setDoc(doc(db, 'settings', 'league'), {
    leagueName: 'Teesta Premier League Season 2 (TPL S2)',
    season: 'Season 2 (২০২৬)',
    defaultBudget: 100000,
    defaultBasePrice: 2000,
    defaultMinIncrement: 1000,
    defaultTimerSeconds: 20,
    maxSquadSize: 15,
    regFeeAmount: 500,
    bKashNumber: '01712-345678',
    nagadNumber: '01912-345678',
    rocketNumber: '01812-345678',
    updatedAt: new Date().toISOString(),
  });
  console.log('✓ League settings seeded');

  // Terminate connection cleanly
  await terminate(db);
  console.log('Seeding completed successfully.');
}

seed().then(() => process.exit(0)).catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
