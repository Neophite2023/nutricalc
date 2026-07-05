import type { Food, ImportResult, Nutrients } from "./types";

type HeaderMap = Record<string, number>;

const columnAliases: Record<keyof Nutrients | "code" | "nameCs" | "nameEn" | "latinName" | "ediblePartCoef" | "fattyAcidsCoef" | "proteinCoef", string[]> = {
  code: ["origfdcd", "kod potraviny", "kód potraviny", "food code", "code"],
  nameCs: ["origfdnm", "nazev potraviny v cestine", "název potraviny v češtině", "nazev potraviny", "název potraviny", "name cs"],
  nameEn: ["engfdnam", "nazev potraviny v anglictine", "název potraviny v angličtině", "english name", "name en"],
  latinName: ["scinam", "latinsky nazev", "latinský název", "latin name"],
  ediblePartCoef: ["edible", "koeficient pro jedly podil", "koeficient pro jedlý podíl", "edible part"],
  fattyAcidsCoef: ["facf", "prepocitavaci faktor pro mastne kyseliny", "přepočítávací faktor pro mastné kyseliny"],
  proteinCoef: ["ncf", "prepocitavaci faktor pro bilkoviny", "přepočítávací faktor pro bílkoviny"],
  kcal: ["energie kcal", "kcal", "enerc kcal", "energie (kcal)", "energy kcal"],
  kJ: ["energie kj", "kj", "enerc kj", "energie (kj)", "energy kj"],
  protein: ["bilkoviny", "bílkoviny", "prot", "protein"],
  fat: ["tuky", "fat"],
  saturatedFat: ["nasycene mastne kyseliny", "nasycené mastné kyseliny", "fasat"],
  monounsaturatedFat: ["mononenasycene mastne kyseliny", "mononenasycené mastné kyseliny", "fams"],
  polyunsaturatedFat: ["polynenasycene mastne kyseliny", "polynenasycené mastné kyseliny", "fapu"],
  transFat: ["trans-mastne kyseliny", "trans-mastné kyseliny", "fatrn", "fatrs"],
  carbs: ["sacharidy celkove", "sacharidy celkové", "chot", "sacharidy"],
  availableCarbs: ["vyuzitelne sacharidy", "využitelné sacharidy", "cho"],
  sugars: ["cukry celkove", "cukry celkové", "sugar", "cukry"],
  fiber: ["vlaknina potravy", "vláknina potravy", "fibt", "vlaknina", "vláknina"],
  ash: ["popel", "ash"],
  sodium: ["sodik", "sodík", "na", "na mg"],
  salt: ["sul", "sůl", "nacl", "nacl g"],
  water: ["voda", "water"],
};

export function parseNutriDatabazeExport(content: string, sourceVersion = "NutriDatabaze import"): ImportResult {
  const delimiter = detectDelimiter(content);
  const rows = parseDelimited(content, delimiter).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    return { foods: [], skippedRows: rows.length, sourceVersion };
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  const headers = buildHeaderMap(rows[headerRowIndex]);
  const importedAt = new Date().toISOString();
  const foods: Food[] = [];
  let skippedRows = 0;

  rows.slice(headerRowIndex + 1).forEach((row, index) => {
    const code = readText(row, headers, "code") || `local-${index + 1}`;
    const nameCs = readText(row, headers, "nameCs");
    const kJ = readNumber(row, headers, "kJ");
    const kcal = readNumber(row, headers, "kcal") ?? (kJ === undefined ? undefined : Math.round((kJ / 4.184) * 10) / 10);

    if (!nameCs || kcal === undefined) {
      skippedRows += 1;
      return;
    }

    foods.push({
      code,
      nameCs,
      nameEn: readText(row, headers, "nameEn"),
      latinName: readText(row, headers, "latinName"),
      ediblePartCoef: readNumber(row, headers, "ediblePartCoef"),
      fattyAcidsCoef: readNumber(row, headers, "fattyAcidsCoef"),
      proteinCoef: readNumber(row, headers, "proteinCoef"),
      sourceVersion,
      importedAt,
      nutrientsPer100g: {
        kcal,
        kJ,
        protein: readNumber(row, headers, "protein"),
        fat: readNumber(row, headers, "fat"),
        saturatedFat: readNumber(row, headers, "saturatedFat"),
        monounsaturatedFat: readNumber(row, headers, "monounsaturatedFat"),
        polyunsaturatedFat: readNumber(row, headers, "polyunsaturatedFat"),
        transFat: readNumber(row, headers, "transFat"),
        carbs: readNumber(row, headers, "carbs"),
        availableCarbs: readNumber(row, headers, "availableCarbs"),
        sugars: readNumber(row, headers, "sugars"),
        fiber: readNumber(row, headers, "fiber"),
        ash: readNumber(row, headers, "ash"),
        sodium: readNumber(row, headers, "sodium"),
        salt: readNumber(row, headers, "salt"),
        water: readNumber(row, headers, "water"),
      },
    });
  });

  return {
    foods,
    skippedRows,
    sourceVersion,
    diagnostics:
      foods.length === 0
        ? `Rozpoznana hlavicka v riadku ${headerRowIndex + 1}: ${rows[headerRowIndex].slice(0, 10).join(" | ")}`
        : undefined,
  };
}

function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const separatorHint = firstLine.match(/^sep=(.)/i)?.[1];
  if (separatorHint) {
    return separatorHint;
  }

  const sample = content.split(/\r?\n/, 10).join("\n");
  const candidates = ["\t", ";", ","];
  return candidates
    .map((delimiter) => ({ delimiter, count: sample.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseDelimited(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function buildHeaderMap(headers: string[]): HeaderMap {
  return headers.reduce<HeaderMap>((map, header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized) {
      map[normalized] = index;
    }
    return map;
  }, {});
}

function findHeaderRowIndex(rows: string[][]): number {
  const candidates = rows.slice(0, 25).map((row, index) => {
    const headers = buildHeaderMap(row);
    const hasName = findColumn(headers, "nameCs") !== undefined;
    const hasEnergy = findColumn(headers, "kcal") !== undefined || findColumn(headers, "kJ") !== undefined;
    const score =
      (hasName ? 20 : 0) +
      (hasEnergy ? 20 : 0) +
      countKnownColumns(headers) +
      Math.min(row.filter((cell) => cell.trim()).length, 10);
    return { index, score };
  });

  return candidates.sort((a, b) => b.score - a.score)[0]?.index ?? 0;
}

function countKnownColumns(headers: HeaderMap): number {
  return (Object.keys(columnAliases) as Array<keyof typeof columnAliases>).filter((key) => findColumn(headers, key) !== undefined).length;
}

function readText(row: string[], headers: HeaderMap, key: keyof typeof columnAliases): string | undefined {
  const index = findColumn(headers, key);
  const value = index === undefined ? undefined : row[index]?.trim();
  return value || undefined;
}

function readNumber(row: string[], headers: HeaderMap, key: keyof typeof columnAliases): number | undefined {
  const raw = readText(row, headers, key);
  if (!raw || raw === "-" || raw.toLowerCase() === "tr") {
    return undefined;
  }
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

function findColumn(headers: HeaderMap, key: keyof typeof columnAliases): number | undefined {
  const aliases = columnAliases[key].map(normalizeHeader);
  for (const alias of aliases) {
    if (headers[alias] !== undefined) {
      return headers[alias];
    }
  }

  const looseMatch = Object.entries(headers).find(([header]) =>
    aliases.some((alias) => alias.length >= 3 && header.length >= 3 && (header.includes(alias) || alias.includes(header)))
  );
  return looseMatch?.[1];
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\[\]()]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
