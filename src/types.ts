export type Nutrients = {
  kcal: number;
  kJ?: number;
  protein?: number;
  fat?: number;
  saturatedFat?: number;
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  transFat?: number;
  carbs?: number;
  availableCarbs?: number;
  sugars?: number;
  fiber?: number;
  ash?: number;
  sodium?: number;
  salt?: number;
  water?: number;
};

export type Food = {
  code: string;
  nameCs: string;
  nameEn?: string;
  latinName?: string;
  ediblePartCoef?: number;
  fattyAcidsCoef?: number;
  proteinCoef?: number;
  sourceVersion: string;
  nutrientsPer100g: Nutrients;
  importedAt: string;
};

export type MealItem = {
  id: string;
  foodCode: string;
  foodName: string;
  grams: number;
  sourceVersion: string;
  nutrientsSnapshotPer100g: Nutrients;
};

export type Meal = {
  id: string;
  name: string;
  eatenAt: string;
  items: MealItem[];
  totals: Nutrients;
  createdAt: string;
  updatedAt: string;
};

export type ImportResult = {
  foods: Food[];
  skippedRows: number;
  sourceVersion: string;
  diagnostics?: string;
};

export type StoreName = "foods" | "meals" | "settings";
