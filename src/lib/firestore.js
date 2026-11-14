import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

const dishesCollection = collection(db, 'dishes');
const DATE_TIME_ZONE = 'Asia/Kolkata';

function withFirestoreError(context, error) {
  const wrappedError = new Error(`${context}: ${error.message}`, { cause: error });
  wrappedError.code = error.code;
  return wrappedError;
}

function getKolkataDateId(date = new Date()) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new TypeError('A valid date is required.');

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DATE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const partValues = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${partValues.year}-${partValues.month}-${partValues.day}`;
}

function requireDishName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('Dish name must be a non-empty string.');
  }
  return name.trim();
}

export async function fetchActiveDishes() {
  try {
    const snapshot = await getDocs(query(dishesCollection, where('isActive', '==', true)));
    return snapshot.docs.map((dish) => ({ id: dish.id, ...dish.data() }));
  } catch (error) {
    throw withFirestoreError('Unable to fetch active dishes', error);
  }
}

export async function addDish(name) {
  const dishName = requireDishName(name);
  try {
    const timestamp = serverTimestamp();
    const reference = await addDoc(dishesCollection, {
      name: dishName,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return reference.id;
  } catch (error) {
    throw withFirestoreError('Unable to add dish', error);
  }
}

export async function editDish(dishId, changes) {
  if (!dishId) throw new TypeError('Dish ID is required.');
  const updates = {};
  if (Object.hasOwn(changes ?? {}, 'name')) updates.name = requireDishName(changes.name);
  if (Object.keys(updates).length === 0) throw new TypeError('Provide a dish name to update.');

  try {
    await updateDoc(doc(db, 'dishes', dishId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw withFirestoreError('Unable to edit dish', error);
  }
}

export async function softDeleteDish(dishId) {
  if (!dishId) throw new TypeError('Dish ID is required.');
  try {
    await updateDoc(doc(db, 'dishes', dishId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw withFirestoreError('Unable to delete dish', error);
  }
}

export async function restoreDish(dishId) {
  if (!dishId) throw new TypeError('Dish ID is required.');
  try {
    await updateDoc(doc(db, 'dishes', dishId), {
      isActive: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw withFirestoreError('Unable to restore dish', error);
  }
}

export async function fetchDailyRecommendation(date = new Date()) {
  let dateId;
  try {
    dateId = getKolkataDateId(date);
    const snapshot = await getDoc(doc(db, 'dailyMeals', dateId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  } catch (error) {
    throw withFirestoreError('Unable to fetch daily recommendation', error);
  }
}

export async function saveDailyRecommendation({ dishId, dishName, date = new Date() }) {
  if (typeof dishId !== 'string' || !dishId.trim()) {
    throw new TypeError('Dish ID is required.');
  }
  const name = requireDishName(dishName);

  try {
    const dateId = getKolkataDateId(date);
    const reference = doc(db, 'dailyMeals', dateId);
    const existing = await getDoc(reference);
    const timestamp = serverTimestamp();
    const data = {
      dishId: dishId.trim(),
      dishName: name,
      date: dateId,
      updatedAt: timestamp,
    };
    if (!existing.exists()) data.createdAt = timestamp;
    await setDoc(reference, data, { merge: true });
    return dateId;
  } catch (error) {
    throw withFirestoreError('Unable to save daily recommendation', error);
  }
}
