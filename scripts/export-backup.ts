import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  terminate,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function exportFullBackup() {
  console.log('=== STARTING COMPLETE BACKUP OF TPL S2 FIRESTORE DATA ===\n');

  const collectionsToBackup = [
    'seasons',
    'teams',
    'players',
    'settings',
    'auditLogs',
    'admins',
    'users',
    'matches',
    'problemReports',
  ];

  const backupData: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    databaseId: firebaseConfig.firestoreDatabaseId,
    projectId: firebaseConfig.projectId,
    collections: {},
    singleDocs: {},
  };

  // 1. Single docs
  try {
    const auctionSnap = await getDoc(doc(db, 'auction', 'current'));
    if (auctionSnap.exists()) {
      backupData.singleDocs['auction/current'] = auctionSnap.data();
    }
  } catch (e: any) {
    console.warn('auction/current export warning:', e.message);
  }

  // 2. Collections
  for (const colName of collectionsToBackup) {
    try {
      const snap = await getDocs(collection(db, colName));
      backupData.collections[colName] = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      console.log(`✓ Backed up collection [${colName}]: ${snap.size} records`);
    } catch (err: any) {
      console.warn(`! Collection [${colName}] export note:`, err.message);
      backupData.collections[colName] = [];
    }
  }

  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFilePath = path.join(backupDir, `tpl-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

  console.log(`\n======================================================`);
  console.log(`FULL BACKUP SUCCESSFULLY SAVED TO: ${backupFilePath}`);
  console.log(`Total Collections backed up: ${Object.keys(backupData.collections).length}`);
  console.log(`======================================================\n`);

  await terminate(db);
}

exportFullBackup().catch(err => {
  console.error('Backup error:', err);
  process.exit(1);
});
