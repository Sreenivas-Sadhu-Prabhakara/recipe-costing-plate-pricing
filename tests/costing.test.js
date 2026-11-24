/* Table-driven tests for the pure costing module.
 *
 *   node tests/costing.test.js
 *
 * No framework, no dependencies. Every expected figure below was worked out by
 * hand from the stated rule, and the arithmetic is written as the arithmetic it
 * is so it stays readable next to the number.
 *
 * The two things these tests exist to pin down:
 *   - purchase unit -> recipe unit conversion, including the refusal when the
 *     two units are not physically comparable;
 *   - yield, which DIVIDES. The wrong direction is tested explicitly, in both
 *     directions, because getting it backwards understates every plate.
 */
"use strict";

var C = require("../assets/costing.js");

var pass = 0;
var fail = 0;
var failures = [];

function near(a, b) {
  if (typeof a !== "number" || typeof b !== "number") { return false; }
  if (!isFinite(a) || !isFinite(b)) { return a === b; }
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function show(v) {
  if (v === null) { return "null"; }
  if (v === undefined) { return "undefined"; }
  if (typeof v === "number") { return String(Math.round(v * 1e6) / 1e6); }
  return String(v);
}

function check(label, ok, detail) {
  if (ok) { pass++; return true; }
  fail++;
  failures.push(label + (detail ? "  — " + detail : ""));
  return false;
}

function eq(label, actual, expected) {
  var ok = (expected === null || expected === undefined)
    ? actual === expected
    : (typeof expected === "number" ? near(actual, expected) : actual === expected);
  return check(label, ok, "expected " + show(expected) + ", got " + show(actual));
}

function codes(errs) {
  return (errs || []).map(function (e) { return e.code; }).join(",");
}

function hasCode(errs, code) {
  return (errs || []).some(function (e) { return e.code === code; });
}

function section(name) { process.stdout.write("\n" + name + "\n"); }

/* Every message handed to the page must be a real sentence, not a code. */
function assertMessages(label, errs) {
  (errs || []).forEach(function (e, i) {
    if (!check(label + " / error object " + i, !!e && typeof e === "object", "got " + show(e))) { return; }
    check(label + " / message:" + e.code,
      typeof e.msg === "string" && e.msg.length > 20,
      "message was " + show(e.msg));
  });
}

/* ================================================================== *
 * 1. UNIT CONVERSION — the core
 * ================================================================== */
section("1. unit conversion");

var CONVERT_CASES = [
  /* label,                      qty,  from,      to,      density, expected,            viaDensity */
  ["kg -> g",                    5,    "kg",      "g",     null,    5000,                false],
  ["g -> kg",                    180,  "g",       "kg",    null,    0.18,                false],
  ["same unit",                  1,    "kg",      "kg",    null,    1,                   false],
  ["mg -> g",                    2500, "mg",      "g",     null,    2.5,                 false],
  ["l -> ml",                    2.5,  "l",       "ml",    null,    2500,                false],
  ["ml -> l",                    750,  "ml",      "l",     null,    0.75,                false],
  ["tbsp -> ml",                 1,    "tbsp",    "ml",    null,    15,                  false],
  ["tsp -> ml",                  3,    "tsp",     "ml",    null,    15,                  false],
  ["cup -> ml",                  1,    "cup",     "ml",    null,    250,                 false],
  ["lb -> g",                    1,    "lb",      "g",     null,    453.59237,           false],
  ["oz -> g (16 oz == 1 lb)",    16,   "oz",      "g",     null,    453.59237,           false],
  ["pc -> dozen",                24,   "pc",      "dozen", null,    2,                   false],
  ["dozen -> pc",                1,    "dozen",   "pc",    null,    12,                  false],
  ["portion -> portion",         1,    "portion", "portion", null,  1,                   false],
  ["blank quantity is 0",        "",   "kg",      "g",     null,    0,                   false],
  ["text quantity is 0",         "abc","kg",      "g",     null,    0,                   false],
  /* the mass/volume bridge: allowed only with a density */
  ["ml -> kg with density 0.91", 700,  "ml",      "kg",    0.91,    0.637,               true],
  ["kg -> l with density 0.91",  1,    "kg",      "l",     0.91,    1 / 0.91,            true],
  ["l -> g with density 1.03",   1,    "l",       "g",     1.03,    1030,                true]
];

CONVERT_CASES.forEach(function (c) {
  var r = C.convert(c[1], c[2], c[3], c[4]);
  eq("convert / " + c[0] + " / ok", r.ok, true);
  eq("convert / " + c[0], r.value, c[5]);
  eq("convert / " + c[0] + " / viaDensity", r.viaDensity, c[6]);
});

var CONVERT_REFUSALS = [
  /* label,                                      qty, from,      to,    density, code */
  ["per kg but used in ml, no density",           700, "ml",      "kg",  null,    "UNIT_MISMATCH"],
  ["per kg but used in ml, density 0",            700, "ml",      "kg",  0,       "UNIT_MISMATCH"],
  ["per kg but used in ml, density blank",        700, "ml",      "kg",  "",      "UNIT_MISMATCH"],
  ["per kg but used in ml, density negative",     700, "ml",      "kg",  -1,      "UNIT_MISMATCH"],
  ["per l but used in g, no density",             250, "g",       "l",   null,    "UNIT_MISMATCH"],
  ["pieces into grams is never defined",          2,   "pc",      "g",   0.91,    "COUNT_MISMATCH"],
  ["grams into pieces is never defined",          100, "g",       "pc",  0.91,    "COUNT_MISMATCH"],
  ["portions are not grams",                      1,   "portion", "g",   1,       "UNIT_MISMATCH"],
  ["unknown source unit",                         1,   "spoon",   "g",   null,    "UNKNOWN_UNIT"],
  ["unknown target unit",                         1,   "g",       "handful", null,"UNKNOWN_UNIT"]
];

CONVERT_REFUSALS.forEach(function (c) {
  var r = C.convert(c[1], c[2], c[3], c[4]);
  eq("refuse / " + c[0] + " / ok", r.ok, false);
  eq("refuse / " + c[0] + " / value", r.value, null);
  eq("refuse / " + c[0] + " / code", r.error && r.error.code, c[5]);
  assertMessages("refuse / " + c[0], [r.error]);
});

/* round trip: every unit back to itself through its base unit */
Object.keys(C.UNITS).forEach(function (u) {
  var base = C.BASE_UNIT[C.UNITS[u].dim];
  var there = C.convert(7, u, base, null);
  var back = C.convert(there.value, base, u, null);
  eq("round trip / 7 " + u + " -> " + base + " -> " + u, back.value, 7);
});

/* ================================================================== *
 * 2. YIELD — divides, never multiplies. Tested in both directions.
 * ================================================================== */
section("2. yield gross-up");

var YIELD_CASES = [
  /* label,                                    qty,  yield, basis, expected */
  ["100% yield changes nothing",               150,  100,   "EP",  150],
  ["72% yield (bone-in chicken)",              150,  72,    "EP",  150 / 0.72],
  ["70% yield",                                150,  70,    "EP",  150 / 0.70],
  ["85% yield (onion, peeled)",                3,    85,    "EP",  3 / 0.85],
  ["50% yield doubles the purchase",           200,  50,    "EP",  400],
  ["250% yield (rice gains water)",            4.5,  250,   "EP",  1.8],
  ["300% yield (dal, cooked)",                 900,  300,   "EP",  300],
  ["as-purchased basis ignores yield",         150,  72,    "AP",  150],
  ["as-purchased basis with silly yield",      150,  0,     "AP",  150],
  ["blank quantity",                           "",   72,    "EP",  0],
  ["negative quantity is treated as 0",        -5,   72,    "EP",  0]
];

YIELD_CASES.forEach(function (c) {
  var r = C.asPurchasedQty(c[1], c[2], c[3]);
  eq("yield / " + c[0] + " / ok", r.ok, true);
  eq("yield / " + c[0], r.value, c[4]);
});

/* the direction itself, stated as an invariant rather than a number */
[50, 60, 70, 72, 85, 95, 99].forEach(function (y) {
  var r = C.asPurchasedQty(150, y, "EP");
  check("direction / yield " + y + "% must RAISE the purchase quantity",
    r.value > 150, "got " + show(r.value));
  check("direction / yield " + y + "% must not be the multiply mistake",
    !near(r.value, 150 * y / 100),
    "got " + show(r.value) + " which equals 150 x " + y + "%");
  check("direction / yield " + y + "% equals served / yield",
    near(r.value, 150 / (y / 100)), "got " + show(r.value));
});

[101, 150, 250, 300].forEach(function (y) {
  var r = C.asPurchasedQty(150, y, "EP");
  check("direction / yield " + y + "% must LOWER the purchase quantity",
    r.value < 150, "got " + show(r.value));
  check("direction / yield " + y + "% equals served / yield",
    near(r.value, 150 / (y / 100)), "got " + show(r.value));
});

/* zero yield is a hole, not a number */
var zy = C.asPurchasedQty(150, 0, "EP");
eq("yield / zero yield refused", zy.ok, false);
eq("yield / zero yield value", zy.value, null);
eq("yield / zero yield code", zy.error && zy.error.code, "ZERO_YIELD");
assertMessages("yield / zero yield", [zy.error]);
var ny = C.asPurchasedQty(150, -20, "EP");
eq("yield / negative yield refused", ny.ok, false);
eq("yield / negative yield code", ny.error && ny.error.code, "ZERO_YIELD");

/* ================================================================== *
 * 3. ONE INGREDIENT LINE — pack price to line cost
 * ================================================================== */
section("3. ingredient lines");

var LINE_CASES = [
  {
    label: "25 kg rice sack, 180 g on the plate",
    line: { name: "Rice", packPrice: 1450, packQty: 25, packUnit: "kg", qty: 180, unit: "g", yieldPct: 100 },
    unitCost: 1450 / 25,                 /* 58 per kg */
    apQty: 180,                          /* grams, as purchased */
    purchaseQty: 0.18,                   /* kilos */
    cost: 1450 / 25 * 0.18               /* 10.44 */
  },
  {
    label: "chicken at 240/kg, 150 g served, 72% yield",
    line: { name: "Chicken", packPrice: 240, packQty: 1, packUnit: "kg", qty: 150, unit: "g", yieldPct: 72 },
    unitCost: 240,
    apQty: 150 / 0.72,                   /* 208.333 g bought */
    purchaseQty: 0.15 / 0.72,
    cost: 50                             /* 240 x 0.15 / 0.72 = exactly 50 */
  },
  {
    label: "same chicken, yield ignored (the mistake)",
    line: { name: "Chicken", packPrice: 240, packQty: 1, packUnit: "kg", qty: 150, unit: "g", yieldPct: 100 },
    unitCost: 240,
    apQty: 150,
    purchaseQty: 0.15,
    cost: 36                             /* understated by 14 a plate */
  },
  {
    label: "same chicken entered as purchased",
    line: { name: "Chicken", packPrice: 240, packQty: 1, packUnit: "kg", qty: 150, unit: "g", yieldPct: 72, basis: "AP" },
    unitCost: 240,
    apQty: 150,
    purchaseQty: 0.15,
    cost: 36
  },
  {
    label: "rice bought raw, 4.5 kg cooked at 250% yield",
    line: { name: "Rice", packPrice: 1450, packQty: 25, packUnit: "kg", qty: 4.5, unit: "kg", yieldPct: 250 },
    unitCost: 58,
    apQty: 1.8,
    purchaseQty: 1.8,
    cost: 104.4                          /* 58 x 1.8 */
  },
  {
    label: "15 kg oil tin, 700 ml used, density 0.91",
    line: { name: "Oil", packPrice: 1850, packQty: 15, packUnit: "kg", qty: 700, unit: "ml", yieldPct: 100, density: 0.91 },
    unitCost: 1850 / 15,
    apQty: 700,
    purchaseQty: 0.637,
    cost: 1850 * 0.637 / 15,             /* 78.5633... */
    viaDensity: true
  },
  {
    label: "spice at 520/kg, 180 g",
    line: { name: "Spice", packPrice: 520, packQty: 1, packUnit: "kg", qty: 180, unit: "g", yieldPct: 100 },
    unitCost: 520,
    apQty: 180,
    purchaseQty: 0.18,
    cost: 93.6
  },
  {
    label: "tray of 30 eggs at 210, 2 pieces used",
    line: { name: "Egg", packPrice: 210, packQty: 30, packUnit: "pc", qty: 2, unit: "pc", yieldPct: 100 },
    unitCost: 7,
    apQty: 2,
    purchaseQty: 2,
    cost: 14
  },
  {
    label: "1 l milk bottle at 66, 120 ml used",
    line: { name: "Milk", packPrice: 66, packQty: 1, packUnit: "l", qty: 120, unit: "ml", yieldPct: 100 },
    unitCost: 66,
    apQty: 120,
    purchaseQty: 0.12,
    cost: 7.92
  },
  {
    label: "herbs from the garden cost nothing",
    line: { name: "Curry leaf", packPrice: 0, packQty: 1, packUnit: "kg", qty: 50, unit: "g", yieldPct: 100 },
    unitCost: 0,
    apQty: 50,
    purchaseQty: 0.05,
    cost: 0
  },
  {
    label: "negative pack price is treated as 0",
    line: { name: "Odd", packPrice: -500, packQty: 1, packUnit: "kg", qty: 100, unit: "g", yieldPct: 100 },
    unitCost: 0,
    apQty: 100,
    purchaseQty: 0.1,
    cost: 0
  },
  {
    label: "blank quantity costs nothing",
    line: { name: "Blank", packPrice: 500, packQty: 1, packUnit: "kg", qty: "", unit: "g", yieldPct: 100 },
    unitCost: 500,
    apQty: 0,
    purchaseQty: 0,
    cost: 0
  }
];

LINE_CASES.forEach(function (c) {
  var r = C.costLine(c.line, null);
  eq("line / " + c.label + " / no errors", codes(r.errors), "");
  eq("line / " + c.label + " / unit cost", r.unitCost, c.unitCost);
  eq("line / " + c.label + " / as-purchased qty", r.apQty, c.apQty);
  eq("line / " + c.label + " / qty in pack units", r.purchaseQty, c.purchaseQty);
  eq("line / " + c.label + " / cost", r.cost, c.cost);
  eq("line / " + c.label + " / via density", r.viaDensity, !!c.viaDensity);
});

/* the yield direction again, this time in money */
var withYield = C.costLine({ packPrice: 240, packQty: 1, packUnit: "kg", qty: 150, unit: "g", yieldPct: 72 }, null);
var noYield = C.costLine({ packPrice: 240, packQty: 1, packUnit: "kg", qty: 150, unit: "g", yieldPct: 100 }, null);
check("money direction / trim loss must raise the plate cost", withYield.cost > noYield.cost,
  show(withYield.cost) + " vs " + show(noYield.cost));
eq("money direction / understatement is exactly 14", withYield.cost - noYield.cost, 14);
check("money direction / not the multiply mistake", !near(withYield.cost, 36 * 0.72),
  "got " + show(withYield.cost));

var gaining = C.costLine({ packPrice: 58, packQty: 1, packUnit: "kg", qty: 450, unit: "g", yieldPct: 250 }, null);
check("money direction / an ingredient that gains weight costs less, not more",
  gaining.cost < 58 * 0.45, show(gaining.cost));
eq("money direction / cooked rice 450 g costs 58 x 0.18", gaining.cost, 58 * 0.18);

/* line-level refusals */
var LINE_REFUSALS = [
  {
    label: "priced per kg, entered in millilitres, no density",
    line: { name: "Oil", packPrice: 1850, packQty: 15, packUnit: "kg", qty: 700, unit: "ml", yieldPct: 100 },
    code: "UNIT_MISMATCH"
  },
  {
    label: "priced per litre, entered in grams, no density",
    line: { name: "Vinegar", packPrice: 180, packQty: 5, packUnit: "l", qty: 250, unit: "g", yieldPct: 100 },
    code: "UNIT_MISMATCH"
  },
  {
    label: "priced per tray of pieces, entered in grams",
    line: { name: "Egg", packPrice: 210, packQty: 30, packUnit: "pc", qty: 100, unit: "g", yieldPct: 100 },
    code: "COUNT_MISMATCH"
  },
  {
    label: "pack size left at zero",
    line: { name: "Rice", packPrice: 1450, packQty: 0, packUnit: "kg", qty: 180, unit: "g", yieldPct: 100 },
    code: "ZERO_PACK"
  },
  {
    label: "pack size blank",
    line: { name: "Rice", packPrice: 1450, packQty: "", packUnit: "kg", qty: 180, unit: "g", yieldPct: 100 },
    code: "ZERO_PACK"
  },
  {
    label: "zero yield",
    line: { name: "Chicken", packPrice: 240, packQty: 1, packUnit: "kg", qty: 150, unit: "g", yieldPct: 0 },
    code: "ZERO_YIELD"
  },
  {
    label: "unknown pack unit",
    line: { name: "Odd", packPrice: 100, packQty: 1, packUnit: "sack", qty: 180, unit: "g", yieldPct: 100 },
    code: "UNKNOWN_UNIT"
  },
  {
    label: "unknown recipe unit",
    line: { name: "Odd", packPrice: 100, packQty: 1, packUnit: "kg", qty: 2, unit: "handful", yieldPct: 100 },
    code: "UNKNOWN_UNIT"
  }
];

LINE_REFUSALS.forEach(function (c) {
  var r = C.costLine(c.line, null);
  eq("line refusal / " + c.label + " / code", codes(r.errors), c.code);
  eq("line refusal / " + c.label + " / costs nothing rather than guessing", r.cost, 0);
  check("line refusal / " + c.label + " / cost is finite", isFinite(r.cost), show(r.cost));
  assertMessages("line refusal / " + c.label, r.errors);
});

/* the same line, rescued by a density */
var rescued = C.costLine({ name: "Oil", packPrice: 1850, packQty: 15, packUnit: "kg", qty: 700, unit: "ml", yieldPct: 100, density: 0.91 }, null);
eq("rescue / density clears the mismatch", codes(rescued.errors), "");
eq("rescue / cost", rescued.cost, 1850 * 0.637 / 15);
eq("rescue / flagged as bridged", rescued.viaDensity, true);

/* ================================================================== *
 * 4. ONE RECIPE — batch to plate
 * ================================================================== */
section("4. recipe and plate cost");

var R1 = {
  id: "d1", name: "Test dish", kind: "dish",
  yieldQty: 10, yieldUnit: "portion",
  wastagePct: 5, otherDirect: 8, menuPrice: 0,
  lines: [
    { kind: "ingredient", name: "A", packPrice: 100, packQty: 1, packUnit: "kg", qty: 200, unit: "g", yieldPct: 100 },
    { kind: "ingredient", name: "B", packPrice: 240, packQty: 1, packUnit: "kg", qty: 150, unit: "g", yieldPct: 72 }
  ]
};
var r1 = C.costRecipe(R1, null);
eq("recipe / ingredient cost per batch", r1.ingredientCostBatch, 70);          /* 20 + 50 */
eq("recipe / wastage amount at 5%", r1.wastageAmount, 3.5);
eq("recipe / food cost per batch", r1.foodCostBatch, 73.5);
eq("recipe / other direct per batch (8 x 10 plates)", r1.otherDirectBatch, 80);
eq("recipe / plate cost per batch", r1.plateCostBatch, 153.5);
eq("recipe / plate cost per portion", r1.costPerYieldUnit, 15.35);
eq("recipe / food-only cost per portion", r1.foodCostPerYieldUnit, 7.35);
eq("recipe / cost per base unit (portion)", r1.costPerBase, 15.35);
eq("recipe / no errors", codes(r1.errors), "");

/* wastage applies to food, not to packaging */
var r1b = C.costRecipe(Object.assign({}, R1, { wastagePct: 0 }), null);
eq("recipe / no wastage", r1b.foodCostBatch, 70);
eq("recipe / packaging untouched by wastage", r1b.otherDirectBatch, 80);
eq("recipe / plate cost without wastage", r1b.costPerYieldUnit, 15);

var RECIPE_CASES = [
  { label: "zero portions", patch: { yieldQty: 0 }, costPerYieldUnit: null, code: "ZERO_PORTIONS" },
  { label: "blank portions", patch: { yieldQty: "" }, costPerYieldUnit: null, code: "ZERO_PORTIONS" },
  { label: "negative portions", patch: { yieldQty: -4 }, costPerYieldUnit: null, code: "ZERO_PORTIONS" },
  { label: "one portion", patch: { yieldQty: 1 }, costPerYieldUnit: 70 + 3.5 + 8, code: "" },
  { label: "half-plate portions", patch: { yieldQty: 2.5 }, costPerYieldUnit: (73.5 + 20) / 2.5, code: "" }
];

RECIPE_CASES.forEach(function (c) {
  var r = C.costRecipe(Object.assign({}, R1, c.patch), null);
  eq("recipe / " + c.label + " / cost per portion", r.costPerYieldUnit, c.costPerYieldUnit);
  eq("recipe / " + c.label + " / codes", codes(r.errors), c.code);
  assertMessages("recipe / " + c.label, r.errors);
});

/* a broken line shortens the total AND says so */
var rBroken = C.costRecipe(Object.assign({}, R1, {
  lines: R1.lines.concat([{ kind: "ingredient", name: "Oil", packPrice: 1850, packQty: 15, packUnit: "kg", qty: 700, unit: "ml", yieldPct: 100 }])
}), null);
eq("recipe / broken line is flagged at recipe level", hasCode(rBroken.errors, "LINE_ERRORS"), true);
eq("recipe / broken line contributes nothing", rBroken.ingredientCostBatch, 70);
check("recipe / broken line keeps the total finite", isFinite(rBroken.costPerYieldUnit), show(rBroken.costPerYieldUnit));

/* a prep batch measured in kilos gets a cost per gram */
var P1 = {
  id: "p1", name: "Base gravy", kind: "prep",
  yieldQty: 4, yieldUnit: "kg", wastagePct: 0, otherDirect: 0,
  lines: [{ kind: "ingredient", name: "X", packPrice: 400, packQty: 10, packUnit: "kg", qty: 2, unit: "kg", yieldPct: 100 }]
};
var p1 = C.costRecipe(P1, null);
eq("prep / batch cost", p1.plateCostBatch, 80);
eq("prep / cost per kilo", p1.costPerYieldUnit, 20);
eq("prep / base unit", p1.baseUnit, "g");
eq("prep / cost per gram", p1.costPerBase, 0.02);
eq("prep / other direct is per batch for a prep", p1.otherDirectBasis, "perBatch");

var p1fuel = C.costRecipe(Object.assign({}, P1, { otherDirect: 20 }), null);
eq("prep / fuel added once per batch", p1fuel.plateCostBatch, 100);
eq("prep / cost per kilo with fuel", p1fuel.costPerYieldUnit, 25);

/* ================================================================== *
 * 5. SUB-RECIPES — costed once, used by many
 * ================================================================== */
section("5. sub-recipes and the cascade");

function book(extra) {
  return {
    pricing: { targetPct: 30, taxPct: 0, taxInclusive: false, rounding: 0 },
    recipes: [
      {
        id: "p1", name: "Base gravy", kind: "prep", yieldQty: 4, yieldUnit: "kg",
        wastagePct: 0, otherDirect: 0,
        lines: [{ kind: "ingredient", name: "Onion", packPrice: (extra && extra.onion) || 400, packQty: 10, packUnit: "kg", qty: 2, unit: "kg", yieldPct: 100 }]
      },
      {
        id: "d1", name: "Dish one", kind: "dish", yieldQty: 10, yieldUnit: "portion",
        wastagePct: 0, otherDirect: 0, menuPrice: 0,
        lines: [{ kind: "prep", name: "Base gravy", prepId: "p1", qty: 1.2, unit: "kg", yieldPct: 100 }]
      },
      {
        id: "d2", name: "Dish two", kind: "dish", yieldQty: 10, yieldUnit: "portion",
        wastagePct: 0, otherDirect: 0, menuPrice: 0,
        lines: [{ kind: "prep", name: "Base gravy", prepId: "p1", qty: 0.6, unit: "kg", yieldPct: 100 }]
      }
    ]
  };
}

var b1 = C.costBook(book());
eq("sub / prep cost per gram", b1.results.p1.costPerBase, 0.02);
eq("sub / dish one takes 1.2 kg of gravy", b1.results.d1.lines[0].cost, 24);
eq("sub / dish two takes 0.6 kg of gravy", b1.results.d2.lines[0].cost, 12);
eq("sub / dish one plate cost", b1.results.d1.costPerYieldUnit, 2.4);
eq("sub / prep is used by two dishes", b1.results.p1.usedBy.length, 2);
eq("sub / dependency names", b1.results.p1.usedBy.map(function (u) { return u.name; }).join("+"), "Dish one+Dish two");
eq("sub / no errors anywhere", [b1.results.p1, b1.results.d1, b1.results.d2].map(function (r) { return codes(r.errors); }).join("|"), "||");

/* one price change, every dependent dish moves */
var b2 = C.costBook(book({ onion: 600 }));
eq("cascade / prep cost per gram after the price rise", b2.results.p1.costPerBase, 0.03);
eq("cascade / dish one line", b2.results.d1.lines[0].cost, 36);
eq("cascade / dish two line", b2.results.d2.lines[0].cost, 18);
eq("cascade / dish one plate cost", b2.results.d1.costPerYieldUnit, 3.6);
eq("cascade / dish two plate cost", b2.results.d2.costPerYieldUnit, 1.8);
check("cascade / both dishes moved", b2.results.d1.costPerYieldUnit > b1.results.d1.costPerYieldUnit && b2.results.d2.costPerYieldUnit > b1.results.d2.costPerYieldUnit, "they did not");

var SUB_CASES = [
  {
    label: "prep in kilos, dish uses grams",
    line: { kind: "prep", prepId: "p1", qty: 120, unit: "g", yieldPct: 100 },
    cost: 2.4, code: ""
  },
  {
    label: "prep in kilos, dish uses litres with a density",
    line: { kind: "prep", prepId: "p1", qty: 0.5, unit: "l", yieldPct: 100, density: 1 },
    cost: 10, code: ""
  },
  {
    label: "prep in kilos, dish uses litres without a density",
    line: { kind: "prep", prepId: "p1", qty: 0.5, unit: "l", yieldPct: 100 },
    cost: 0, code: "UNIT_MISMATCH"
  },
  {
    label: "prep in kilos, dish asks for portions",
    line: { kind: "prep", prepId: "p1", qty: 1, unit: "portion", yieldPct: 100 },
    cost: 0, code: "PREP_DIM"
  },
  {
    label: "prep reference that no longer exists",
    line: { kind: "prep", prepId: "ghost", qty: 1, unit: "kg", yieldPct: 100 },
    cost: 0, code: "MISSING_PREP"
  },
  {
    label: "a prep still loses yield when it is reduced further",
    line: { kind: "prep", prepId: "p1", qty: 1, unit: "kg", yieldPct: 50 },
    cost: 40, code: ""
  }
];

SUB_CASES.forEach(function (c) {
  var bb = book();
  bb.recipes[1].lines = [c.line];
  var r = C.costBook(bb);
  eq("sub / " + c.label + " / code", codes(r.results.d1.lines[0].errors), c.code);
  eq("sub / " + c.label + " / cost", r.results.d1.lines[0].cost, c.cost);
  check("sub / " + c.label + " / finite", isFinite(r.results.d1.lines[0].cost), "not finite");
  assertMessages("sub / " + c.label, r.results.d1.lines[0].errors);
});

/* a prep of a prep */
var deep = {
  pricing: {},
  recipes: [
    { id: "p0", name: "Spice paste", kind: "prep", yieldQty: 1, yieldUnit: "kg", lines: [{ kind: "ingredient", name: "Spice", packPrice: 500, packQty: 1, packUnit: "kg", qty: 1, unit: "kg", yieldPct: 100 }] },
    { id: "p1", name: "Gravy", kind: "prep", yieldQty: 4, yieldUnit: "kg", lines: [{ kind: "prep", prepId: "p0", qty: 200, unit: "g", yieldPct: 100 }] },
    { id: "d1", name: "Dish", kind: "dish", yieldQty: 10, yieldUnit: "portion", lines: [{ kind: "prep", prepId: "p1", qty: 1, unit: "kg", yieldPct: 100 }] }
  ]
};
var dp = C.costBook(deep);
eq("depth / paste cost per kilo", dp.results.p0.costPerYieldUnit, 500);
eq("depth / gravy batch cost (200 g of paste)", dp.results.p1.plateCostBatch, 100);
eq("depth / gravy cost per kilo", dp.results.p1.costPerYieldUnit, 25);
eq("depth / dish takes 1 kg of gravy", dp.results.d1.lines[0].cost, 25);
eq("depth / dish plate cost", dp.results.d1.costPerYieldUnit, 2.5);
eq("depth / no errors", [dp.results.p0, dp.results.p1, dp.results.d1].map(function (r) { return codes(r.errors); }).join("|"), "||");

/* a loop must be reported, not hung on */
var loop = {
  pricing: {},
  recipes: [
    { id: "a", name: "A", kind: "prep", yieldQty: 1, yieldUnit: "kg", lines: [{ kind: "prep", prepId: "b", qty: 1, unit: "kg", yieldPct: 100 }] },
    { id: "b", name: "B", kind: "prep", yieldQty: 1, yieldUnit: "kg", lines: [{ kind: "prep", prepId: "a", qty: 1, unit: "kg", yieldPct: 100 }] }
  ]
};
var lp = C.costBook(loop);
eq("loop / A is flagged", hasCode(lp.results.a.errors, "CYCLE"), true);
eq("loop / B is flagged", hasCode(lp.results.b.errors, "CYCLE"), true);
eq("loop / A has no cost", lp.results.a.costPerYieldUnit, null);
eq("loop / B has no cost", lp.results.b.costPerYieldUnit, null);
assertMessages("loop / A", lp.results.a.errors);

var selfLoop = {
  pricing: {},
  recipes: [{ id: "a", name: "A", kind: "prep", yieldQty: 1, yieldUnit: "kg", lines: [{ kind: "prep", prepId: "a", qty: 1, unit: "kg", yieldPct: 100 }] }]
};
var sl = C.costBook(selfLoop);
eq("loop / a prep that uses itself is flagged", hasCode(sl.results.a.errors, "CYCLE"), true);
eq("loop / and has no cost", sl.results.a.costPerYieldUnit, null);

/* a dish that uses a looped prep must still render */
var loop3 = {
  pricing: {},
  recipes: [
    { id: "a", name: "A", kind: "prep", yieldQty: 1, yieldUnit: "kg", lines: [{ kind: "prep", prepId: "b", qty: 1, unit: "kg", yieldPct: 100 }] },
    { id: "b", name: "B", kind: "prep", yieldQty: 1, yieldUnit: "kg", lines: [{ kind: "prep", prepId: "a", qty: 1, unit: "kg", yieldPct: 100 }] },
    { id: "d", name: "D", kind: "dish", yieldQty: 4, yieldUnit: "portion", lines: [{ kind: "prep", prepId: "a", qty: 1, unit: "kg", yieldPct: 100 }, { kind: "ingredient", name: "Rice", packPrice: 58, packQty: 1, packUnit: "kg", qty: 1, unit: "kg", yieldPct: 100 }] }
  ]
};
var l3 = C.costBook(loop3);
eq("loop / the dish is not in the loop", lp3Codes(), false);
function lp3Codes() { return hasCode(l3.results.d.errors, "CYCLE"); }
eq("loop / the dish flags the unusable line", hasCode(l3.results.d.lines[0].errors, "CYCLE"), true);
eq("loop / the dish still costs what it can", l3.results.d.ingredientCostBatch, 58);
eq("loop / the dish plate cost", l3.results.d.costPerYieldUnit, 14.5);

/* ================================================================== *
 * 6. PRICE FROM COST and COST FROM PRICE
 * ================================================================== */
section("6. pricing both ways");

var TARGET_CASES = [
  /* cost, target, tax, round,  net,            rounded, gross,   multiple,  effectiveCostPct */
  [70,     30,     0,   5,      70 / 0.30,      235,     235,     100 / 30,  70 / 235 * 100],
  [70,     30,     5,   5,      70 / 0.30,      235,     246.75,  100 / 30,  70 / 235 * 100],
  [70,     30,     0,   0,      70 / 0.30,      70 / 0.30, 70 / 0.30, 100 / 30, 30],
  [70,     30,     0,   10,     70 / 0.30,      240,     240,     100 / 30,  70 / 240 * 100],
  [70,     25,     0,   5,      280,            280,     280,     4,         25],
  [70,     35,     0,   1,      200,            200,     200,     100 / 35,  35],
  [70,     100,    0,   0,      70,             70,      70,      1,         100],
  [0,      30,     0,   5,      0,              0,       0,       100 / 30,  null],
  [233.33, 30,     0,   5,      777.7666666,    780,     780,     100 / 30,  233.33 / 780 * 100]
];

TARGET_CASES.forEach(function (c) {
  var label = "target / cost " + c[0] + " at " + c[1] + "% (tax " + c[2] + ", round " + c[3] + ")";
  var r = C.priceAtTarget(c[0], c[1], c[2], c[3]);
  eq(label + " / ok", r.ok, true);
  eq(label + " / exact price", r.suggestedNet, c[4]);
  eq(label + " / rounded up", r.suggestedRounded, c[5]);
  eq(label + " / with tax", r.suggestedGross, c[6]);
  eq(label + " / pricing multiple", r.multiple, c[7]);
  eq(label + " / food cost at the rounded price", r.effectiveCostPct, c[8]);
  if (r.suggestedRounded !== null && r.suggestedNet !== null) {
    check(label + " / rounding never goes down", r.suggestedRounded >= r.suggestedNet - 1e-9, "it did");
  }
});

[0, -1, "", "abc", 101, 1000].forEach(function (t) {
  var r = C.priceAtTarget(70, t, 0, 5);
  eq("target / refuse target " + show(t), r.ok, false);
  eq("target / refuse target " + show(t) + " / code", codes(r.errors), "TARGET_OUT_OF_RANGE");
  eq("target / refuse target " + show(t) + " / price", r.suggestedRounded, null);
  assertMessages("target / refuse " + show(t), r.errors);
});

var ANALYSE_CASES = [
  {
    label: "70 cost, 320 on the menu, no tax",
    args: [70, 320, 0, false, 30],
    netPrice: 320, costPct: 70 / 320 * 100, marginAmount: 250, marginPct: 250 / 320 * 100,
    vsTargetPoints: 70 / 320 * 100 - 30, multiple: 320 / 70, verdict: "at-or-under-target"
  },
  {
    label: "70 cost, 250 on the menu including 5% tax",
    args: [70, 250, 5, true, 30],
    netPrice: 250 / 1.05, costPct: 29.4, marginAmount: 250 / 1.05 - 70, marginPct: (250 / 1.05 - 70) / (250 / 1.05) * 100,
    vsTargetPoints: -0.6, multiple: (250 / 1.05) / 70, verdict: "at-or-under-target"
  },
  {
    label: "70 cost, 250 on the menu plus 5% tax",
    args: [70, 250, 5, false, 30],
    netPrice: 250, costPct: 28, marginAmount: 180, marginPct: 72,
    vsTargetPoints: -2, multiple: 250 / 70, verdict: "at-or-under-target"
  },
  {
    label: "70 cost, 150 on the menu — over target",
    args: [70, 150, 0, false, 30],
    netPrice: 150, costPct: 70 / 150 * 100, marginAmount: 80, marginPct: 80 / 150 * 100,
    vsTargetPoints: 70 / 150 * 100 - 30, multiple: 150 / 70, verdict: "over-target"
  },
  {
    label: "70 cost, exactly on target at 233.333",
    args: [70, 70 / 0.3, 0, false, 30],
    netPrice: 70 / 0.3, costPct: 30, marginAmount: 70 / 0.3 - 70, marginPct: 70,
    vsTargetPoints: 0, multiple: 10 / 3, verdict: "at-or-under-target"
  },
  {
    label: "70 cost, 50 on the menu — sold below cost",
    args: [70, 50, 0, false, 30],
    netPrice: 50, costPct: 140, marginAmount: -20, marginPct: -40,
    vsTargetPoints: 110, multiple: 50 / 70, verdict: "below-cost"
  },
  {
    label: "no target set",
    args: [70, 320, 0, false, 0],
    netPrice: 320, costPct: 70 / 320 * 100, marginAmount: 250, marginPct: 250 / 320 * 100,
    vsTargetPoints: null, multiple: 320 / 70, verdict: "no-target"
  }
];

ANALYSE_CASES.forEach(function (c) {
  var r = C.analysePrice(c.args[0], c.args[1], c.args[2], c.args[3], c.args[4]);
  eq("analyse / " + c.label + " / ok", r.ok, true);
  eq("analyse / " + c.label + " / price before tax", r.netPrice, c.netPrice);
  eq("analyse / " + c.label + " / food cost %", r.costPct, c.costPct);
  eq("analyse / " + c.label + " / gross margin per plate", r.marginAmount, c.marginAmount);
  eq("analyse / " + c.label + " / gross margin %", r.marginPct, c.marginPct);
  eq("analyse / " + c.label + " / points vs target", r.vsTargetPoints, c.vsTargetPoints);
  eq("analyse / " + c.label + " / pricing multiple", r.multiple, c.multiple);
  eq("analyse / " + c.label + " / verdict", r.verdict, c.verdict);
  if (r.costPct !== null && r.marginPct !== null) {
    check("analyse / " + c.label + " / cost% + margin% = 100", near(r.costPct + r.marginPct, 100), "they do not");
  }
});

[0, "", -10, "abc"].forEach(function (p) {
  var r = C.analysePrice(70, p, 0, false, 30);
  eq("analyse / no price " + show(p) + " / refused", r.ok, false);
  eq("analyse / no price " + show(p) + " / code", codes(r.errors), "NO_PRICE");
  eq("analyse / no price " + show(p) + " / food cost %", r.costPct, null);
  eq("analyse / no price " + show(p) + " / margin", r.marginAmount, null);
  assertMessages("analyse / no price " + show(p), r.errors);
});

/* the two directions must agree: price at target, then read it back */
[[70, 30], [12.5, 28], [240, 35], [7.25, 25], [1000, 33.3]].forEach(function (c) {
  var t = C.priceAtTarget(c[0], c[1], 0, 0);
  var a = C.analysePrice(c[0], t.suggestedNet, 0, false, c[1]);
  check("round trip / cost " + c[0] + " at " + c[1] + "% reads back as " + c[1] + "%",
    near(a.costPct, c[1]), "got " + show(a.costPct));
  check("round trip / and is exactly on target", near(a.vsTargetPoints, 0), "got " + show(a.vsTargetPoints));
});

/* tax must not touch the food-cost percentage when the price is quoted ex-tax */
var exTax0 = C.analysePrice(70, 250, 0, false, 30);
var exTax18 = C.analysePrice(70, 250, 18, false, 30);
eq("tax / an ex-tax price gives the same food cost % whatever the tax rate", exTax18.costPct, exTax0.costPct);
check("tax / but the customer pays more", exTax18.grossPrice > exTax0.grossPrice, "they did not");
var inc18 = C.analysePrice(70, 250, 18, true, 30);
check("tax / a tax-inclusive price hides a worse food cost %", inc18.costPct > exTax0.costPct,
  show(inc18.costPct) + " vs " + show(exTax0.costPct));
eq("tax / inclusive 250 at 18% is 211.86 before tax", inc18.netPrice, 250 / 1.18);
eq("tax / and the tax inside it", inc18.taxAmount, 250 - 250 / 1.18);

/* ================================================================== *
 * 7. THE WHOLE BOOK — invariants on every result
 * ================================================================== */
section("7. book-wide invariants");

function assertInvariants(label, r) {
  check(label + " / food = ingredients + wastage",
    near(r.foodCostBatch, r.ingredientCostBatch + r.wastageAmount), "it does not");
  check(label + " / batch = food + other direct",
    near(r.plateCostBatch, r.foodCostBatch + r.otherDirectBatch), "it does not");
  if (r.costPerYieldUnit !== null) {
    check(label + " / per unit x yield = batch",
      near(r.costPerYieldUnit * r.yieldQty, r.plateCostBatch), "it does not");
    check(label + " / food-only per unit never exceeds total per unit",
      r.foodCostPerYieldUnit <= r.costPerYieldUnit + 1e-9, "it does");
  }
  if (r.costPerBase !== null && r.baseQty) {
    check(label + " / per base unit x base qty = batch",
      near(r.costPerBase * r.baseQty, r.plateCostBatch), "it does not");
  }
  check(label + " / line costs add up to the ingredient total",
    near(r.lines.reduce(function (s, l) { return s + l.cost; }, 0), r.ingredientCostBatch), "they do not");
}

function assertFinite(label, node, depth) {
  if (depth > 6 || node === null || typeof node !== "object") { return; }
  Object.keys(node).forEach(function (k) {
    var v = node[k];
    if (typeof v === "number") {
      check(label + " / finite:" + k, isFinite(v), "got " + v);
    } else if (v && typeof v === "object") {
      assertFinite(label + "." + k, v, depth + 1);
    }
  });
}

/* adversarial books: nothing here may produce NaN, Infinity or a hang */
var ADVERSARIAL = [
  { label: "empty book", book: {} },
  { label: "no recipes", book: { recipes: [] } },
  { label: "null recipe", book: { recipes: [null, undefined] } },
  { label: "recipe with no lines", book: { recipes: [{ id: "x", name: "X", kind: "dish", yieldQty: 4, yieldUnit: "portion" }] } },
  { label: "everything zero", book: { recipes: [{ id: "x", kind: "dish", yieldQty: 0, yieldUnit: "portion", wastagePct: 0, otherDirect: 0, menuPrice: 0, lines: [{ kind: "ingredient", packPrice: 0, packQty: 0, packUnit: "kg", qty: 0, unit: "g", yieldPct: 0 }] }], pricing: { targetPct: 0, taxPct: 0, rounding: 0 } } },
  { label: "everything blank", book: { recipes: [{ id: "x", kind: "dish", yieldQty: "", yieldUnit: "", wastagePct: "", otherDirect: "", menuPrice: "", lines: [{ kind: "ingredient", packPrice: "", packQty: "", packUnit: "", qty: "", unit: "", yieldPct: "" }] }], pricing: { targetPct: "", taxPct: "", rounding: "" } } },
  { label: "everything text", book: { recipes: [{ id: "x", kind: "dish", yieldQty: "four", yieldUnit: "plates", wastagePct: "lots", otherDirect: "some", menuPrice: "free", lines: [{ kind: "ingredient", packPrice: "cheap", packQty: "a sack", packUnit: "sack", qty: "a bit", unit: "pinch", yieldPct: "most" }] }], pricing: { targetPct: "a third", taxPct: "GST", rounding: "nearest" } } },
  { label: "everything negative", book: { recipes: [{ id: "x", kind: "dish", yieldQty: -4, yieldUnit: "portion", wastagePct: -5, otherDirect: -8, menuPrice: -320, lines: [{ kind: "ingredient", packPrice: -1450, packQty: -25, packUnit: "kg", qty: -180, unit: "g", yieldPct: -72 }] }], pricing: { targetPct: -30, taxPct: -5, rounding: -5 } } },
  { label: "absurd magnitudes", book: { recipes: [{ id: "x", kind: "dish", yieldQty: 1e-9, yieldUnit: "portion", wastagePct: 1e9, otherDirect: 1e9, menuPrice: 1e-9, lines: [{ kind: "ingredient", packPrice: 1e12, packQty: 1e-12, packUnit: "kg", qty: 1e12, unit: "g", yieldPct: 1e-9 }] }], pricing: { targetPct: 1e-9, taxPct: 1e9, rounding: 1e9 } } },
  { label: "duplicate ids", book: { recipes: [{ id: "x", kind: "dish", yieldQty: 4, yieldUnit: "portion", lines: [] }, { id: "x", kind: "prep", yieldQty: 2, yieldUnit: "kg", lines: [] }] } },
  { label: "missing ids", book: { recipes: [{ kind: "dish", yieldQty: 4, yieldUnit: "portion", lines: [] }] } },
  { label: "lines not an array", book: { recipes: [{ id: "x", kind: "dish", yieldQty: 4, yieldUnit: "portion", lines: "rice" }] } },
  { label: "prep pointing at a dish", book: { recipes: [{ id: "d", kind: "dish", yieldQty: 4, yieldUnit: "portion", lines: [{ kind: "prep", prepId: "e", qty: 1, unit: "portion", yieldPct: 100 }] }, { id: "e", kind: "dish", yieldQty: 2, yieldUnit: "portion", lines: [{ kind: "ingredient", packPrice: 100, packQty: 1, packUnit: "kg", qty: 500, unit: "g", yieldPct: 100 }] }] } },
  { label: "the loop", book: loop },
  { label: "the self loop", book: selfLoop },
  { label: "the worked example shape", book: book() },
  { label: "the deep chain", book: deep }
];

ADVERSARIAL.forEach(function (c) {
  var out;
  try {
    out = C.costBook(c.book);
  } catch (e) {
    check("book / " + c.label + " / does not throw", false, String(e && e.message));
    return;
  }
  check("book / " + c.label + " / does not throw", true);
  out.ids.forEach(function (id) {
    var r = out.results[id];
    check("book / " + c.label + " / result present for " + id, !!r);
    if (!r) { return; }
    assertFinite("book / " + c.label + " / " + id, r, 0);
    assertInvariants("book / " + c.label + " / " + id, r);
    assertMessages("book / " + c.label + " / " + id, r.errors);
    r.lines.forEach(function (l, i) { assertMessages("book / " + c.label + " / " + id + " / line " + i, l.errors); });
  });
});

/* defaults are applied when the pricing block is silent */
var defaulted = C.costBook({ recipes: [{ id: "x", kind: "dish", yieldQty: 1, yieldUnit: "portion", menuPrice: 0, lines: [{ kind: "ingredient", packPrice: 70, packQty: 1, packUnit: "kg", qty: 1, unit: "kg", yieldPct: 100 }] }] });
eq("defaults / target food cost", defaulted.pricing.targetPct, C.DEFAULT_TARGET_FOOD_COST_PCT);
eq("defaults / rounding step", defaulted.pricing.rounding, C.DEFAULT_PRICE_ROUNDING);
eq("defaults / no tax is assumed", defaulted.pricing.taxPct, 0);
eq("defaults / suggested price at the default target", defaulted.results.x.target.suggestedRounded, 235);

/* a dish with zero portions must price to nothing rather than to infinity */
var zeroP = C.costBook({ recipes: [{ id: "x", kind: "dish", yieldQty: 0, yieldUnit: "portion", menuPrice: 320, lines: [{ kind: "ingredient", packPrice: 700, packQty: 1, packUnit: "kg", qty: 1, unit: "kg", yieldPct: 100 }] }], pricing: { targetPct: 30 } });
eq("zero portions / plate cost", zeroP.results.x.costPerYieldUnit, null);
eq("zero portions / suggested price", zeroP.results.x.target.suggestedRounded, null);
eq("zero portions / food cost %", zeroP.results.x.analysis.costPct, null);
eq("zero portions / margin", zeroP.results.x.analysis.marginAmount, null);
eq("zero portions / verdict", zeroP.results.x.analysis.verdict, "no-cost");
eq("zero portions / flagged", hasCode(zeroP.results.x.errors, "ZERO_PORTIONS"), true);

/* ================================================================== *
 * 8. A WORKED PLATE, end to end
 * ================================================================== */
section("8. a worked plate, end to end");

/* 10 plates of rice and curry.
 *   chicken  240/kg, 1.5 kg served at 72% yield -> 2.0833 kg bought -> 500.00
 *   rice     1450 per 25 kg sack = 58/kg, 4.5 kg cooked at 250% -> 1.8 kg -> 104.40
 *   oil      1850 per 15 kg tin, 300 ml at 0.91 g/ml -> 0.273 kg ->  33.67
 *   gravy    prep at 20/kg, 1.2 kg                              ->  24.00
 *                                                     ingredients  662.07
 *   wastage 5%                                                   ->  33.10
 *                                                     food cost    695.17
 *   packaging 8 a plate x 10                                      ->  80.00
 *                                                     batch        775.17
 *   per plate                                                        77.52
 *   at a 30% target: 258.39 exact, 260 rounded
 *   at 320 on the menu: 24.2% food cost, 242.48 gross margin
 */
var plate = C.costBook({
  pricing: { targetPct: 30, taxPct: 0, taxInclusive: false, rounding: 5 },
  recipes: [
    {
      id: "p1", name: "Base gravy", kind: "prep", yieldQty: 4, yieldUnit: "kg", wastagePct: 0, otherDirect: 0,
      lines: [{ kind: "ingredient", name: "Onion", packPrice: 400, packQty: 10, packUnit: "kg", qty: 2, unit: "kg", yieldPct: 100 }]
    },
    {
      id: "d1", name: "Chicken curry with rice", kind: "dish", yieldQty: 10, yieldUnit: "portion",
      wastagePct: 5, otherDirect: 8, menuPrice: 320,
      lines: [
        { kind: "ingredient", name: "Chicken", packPrice: 240, packQty: 1, packUnit: "kg", qty: 1.5, unit: "kg", yieldPct: 72 },
        { kind: "ingredient", name: "Rice", packPrice: 1450, packQty: 25, packUnit: "kg", qty: 4.5, unit: "kg", yieldPct: 250 },
        { kind: "ingredient", name: "Oil", packPrice: 1850, packQty: 15, packUnit: "kg", qty: 300, unit: "ml", yieldPct: 100, density: 0.91 },
        { kind: "prep", name: "Base gravy", prepId: "p1", qty: 1.2, unit: "kg", yieldPct: 100 }
      ]
    }
  ]
});
var d = plate.results.d1;
eq("plate / chicken line", d.lines[0].cost, 240 * 1.5 / 0.72);
eq("plate / chicken bought", d.lines[0].purchaseQty, 1.5 / 0.72);
eq("plate / rice line", d.lines[1].cost, 58 * 1.8);
eq("plate / oil line", d.lines[2].cost, 1850 / 15 * 0.273);
eq("plate / gravy line", d.lines[3].cost, 24);
eq("plate / ingredients", d.ingredientCostBatch, 500 + 104.4 + (1850 / 15 * 0.273) + 24);
eq("plate / wastage", d.wastageAmount, d.ingredientCostBatch * 0.05);
eq("plate / packaging", d.otherDirectBatch, 80);
eq("plate / batch", d.plateCostBatch, d.ingredientCostBatch * 1.05 + 80);
eq("plate / per plate", d.costPerYieldUnit, (d.ingredientCostBatch * 1.05 + 80) / 10);
eq("plate / suggested price rounded up to 5", d.target.suggestedRounded, Math.ceil(d.costPerYieldUnit / 0.3 / 5 - 1e-9) * 5);
eq("plate / food cost at 320", d.analysis.costPct, d.costPerYieldUnit / 320 * 100);
eq("plate / gross margin at 320", d.analysis.marginAmount, 320 - d.costPerYieldUnit);
eq("plate / verdict at 320", d.analysis.verdict, "at-or-under-target");
check("plate / per plate is about 77.52", Math.abs(d.costPerYieldUnit - 77.52) < 0.01, show(d.costPerYieldUnit));
check("plate / suggested price is 260", d.target.suggestedRounded === 260, show(d.target.suggestedRounded));
check("plate / food cost at 320 is about 24.2%", Math.abs(d.analysis.costPct - 24.22) < 0.05, show(d.analysis.costPct));

/* and the whole point: raise the onion price, the plate moves */
var before = d.costPerYieldUnit;
var plate2 = C.costBook({
  pricing: { targetPct: 30, taxPct: 0, taxInclusive: false, rounding: 5 },
  recipes: [
    { id: "p1", name: "Base gravy", kind: "prep", yieldQty: 4, yieldUnit: "kg", wastagePct: 0, otherDirect: 0, lines: [{ kind: "ingredient", name: "Onion", packPrice: 800, packQty: 10, packUnit: "kg", qty: 2, unit: "kg", yieldPct: 100 }] },
    { id: "d1", name: "Chicken curry with rice", kind: "dish", yieldQty: 10, yieldUnit: "portion", wastagePct: 5, otherDirect: 8, menuPrice: 320,
      lines: [
        { kind: "ingredient", name: "Chicken", packPrice: 240, packQty: 1, packUnit: "kg", qty: 1.5, unit: "kg", yieldPct: 72 },
        { kind: "ingredient", name: "Rice", packPrice: 1450, packQty: 25, packUnit: "kg", qty: 4.5, unit: "kg", yieldPct: 250 },
        { kind: "ingredient", name: "Oil", packPrice: 1850, packQty: 15, packUnit: "kg", qty: 300, unit: "ml", yieldPct: 100, density: 0.91 },
        { kind: "prep", name: "Base gravy", prepId: "p1", qty: 1.2, unit: "kg", yieldPct: 100 }
      ] }
  ]
});
/* onion 40/kg -> 80/kg doubles the gravy: 24 -> 48 on the dish, x1.05 wastage, /10 plates */
eq("cascade / the plate rises by 24 x 1.05 / 10", plate2.results.d1.costPerYieldUnit - before, 24 * 1.05 / 10);

/* ================================================================== *
 * summary
 * ================================================================== */
process.stdout.write("\n");
if (fail) {
  failures.forEach(function (f) { process.stdout.write("FAIL  " + f + "\n"); });
  process.stdout.write("\n");
}
process.stdout.write(pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
