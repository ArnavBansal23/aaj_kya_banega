import { signIn, logOut } from '../src/lib/auth.js';
import { db } from '../src/lib/firebase.js';
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';

const ALLOWED_IMPORT_UID = 'Ycxl5zZoGmaEUA2cEIi6mLFTGxq2';
const form = document.querySelector('#import-form');
const status = document.querySelector('#status');
const submitButton = document.querySelector('#submit');

function normalizedName(name) {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en-IN');
}

async function dishDocumentId(name) {
  const bytes = new TextEncoder().encode(normalizedName(name));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hexDigest = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `meal_import_${hexDigest}`;
}

function getMealNames(workbookFile) {
  return workbookFile.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error('The workbook has no worksheets.');

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
    if (!rows.length || !Object.hasOwn(rows[0], 'Meal')) {
      throw new Error('Could not find a column named "Meal" in the first worksheet.');
    }

    const names = rows
      .map((row) => (typeof row.Meal === 'string' ? row.Meal.trim() : String(row.Meal ?? '').trim()))
      .filter(Boolean);
    const uniqueNames = [...new Map(names.map((name) => [normalizedName(name), name])).values()];
    if (uniqueNames.length !== 45) {
      throw new Error(`Expected 45 unique meal names in the Meal column; found ${uniqueNames.length}. No dishes were imported.`);
    }
    return uniqueNames;
  });
}

async function importDishes(names, progress) {
  const snapshot = await getDocs(collection(db, 'dishes'));
  const knownNames = new Set(
    snapshot.docs
      .map((dish) => dish.data().name)
      .filter((name) => typeof name === 'string')
      .map(normalizedName),
  );

  for (const name of names) {
    const normalized = normalizedName(name);
    if (knownNames.has(normalized)) {
      progress.skipped += 1;
      continue;
    }

    const reference = doc(db, 'dishes', await dishDocumentId(name));
    const created = await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists()) {
        const existingName = existing.data().name;
        if (typeof existingName !== 'string' || normalizedName(existingName) !== normalized) {
          throw new Error(`Deterministic document ID conflict for "${name}". No existing record was changed.`);
        }
        return false;
      }

      const timestamp = serverTimestamp();
      transaction.set(reference, {
        name,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return true;
    });
    knownNames.add(normalized);
    if (created) progress.added += 1;
    else progress.skipped += 1;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  status.textContent = 'Reading workbook…';

  const progress = { added: 0, skipped: 0 };
  let authenticationAttempted = false;
  let importError = null;
  let logoutError = null;
  try {
    const workbookFile = document.querySelector('#workbook').files[0];
    const names = await getMealNames(workbookFile);
    const email = document.querySelector('#email').value;
    const passwordInput = document.querySelector('#password');
    const password = passwordInput.value;
    passwordInput.value = '';

    status.textContent = 'Signing in and checking existing dishes…';
    authenticationAttempted = true;
    const credential = await signIn(email, password);
    if (credential.user.uid !== ALLOWED_IMPORT_UID) {
      throw new Error(`Import stopped: signed-in UID does not match the authorized UID. No dishes were written.`);
    }

    await importDishes(names, progress);
  } catch (error) {
    importError = error;
  } finally {
    if (authenticationAttempted) {
      try {
        await logOut();
      } catch (error) {
        logoutError = error;
      }
    }
    document.querySelector('#password').value = '';
    submitButton.disabled = false;
  }

  const importStatus = importError
    ? `Import failed: ${importError.message}\nSuccessfully added ${progress.added}; skipped ${progress.skipped} duplicates before failure.`
    : `Import complete. Added ${progress.added} dishes; skipped ${progress.skipped} existing dishes.`;
  const logoutStatus = !authenticationAttempted
    ? ''
    : logoutError
      ? `\nWARNING: Sign-out failed (${logoutError.message}). The shared account may still be signed in on this device.`
      : '\nSigned out successfully.';
  status.textContent = `${importStatus}${logoutStatus}`;
});
