# Recipe costing and plate pricing calculator for kitchens

A free, open-source single-page tool that works out what one plate actually
costs, and what it therefore has to sell for.

Most kitchen costing fails in the same two places, and both of them make every
plate look cheaper than it is:

1. **The pack unit is not the recipe unit.** Rice is bought by the 25 kg sack
   and served 180 g at a time; oil is bought by the 15 kg tin and ladled by the
   millilitre. The conversion is where the arithmetic goes wrong.
2. **Yield divides, it does not multiply.** 150 g of trimmed chicken on a plate
   at a 72% yield means `150 ÷ 0.72 = 208 g` came out of the cold room, and
   208 g is what the kitchen paid for. Multiplying instead — `150 × 0.72` —
   understates the plate, every plate, forever.

This page does both explicitly, costs shared preparations once, and then prices
in both directions: the menu price your target food cost needs, and the real
food cost of the price already printed on your menu.

## What it computes

- **Plate cost per portion** — ingredients converted from pack units to recipe
  units, grossed up for yield, plus a wastage allowance and any other direct
  cost, divided by the portions one batch serves.
- **Per-line transparency** — for every ingredient: the rate per kilo or litre
  implied by its pack price, and the quantity the kitchen must actually buy.
- **Preps (sub-recipes)** — a base gravy, stock, spice paste or chutney is a
  recipe in its own right with its own batch yield, so it has its own cost per
  gram. Dishes buy it by the gram. Change one onion price and every dish that
  touches the gravy moves in the same keystroke. Preps may use other preps to
  any depth; a loop is reported as a loop rather than costed.
- **Suggested menu price** at your target food-cost percentage, rounded up
  (never down) to a round figure, with your own GST or VAT added if you want it.
- **The reverse** — at the price you charge today: your actual food-cost
  percentage, how many points that is over or under target, your gross margin
  per plate in money and in percent, and the pricing multiple.
- **A menu-wide table** of every dish with its plate cost, price and food cost,
  so the one dish quietly running at 48% is visible.

## Who it's for

Cafes, cloud kitchens, caterers, QSR operators, canteens, bakeries and small
food processors in India and the Philippines — anyone who sells a plate, a box
or a packet made from a recipe. It assumes no accounting software, no training,
and no spreadsheet skill: a phone browser is enough.

## The named regulation

**There isn't one, and the page does not invent one.** No statute, licence or
standard in India or the Philippines fixes what a plate may cost or what a
kitchen may charge, so every default here is ordinary food-service trade
practice, labelled as indicative, and editable:

| Default | Value | What it is |
| --- | --- | --- |
| Target food cost | 30% | A rule of thumb; kitchens commonly aim at 25–35%. |
| Wastage allowance | 5% | Spoilage, spillage, over-portioning, staff tasting; 3–8% is the band usually quoted. |
| Price rounding | 5, upward | Menu prices are normally printed as round figures. |
| GST / VAT | 0% | No tax rate is assumed or asserted. Enter your own, and say whether your menu price already includes it. |

The only fixed figures are unit conversions: weight is based on the gram
(1 kg = 1000 g, 1 lb = 453.59237 g, 1 oz = 28.349523125 g), volume on the
millilitre (1 l = 1000 ml), and because household measures differ between
countries the ones used here are stated outright — teaspoon 5 ml,
tablespoon 15 ml, cup 250 ml.

## How to run it

It is a static page with no dependencies and no network calls. Clone it and
serve the folder:

```sh
python3 -m http.server 8137
# then open http://localhost:8137/
```

Or open `index.html` directly, or host the folder on any static host.

The costing rules live in `assets/costing.js` as a pure module with no DOM and
no browser dependency, so they can be checked on their own:

```sh
node tests/costing.test.js
```

The tests are table-driven and cover every unit conversion, the yield gross-up
in both directions (including the multiply mistake, asserted against), the
sub-recipe dependency graph, loop detection, both pricing directions, and the
guards below.

## What it refuses to do

- Cost a line whose pack unit and recipe unit are not comparable — a pack
  priced per kilo against a recipe written in millilitres — unless you supply a
  density in grams per millilitre. Pieces never convert to grams at all.
- Divide by zero portions, zero yield, zero pack size or zero price. Each is
  reported as the hole it is, in plain words, and never rendered as a number.
- Accept a target food cost of 0% or over 100%.
- Round a suggested price down.

## Honesty about scope

This costs **the plate**: food and the direct costs you enter. It is not a
profit-and-loss statement. Rent, wages, electricity, gas beyond what you type
in, delivery commission, forgotten packaging and tax are all outside plate
cost, and a healthy food-cost percentage is not the same thing as a profitable
kitchen.

The output is only as good as the inputs. Pack prices move weekly; yields
depend on your supplier, your cuts and your cooks, and are worth measuring in
your own kitchen rather than taken from any published table — the yield figures
in the worked example on the page are illustrative, not reference data. Portion
counts are whatever you say they are; the page has no view on how big a plate
should be.

Nothing here is tax, pricing or labelling advice. Everything runs in the
browser: nothing is uploaded, stored or sent anywhere, which also means a
refresh clears the page — print or save a PDF to keep a costing sheet.

MIT licensed.
