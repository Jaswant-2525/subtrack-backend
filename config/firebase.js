/**
 * config/firebase.js
 * ------------------
 * Initializes the Firebase Admin SDK using a service account.
 *
 * Two supported styles (pick one via .env):
 *
 *  Option A – JSON string in env var (recommended for cloud hosts like Render):
 *    FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"..."}'
 *
 *  Option B – Path to the downloaded JSON file (good for local dev):
 *    FIREBASE_SERVICE_ACCOUNT_PATH=./config/serviceAccountKey.json
 *
 * The JSON string approach avoids committing a secrets file to git.
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Option A: parse the JSON string stored in the env var
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    throw new Error(
      '[firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON – make sure it is valid JSON.\n' + err.message
    );
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  // Option B: read from a local file path
  const filePath = resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  serviceAccount = JSON.parse(readFileSync(filePath, 'utf8'));
} else {
  throw new Error(
    '[firebase] No service account provided. ' +
    'Set either FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in your .env file.'
  );
}

// Only initialize once (guards against hot-reload double-init)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
export default admin;
