/* Recipe costing and plate pricing — page wiring.
 *
 * Reads the recipe book out of the form, hands plain values to the pure
 * costing module in costing.js, and formats what comes back. No dependencies,
 * no network, nothing leaves the browser.
 */
(function () {
  "use strict";

  var C = window.RecipeCosting;
  if (!C) { return; }

  var SYM = { INR: "₹", PHP: "₱" };
  var LOCALE = { INR: "en-IN", PHP: "en-PH" };

  /* Units offered in each dropdown. The module knows more than this; these are
   * the ones a kitchen actually buys and measures in. */
  var PACK_UNITS = [["Weight", ["kg", "g", "mg", "lb", "oz"]], ["Volume", ["l", "ml"]], ["Count", ["pc", "dozen"]]];
  var USE_UNITS = [["Weight", ["g", "kg", "mg", "lb", "oz"]], ["Volume", ["ml", "l", "tsp", "tbsp", "cup"]], ["Count", ["pc", "dozen"]]];
  var PREP_UNITS = [["Plates", ["portion"]]].concat(USE_UNITS);
  var YIELD_UNITS = [["Plates", ["portion"]], ["Weight", ["kg", "g"]], ["Volume", ["l", "ml"]], ["Count", ["pc", "dozen"]]];

  var seq = 1;
  function nextId(prefix) { seq += 1; return prefix + seq; }

  function byId(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  /* ---------------- state ---------------- */

  var state = null;

  function blankState() {
    seq = 1;
    return {
      currency: "INR",
      pricing: {
        targetPct: C.DEFAULT_TARGET_FOOD_COST_PCT,
        taxPct: C.DEFAULT_TAX_PCT,
        taxInclusive: false,
        rounding: C.DEFAULT_PRICE_ROUNDING
      },
      selected: "r1",
      recipes: [{
        id: "r1", name: "", kind: "dish", yieldQty: "", yieldUnit: "portion",
        wastagePct: C.DEFAULT_WASTAGE_PCT, otherDirect: "", menuPrice: "",
        lines: [blankLine("ingredient")]
      }]
    };
  }

  function blankLine(kind) {
    if (kind === "prep") {
      return { lid: nextId("l"), kind: "prep", prepId: null, qty: "", unit: "kg", yieldPct: 100, basis: "EP", density: "" };
    }
    return { lid: nextId("l"), kind: "ingredient", name: "", packPrice: "", packQty: "", packUnit: "kg", qty: "", unit: "g", yieldPct: 100, basis: "EP", density: "" };
  }

  /* A worked example. Every figure here is made up for illustration — replace
   * all of them with your own invoice prices and your own measured yields. */
  function exampleState() {
    seq = 1;
    function ing(name, packPrice, packQty, packUnit, qty, unit, yieldPct, density) {
      return { lid: nextId("l"), kind: "ingredient", name: name, packPrice: packPrice, packQty: packQty, packUnit: packUnit, qty: qty, unit: unit, yieldPct: yieldPct, basis: "EP", density: density === undefined ? "" : density };
    }
    function prepLine(prepId, qty, unit) {
      return { lid: nextId("l"), kind: "prep", prepId: prepId, qty: qty, unit: unit, yieldPct: 100, basis: "EP", density: "" };
    }
    return {
      currency: "INR",
      pricing: { targetPct: C.DEFAULT_TARGET_FOOD_COST_PCT, taxPct: 0, taxInclusive: false, rounding: C.DEFAULT_PRICE_ROUNDING },
      selected: "d1",
      recipes: [
        {
          id: "p1", name: "Base gravy", kind: "prep", yieldQty: 4, yieldUnit: "kg",
          wastagePct: C.DEFAULT_WASTAGE_PCT, otherDirect: 25, menuPrice: "",
          lines: [
            ing("Onion", 400, 10, "kg", 2, "kg", 85),
            ing("Tomato", 480, 12, "kg", 2.5, "kg", 92),
            ing("Cooking oil", 1850, 15, "kg", 500, "ml", 100, 0.91),
            ing("Ginger-garlic paste", 240, 1, "kg", 250, "g", 100),
            ing("Spice mix", 520, 1, "kg", 180, "g", 100)
          ]
        },
        {
          id: "d1", name: "Chicken curry with rice", kind: "dish", yieldQty: 10, yieldUnit: "portion",
          wastagePct: C.DEFAULT_WASTAGE_PCT, otherDirect: 8, menuPrice: 320,
          lines: [
            ing("Chicken, bone-in", 240, 1, "kg", 1.5, "kg", 72),
            ing("Rice, cooked weight", 1450, 25, "kg", 4.5, "kg", 250),
            prepLine("p1", 1.2, "kg"),
            ing("Coriander", 160, 1, "kg", 100, "g", 70)
          ]
        },
        {
          id: "d2", name: "Paneer butter masala", kind: "dish", yieldQty: 8, yieldUnit: "portion",
          wastagePct: C.DEFAULT_WASTAGE_PCT, otherDirect: 8, menuPrice: 280,
          lines: [
            ing("Paneer", 380, 1, "kg", 1.2, "kg", 100),
            prepLine("p1", 1.6, "kg"),
            ing("Butter", 540, 1, "kg", 200, "g", 100),
            ing("Cream", 220, 1, "l", 150, "ml", 100)
          ]
        }
      ]
    };
  }

  function current() {
    for (var i = 0; i < state.recipes.length; i++) {
      if (state.recipes[i].id === state.selected) { return state.recipes[i]; }
    }
    return state.recipes[0] || null;
  }

  function preps() {
    return state.recipes.filter(function (r) { return r.kind === "prep"; });
  }

  function displayName(r) {
    if (r.name) { return r.name; }
    return r.kind === "prep" ? "Untitled prep" : "Untitled dish";
  }

  /* ---------------- formatting ---------------- */

  function money(n) {
    if (typeof n !== "number" || !isFinite(n)) { return "—"; }
    if (n === 0) { n = 0; }                        /* never print a minus zero */
    try {
      return new Intl.NumberFormat(LOCALE[state.currency], {
        style: "currency", currency: state.currency,
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(n);
    } catch (e) {
      return SYM[state.currency] + n.toFixed(2);
    }
  }

  function plainNum(n, digits) {
    try {
      return new Intl.NumberFormat(LOCALE[state.currency], {
        minimumFractionDigits: digits, maximumFractionDigits: digits
      }).format(n);
    } catch (e) {
      return n.toFixed(digits);
    }
  }

  /* Same, but trailing zeros are dropped: a batch of 10 portions is not 10.00. */
  function looseNum(n, digits) {
    try {
      return new Intl.NumberFormat(LOCALE[state.currency], {
        minimumFractionDigits: 0, maximumFractionDigits: digits
      }).format(n);
    } catch (e) {
      return String(n);
    }
  }

  function unitLabel(unit, n) {
    var u = C.UNITS[unit];
    if (!u) { return ""; }
    if (unit === "portion") { return n === 1 ? "portion" : "portions"; }
    return u.label;
  }

  function fmtQty(n, unit) {
    if (typeof n !== "number" || !isFinite(n)) { return "—"; }
    if (n === 0) { n = 0; }
    var a = Math.abs(n);
    var d = a >= 1000 ? 0 : (a >= 100 ? 1 : (a >= 10 ? 2 : 3));
    return looseNum(n, d) + " " + unitLabel(unit, n);
  }

  /* A rate per gram or per millilitre rounds to nothing in money, so anything
   * under one unit of currency is quoted per kilo or per litre instead. */
  function rate(unitCost, unit) {
    if (typeof unitCost !== "number" || !isFinite(unitCost)) { return ""; }
    if (unitCost >= 1 || unitCost === 0) { return money(unitCost) + "/" + unitLabel(unit, 1); }
    if (unit === "g") { return money(unitCost * 1000) + "/kg"; }
    if (unit === "ml") { return money(unitCost * 1000) + "/l"; }
    if (unit === "mg") { return money(unitCost * 1000000) + "/kg"; }
    return money(unitCost) + "/" + unitLabel(unit, 1);
  }

  function fmtPct(n, digits) {
    if (typeof n !== "number" || !isFinite(n)) { return "—"; }
    if (n === 0) { n = 0; }
    return plainNum(n, digits === undefined ? 1 : digits) + "%";
  }

  /* ---------------- small DOM builders ---------------- */

  function field(labelText, hintText) {
    var f = el("div", "field");
    var lab = el("label");
    lab.appendChild(document.createTextNode(labelText));
    if (hintText) {
      lab.appendChild(document.createTextNode(" "));
      lab.appendChild(el("span", "hint", hintText));
    }
    f.appendChild(lab);
    f.label = lab;
    return f;
  }

  function numberInput(id, value) {
    var inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.step = "any";
    inp.setAttribute("inputmode", "decimal");
    inp.id = id;
    inp.value = (value === undefined || value === null) ? "" : String(value);
    return inp;
  }

  function wrapInp(inp, pre, suf) {
    var cls = "inp" + (pre ? " has-pre" : "") + (suf ? " has-suf" : "");
    var box = el("div", cls);
    if (pre) {
      var p = el("span", "pre", pre);
      p.setAttribute("data-cursym", "");
      box.appendChild(p);
    }
    if (suf) { box.appendChild(el("span", "suf", suf)); }
    box.appendChild(inp);
    return box;
  }

  function unitSelect(id, groups, value) {
    var sel = document.createElement("select");
    sel.id = id;
    groups.forEach(function (g) {
      var og = document.createElement("optgroup");
      og.label = g[0];
      g[1].forEach(function (u) {
        var o = document.createElement("option");
        o.value = u;
        o.textContent = C.UNITS[u] ? C.UNITS[u].label : u;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.value = value;
    return sel;
  }

  function segButton(text, pressed, onClick) {
    var b = el("button", null, text);
    b.type = "button";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.addEventListener("click", onClick);
    return b;
  }

  function cell(tr, text, cls) {
    tr.appendChild(el("td", cls || null, text === undefined || text === null ? "" : text));
  }

  function row3(tbody, cls, a, b, c) {
    var tr = el("tr", cls || null);
    cell(tr, a);
    cell(tr, b, "num");
    cell(tr, c, "num");
    tbody.appendChild(tr);
    return tr;
  }

  function row2(tbody, cls, a, b) {
    var tr = el("tr", cls || null);
    cell(tr, a);
    cell(tr, b, "num");
    tbody.appendChild(tr);
    return tr;
  }

  /* ---------------- the recipe tabs ---------------- */

  function renderTabs() {
    var host = byId("recipeTabs");
    host.textContent = "";
    state.recipes.forEach(function (r) {
      var label = (r.kind === "prep" ? "prep · " : "") + displayName(r);
      host.appendChild(segButton(label, r.id === state.selected, function () {
        state.selected = r.id;
        renderAll();
      }));
    });
    byId("delRecipe").disabled = state.recipes.length < 2;
    byId("addPrepLine").disabled = preps().length === 0 || (current() && current().kind === "prep" && preps().length < 2);
  }

  /* ---------------- the recipe-level fields ---------------- */

  function renderRecipe() {
    var r = current();
    if (!r) { return; }
    var isPrep = r.kind === "prep";

    byId("recipeKind").textContent = isPrep ? "This prep" : "This dish";
    byId("rName").value = r.name || "";
    byId("rName").placeholder = isPrep ? "Base gravy" : "Chicken curry with rice";

    byId("rYieldLabel").textContent = isPrep ? "Batch makes " : "Batch serves ";
    var yh = el("span", "hint", isPrep ? "weight or volume of finished prep" : "portions");
    byId("rYieldLabel").appendChild(yh);

    byId("rYieldQty").value = r.yieldQty === "" || r.yieldQty === null ? "" : String(r.yieldQty);
    var ySel = byId("rYieldUnit");
    if (!ySel.options.length) {
      YIELD_UNITS.forEach(function (g) {
        var og = document.createElement("optgroup");
        og.label = g[0];
        g[1].forEach(function (u) {
          var o = document.createElement("option");
          o.value = u;
          o.textContent = C.UNITS[u].label;
          og.appendChild(o);
        });
        ySel.appendChild(og);
      });
    }
    ySel.value = r.yieldUnit || "portion";

    byId("rWastage").value = r.wastagePct === "" || r.wastagePct === null ? "" : String(r.wastagePct);

    var ol = byId("rOtherLabel");
    ol.textContent = "Other direct cost ";
    ol.appendChild(el("span", "hint", isPrep ? "per batch: fuel, gas" : "per plate: packaging, condiments"));
    byId("rOther").value = r.otherDirect === "" || r.otherDirect === null ? "" : String(r.otherDirect);

    byId("rPriceField").hidden = isPrep;
    byId("rPrice").value = r.menuPrice === "" || r.menuPrice === null ? "" : String(r.menuPrice);

    byId("pTarget").value = String(state.pricing.targetPct);
    byId("pRound").value = String(state.pricing.rounding);
    byId("pTax").value = String(state.pricing.taxPct);
    paintSeg("[data-inc]", "inc", state.pricing.taxInclusive ? "1" : "0");
    paintSeg("[data-cur]", "cur", state.currency);
    paintCurrencySymbols();
  }

  function paintSeg(selector, attr, value) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute("aria-pressed", nodes[i].getAttribute("data-" + attr) === String(value) ? "true" : "false");
    }
  }

  function paintCurrencySymbols() {
    var nodes = document.querySelectorAll("[data-cursym]");
    for (var i = 0; i < nodes.length; i++) { nodes[i].textContent = SYM[state.currency]; }
  }

  /* ---------------- the ingredient lines ---------------- */

  function dimOf(unit) { return C.UNITS[unit] ? C.UNITS[unit].dim : null; }

  /* A density is only ever asked for when weight has to meet volume. */
  function needsDensity(line) {
    var a, b;
    if (line.kind === "prep") {
      var p = findRecipe(line.prepId);
      if (!p) { return false; }
      a = dimOf(line.unit);
      b = dimOf(p.yieldUnit);
    } else {
      a = dimOf(line.unit);
      b = dimOf(line.packUnit);
    }
    if (!a || !b || a === b) { return false; }
    return (a === "mass" && b === "volume") || (a === "volume" && b === "mass");
  }

  function findRecipe(id) {
    for (var i = 0; i < state.recipes.length; i++) {
      if (state.recipes[i].id === id) { return state.recipes[i]; }
    }
    return null;
  }

  function renderLines() {
    var host = byId("lines");
    host.textContent = "";
    var r = current();
    if (!r) { return; }
    if (!r.lines.length) {
      var empty = el("div", "note", "No ingredients yet. Add one below.");
      host.appendChild(empty);
      return;
    }
    r.lines.forEach(function (ln, i) { host.appendChild(lineCard(r, ln, i)); });
  }

  function lineCard(recipe, line, index) {
    var outer = el("div", "field");
    var card = el("section", "card");
    outer.appendChild(card);
    outer.setAttribute("data-lid", line.lid);

    var isPrep = line.kind === "prep";

    /* --- what the line is --- */
    if (isPrep) {
      var pf = field("Prep", "costed once, from its own batch");
      var sel = document.createElement("select");
      sel.id = line.lid + "-prep";
      var available = preps().filter(function (p) { return p.id !== recipe.id; });
      if (!available.length) {
        var o0 = document.createElement("option");
        o0.value = "";
        o0.textContent = "No preps yet";
        sel.appendChild(o0);
      }
      available.forEach(function (p) {
        var o = document.createElement("option");
        o.value = p.id;
        o.textContent = displayName(p);
        sel.appendChild(o);
      });
      sel.value = line.prepId || "";
      sel.addEventListener("change", function () {
        line.prepId = sel.value || null;
        refreshCard(outer, line);
        compute();
      });
      pf.label.setAttribute("for", sel.id);
      var pbox = el("div", "inp");
      pbox.appendChild(sel);
      pf.appendChild(pbox);
      card.appendChild(pf);
    } else {
      var nf = field("Ingredient", "line " + (index + 1));
      var nameInp = document.createElement("input");
      nameInp.type = "text";
      nameInp.id = line.lid + "-name";
      nameInp.autocomplete = "off";
      nameInp.placeholder = "Chicken, bone-in";
      nameInp.value = line.name || "";
      nameInp.addEventListener("input", function () { line.name = nameInp.value; compute(); });
      nf.label.setAttribute("for", nameInp.id);
      var nbox = el("div", "inp");
      nbox.appendChild(nameInp);
      nf.appendChild(nbox);
      card.appendChild(nf);

      /* --- the purchase pack: price and yield side by side, pack size on its
             own row so the amount and its unit are never squeezed --- */
      var pair1 = el("div", "row2");

      var ppf = field("Pack price", "what the invoice says");
      var ppIn = numberInput(line.lid + "-pp", line.packPrice);
      ppIn.addEventListener("input", function () { line.packPrice = ppIn.value; compute(); });
      ppf.label.setAttribute("for", ppIn.id);
      ppf.appendChild(wrapInp(ppIn, SYM[state.currency], null));
      pair1.appendChild(ppf);

      var yf1 = field("Yield", "usable % after trim");
      var yIn1 = numberInput(line.lid + "-y", line.yieldPct);
      yIn1.addEventListener("input", function () { line.yieldPct = yIn1.value; compute(); });
      yf1.label.setAttribute("for", yIn1.id);
      yf1.appendChild(wrapInp(yIn1, null, "%"));
      pair1.appendChild(yf1);

      card.appendChild(pair1);

      var pqf = field("Pack size", "a 25 kg sack is 25 kg");
      var pqRow = el("div", "row2");
      var pqIn = numberInput(line.lid + "-pq", line.packQty);
      pqIn.addEventListener("input", function () { line.packQty = pqIn.value; compute(); });
      var puSel = unitSelect(line.lid + "-pu", PACK_UNITS, line.packUnit);
      puSel.setAttribute("aria-label", "Pack unit");
      puSel.addEventListener("change", function () {
        line.packUnit = puSel.value;
        refreshCard(outer, line);
        compute();
      });
      pqRow.appendChild(pqIn);
      pqRow.appendChild(puSel);
      pqf.label.setAttribute("for", pqIn.id);
      pqf.appendChild(pqRow);
      card.appendChild(pqf);
    }

    /* --- how much the batch uses --- */
    var qf = field("Used per batch", isPrep ? "out of that prep's batch" : null);
    var qRow = el("div", "row2");
    var qIn = numberInput(line.lid + "-q", line.qty);
    qIn.addEventListener("input", function () { line.qty = qIn.value; compute(); });
    var uSel = unitSelect(line.lid + "-u", isPrep ? PREP_UNITS : USE_UNITS, line.unit);
    uSel.setAttribute("aria-label", "Recipe unit");
    uSel.addEventListener("change", function () {
      line.unit = uSel.value;
      refreshCard(outer, line);
      compute();
    });
    qRow.appendChild(qIn);
    qRow.appendChild(uSel);
    qf.label.setAttribute("for", qIn.id);
    qf.appendChild(qRow);
    card.appendChild(qf);

    if (isPrep) {
      var yf = field("Yield", "usable % if it reduces further");
      var yIn = numberInput(line.lid + "-y", line.yieldPct);
      yIn.addEventListener("input", function () { line.yieldPct = yIn.value; compute(); });
      yf.label.setAttribute("for", yIn.id);
      yf.appendChild(wrapInp(yIn, null, "%"));
      card.appendChild(yf);
    }

    /* --- which quantity was entered --- */
    var bf = field("The quantity above is", null);
    var seg = el("div", "seg");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Quantity basis");
    var bEP, bAP;
    bEP = segButton("As served", line.basis !== "AP", function () {
      line.basis = "EP";
      bEP.setAttribute("aria-pressed", "true");
      bAP.setAttribute("aria-pressed", "false");
      refreshCard(outer, line);
      compute();
    });
    bAP = segButton("As purchased", line.basis === "AP", function () {
      line.basis = "AP";
      bEP.setAttribute("aria-pressed", "false");
      bAP.setAttribute("aria-pressed", "true");
      refreshCard(outer, line);
      compute();
    });
    seg.appendChild(bEP);
    seg.appendChild(bAP);
    bf.appendChild(seg);
    card.appendChild(bf);

    /* --- density, only when weight has to meet volume --- */
    var df = field("Density", "grams per millilitre — cooking oil is about 0.91, water is 1");
    var dIn = numberInput(line.lid + "-d", line.density);
    dIn.addEventListener("input", function () { line.density = dIn.value; compute(); });
    df.label.setAttribute("for", dIn.id);
    df.appendChild(wrapInp(dIn, null, "g/ml"));
    df.setAttribute("data-density", "");
    card.appendChild(df);

    /* --- what this line costs, and anything wrong with it --- */
    var errNote = el("div", "note");
    errNote.setAttribute("data-lineerr", "");
    errNote.hidden = true;
    card.appendChild(errNote);

    var bar = el("div", "btnrow");
    var costPill = el("span", "pill", "—");
    costPill.setAttribute("data-linecost", "");
    var unitPill = el("span", "pill", "");
    unitPill.setAttribute("data-lineunit", "");
    var del = el("button", "btn ghost", "Remove");
    del.type = "button";
    del.addEventListener("click", function () {
      var at = recipe.lines.indexOf(line);
      if (at >= 0) { recipe.lines.splice(at, 1); }
      renderLines();
      compute();
    });
    bar.appendChild(costPill);
    bar.appendChild(unitPill);
    bar.appendChild(del);
    card.appendChild(bar);

    refreshCard(outer, line);
    return outer;
  }

  /* Show or hide the density field without rebuilding the card, so typing
   * never loses the cursor. */
  function refreshCard(outer, line) {
    var d = outer.querySelector("[data-density]");
    if (d) { d.hidden = !needsDensity(line); }
  }

  /* ---------------- the book handed to the costing module ---------------- */

  function toBook() {
    return {
      pricing: {
        targetPct: state.pricing.targetPct,
        taxPct: state.pricing.taxPct,
        taxInclusive: state.pricing.taxInclusive,
        rounding: state.pricing.rounding
      },
      recipes: state.recipes.map(function (r) {
        return {
          id: r.id,
          name: displayName(r),
          kind: r.kind,
          yieldQty: r.yieldQty,
          yieldUnit: r.yieldUnit,
          wastagePct: r.wastagePct,
          otherDirect: r.otherDirect,
          menuPrice: r.menuPrice,
          lines: r.lines.map(function (l) {
            return {
              kind: l.kind,
              name: l.name,
              prepId: l.prepId,
              packPrice: l.packPrice,
              packQty: l.packQty,
              packUnit: l.packUnit,
              qty: l.qty,
              unit: l.unit,
              yieldPct: l.yieldPct,
              basis: l.basis,
              density: l.density
            };
          })
        };
      })
    };
  }

  /* ---------------- painting the result ---------------- */

  /* A field nobody has touched is not a mistake. The costing module treats a
   * blank as 0, which is right for the arithmetic, but an untouched line must
   * not be told off for it — only a line somebody has started filling in, or a
   * zero somebody actually typed, earns a warning. */
  function isBlank(v) { return v === "" || v === null || v === undefined; }

  function lineTouched(line) {
    if (!line) { return false; }
    if (line.kind === "prep") { return !!line.prepId || !isBlank(line.qty); }
    return !isBlank(line.name) || !isBlank(line.packPrice) || !isBlank(line.packQty) || !isBlank(line.qty);
  }

  function anyLineTouched(recipe) {
    return recipe.lines.some(lineTouched);
  }

  function lineLabel(line, result, index) {
    if (line.kind === "prep") {
      var p = findRecipe(line.prepId);
      return p ? displayName(p) : "Prep (none picked)";
    }
    return line.name || ("Ingredient " + (index + 1));
  }

  function compute() {
    var out = C.costBook(toBook());
    paintSelected(out);
    paintMenu(out);
  }

  function paintSelected(out) {
    var r = current();
    if (!r) { return; }
    var res = out.results[r.id];
    if (!res) { return; }
    var isPrep = r.kind === "prep";
    var warnings = [];

    /* --- the headline --- */
    var unitWord = isPrep ? unitLabel(res.yieldUnit, 1) : "portion";
    byId("pk").textContent = isPrep
      ? ("Cost per " + unitWord + " of prep")
      : "Plate cost per portion";
    byId("pv").textContent = money(res.costPerYieldUnit);

    var sub = [];
    if (res.costPerYieldUnit === null) {
      sub.push(isPrep ? "Enter what the batch makes." : "Enter how many portions the batch serves.");
    } else if (isPrep) {
      sub.push("Batch of " + fmtQty(res.yieldQty, res.yieldUnit) + " costs " + money(res.plateCostBatch));
      sub.push(res.usedBy.length === 0
        ? "Not used by any dish yet"
        : ("Used by " + res.usedBy.length + (res.usedBy.length === 1 ? " recipe" : " recipes")));
    } else {
      if (res.target.suggestedRounded !== null) {
        sub.push("Suggested price at " + fmtPct(out.pricing.targetPct, 0) + " food cost: " + money(res.target.suggestedRounded));
      }
      if (res.analysis.ok && res.analysis.costPct !== null) {
        sub.push("At " + money(res.analysis.menuPrice) + " you run " + fmtPct(res.analysis.costPct) + " food cost");
      }
    }
    byId("ps").textContent = sub.join(" · ");

    /* --- the batch build-up --- */
    var tb = byId("lineRows");
    tb.textContent = "";
    res.lines.forEach(function (L, i) {
      var label = lineLabel(r.lines[i], L, i);
      var bought = L.errors.length ? "—" : fmtQty(L.apQty, L.unit);
      var cost = L.errors.length ? "—" : money(L.cost);
      var tr = row3(tb, null, label, bought, cost);
      if (L.errors.length) { tr.className = "sub"; }
      if (lineTouched(r.lines[i])) {
        L.errors.forEach(function (e) { warnings.push(label + ": " + e.msg); });
      }
    });
    if (!res.lines.length) { row3(tb, "sub", "No ingredients yet", "", ""); }

    row3(tb, "sub", "Ingredients", "", money(res.ingredientCostBatch));
    if (res.wastagePct > 0) {
      row3(tb, "sub", "Wastage " + fmtPct(res.wastagePct, res.wastagePct % 1 ? 1 : 0), "", money(res.wastageAmount));
    }
    if (res.otherDirectBatch > 0) {
      row3(tb, "sub", res.otherDirectBasis === "perBatch"
        ? "Other direct, per batch"
        : ("Other direct, " + money(res.otherDirect) + " a plate"), "", money(res.otherDirectBatch));
    }
    row3(tb, "total",
      res.yieldQty > 0 ? ("Batch of " + fmtQty(res.yieldQty, res.yieldUnit)) : "Batch",
      "", money(res.plateCostBatch));

    /* --- the price check --- */
    var pb = byId("priceRows");
    pb.textContent = "";

    if (isPrep) {
      row2(pb, null, "Cost per " + unitLabel(res.yieldUnit, 1), money(res.costPerYieldUnit));
      row2(pb, null, "Cost of the whole batch", money(res.plateCostBatch));
      row2(pb, "sub", "of which food only", money(res.foodCostBatch));
      var usedRow = res.usedBy.length
        ? res.usedBy.map(function (u) { return u.name; }).join(", ")
        : "nothing yet";
      row2(pb, "total", "Used by", usedRow);
    } else {
      row2(pb, null, "Plate cost per portion", money(res.costPerYieldUnit));
      row2(pb, "sub", "of which food only", money(res.foodCostPerYieldUnit));
      if (res.target.ok && res.target.suggestedNet !== null) {
        row2(pb, null, "Price at " + fmtPct(out.pricing.targetPct, 0) + " food cost", money(res.target.suggestedNet));
        if (out.pricing.rounding > 0) {
          row2(pb, null, "Rounded up to the nearest " + money(out.pricing.rounding), money(res.target.suggestedRounded));
        }
        if (out.pricing.taxPct > 0) {
          row2(pb, "sub", "With " + fmtPct(out.pricing.taxPct) + " tax added", money(res.target.suggestedGross));
        }
      } else {
        res.target.errors.forEach(function (e) { warnings.push(e.msg); });
      }

      var A = res.analysis;
      if (A.ok) {
        row2(pb, null, out.pricing.taxInclusive ? "Your menu price, tax included" : "Your menu price, before tax", money(A.menuPrice));
        if (out.pricing.taxPct > 0) {
          row2(pb, "sub", out.pricing.taxInclusive ? "Price before tax" : "Price with tax added",
            money(out.pricing.taxInclusive ? A.netPrice : A.grossPrice));
        }
        row2(pb, null, "Your food cost", fmtPct(A.costPct));
        if (A.vsTargetPoints !== null) {
          var pts = Math.abs(A.vsTargetPoints);
          row2(pb, "sub", "Against your target",
            A.vsTargetPoints > 0.05
              ? (plainNum(pts, 1) + " points over")
              : (A.vsTargetPoints < -0.05 ? (plainNum(pts, 1) + " points under") : "on target"));
        }
        if (A.multiple !== null) {
          row2(pb, "sub", "Pricing multiple", plainNum(A.multiple, 2) + "× the plate cost");
        }
        var gm = row2(pb, "total", "Gross margin per plate",
          A.marginAmount === null ? "—" : (money(A.marginAmount) + (A.marginPct === null ? "" : "  (" + fmtPct(A.marginPct) + ")")));
        if (A.marginAmount !== null && A.marginAmount < 0) {
          gm.lastChild.className = "num neg";
        }
        if (A.verdict === "below-cost") {
          warnings.push("This dish is sold below what the plate costs to make: every plate loses " + money(-A.marginAmount) + ".");
        } else if (A.verdict === "over-target" && A.priceForTargetNet !== null) {
          warnings.push("Food cost is " + plainNum(Math.abs(A.vsTargetPoints), 1) + " points over your target. " + money(A.priceForTargetNet) + " before tax would bring it back to " + fmtPct(out.pricing.targetPct, 0) + ".");
        }
      } else {
        row2(pb, "total", "Your menu price", "—");
        /* no point asking for a price until there is a plate cost to judge it against */
        if (res.costPerYieldUnit !== null) {
          A.errors.forEach(function (e) { warnings.push(e.msg); });
        }
      }
    }

    /* --- recipe-level problems --- */
    var started = anyLineTouched(r);
    res.errors.forEach(function (e) {
      if (e.code === "LINE_ERRORS") { return; }        /* already listed per line */
      if (e.code === "ZERO_PORTIONS" && isBlank(r.yieldQty) && !started) { return; }
      warnings.push(e.msg);
    });

    paintWarnings(warnings);
    paintLinePills(r, res);
  }

  function paintLinePills(recipe, res) {
    var host = byId("lines");
    res.lines.forEach(function (L, i) {
      var line = recipe.lines[i];
      if (!line) { return; }
      var card = host.querySelector('[data-lid="' + line.lid + '"]');
      if (!card) { return; }
      var costPill = card.querySelector("[data-linecost]");
      var unitPill = card.querySelector("[data-lineunit]");
      var note = card.querySelector("[data-lineerr]");

      if (L.errors.length) {
        var touched = lineTouched(line);
        costPill.textContent = touched ? "not costed" : "—";
        unitPill.textContent = "";
        note.textContent = touched ? L.errors.map(function (e) { return e.msg; }).join(" ") : "";
        note.hidden = !touched;
      } else {
        costPill.textContent = money(L.cost);
        var bits = [];
        if (L.unitCost !== null && L.purchaseUnit) {
          bits.push(rate(L.unitCost, L.purchaseUnit));
        }
        /* "buys" is worth saying only where the quantity moved: a yield
         * gross-up, or a weight/volume bridge. A plain 1:1 line says nothing. */
        if (L.viaDensity && L.purchaseQty !== null) {
          bits.push("buys " + fmtQty(L.purchaseQty, L.purchaseUnit));
        } else if (L.grossedUp) {
          bits.push("buys " + fmtQty(L.apQty, L.unit));
        }
        unitPill.textContent = bits.join(" · ");
        note.textContent = "";
        note.hidden = true;
      }
    });
  }

  function paintWarnings(list) {
    var box = byId("warnBox");
    box.textContent = "";
    if (!list.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    if (list.length === 1) {
      box.textContent = list[0];
      return;
    }
    var ul = document.createElement("ul");
    list.forEach(function (w) { ul.appendChild(el("li", null, w)); });
    box.appendChild(ul);
  }

  function paintMenu(out) {
    var mb = byId("menuRows");
    mb.textContent = "";
    if (!out.dishes.length) {
      var tr = el("tr", "sub");
      cell(tr, "No dishes yet");
      cell(tr, "", "num");
      cell(tr, "", "num");
      cell(tr, "", "num");
      mb.appendChild(tr);
    }
    out.dishes.forEach(function (d) {
      var tr = el("tr", d.id === state.selected ? "total" : null);
      var td = el("td");
      var a = document.createElement("a");
      a.href = "#";
      a.textContent = d.name;
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        state.selected = d.id;
        renderAll();
      });
      td.appendChild(a);
      tr.appendChild(td);
      cell(tr, money(d.costPerYieldUnit), "num");
      cell(tr, d.analysis.ok ? money(d.analysis.menuPrice) : "—", "num");
      var pctCell = el("td", "num", d.analysis.costPct === null ? "—" : fmtPct(d.analysis.costPct));
      if (d.analysis.costPct !== null && out.pricing.targetPct > 0 && d.analysis.costPct > out.pricing.targetPct) {
        pctCell.className = "num neg";
      }
      tr.appendChild(pctCell);
      mb.appendChild(tr);
    });

    var pb = byId("prepRows");
    pb.textContent = "";
    if (!out.preps.length) {
      var tr2 = el("tr", "sub");
      cell(tr2, "No preps yet — a sauce used by several dishes belongs here");
      cell(tr2, "", "num");
      cell(tr2, "", "num");
      pb.appendChild(tr2);
    }
    out.preps.forEach(function (p) {
      var tr = el("tr", p.id === state.selected ? "total" : null);
      var td = el("td");
      var a = document.createElement("a");
      a.href = "#";
      a.textContent = p.name;
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        state.selected = p.id;
        renderAll();
      });
      td.appendChild(a);
      tr.appendChild(td);
      cell(tr, p.costPerYieldUnit === null ? "—" : (money(p.costPerYieldUnit) + " / " + unitLabel(p.yieldUnit, 1)), "num");
      cell(tr, p.usedBy.length ? (p.usedBy.length + (p.usedBy.length === 1 ? " recipe" : " recipes")) : "nothing", "num");
      pb.appendChild(tr);
    });
  }

  /* ---------------- wiring ---------------- */

  function renderAll() {
    renderTabs();
    renderRecipe();
    renderLines();
    compute();
  }

  function onRecipeField(id, key, isPricing) {
    var node = byId(id);
    node.addEventListener("input", function () {
      if (isPricing) {
        state.pricing[key] = node.value;
      } else {
        var r = current();
        if (!r) { return; }
        r[key] = node.value;
        if (key === "name") { renderTabs(); }
      }
      compute();
    });
  }

  function wire() {
    onRecipeField("rName", "name", false);
    onRecipeField("rYieldQty", "yieldQty", false);
    onRecipeField("rWastage", "wastagePct", false);
    onRecipeField("rOther", "otherDirect", false);
    onRecipeField("rPrice", "menuPrice", false);
    onRecipeField("pTarget", "targetPct", true);
    onRecipeField("pRound", "rounding", true);
    onRecipeField("pTax", "taxPct", true);

    byId("rYieldUnit").addEventListener("change", function () {
      var r = current();
      if (!r) { return; }
      r.yieldUnit = byId("rYieldUnit").value;
      renderLines();                 /* prep lines may need a different unit */
      compute();
    });

    var curBtns = document.querySelectorAll("[data-cur]");
    for (var i = 0; i < curBtns.length; i++) {
      (function (b) {
        b.addEventListener("click", function () {
          state.currency = b.getAttribute("data-cur");
          paintSeg("[data-cur]", "cur", state.currency);
          paintCurrencySymbols();
          compute();
        });
      })(curBtns[i]);
    }

    var incBtns = document.querySelectorAll("[data-inc]");
    for (var j = 0; j < incBtns.length; j++) {
      (function (b) {
        b.addEventListener("click", function () {
          state.pricing.taxInclusive = b.getAttribute("data-inc") === "1";
          paintSeg("[data-inc]", "inc", state.pricing.taxInclusive ? "1" : "0");
          compute();
        });
      })(incBtns[j]);
    }

    byId("addDish").addEventListener("click", function () {
      var id = nextId("r");
      state.recipes.push({
        id: id, name: "", kind: "dish", yieldQty: "", yieldUnit: "portion",
        wastagePct: C.DEFAULT_WASTAGE_PCT, otherDirect: "", menuPrice: "",
        lines: [blankLine("ingredient")]
      });
      state.selected = id;
      renderAll();
      byId("rName").focus();
    });

    byId("addPrep").addEventListener("click", function () {
      var id = nextId("r");
      state.recipes.push({
        id: id, name: "", kind: "prep", yieldQty: "", yieldUnit: "kg",
        wastagePct: C.DEFAULT_WASTAGE_PCT, otherDirect: "", menuPrice: "",
        lines: [blankLine("ingredient")]
      });
      state.selected = id;
      renderAll();
      byId("rName").focus();
    });

    byId("delRecipe").addEventListener("click", function () {
      if (state.recipes.length < 2) { return; }
      var r = current();
      state.recipes = state.recipes.filter(function (x) { return x.id !== r.id; });
      state.selected = state.recipes[0].id;
      renderAll();
    });

    byId("addLine").addEventListener("click", function () {
      var r = current();
      if (!r) { return; }
      r.lines.push(blankLine("ingredient"));
      renderLines();
      compute();
    });

    byId("addPrepLine").addEventListener("click", function () {
      var r = current();
      if (!r) { return; }
      var available = preps().filter(function (p) { return p.id !== r.id; });
      if (!available.length) { return; }
      var ln = blankLine("prep");
      ln.prepId = available[0].id;
      ln.unit = available[0].yieldUnit === "portion" ? "portion" : available[0].yieldUnit;
      r.lines.push(ln);
      renderLines();
      compute();
    });

    byId("print").addEventListener("click", function () { window.print(); });

    byId("reset").addEventListener("click", function () {
      state = blankState();
      renderAll();
    });

    byId("example").addEventListener("click", function () {
      state = exampleState();
      renderAll();
    });

    state = exampleState();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
