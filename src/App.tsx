import { useEffect, useMemo, useState } from "react";
import { addNutrients, formatNumber, isoDate, sameLocalDate, sumMealItems } from "./calculations";
import { clearFoods, deleteMeal, deleteWeight, getAllFoods, getAllMeals, getAllWeights, getSetting, putFoods, putMeal, putWeight, setSetting } from "./db";
import { parseNutriDatabazeExport } from "./importer";
import type { Food, Meal, MealItem, Nutrients, WeightEntry } from "./types";

type Page = "today" | "add" | "history" | "import" | "weight" | "settings";

type DraftItem = {
  food: Food;
  grams: number;
};

const emptyTotals: Nutrients = { kcal: 0 };

export function App() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [page, setPage] = useState<Page>("today");
  const [selectedDate, setSelectedDate] = useState(isoDate());
  const [importMessage, setImportMessage] = useState("");
  const [sourceVersion, setSourceVersion] = useState("NutriDatabaze.cz");
  const [dailyTarget, setDailyTarget] = useState(2200);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    Promise.all([getAllFoods(), getAllMeals(), getAllWeights(), getSetting<number>("dailyTarget")]).then(([storedFoods, storedMeals, storedWeights, target]) => {
      setFoods(storedFoods);
      setMeals(storedMeals);
      setWeights(storedWeights);
      if (target) {
        setDailyTarget(target);
      }
      setIsReady(true);
    });
  }, []);

  const mealsForDate = useMemo(() => meals.filter((meal) => sameLocalDate(meal.eatenAt, selectedDate)), [meals, selectedDate]);
  const dailyTotals = useMemo(() => mealsForDate.reduce((totals, meal) => addNutrients(totals, meal.totals), emptyTotals), [mealsForDate]);
  const targetRatio = Math.min(100, Math.round((dailyTotals.kcal / dailyTarget) * 100));

  async function refreshMeals() {
    setMeals(await getAllMeals());
  }

  async function refreshWeights() {
    setWeights(await getAllWeights());
  }

  async function handleImport(file: File) {
    const content = await readTextFile(file);
    const result = parseNutriDatabazeExport(content, sourceVersion || "NutriDatabaze.cz");
    if (result.foods.length === 0) {
      setImportMessage(`Import nenasiel ziadne riadky s nazvom potraviny a energiou. ${result.diagnostics ?? ""}`);
      return;
    }

    await clearFoods();
    await putFoods(result.foods);
    setFoods(await getAllFoods());
    setImportMessage(`Importovane: ${result.foods.length} potravin. Preskocene riadky: ${result.skippedRows}.`);
  }

  async function handleClearFoods() {
    await clearFoods();
    setFoods([]);
    setImportMessage("Databaza potravin bola vymazana. Archiv jedal ostal zachovany.");
  }

  async function handleSaveMeal(name: string, eatenAt: string, draftItems: DraftItem[]) {
    const now = new Date().toISOString();
    const items: MealItem[] = draftItems.map(({ food, grams }) => ({
      id: crypto.randomUUID(),
      foodCode: food.code,
      foodName: food.nameCs,
      grams,
      sourceVersion: food.sourceVersion,
      nutrientsSnapshotPer100g: food.nutrientsPer100g,
    }));

    await putMeal({
      id: crypto.randomUUID(),
      name: name.trim() || "Jedlo",
      eatenAt,
      items,
      totals: sumMealItems(items),
      createdAt: now,
      updatedAt: now,
    });
    await refreshMeals();
    setSelectedDate(eatenAt.slice(0, 10));
    setPage("today");
  }

  async function handleDeleteMeal(id: string) {
    await deleteMeal(id);
    await refreshMeals();
  }

  async function handleSaveWeight(measuredAt: string, kg: number) {
    const now = new Date().toISOString();
    await putWeight({
      id: crypto.randomUUID(),
      measuredAt,
      kg: Math.round((kg + Number.EPSILON) * 10) / 10,
      createdAt: now,
      updatedAt: now,
    });
    await refreshWeights();
  }

  async function handleDeleteWeight(id: string) {
    await deleteWeight(id);
    await refreshWeights();
  }

  async function handleTargetChange(value: number) {
    setDailyTarget(value);
    await setSetting("dailyTarget", value);
  }

  function exportArchive() {
    const payload = {
      exportedAt: new Date().toISOString(),
      meals,
      weights,
      settings: { dailyTarget },
    };
    downloadJson("nutricalc-archiv.json", payload);
  }

  async function importArchive(file: File) {
    const payload = JSON.parse(await file.text()) as { meals?: Meal[]; weights?: WeightEntry[]; settings?: { dailyTarget?: number } };
    if (Array.isArray(payload.meals)) {
      await Promise.all(payload.meals.map((meal) => putMeal(meal)));
      await refreshMeals();
    }
    if (Array.isArray(payload.weights)) {
      await Promise.all(payload.weights.map((weight) => putWeight(weight)));
      await refreshWeights();
    }
    if (payload.settings?.dailyTarget) {
      await handleTargetChange(payload.settings.dailyTarget);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>NutriCalc</strong>
            <span>lokalny dennik</span>
          </div>
        </div>

        <nav className="nav">
          <button className={page === "today" ? "active" : ""} onClick={() => setPage("today")}>Dnes</button>
          <button className={page === "add" ? "active" : ""} onClick={() => setPage("add")}>Pridat jedlo</button>
          <button className={page === "history" ? "active" : ""} onClick={() => setPage("history")}>Historia</button>
          <button className={page === "weight" ? "active" : ""} onClick={() => setPage("weight")}>Vaha</button>
          <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>Nastavenia</button>
        </nav>

        <div className="source-note">
          <span>{foods.length}</span>
          potravin lokalne
        </div>
      </aside>

      <main className="main">
        {!isReady ? (
          <section className="empty-state">Nacitavam lokalnu databazu...</section>
        ) : (
          <>
            {page === "today" && (
              <TodayPage
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                meals={mealsForDate}
                totals={dailyTotals}
                targetRatio={targetRatio}
                dailyTarget={dailyTarget}
                onDeleteMeal={handleDeleteMeal}
                onAddMeal={() => setPage("add")}
              />
            )}
            {page === "add" && <AddMealPage foods={foods} selectedDate={selectedDate} onSave={handleSaveMeal} onImport={() => setPage("import")} />}
            {page === "history" && <HistoryPage meals={meals} onDeleteMeal={handleDeleteMeal} />}
            {page === "weight" && <WeightPage weights={weights} onSave={handleSaveWeight} onDelete={handleDeleteWeight} />}
            {page === "import" && (
              <ImportPage
                sourceVersion={sourceVersion}
                setSourceVersion={setSourceVersion}
                importMessage={importMessage}
                onImport={handleImport}
                onClearFoods={handleClearFoods}
              />
            )}
            {page === "settings" && (
              <SettingsPage
                dailyTarget={dailyTarget}
                onTargetChange={handleTargetChange}
                onExportArchive={exportArchive}
                onImportArchive={importArchive}
                onOpenImport={() => setPage("import")}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TodayPage(props: {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  meals: Meal[];
  totals: Nutrients;
  targetRatio: number;
  dailyTarget: number;
  onDeleteMeal: (id: string) => void;
  onAddMeal: () => void;
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Dennik</span>
          <h1>Prehlad dna</h1>
        </div>
        <input type="date" value={props.selectedDate} onChange={(event) => props.setSelectedDate(event.target.value)} />
      </header>

      <section className="summary-grid">
        <div className="metric primary">
          <span>Kalorie</span>
          <strong>{formatNumber(props.totals.kcal, " kcal")}</strong>
          <div className="progress"><span style={{ width: `${props.targetRatio}%` }} /></div>
          <small>{props.targetRatio}% z ciela {formatNumber(props.dailyTarget, " kcal")}</small>
        </div>
        <Metric label="Bielkoviny" value={props.totals.protein} suffix=" g" />
        <Metric label="Tuky" value={props.totals.fat} suffix=" g" />
        <Metric label="Sacharidy" value={props.totals.carbs ?? props.totals.availableCarbs} suffix=" g" />
      </section>

      <section className="section-head">
        <h2>Jedla</h2>
        <button onClick={props.onAddMeal}>Pridat</button>
      </section>
      <MealList meals={props.meals} onDeleteMeal={props.onDeleteMeal} />
    </>
  );
}

function AddMealPage(props: {
  foods: Food[];
  selectedDate: string;
  onSave: (name: string, eatenAt: string, items: DraftItem[]) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedFoodCode, setSelectedFoodCode] = useState("");
  const [grams, setGrams] = useState(100);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [mealName, setMealName] = useState("");
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));

  const results = useMemo(() => searchFoods(props.foods, query).slice(0, 20), [props.foods, query]);
  const selectedFood = props.foods.find((food) => food.code === selectedFoodCode) ?? results[0];
  const totals = useMemo(() => sumMealItems(items.map(({ food, grams }) => ({
    id: food.code,
    foodCode: food.code,
    foodName: food.nameCs,
    grams,
    sourceVersion: food.sourceVersion,
    nutrientsSnapshotPer100g: food.nutrientsPer100g,
  }))), [items]);

  function addItem() {
    if (!selectedFood || grams <= 0) {
      return;
    }
    setItems((current) => [...current, { food: selectedFood, grams }]);
    setQuery("");
    setSelectedFoodCode("");
    setGrams(100);
  }

  function saveMeal() {
    if (items.length === 0) {
      return;
    }
    props.onSave(mealName, `${props.selectedDate}T${time}:00`, items);
  }

  if (props.foods.length === 0) {
    return (
      <section className="empty-state">
        <h1>Najprv importuj databazu potravin</h1>
        <p>Appka ocakava CSV alebo TSV export so stlpcami pre nazov potraviny a energiu v kcal.</p>
        <button onClick={props.onImport}>Otvorit import</button>
      </section>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Editor</span>
          <h1>Pridat jedlo</h1>
        </div>
        <button disabled={items.length === 0} onClick={saveMeal}>Ulozit jedlo</button>
      </header>

      <section className="editor-layout">
        <div className="panel">
          <label>
            Nazov jedla
            <input value={mealName} onChange={(event) => setMealName(event.target.value)} placeholder="Ranajky, obed..." />
          </label>
          <label>
            Cas
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label>
            Hladat potravinu
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="kuracie, ryza, jablko..." />
          </label>

          <div className="search-results">
            {results.map((food) => (
              <button key={food.code} className={food.code === selectedFood?.code ? "selected" : ""} onClick={() => setSelectedFoodCode(food.code)}>
                <strong>{food.nameCs}</strong>
                <span>{formatNumber(food.nutrientsPer100g.kcal, " kcal / 100 g")}</span>
              </button>
            ))}
          </div>

          <div className="row">
            <label>
              Gramy
              <input type="number" min="1" value={grams} onChange={(event) => setGrams(Number(event.target.value))} />
            </label>
            <button onClick={addItem} disabled={!selectedFood}>Pridat polozku</button>
          </div>
        </div>

        <div className="panel">
          <h2>Aktualne jedlo</h2>
          <div className="compact-metrics">
            <Metric label="Kalorie" value={totals.kcal} suffix=" kcal" />
            <Metric label="Bielkoviny" value={totals.protein} suffix=" g" />
            <Metric label="Tuky" value={totals.fat} suffix=" g" />
            <Metric label="Sacharidy" value={totals.carbs ?? totals.availableCarbs} suffix=" g" />
          </div>
          <div className="item-list">
            {items.map((item, index) => (
              <div className="item-row" key={`${item.food.code}-${index}`}>
                <div>
                  <strong>{item.food.nameCs}</strong>
                  <span>{item.grams} g</span>
                </div>
                <button onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Odstranit</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function HistoryPage({ meals, onDeleteMeal }: { meals: Meal[]; onDeleteMeal: (id: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = meals.filter((meal) => (!from || meal.eatenAt.slice(0, 10) >= from) && (!to || meal.eatenAt.slice(0, 10) <= to));
  const totals = filtered.reduce((sum, meal) => addNutrients(sum, meal.totals), emptyTotals);

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Archiv</span>
          <h1>Historia jedal</h1>
        </div>
      </header>
      <section className="filters">
        <label>Od <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Do <input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </section>
      <section className="summary-grid">
        <Metric label="Jedal" value={filtered.length} suffix="" />
        <Metric label="Kalorie spolu" value={totals.kcal} suffix=" kcal" />
        <Metric label="Bielkoviny" value={totals.protein} suffix=" g" />
        <Metric label="Tuky" value={totals.fat} suffix=" g" />
      </section>
      <MealList meals={filtered} onDeleteMeal={onDeleteMeal} />
    </>
  );
}

function WeightPage({ weights, onSave, onDelete }: { weights: WeightEntry[]; onSave: (measuredAt: string, kg: number) => void; onDelete: (id: string) => void }) {
  const [measuredAt, setMeasuredAt] = useState(isoDate());
  const [kg, setKg] = useState("");
  const latest = weights[0];
  const previous = weights[1];
  const delta = latest && previous ? Math.round((latest.kg - previous.kg + Number.EPSILON) * 10) / 10 : undefined;

  function saveWeight() {
    const parsed = Number(kg.replace(",", "."));
    if (!measuredAt || !Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    onSave(measuredAt, parsed);
    setKg("");
  }

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Telo</span>
          <h1>Vaha</h1>
        </div>
      </header>

      <section className="summary-grid weight-summary">
        <div className="metric primary">
          <span>Posledna vaha</span>
          <strong>{latest ? formatNumber(latest.kg, " kg") : "-"}</strong>
          <small>{latest ? new Date(latest.measuredAt).toLocaleDateString("sk-SK", { dateStyle: "medium" }) : "Zatial bez zaznamu"}</small>
        </div>
        <Metric label="Zmena" value={delta} suffix=" kg" />
      </section>

      <section className="panel narrow">
        <label>
          Datum
          <input type="date" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} />
        </label>
        <label>
          Vaha v kg
          <input inputMode="decimal" type="number" min="0" step="0.1" value={kg} onChange={(event) => setKg(event.target.value)} placeholder="82,4" />
        </label>
        <button onClick={saveWeight} disabled={!kg}>Ulozit vahu</button>
      </section>

      <section className="section-head">
        <h2>Historia vahy</h2>
      </section>
      <WeightList weights={weights} onDelete={onDelete} />
    </>
  );
}

function WeightList({ weights, onDelete }: { weights: WeightEntry[]; onDelete: (id: string) => void }) {
  if (weights.length === 0) {
    return <section className="empty-state">Ziadne ulozene vahy.</section>;
  }

  return (
    <div className="meal-list">
      {weights.map((entry) => (
        <article className="meal-card weight-card" key={entry.id}>
          <div>
            <h3>{formatNumber(entry.kg, " kg")}</h3>
            <time>{new Date(entry.measuredAt).toLocaleDateString("sk-SK", { dateStyle: "medium" })}</time>
          </div>
          <button onClick={() => onDelete(entry.id)}>Odstranit</button>
        </article>
      ))}
    </div>
  );
}

function ImportPage(props: {
  sourceVersion: string;
  setSourceVersion: (value: string) => void;
  importMessage: string;
  onImport: (file: File) => void;
  onClearFoods: () => void;
}) {
  const [selectedFileName, setSelectedFileName] = useState("");

  function handleFile(file: File) {
    setSelectedFileName(file.name);
    props.onImport(file);
  }

  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Potraviny</span>
          <h1>Import dat</h1>
        </div>
      </header>
      <section className="panel narrow">
        <label>
          Verzia zdroja
          <input value={props.sourceVersion} onChange={(event) => props.setSourceVersion(event.target.value)} placeholder="NutriDatabaze.cz v11.26" />
        </label>
        <label className="file-input">
          <span>Subor CSV alebo TSV</span>
          <strong>Vybrat CSV subor</strong>
          <small>{selectedFileName || "Klikni sem a vyber subor z NutriDatabaze.cz"}</small>
          <input type="file" accept=".csv,.tsv,.txt" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
        </label>
        {props.importMessage && <p className="status">{props.importMessage}</p>}
        <button className="danger" onClick={props.onClearFoods}>Vymazat lokalnu databazu potravin</button>
      </section>
    </>
  );
}

function SettingsPage(props: {
  dailyTarget: number;
  onTargetChange: (value: number) => void;
  onExportArchive: () => void;
  onImportArchive: (file: File) => void;
  onOpenImport: () => void;
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">Lokalne data</span>
          <h1>Nastavenia</h1>
        </div>
      </header>
      <section className="panel narrow">
        <label>
          Denny kaloricky ciel
          <input type="number" min="0" value={props.dailyTarget} onChange={(event) => props.onTargetChange(Number(event.target.value))} />
        </label>
        <button onClick={props.onOpenImport}>Importovat potraviny</button>
        <div className="actions">
          <button onClick={props.onExportArchive}>Exportovat archiv</button>
          <label className="button-like">
            Importovat archiv
            <input type="file" accept=".json" onChange={(event) => event.target.files?.[0] && props.onImportArchive(event.target.files[0])} />
          </label>
        </div>
      </section>
    </>
  );
}

function MealList({ meals, onDeleteMeal }: { meals: Meal[]; onDeleteMeal: (id: string) => void }) {
  if (meals.length === 0) {
    return <section className="empty-state">Ziadne ulozene jedla.</section>;
  }

  return (
    <div className="meal-list">
      {meals.map((meal) => (
        <article className="meal-card" key={meal.id}>
          <div className="meal-top">
            <div>
              <h3>{meal.name}</h3>
              <time>{new Date(meal.eatenAt).toLocaleString("sk-SK", { dateStyle: "medium", timeStyle: "short" })}</time>
            </div>
            <strong>{formatNumber(meal.totals.kcal, " kcal")}</strong>
          </div>
          <div className="meal-items">
            {meal.items.map((item) => (
              <span key={item.id}>{item.foodName} {item.grams} g</span>
            ))}
          </div>
          <div className="meal-footer">
            <span>B {formatNumber(meal.totals.protein, " g")}</span>
            <span>T {formatNumber(meal.totals.fat, " g")}</span>
            <span>S {formatNumber(meal.totals.carbs ?? meal.totals.availableCarbs, " g")}</span>
            <button onClick={() => onDeleteMeal(meal.id)}>Odstranit</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function Metric({ label, value, suffix }: { label: string; value?: number; suffix: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{formatNumber(value, suffix)}</strong>
    </div>
  );
}

function searchFoods(foods: Food[], query: string): Food[] {
  const normalized = normalize(query);
  if (!normalized) {
    return foods.slice().sort((a, b) => a.nameCs.localeCompare(b.nameCs, "cs"));
  }

  return foods
    .map((food) => {
      const haystack = normalize(`${food.nameCs} ${food.nameEn ?? ""} ${food.code}`);
      const index = haystack.indexOf(normalized);
      return { food, score: index === -1 ? 9999 : index };
    })
    .filter((result) => result.score !== 9999)
    .sort((a, b) => a.score - b.score || a.food.nameCs.localeCompare(b.food.nameCs, "cs"))
    .map((result) => result.food);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (looksMisdecoded(utf8)) {
    try {
      return new TextDecoder("windows-1250").decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function looksMisdecoded(text: string): boolean {
  const sample = text.slice(0, 5000);
  const replacementChars = (sample.match(/\uFFFD/g) ?? []).length;
  const mojibakeMarkers = (sample.match(/[ĂÄĹĹĽĹĄĹľĹ™ĹŻ]/g) ?? []).length;
  return replacementChars > 0 || mojibakeMarkers > 3;
}
