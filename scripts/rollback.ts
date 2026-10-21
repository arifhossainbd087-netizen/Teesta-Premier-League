import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  terminate,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function rollbackFromBackup(backupFileName?: string) {
  const backupDir = path.resolve('backups');
  let fileToRestore = backupFileName;
  if (!fileToRestore) {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) throw new Error('No backup files found');
    fileToRestore = files.sort().pop()!;
  }

  const filePath = path.join(backupDir, fileToRestore);
  console.log(`Loading backup from: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Restore single docs
  for (const [docPath, docData] of Object.entries(data.singleDocs || {})) {
    console.log(`Restoring single doc: ${docPath}`);
    const [col, id] = docPath.split('/');
    await setDoc(doc(db, col, id), docData as any, { merge: true });
  }

  // Restore collections
  for (const [colName, docs] of Object.entries(data.collections || {})) {
    const docList = docs as Array<{ id: string; [key: string]: any }>;
    console.log(`Restoring collection [${colName}]: ${docList.length} records`);
    for (const d of docList) {
      const { id, ...rest } = d;
      await setDoc(doc(db, colName, id), rest, { merge: true });
    }
  }

  console.log('✓ Rollback completed successfully.');
  await terminate(db);
}

if (process.argv[2] === '--run') {
  rollbackFromBackup().catch(err => {
    console.error('Rollback error:', err);
    process.exit(1);
  });
}
