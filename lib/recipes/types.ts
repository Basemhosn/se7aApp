export type MealCategory =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "dessert"
  | "drink";

export type Cuisine =
  | "emirati"
  | "saudi"
  | "kuwaiti"
  | "qatari"
  | "bahraini"
  | "omani"
  | "yemeni"
  | "levantine"
  | "egyptian"
  | "iraqi"
  | "iranian"
  | "gulf-fusion";

export type DietTag =
  | "halal"
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "dairy-free"
  | "high-protein"
  | "low-carb"
  | "ramadan-friendly";

export interface Ingredient {
  name_en: string;
  name_ar?: string;
  qty: string; // "1 cup", "150 g", "2 tbsp"
}

export interface Recipe {
  id: string; // slug
  name_en: string;
  name_ar: string;
  category: MealCategory;
  cuisine: Cuisine;
  servings: number;
  prep_time_min: number;
  cook_time_min: number;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  ingredients: Ingredient[];
  steps: string[];
  tags: DietTag[];
  notes?: string;
}
