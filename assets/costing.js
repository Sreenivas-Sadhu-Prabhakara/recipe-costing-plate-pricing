/* Recipe costing and plate pricing — pure costing module.
 *
 * No DOM, no network, no dependencies. Every function takes plain values and
 * returns plain values, so the kitchen rules can be tested on their own
 * (see tests/costing.test.js).
 *
 * The three ideas this module exists to express:
 *
 *  1. PURCHASE UNIT IS NOT RECIPE UNIT. Rice is bought by the 25 kg sack and
 *     used 180 g at a time. Oil is bought by the kilo and ladled by the
 *     millilitre. Every cost in here is therefore
 *         (pack price / pack size)  x  (recipe quantity converted to pack units)
 *     and the conversion is explicit, named, and refused when it is not
 *     physically defined.
 *
 *  2. YIELD DIVIDES, IT DOES NOT MULTIPLY. One kilo of raw bone-in chicken is
 *     not one kilo of meat on plates. If a recipe serves 150 g of trimmed
 *     chicken at a 72% yield, the kitchen had to BUY 150 / 0.72 = 208.3 g.
 *     Multiplying instead (150 x 0.72 = 108 g) is the classic error and it
 *     understates every plate on the menu. The quantity that gets costed is
 *     always the AS-PURCHASED quantity.
 *
 *  3. A SAUCE IS COSTED ONCE. A base gravy is a recipe in its own right with
 *     its own batch yield; the dishes that use it buy it by the gram at that
 *     batch's cost per gram. Change the onion price and every dish that
 *     touches the gravy moves, in one pass, automatically.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ *
   * TRADE-PRACTICE CONSTANTS
   *
   * None of these is a statutory or regulated figure. There is no law that
   * fixes what a plate may cost or what a kitchen may charge. They are
   * ordinary food-service rules of thumb, written here so there is exactly
   * one place to read or change them, and every one of them is exposed as an
   * editable field on the page. Treat them as INDICATIVE starting points and
   * replace them with your own kitchen's measured figures.
   * ------------------------------------------------------------------ */

  /* Food cost as a share of the (tax-exclusive) selling price that kitchens
   * commonly aim at. Full-service kitchens usually sit higher than delivery-
   * only ones because their other costs differ. Indicative only. */
  var DEFAULT_TARGET_FOOD_COST_PCT = 30;
  var INDICATIVE_TARGET_BAND = { low: 25, high: 35 };

  /* An allowance for spoilage, over-portioning, spillage, trim that was meant
   * to be used and was not, and staff tasting. Applied on top of the costed
   * ingredients. Indicative only — count your own bin for a week. */
  var DEFAULT_WASTAGE_PCT = 5;
  var INDICATIVE_WASTAGE_BAND = { low: 3, high: 8 };

  /* Menu prices are normally rounded up to a round figure rather than printed
   * as 233.33. Rounding UP, never down, so rounding can never quietly push the
   * food cost above target. Indicative; set 0 for the exact figure. */
  var DEFAULT_PRICE_ROUNDING = 5;

  /* No tax rate is assumed or asserted by this page. Whatever GST or VAT
   * applies to your sales is yours to enter. */
  var DEFAULT_TAX_PCT = 0;

  /* Physical densities, grams per millilitre, for the one case where a mass
   * purchase unit has to meet a volume recipe unit (oil bought by the kilo,
   * poured by the millilitre). Approximate kitchen figures for reference only;
   * the density field on the page is yours to type into. */
  var INDICATIVE_DENSITY_G_PER_ML = {
    "water": 1.00,
    "milk": 1.03,
    "cooking oil": 0.91,
    "ghee / melted butter": 0.91,
    "coconut milk": 1.00,
    "honey": 1.42,
    "vinegar": 1.01,
    "soy sauce": 1.20
  };

  /* ------------------------------------------------------------------ *
   * UNITS
   *
   * Four dimensions. Mass is based on the gram, volume on the millilitre,
   * count on the piece, and a portion is its own dimension so a batch of
   * plates can never be silently converted into a batch of grams.
   *
   * The spoon and cup figures are the ones printed here and nowhere else:
   * teaspoon 5 ml, tablespoon 15 ml, cup 250 ml (metric cup). Household
   * measures genuinely differ between countries, so if yours differ, enter
   * millilitres.
   * ------------------------------------------------------------------ */
  var UNITS = {
    mg:      { dim: "mass",    base: 0.001,          label: "mg" },
    g:       { dim: "mass",    base: 1,              label: "g" },
    kg:      { dim: "mass",    base: 1000,           label: "kg" },
    oz:      { dim: "mass",    base: 28.349523125,   label: "oz" },
    lb:      { dim: "mass",    base: 453.59237,      label: "lb" },
    ml:      { dim: "volume",  base: 1,              label: "ml" },
    l:       { dim: "volume",  base: 1000,           label: "l" },
    tsp:     { dim: "volume",  base: 5,              label: "tsp" },
    tbsp:    { dim: "volume",  base: 15,             label: "tbsp" },
    cup:     { dim: "volume",  base: 250,            label: "cup" },
    pc:      { dim: "count",   base: 1,              label: "pc" },
    dozen:   { dim: "count",   base: 12,             label: "dozen" },
    portion: { dim: "portion", base: 1,              label: "portion" }
  };

  var BASE_UNIT = { mass: "g", volume: "ml", count: "pc", portion: "portion" };

  var DIM_NAME = { mass: "weight", volume: "volume", count: "pieces", portion: "portions" };

  /* ------------------------------------------------------------------ *
   * numbers
   * ------------------------------------------------------------------ */

  /* Anything that is not a finite number becomes 0. Empty fields, blank
   * strings, text, null, NaN and Infinity all arrive here from a form. */
  function num(v) {
    if (typeof v === "number") { return isFinite(v) ? v : 0; }
    if (typeof v === "string") {
      var s = v.trim();
      if (!s) { return 0; }
      var n = Number(s);
      return isFinite(n) ? n : 0;
    }
    return 0;
  }

  function nonNeg(v) {
    var n = num(v);
    return n > 0 ? n : 0;
  }

  /* Any division that could not be defined returns null, never NaN and never
   * Infinity. The page renders null as a dash. */
  function fin(n) {
    return (typeof n === "number" && isFinite(n)) ? n : null;
  }

  function round2(n) {
    var v = fin(n);
    return v === null ? null : Math.round(v * 100) / 100;
  }

  function E(code, msg) { return { code: code, msg: msg }; }

  /* ------------------------------------------------------------------ *
   * UNIT CONVERSION — the core of the whole tool
   *
   * convert(5, "kg", "g")            -> 5000
   * convert(180, "g", "kg")          -> 0.18
   * convert(700, "ml", "kg", 0.91)   -> 0.637      (bridged by density)
   * convert(700, "ml", "kg")         -> refused, UNIT_MISMATCH
   * convert(2, "pc", "g")            -> refused, COUNT_MISMATCH
   * ------------------------------------------------------------------ */
  function convert(qty, from, to, density) {
    var q = num(qty);
    var F = UNITS[from];
    var T = UNITS[to];

    if (!F) { return { ok: false, value: null, error: E("UNKNOWN_UNIT", "Unit “" + String(from) + "” is not one this page knows."), viaDensity: false }; }
    if (!T) { return { ok: false, value: null, error: E("UNKNOWN_UNIT", "Unit “" + String(to) + "” is not one this page knows."), viaDensity: false }; }

    if (F.dim === T.dim) {
      return { ok: true, value: q * F.base / T.base, error: null, viaDensity: false };
    }

    var massToVolume = (F.dim === "mass" && T.dim === "volume");
    var volumeToMass = (F.dim === "volume" && T.dim === "mass");

    if (!massToVolume && !volumeToMass) {
      var code = (F.dim === "count" || T.dim === "count") ? "COUNT_MISMATCH" : "UNIT_MISMATCH";
      return {
        ok: false, value: null, viaDensity: false,
        error: E(code, "Cannot turn " + DIM_NAME[F.dim] + " (" + F.label + ") into " + DIM_NAME[T.dim] + " (" + T.label + "). Buy and use the item in the same kind of unit, or convert it by hand.")
      };
    }

    var d = num(density);
    if (!(d > 0)) {
      return {
        ok: false, value: null, viaDensity: false,
        error: E("UNIT_MISMATCH", "This item is measured by " + DIM_NAME[F.dim] + " (" + F.label + ") on one side and by " + DIM_NAME[T.dim] + " (" + T.label + ") on the other. Enter a density in grams per millilitre to bridge them — cooking oil is about 0.91, water is 1.")
      };
    }

    if (volumeToMass) {
      /* millilitres -> grams -> target mass unit */
      var grams = q * F.base * d;
      return { ok: true, value: grams / T.base, error: null, viaDensity: true };
    }
    /* grams -> millilitres -> target volume unit */
    var ml = (q * F.base) / d;
    return { ok: true, value: ml / T.base, error: null, viaDensity: true };
  }

  /* ------------------------------------------------------------------ *
   * YIELD — the gross-up, in the one direction that is correct
   *
   * basis "EP" (edible portion / as served): the quantity written in the
   *   recipe is what reaches the plate, so the kitchen must buy MORE of it.
   *       asPurchased = served / (yield% / 100)
   *   yield below 100% (trim, peel, bone, drain) raises the quantity;
   *   yield above 100% (rice, pasta and pulses gain water) lowers it.
   *
   * basis "AP" (as purchased): the quantity written is already the raw
   *   quantity taken out of the store, so there is nothing to gross up.
   * ------------------------------------------------------------------ */
  function asPurchasedQty(qty, yieldPct, basis) {
    var q = nonNeg(qty);
    if (basis === "AP") {
      return { ok: true, value: q, grossedUp: false, error: null };
    }
    var y = num(yieldPct);
    if (!(y > 0)) {
      return {
        ok: false, value: null, grossedUp: false,
        error: E("ZERO_YIELD", "Yield is 0%, which says nothing usable comes out of this item. Enter the usable percentage (bone-in chicken is often around 70%), or switch the quantity to as-purchased.")
      };
    }
    return { ok: true, value: q / (y / 100), grossedUp: (y !== 100), error: null };
  }

  /* ------------------------------------------------------------------ *
   * ONE RECIPE LINE
   *
   * kind "ingredient": priced from a purchase pack.
   *   { kind, name, packPrice, packQty, packUnit, qty, unit, yieldPct, basis, density }
   *
   * kind "prep": priced from another recipe's batch.
   *   { kind, name, prepId, qty, unit, yieldPct, basis, density }
   * ------------------------------------------------------------------ */
  function costLine(line, prepResult) {
    line = line || {};
    var isPrep = (line.kind === "prep");
    var errors = [];

    var out = {
      kind: isPrep ? "prep" : "ingredient",
      name: typeof line.name === "string" ? line.name : "",
      prepId: isPrep ? (line.prepId == null ? null : line.prepId) : null,
      qty: nonNeg(line.qty),
      unit: line.unit,
      basis: line.basis === "AP" ? "AP" : "EP",
      yieldPct: num(line.yieldPct),
      density: nonNeg(line.density),
      /* what the kitchen must take out of the store, in the recipe's own unit */
      apQty: null,
      /* the same quantity expressed in the unit the item is bought in */
      purchaseQty: null,
      purchaseUnit: null,
      unitCost: null,         /* cost of one purchase unit (per kg, per l, per pc) */
      cost: 0,                /* cost of this line in this batch */
      viaDensity: false,
      errors: errors
    };

    /* step 1 — gross the recipe quantity up to the as-purchased quantity */
    var ap = asPurchasedQty(line.qty, line.yieldPct, out.basis);
    if (!ap.ok) { errors.push(ap.error); return out; }
    out.apQty = ap.value;
    out.grossedUp = ap.grossedUp;

    if (isPrep) {
      /* step 2 — a prep line buys from another batch, by its base unit */
      if (!prepResult) {
        errors.push(E("MISSING_PREP", "This line points at a prep that is not in the list any more. Pick one, or make it a plain ingredient."));
        return out;
      }
      if (prepResult.cyclic) {
        errors.push(E("CYCLE", "“" + (prepResult.name || "This prep") + "” is part of a loop — it uses a prep that ends up using it again — so it has no cost to pass on. Break the loop and this line comes back."));
        return out;
      }
      out.purchaseUnit = prepResult.baseUnit;
      out.unitCost = prepResult.costPerBase;
      if (prepResult.costPerBase === null) {
        errors.push(E("PREP_UNUSABLE", "“" + (prepResult.name || "That prep") + "” has no cost per " + String(prepResult.baseUnit) + " yet — fix its own batch yield or its ingredients first."));
        return out;
      }
      var cv = convert(out.apQty, line.unit, prepResult.baseUnit, out.density);
      if (!cv.ok) {
        if (UNITS[line.unit] && UNITS[prepResult.baseUnit] && UNITS[line.unit].dim !== UNITS[prepResult.baseUnit].dim && (UNITS[line.unit].dim === "portion" || UNITS[prepResult.baseUnit].dim === "portion")) {
          errors.push(E("PREP_DIM", "“" + (prepResult.name || "That prep") + "” is measured in " + DIM_NAME[UNITS[prepResult.baseUnit].dim] + ", so use that here too."));
        } else {
          errors.push(cv.error);
        }
        return out;
      }
      out.purchaseQty = cv.value;
      out.viaDensity = cv.viaDensity;
      out.cost = cv.value * prepResult.costPerBase;
      return out;
    }

    /* step 2 — an ingredient line buys from a purchase pack */
    var packPrice = nonNeg(line.packPrice);
    var packQty = nonNeg(line.packQty);
    out.packPrice = packPrice;
    out.packQty = packQty;
    out.purchaseUnit = line.packUnit;

    if (!UNITS[line.packUnit]) {
      errors.push(E("UNKNOWN_UNIT", "Pack unit “" + String(line.packUnit) + "” is not one this page knows."));
      return out;
    }
    if (packQty <= 0) {
      errors.push(E("ZERO_PACK", "Pack size is 0, so there is no price per unit to work from. Enter how much is in the pack you buy (a 25 kg sack is 25 kg)."));
      return out;
    }

    out.unitCost = packPrice / packQty;

    var c = convert(out.apQty, line.unit, line.packUnit, out.density);
    if (!c.ok) { errors.push(c.error); return out; }

    out.purchaseQty = c.value;
    out.viaDensity = c.viaDensity;
    out.cost = c.value * out.unitCost;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * ONE RECIPE (a dish or a prep)
   *
   * { id, name, kind:"dish"|"prep", yieldQty, yieldUnit, wastagePct,
   *   otherDirect, menuPrice, lines:[...] }
   *
   * yieldUnit "portion" means the batch makes plates. Anything else means the
   * batch makes that much stuff, which is how a prep gets a cost per gram.
   * ------------------------------------------------------------------ */
  function costRecipe(recipe, prepResults) {
    recipe = recipe || {};
    var isPrep = (recipe.kind === "prep");
    var errors = [];
    var lines = [];
    var ingredientCostBatch = 0;
    var lineErrorCount = 0;

    var rawLines = Array.isArray(recipe.lines) ? recipe.lines : [];
    for (var i = 0; i < rawLines.length; i++) {
      var src = rawLines[i] || {};
      var pr = (src.kind === "prep") ? (prepResults && prepResults[src.prepId]) || null : null;
      var r = costLine(src, pr);
      if (r.errors.length) { lineErrorCount++; }
      ingredientCostBatch += fin(r.cost) === null ? 0 : r.cost;
      lines.push(r);
    }

    if (lineErrorCount > 0) {
      errors.push(E("LINE_ERRORS", lineErrorCount === 1
        ? "One line below could not be costed, so this total is short."
        : lineErrorCount + " lines below could not be costed, so this total is short."));
    }

    var wastagePct = nonNeg(recipe.wastagePct);
    var wastageAmount = ingredientCostBatch * wastagePct / 100;
    var foodCostBatch = ingredientCostBatch + wastageAmount;

    /* Other direct costs: packaging and condiments go per plate, fuel and gas
     * for a prep batch go per batch. */
    var otherDirect = nonNeg(recipe.otherDirect);
    var otherDirectBasis = isPrep ? "perBatch" : "perPortion";
    var yieldQty = nonNeg(recipe.yieldQty);
    var otherDirectBatch = (otherDirectBasis === "perBatch") ? otherDirect : otherDirect * yieldQty;

    var plateCostBatch = foodCostBatch + otherDirectBatch;

    var yieldUnit = UNITS[recipe.yieldUnit] ? recipe.yieldUnit : "portion";
    if (!UNITS[recipe.yieldUnit]) {
      if (recipe.yieldUnit != null && recipe.yieldUnit !== "") {
        errors.push(E("UNKNOWN_UNIT", "Batch yield unit “" + String(recipe.yieldUnit) + "” is not one this page knows; treating it as portions."));
      }
    }
    var dim = UNITS[yieldUnit].dim;
    var baseUnit = BASE_UNIT[dim];

    var costPerYieldUnit = null;
    var foodCostPerYieldUnit = null;
    var costPerBase = null;
    var baseQty = null;

    if (yieldQty <= 0) {
      errors.push(E("ZERO_PORTIONS", isPrep
        ? "Batch yield is 0, so there is no cost per " + UNITS[yieldUnit].label + " to divide out. Enter how much the batch makes."
        : "Batch yield is 0 portions, so there is no cost per plate to divide out. Enter how many plates the batch serves."));
    } else {
      costPerYieldUnit = fin(plateCostBatch / yieldQty);
      foodCostPerYieldUnit = fin(foodCostBatch / yieldQty);
      baseQty = yieldQty * UNITS[yieldUnit].base;
      costPerBase = baseQty > 0 ? fin(plateCostBatch / baseQty) : null;
    }

    return {
      id: recipe.id,
      name: typeof recipe.name === "string" ? recipe.name : "",
      kind: isPrep ? "prep" : "dish",
      cyclic: false,
      lines: lines,

      ingredientCostBatch: fin(ingredientCostBatch) === null ? 0 : ingredientCostBatch,
      wastagePct: wastagePct,
      wastageAmount: wastageAmount,
      foodCostBatch: foodCostBatch,
      otherDirect: otherDirect,
      otherDirectBasis: otherDirectBasis,
      otherDirectBatch: otherDirectBatch,
      plateCostBatch: plateCostBatch,

      yieldQty: yieldQty,
      yieldUnit: yieldUnit,
      yieldDim: dim,
      baseUnit: baseUnit,
      baseQty: baseQty,

      costPerYieldUnit: costPerYieldUnit,
      foodCostPerYieldUnit: foodCostPerYieldUnit,
      costPerBase: costPerBase,

      usedBy: [],
      errors: errors
    };
  }

  /* A recipe that cannot be costed at all (it is part of a loop) still has to
   * come back as a complete, finite result. */
  function unusableResult(recipe, note) {
    var r = costRecipe({ id: recipe.id, name: recipe.name, kind: recipe.kind, yieldQty: 0, yieldUnit: recipe.yieldUnit, lines: [] }, null);
    r.errors = [note];
    r.cyclic = true;
    r.costPerYieldUnit = null;
    r.costPerBase = null;
    return r;
  }

  /* ------------------------------------------------------------------ *
   * PRICE FROM COST — target food cost % -> suggested menu price
   * ------------------------------------------------------------------ */
  function priceAtTarget(plateCost, targetPct, taxPct, roundStep) {
    var cost = nonNeg(plateCost);
    var t = num(targetPct);
    var tax = nonNeg(taxPct);
    var blank = {
      ok: false, targetPct: t, suggestedNet: null, suggestedRounded: null,
      suggestedGross: null, multiple: null, effectiveCostPct: null,
      marginAtSuggested: null, errors: []
    };

    if (!(t > 0) || t > 100) {
      blank.errors.push(E("TARGET_OUT_OF_RANGE", "A target food cost has to be above 0% and no more than 100%. At 100% the price only covers the plate; everything else — rent, gas, wages — comes out of nothing."));
      return blank;
    }

    var net = cost / (t / 100);
    var step = nonNeg(roundStep);
    /* round UP only, so rounding can never push the food cost above target */
    var rounded = step > 0 ? Math.ceil(net / step - 1e-9) * step : net;
    rounded = fin(rounded) === null ? net : rounded;
    if (rounded === 0) { rounded = 0; }            /* never hand out a minus zero */

    return {
      ok: true,
      targetPct: t,
      suggestedNet: fin(net),
      suggestedRounded: fin(rounded),
      suggestedGross: fin(rounded * (1 + tax / 100)),
      multiple: fin(100 / t),
      effectiveCostPct: rounded > 0 ? fin(cost / rounded * 100) : null,
      marginAtSuggested: fin(rounded - cost),
      errors: []
    };
  }

  /* ------------------------------------------------------------------ *
   * COST FROM PRICE — what my menu price is really doing
   * ------------------------------------------------------------------ */
  function analysePrice(plateCost, menuPrice, taxPct, taxInclusive, targetPct) {
    var cost = nonNeg(plateCost);
    var p = nonNeg(menuPrice);
    var tax = nonNeg(taxPct);
    var t = num(targetPct);

    var blank = {
      ok: false, menuPrice: p, netPrice: null, taxAmount: null, grossPrice: null,
      costPct: null, foodCostPct: null, marginAmount: null, marginPct: null,
      vsTargetPoints: null, multiple: null, priceForTargetNet: null,
      priceForTargetGross: null, verdict: "nothing-entered", errors: []
    };

    if (!(p > 0)) {
      blank.errors.push(E("NO_PRICE", "Enter the price on your menu to see what food-cost percentage you are actually running."));
      return blank;
    }

    var net = taxInclusive ? p / (1 + tax / 100) : p;
    var taxAmount = taxInclusive ? (p - net) : (p * tax / 100);
    var gross = taxInclusive ? p : (p + taxAmount);

    var costPct = net > 0 ? fin(cost / net * 100) : null;
    var margin = net - cost;
    var marginPct = net > 0 ? fin(margin / net * 100) : null;

    var target = priceAtTarget(cost, t, tax, 0);

    var verdict = "no-target";
    if (costPct !== null && t > 0 && t <= 100) {
      if (costPct <= t + 1e-9) { verdict = "at-or-under-target"; }
      else { verdict = "over-target"; }
    }
    if (margin < 0) { verdict = "below-cost"; }

    return {
      ok: true,
      menuPrice: p,
      netPrice: fin(net),
      taxAmount: fin(taxAmount),
      grossPrice: fin(gross),
      costPct: costPct,
      marginAmount: fin(margin),
      marginPct: marginPct,
      vsTargetPoints: (costPct !== null && t > 0 && t <= 100) ? fin(costPct - t) : null,
      multiple: cost > 0 ? fin(net / cost) : null,
      priceForTargetNet: target.suggestedNet,
      priceForTargetGross: target.ok ? fin(target.suggestedNet * (1 + tax / 100)) : null,
      verdict: verdict,
      errors: []
    };
  }

  /* ------------------------------------------------------------------ *
   * THE WHOLE BOOK — resolve preps first, then cost every recipe, then price
   *
   * book = {
   *   recipes: [ recipe, ... ],
   *   pricing: { targetPct, taxPct, taxInclusive, rounding }
   * }
   *
   * Returns { order:[id,...], results:{id:result}, dishes:[...], preps:[...] }.
   * Depth-first with a visiting set, so a prep that (directly or through other
   * preps) uses itself is reported as a loop instead of hanging.
   * ------------------------------------------------------------------ */
  function costBook(book) {
    book = book || {};
    var recipes = Array.isArray(book.recipes) ? book.recipes : [];
    var pricing = book.pricing || {};
    var targetPct = (pricing.targetPct === undefined || pricing.targetPct === null || pricing.targetPct === "")
      ? DEFAULT_TARGET_FOOD_COST_PCT : num(pricing.targetPct);
    var taxPct = nonNeg(pricing.taxPct);
    var taxInclusive = !!pricing.taxInclusive;
    var rounding = (pricing.rounding === undefined || pricing.rounding === null || pricing.rounding === "")
      ? DEFAULT_PRICE_ROUNDING : nonNeg(pricing.rounding);

    var byId = {};
    var ids = [];
    var i;
    for (i = 0; i < recipes.length; i++) {
      var rec = recipes[i];
      if (!rec || rec.id == null) { continue; }
      var key = String(rec.id);
      if (byId[key]) { continue; }          /* first one wins on a duplicate id */
      byId[key] = rec;
      ids.push(key);
    }

    var results = {};
    var state = {};                          /* undefined | 1 visiting | 2 done */
    var cyclic = {};
    var stack = [];
    var order = [];

    function resolve(key) {
      if (state[key] === 2) { return results[key]; }
      if (state[key] === 1) {
        /* every recipe from this one up the stack is in the loop */
        var at = stack.indexOf(key);
        for (var k = (at < 0 ? 0 : at); k < stack.length; k++) { cyclic[stack[k]] = true; }
        return { cyclic: true, name: byId[key] ? byId[key].name : key, baseUnit: null, costPerBase: null };
      }
      state[key] = 1;
      stack.push(key);

      var rec = byId[key];
      var prepResults = {};
      var lines = Array.isArray(rec.lines) ? rec.lines : [];
      for (var j = 0; j < lines.length; j++) {
        var ln = lines[j] || {};
        if (ln.kind !== "prep" || ln.prepId == null) { continue; }
        var pk = String(ln.prepId);
        if (!byId[pk]) { continue; }        /* costLine reports MISSING_PREP */
        prepResults[ln.prepId] = resolve(pk);
      }

      var out = costRecipe(rec, prepResults);
      if (cyclic[key]) {
        out = unusableResult(rec, E("CYCLE", "This recipe is part of a loop: it uses a prep that ends up using this recipe again. Nothing in a loop can be costed. Break the loop and the numbers come back."));
      }
      results[key] = out;
      state[key] = 2;
      stack.pop();
      order.push(key);
      return out;
    }

    for (i = 0; i < ids.length; i++) { resolve(ids[i]); }

    /* who uses what — the dependency list that makes the cascade visible */
    for (i = 0; i < ids.length; i++) {
      var r = results[ids[i]];
      for (var m = 0; m < r.lines.length; m++) {
        var L = r.lines[m];
        if (L.kind !== "prep" || L.prepId == null) { continue; }
        var target = results[String(L.prepId)];
        if (!target) { continue; }
        target.usedBy.push({ id: r.id, name: r.name, kind: r.kind, qty: L.qty, unit: L.unit, cost: L.cost });
      }
    }

    /* price every recipe off its own cost per yield unit */
    var dishes = [];
    var preps = [];
    for (i = 0; i < ids.length; i++) {
      var res = results[ids[i]];
      var unitCost = res.costPerYieldUnit === null ? 0 : res.costPerYieldUnit;
      res.target = priceAtTarget(unitCost, targetPct, taxPct, rounding);
      res.analysis = analysePrice(unitCost, byId[ids[i]].menuPrice, taxPct, taxInclusive, targetPct);
      if (res.costPerYieldUnit === null) {
        res.target.ok = false;
        res.target.suggestedNet = null;
        res.target.suggestedRounded = null;
        res.target.suggestedGross = null;
        res.target.effectiveCostPct = null;
        res.target.marginAtSuggested = null;
        res.analysis.ok = false;
        res.analysis.costPct = null;
        res.analysis.marginAmount = null;
        res.analysis.marginPct = null;
        res.analysis.vsTargetPoints = null;
        res.analysis.multiple = null;
        res.analysis.priceForTargetNet = null;
        res.analysis.priceForTargetGross = null;
        res.analysis.verdict = "no-cost";
      }
      if (res.kind === "prep") { preps.push(res); } else { dishes.push(res); }
    }

    return {
      order: order,
      ids: ids,
      results: results,
      dishes: dishes,
      preps: preps,
      pricing: { targetPct: targetPct, taxPct: taxPct, taxInclusive: taxInclusive, rounding: rounding }
    };
  }

  var RecipeCosting = {
    /* constants */
    DEFAULT_TARGET_FOOD_COST_PCT: DEFAULT_TARGET_FOOD_COST_PCT,
    INDICATIVE_TARGET_BAND: INDICATIVE_TARGET_BAND,
    DEFAULT_WASTAGE_PCT: DEFAULT_WASTAGE_PCT,
    INDICATIVE_WASTAGE_BAND: INDICATIVE_WASTAGE_BAND,
    DEFAULT_PRICE_ROUNDING: DEFAULT_PRICE_ROUNDING,
    DEFAULT_TAX_PCT: DEFAULT_TAX_PCT,
    INDICATIVE_DENSITY_G_PER_ML: INDICATIVE_DENSITY_G_PER_ML,
    UNITS: UNITS,
    BASE_UNIT: BASE_UNIT,
    DIM_NAME: DIM_NAME,
    /* helpers */
    num: num,
    nonNeg: nonNeg,
    fin: fin,
    round2: round2,
    /* rules */
    convert: convert,
    asPurchasedQty: asPurchasedQty,
    costLine: costLine,
    costRecipe: costRecipe,
    priceAtTarget: priceAtTarget,
    analysePrice: analysePrice,
    costBook: costBook
  };

  if (typeof module === "object" && module && module.exports) {
    module.exports = RecipeCosting;
  } else {
    root.RecipeCosting = RecipeCosting;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
