import type { Food, Meal, StoreName, WeightEntry } from "./types";

const DB_NAME = "nutricalc";
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("foods")) {
        const foods = db.createObjectStore("foods", { keyPath: "code" });
        foods.createIndex("nameCs", "nameCs", { unique: false });
        foods.createIndex("sourceVersion", "sourceVersion", { unique: false });
      }
      if (!db.objectStoreNames.contains("meals")) {
        const meals = db.createObjectStore("meals", { keyPath: "id" });
        meals.createIndex("eatenAt", "eatenAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("weights")) {
        const weights = db.createObjectStore("weights", { keyPath: "id" });
        weights.createIndex("measuredAt", "measuredAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function transaction<T>(storeName: StoreName, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = action(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onerror = () => reject(tx.error);
      })
  );
}

export function getAllFoods(): Promise<Food[]> {
  return transaction<Food[]>("foods", "readonly", (store) => store.getAll());
}

export function putFoods(foods: Food[]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("foods", "readwrite");
        const store = tx.objectStore("foods");
        foods.forEach((food) => store.put(food));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

export function clearFoods(): Promise<void> {
  return transaction<undefined>("foods", "readwrite", (store) => store.clear() as IDBRequest<undefined>).then(() => undefined);
}

export function getAllMeals(): Promise<Meal[]> {
  return transaction<Meal[]>("meals", "readonly", (store) => store.getAll()).then((meals) =>
    meals.sort((a, b) => b.eatenAt.localeCompare(a.eatenAt))
  );
}

export function putMeal(meal: Meal): Promise<void> {
  return transaction<IDBValidKey>("meals", "readwrite", (store) => store.put(meal)).then(() => undefined);
}

export function deleteMeal(id: string): Promise<void> {
  return transaction<undefined>("meals", "readwrite", (store) => store.delete(id) as IDBRequest<undefined>).then(() => undefined);
}

export function getAllWeights(): Promise<WeightEntry[]> {
  return transaction<WeightEntry[]>("weights", "readonly", (store) => store.getAll()).then((weights) =>
    weights.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
  );
}

export function putWeight(weight: WeightEntry): Promise<void> {
  return transaction<IDBValidKey>("weights", "readwrite", (store) => store.put(weight)).then(() => undefined);
}

export function deleteWeight(id: string): Promise<void> {
  return transaction<undefined>("weights", "readwrite", (store) => store.delete(id) as IDBRequest<undefined>).then(() => undefined);
}

export function getSetting<T>(key: string): Promise<T | undefined> {
  return transaction<{ key: string; value: T } | undefined>("settings", "readonly", (store) => store.get(key)).then((row) => row?.value);
}

export function setSetting<T>(key: string, value: T): Promise<void> {
  return transaction<IDBValidKey>("settings", "readwrite", (store) => store.put({ key, value })).then(() => undefined);
}
