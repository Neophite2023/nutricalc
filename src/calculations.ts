import type { MealItem, Nutrients } from "./types";

const nutrientKeys: Array<keyof Nutrients> = [
  "kcal",
  "kJ",
  "protein",
  "fat",
  "saturatedFat",
  "monounsaturatedFat",
  "polyunsaturatedFat",
  "transFat",
  "carbs",
  "availableCarbs",
  "sugars",
  "fiber",
  "ash",
  "sodium",
  "salt",
  "water",
];

export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  return nutrientKeys.reduce<Nutrients>(
    (totals, key) => {
      const value = per100g[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        totals[key] = roundNutrient((value * grams) / 100);
      }
      return totals;
    },
    { kcal: 0 }
  );
}

export function sumMealItems(items: MealItem[]): Nutrients {
  return items.reduce<Nutrients>(
    (totals, item) => addNutrients(totals, scaleNutrients(item.nutrientsSnapshotPer100g, item.grams)),
    { kcal: 0 }
  );
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return nutrientKeys.reduce<Nutrients>(
    (totals, key) => {
      const value = (a[key] ?? 0) + (b[key] ?? 0);
      if (value !== 0 || key === "kcal") {
        totals[key] = roundNutrient(value);
      }
      return totals;
    },
    { kcal: 0 }
  );
}

export function roundNutrient(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function formatNumber(value?: number, suffix = ""): string {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

export function isoDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function sameLocalDate(isoDateTime: string, date: string): boolean {
  return isoDateTime.slice(0, 10) === date;
}
