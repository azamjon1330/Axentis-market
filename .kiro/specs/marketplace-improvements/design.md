# Design Document

## Overview

This design delivers the 22 marketplace-improvement requirements end-to-end across four surfaces:

- **Backend** (Go / Gin, `backend/`): new SQL migrations, per-variant photo storage and CRUD, product default-variant designation, a user-aware Top Companies ranking endpoint, per-company subscription status, saved-addresses CRUD, an analytics aggregation fix that covers all product types, a time-series endpoint with granularity + previous-period comparison, and promo-code listing (already largely present).
- **Web** (Vite + React + TS, `src/`): real-time language propagation into analytics, a polling hook, a two-line Orders & Revenue chart with dynamic granularity buckets, light-theme CSS fixes for admin and company panels, and Company-Panel UI for default-variant selection and per-variant photo upload.
- **Buyer App** (Expo React Native, `Homepage/`): category icons, a Top Companies section with subscription round-robin ordering, Uzbek translations, a product image gallery with auto-scroll, per-variant photo switching, stable variant selection, sizes in orders, cart quantity controls (plus/minus + editable field + stock cap), variant-required add-to-cart, default-variant auto-apply, promo-code rendering, and saved-addresses with map picker.

"Real-time" is implemented as **auto-refresh polling (15–30s)** for analytics and **instant in-memory React context switching** for language — no sockets, no page reloads.

### Critical Design Constraint — `.js` vs `.tsx` runtime resolution

Every Buyer App screen and context exists as **both** a `.js` and a `.tsx` file (e.g. `CartScreen.js` + `CartScreen.tsx`, `LanguageContext.js` + `LanguageContext.tsx`, `ProductDetailScreen.js` + `ProductDetailScreen.tsx`). Metro's default `sourceExts` resolves **`.js` before `.tsx`**, so **the `.js` files are the runtime**. The `.tsx` files are effectively dead code at runtime.

**Rule for all app work in this feature:** apply every behavioral fix to the **`.js`** file. Where the `.tsx` variant contains newer logic that the `.js` lacks, port that logic into the `.js` file. Treat `.tsx` as a reference, never as the thing that ships. This applies to `CartContext.js`, `LanguageContext.js`, `ProductDetailScreen.js`, `CartScreen.js`, `CategoryProductsScreen.js`, `CheckoutScreen.js`, `MapLocationPickerScreen.js`, `CompanyStoreScreen.js`, and the `Home`/`Orders`/`Catalog` runtime files.

A secondary cleanup option (out of scope to force, but recommended) is to delete the redundant `.tsx` siblings once parity is confirmed, to remove the footgun. This design assumes they remain and that `.js` is authoritative.

---

## Architecture

```
┌────────────────────┐     polling 15–30s (analytics)        ┌──────────────────────┐
│  Web (Vite/React)  │  ───────────────────────────────────► │  Go Backend (Gin)    │
│  AdvancedAnalytics │  ◄───────────────────────────────────  │  routes/handlers/*   │
│  Admin/CompanyPanel│     REST JSON                           │                      │
└────────────────────┘                                        │  ┌────────────────┐  │
                                                               │  │ PostgreSQL     │  │
┌────────────────────┐     REST JSON (poll on focus/reload)    │  │ + migrations   │  │
│  Buyer App (Expo)  │  ───────────────────────────────────►  │  └────────────────┘  │
│  .js runtime files │  ◄───────────────────────────────────  │                      │
│  React contexts    │                                         └──────────────────────┘
└────────────────────┘
        │
        └── LanguageContext (instant in-memory switch), CartContext (variant-aware lines)
```

No new transport is introduced. All real-time behavior is REST polling plus in-memory context state.

---

## Data Model / Database Migrations

All migrations are additive and follow the existing `+goose Up` / `+goose Down` convention and numbering. Existing data and code paths remain backward compatible.

Existing relevant state (confirmed in code):
- `products.images` is a **JSON-array string** column, currently hard-capped at 6 in `UploadProductImages` → this is the **Default_Photo_Set**.
- `product_variants` (migration 129/130) has **no photo column** and **no default flag**.
- `promo_codes` + `promo_code_uses` exist (migration 206) with full handler support.
- `categories.icon` already exists.
- A `subscriptions` table exists but models **user→company follows**, not a paid company subscription. A new field is required for paid ranking.

### Migration 211 — Per-variant photos

Store variant photos as a JSON array on the variant row (mirrors the existing `products.images` approach, avoids a join, and keeps ordering). Up to 4 enforced in the handler.

```sql
-- +goose Up
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;
-- +goose Down
ALTER TABLE product_variants DROP COLUMN IF EXISTS photos;
```

### Migration 212 — Product default variant

```sql
-- +goose Up
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS default_variant_id BIGINT
  REFERENCES product_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_default_variant ON products(default_variant_id);
-- +goose Down
ALTER TABLE products DROP COLUMN IF EXISTS default_variant_id;
```

`ON DELETE SET NULL` ensures deleting a variant clears, rather than orphans, the default pointer.

### Migration 213 — Company subscription (paid ranking)

```sql
-- +goose Up
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_subscribed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_companies_subscription ON companies(is_subscribed) WHERE is_subscribed = TRUE;
-- +goose Down
ALTER TABLE companies DROP COLUMN IF EXISTS is_subscribed;
ALTER TABLE companies DROP COLUMN IF EXISTS subscription_expires_at;
```

A company counts as actively subscribed when `is_subscribed = TRUE AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())`.

### Migration 214 — Saved delivery addresses

Replaces the single-default model (`users.default_delivery_*` from migration 112) with a one-to-many table. The legacy columns remain for backward compatibility; new saved addresses are authoritative.

```sql
-- +goose Up
CREATE TABLE IF NOT EXISTS saved_addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(100) NOT NULL,
    address_text TEXT NOT NULL,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    recipient_name VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_addresses_user ON saved_addresses(user_id);
-- +goose Down
DROP TABLE IF EXISTS saved_addresses;
```

### Photo-limit invariants (enforced in backend handlers, not SQL)

- Per variant: **≤ 4** photos in `product_variants.photos`.
- Default photo set: **≤ 6** photos in `products.images`.
- Per product total: `len(products.images) + Σ len(variant.photos) ≤ 20`.

---

## Backend — Go Endpoints

### 1. Per-variant photo CRUD (Requirement 12)

New handlers in `routes/handlers/product_variants.go`; routes nested under the existing variant group in `routes.go`.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/products/:id/variants/:variantId/photos` | Upload photos for a variant (multipart, same `files` field as `UploadProductImages`) |
| `DELETE` | `/api/products/:id/variants/:variantId/photos` | Remove a photo by URL/index from the variant |

Validation (returns `400` with a limit message on violation — Req 12.6):

```go
func validatePhotoLimits(db *sql.DB, productID, variantID int64, incoming int) error {
    // 1. per-variant cap
    var current int // len(photos) for this variant
    if current+incoming > 4 {
        return fmt.Errorf("variant photo limit is 4 (have %d, adding %d)", current, incoming)
    }
    // 2. product-wide cap: len(products.images) + Σ len(variant.photos)
    var productTotal int
    if productTotal+incoming > 20 {
        return fmt.Errorf("product photo limit is 20 (have %d, adding %d)", productTotal, incoming)
    }
    return nil
}
```

`UploadProductImages` is updated so the existing 6-cap on `products.images` also participates in the 20-total check (reject rather than silently truncate, per Req 12.6). `GetProductVariants` is extended to return the `photos` array per variant; `GetProductByID` returns `images` (default set) plus a `defaultVariantId`.

### 2. Default variant set/get (Requirement 18)

| Method | Route | Purpose |
|---|---|---|
| `PUT` | `/api/products/:id/default-variant` | Body `{ "variantId": <id|null> }`; validates the variant belongs to the product; sets `products.default_variant_id` |

`GetProductByID` / `GetProducts` include `defaultVariantId` so the app can auto-apply it.

### 3. Top Companies ranking (Requirement 8)

`GetTopCompanies` is reworked to be **user-aware** and ranked by **positive-review volume** and **the viewer's prior orders**, replacing the current `sold_count`-only ordering.

- Route gains an optional query param: `GET /api/companies/top?userPhone=<phone>`.
- Ranking score (computed in SQL, ordered DESC):

```
score = positive_reviews * W_REVIEW + has_prior_order * W_HISTORY
```

```sql
SELECT c.id, c.name, COALESCE(c.logo_url,''), COALESCE(c.address,''),
  COALESCE((SELECT COUNT(*) FROM reviews r
            JOIN products p ON p.id = r.product_id
            WHERE p.company_id = c.id AND r.rating >= 4), 0) AS positive_reviews,
  EXISTS(SELECT 1 FROM orders o
         WHERE o.company_id = c.id AND o.customer_phone = $1
           AND o.status NOT IN ('pending','cancelled')) AS has_prior_order,
  c.is_subscribed
FROM companies c
WHERE c.status = 'approved' AND (c.mode = 'public' OR c.mode IS NULL)
  AND COALESCE(c.is_enabled, TRUE) = TRUE
ORDER BY (CASE WHEN has_prior_order THEN 1000 ELSE 0 END) + positive_reviews DESC,
         positive_reviews DESC
LIMIT 12;
```

When `userPhone` is absent, `has_prior_order` is `false` for all rows and ranking falls back to positive reviews. The "promotes more often" requirement (8.1/8.2) is satisfied by rank order: higher-scored companies appear earlier/more prominently, and the app's round-robin (below) reuses the order.

### 4. Subscription status exposure (Requirement 9.4)

- `GetProducts` and `GetCompanies` include `isSubscribed` (derived: `is_subscribed AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())`).
- New admin route to toggle: `PUT /api/companies/:id/subscription` with `{ "isSubscribed": bool, "expiresAt": <ts|null> }`.

This lets the app rank subscribed companies first; the **ordering algorithm itself lives in the app** (Req 9.1–9.3 are Buyer_App behaviors).

### 5. Saved addresses CRUD (Requirement 13)

New handler file `routes/handlers/saved_addresses.go`, new route group:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/users/:phone/addresses` | List the user's saved addresses |
| `POST` | `/api/users/:phone/addresses` | Create `{label, addressText, latitude, longitude, recipientName, isDefault}` |
| `PUT` | `/api/users/:phone/addresses/:addressId` | Update label/coords/text (Req 13.5) |
| `DELETE` | `/api/users/:phone/addresses/:addressId` | Remove (Req 13.6) |

Setting `isDefault=true` clears the flag on the user's other rows in the same transaction.

### 6. Analytics aggregation fix — all product types (Requirement 3)

The current `GetCompanyAnalytics` returns aggregate totals plus raw `orders` (with `items` JSON), so the per-product-type breakdown is computed client-side and currently misses types. Fix server-side by adding a typed breakdown so the web does not have to guess:

```sql
-- breakdown over confirmed orders + cash sales, grouped by product type
SELECT item->>'type' AS product_type,
       SUM((item->>'quantity')::int) AS units,
       SUM((item->>'price')::numeric * (item->>'quantity')::int) AS revenue
FROM orders o, jsonb_array_elements(o.items) item
WHERE o.company_id = $1 AND o.status NOT IN ('pending','cancelled')
GROUP BY item->>'type';
```

The handler unions this with the equivalent over `sales`, normalizes type keys (`futbolka`, `sportivka`, `kostyum`, `krossovka`, …), and returns a `productTypeBreakdown: [{ productType, units, revenue }]` array containing **every** type with recorded sales (Req 3.1–3.3). Types absent from the range are simply omitted (not zero-filled).

### 7. Analytics time-series with granularity + previous-period comparison (Requirement 4)

Replace the fixed `GetRevenueAnalytics` (currently `LIMIT 30` daily over `sales` only) with a range/granularity-aware series over **orders + cash sales**:

`GET /api/analytics/company/:companyId/timeseries?range=<daily|weekly|monthly|yearly>&from=<iso>&to=<iso>`

Bucket size derived from `range` (Req 4.2–4.5):

| range | bucket | SQL `date_trunc` / generated bucket |
|---|---|---|
| daily | 1 hour | `date_trunc('hour', created_at)` |
| weekly | 12 hours | floor to 12h boundary |
| monthly | 1 day | `date_trunc('day', created_at)` |
| yearly | 1 week | `date_trunc('week', created_at)` |

Response returns two aligned series (Req 4.6–4.7):

```json
{
  "granularity": "day",
  "current":  [{ "bucket": "...", "orders": 12, "revenue": 3400 }],
  "previous": [{ "bucket": "...", "orders": 9,  "revenue": 2600 }]
}
```

`previous` covers the equal-length range **immediately preceding** `[from, to)` (i.e. `from' = from - (to-from)`, `to' = from`), bucketed identically and **index-aligned** to `current` so the chart can plot exactly two lines. Empty buckets are zero-filled within the range only (Req 4.1).

### 8. Promo codes listing (Requirement 21)

Already implemented (`GetAllPromoCodes`, `GetCompanyPromoCodes`, `ValidatePromoCode`, `RedeemPromoCode`). The app consumes:
- `GET /api/promo-codes/company/:companyId` — list visible codes (company + platform-wide).
- `POST /api/promo-codes/validate` — `{code, userPhone, companyId, orderAmount}` → `{valid, discount, finalAmount, message}`.
- `POST /api/promo-codes/redeem` — record use at order placement.

No backend change required beyond confirming the app points at these routes.

---

## Web (Vite + React + TypeScript, `src/`)

### A. Real-time language propagation into analytics (Requirement 1)

- Ensure analytics components (`AdvancedAnalytics.tsx`, and any `Admin*`/`Company*` analytics children) consume the existing translation/language source (`src/utils/translations`) reactively via context, not a value captured once on mount.
- All visible labels, plus **chart axis labels, legends, and tooltips** (recharts + chart.js), read from the active language each render. Switching language updates a context value → React re-renders → labels change with **no reload** (Req 1.1–1.3).

### B. Polling hook for analytics (Requirement 2)

A reusable hook drives all analytics fetches:

```ts
function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 20000) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const d = await fetcher(); if (alive) setData(d); }
      catch { /* keep last good data, retry next tick (Req 2.3) */ }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [fetcher, intervalMs]);
  return data;
}
```

- `intervalMs` is fixed within 15000–30000 (default 20000) per Req 2.1.
- On fetch failure the last successfully loaded `data` is retained and the next tick retries (Req 2.3). Values and charts update in place on success (Req 2.2).

### C. Orders & Revenue chart — two lines + dynamic buckets (Requirement 4)

- Chart fetches the new `/timeseries` endpoint with the user's selected `range`.
- Renders **exactly two lines**: Current_Period and Previous_Period, index-aligned by bucket position. No extra series (remove any prior multi-line/all-time overlays).
- X-axis tick formatting follows `granularity` returned by the backend (hour / 12-hour / day / week).
- Only data within the selected range is plotted (Req 4.1).

### D. Light/day theme fixes for Admin & Company panels (Requirement 6)

- The light theme is currently broken because `src/dark-theme.css` rules (and/or unscoped overrides in `src/index.css`) leak into light mode, producing low-contrast text.
- Fix by scoping dark rules strictly under the dark selector (e.g. `.dark`, `[data-theme="dark"]`) and providing explicit light-theme color tokens for panel surfaces and text in `src/index.css`.
- Audit `AdminPanel.tsx` and `CompanyPanel.tsx` (and their `Admin*`/`Company*` sections) so every section reads theme tokens; verify text/background contrast in light mode (Req 6.1–6.2) and that toggling applies to **all** sections (Req 6.3–6.4).

### E. Company Panel — default-variant selector + per-variant photo upload (Requirements 18, 12)

In `CompanyPanel.tsx` product editor:
- **Default-variant selector**: a dropdown/radio listing the product's variants; selection calls `PUT /api/products/:id/default-variant`. Exactly one (or none) selectable per product (Req 18.1).
- **Per-variant photo upload**: each variant row gets an uploader (≤4) calling `POST /api/products/:id/variants/:variantId/photos`; client pre-checks the 4/variant and 20/product caps and surfaces the backend's limit error (Req 12.1, 12.6). The default photo set uploader keeps its ≤6 limit (Req 12.3).

---

## Buyer App (Expo React Native, `Homepage/` — `.js` runtime)

> All changes below target the **`.js`** files. Port any newer logic from the `.tsx` siblings into the `.js` where the `.js` lacks it.

### F. Catalog category icons (Requirement 7)

- `CategoryProductsScreen.js` / catalog list renders `category.icon` (already returned by `GetCategories`). When `icon` is empty, render a default placeholder icon (Req 7.2). Icons refresh on next catalog load since the list is re-fetched (Req 7.3).

### G. Top Companies section + subscription round-robin (Requirements 8, 9)

- Home runtime renders a **Top Companies** section from `getTopCompanies(userPhone)`; visible when more than one company is returned (mirrors existing `HomeScreen` gating). Higher-ranked (more positive reviews / prior-order) companies appear first/more prominently (Req 8).
- **Product listing ordering** (Req 9): a pure ordering function applied to product lists:
  1. Partition products into subscribed-company vs non-subscribed (using `isSubscribed` from backend). Subscribed first (Req 9.1).
  2. Among subscribed companies, **shuffle the company order** (re-randomized each load — Req 9.3) then **round-robin interleave** one product per company per pass so no single company dominates (Req 9.2).
  3. Append non-subscribed products after.

```js
function orderListing(products, seed) {
  const subs = groupByCompany(products.filter(p => p.isSubscribed));
  const rest = products.filter(p => !p.isSubscribed);
  const companies = shuffle(Object.keys(subs), seed); // re-randomized per reload
  const interleaved = [];
  let added = true;
  while (added) {
    added = false;
    for (const c of companies) {
      const bucket = subs[c];
      if (bucket.length) { interleaved.push(bucket.shift()); added = true; }
    }
  }
  return [...interleaved, ...rest];
}
```

The `seed` is regenerated on each listing reload so order re-randomizes (Req 9.3).

### H. Uzbek translations (Requirement 10)

- `LanguageContext.js` holds the in-memory `translations` object (default `'uz'`). Add the missing Uzbek keys for **product card labels, home card labels, and selection label/text** (Req 10.1–10.3). Language switch is an instant context state change (no reload), consistent with the existing context design.

### I. Product image gallery (Requirement 11)

In `ProductDetailScreen.js`, a gallery component:
- Renders up to **6** photos from the active photo set (Req 11.1).
- Auto-scrolls to the next photo every **3s** via an interval on a horizontal `FlatList`/`ScrollView` (Req 11.2).
- On manual scroll (`onScrollBeginDrag`), pause auto-scroll for **5s** then resume (Req 11.3).
- Rendered in a visually separated container above/apart from the product text block (Req 11.4).

```js
// auto-scroll with manual-pause
useEffect(() => {
  if (paused) return;
  const id = setInterval(() => setIndex(i => (i + 1) % photos.length), 3000);
  return () => clearInterval(id);
}, [paused, photos.length]);
const onManualScroll = () => {
  setPaused(true);
  clearTimeout(resumeRef.current);
  resumeRef.current = setTimeout(() => setPaused(false), 5000);
};
```

### J. Per-variant photo switching with animation (Requirement 12)

- When a buyer selects a color variant, the gallery's photo set swaps to that variant's `photos`; transition uses an `Animated` fade/cross-fade (Req 12.2).
- While no variant is selected, the gallery shows the product `images` (Default_Photo_Set) (Req 12.4).

### K. Stable variant selection (Requirement 14)

- Selected `color`/`size` live in screen state keyed to the product, not derived from fetched data. The polling/refresh of product data must **merge** new product fields without resetting `selectedColor`/`selectedSize` (Req 14.1–14.2). If the previously selected variant still exists after refresh, keep it; only reset if it disappeared.

### L. Sizes shown in orders (Requirement 15)

- Order line items carry the selected variant's `size` (and `color`). `OrdersScreen`/order detail render the size for each item (Req 15.1–15.2). Ensure the size is persisted into the order `items` payload at checkout so it survives in `orders.items` JSON.

### M. Cart quantity controls (Requirements 16, 19, 20)

`CartContext.js` is made **variant-aware**: a cart line is keyed by `(productId, variantId)` rather than `(productId, color)`. Quantity is set via the existing `/cart/set` endpoint.

- **Plus** → quantity + 1, capped at variant stock (Req 16.1, 20.1).
- **Minus** at quantity > 1 → quantity − 1 (Req 16.2).
- **Minus** at quantity == 1 → keep at 1 and prompt for explicit removal (confirm dialog), never silently delete (Req 16.3).
- **Editable field** (Req 19): a `TextInput` per line; on commit, set quantity to the entered integer, clamped to `[1, stock]`. Clearing the field is treated as 1 until a valid value is entered (Req 19.3).
- **Stock cap + warning** (Req 20): when an attempted quantity exceeds variant stock, clamp to stock and show the exact message: `"Only N of this product are in stock at this company's warehouse"` where `N` is the variant stock (Req 20.2–20.3).

```js
function clampQuantity(requested, stock) {
  let q = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1;
  if (q > stock) { q = stock; warn(`Only ${stock} of this product are in stock at this company's warehouse`); }
  return q;
}
```

### N. Variant-required add-to-cart + no variant-less / duplicate lines (Requirements 17, 18)

- If a product **has variants** and the buyer attempts Add-to-Cart / Buy Now without choosing one:
  - If the product has a **Default_Variant**, auto-apply it (Req 18.2).
  - Otherwise **block** the action and prompt the buyer to choose color then size (Req 17.1, 18.3).
- Never create a variant-less line for a product that has variants (Req 17.2).
- Adding a `(productId, variantId)` already in the cart **increments** the existing line instead of creating a duplicate (Req 17.3) — enforced by the variant-keyed line lookup in `CartContext.js`.

### O. Promo codes in app (Requirement 21)

- A promo section (cart/checkout) renders available codes from `GET /api/promo-codes/company/:companyId` (Req 21.1).
- Applying a code calls `POST /api/promo-codes/validate`; on `valid` show the discount on the order total (Req 21.2); on invalid/expired show the returned message and leave the total unchanged (Req 21.3). On order placement, `redeem` is called.

### P. Saved addresses + map picker (Requirement 13)

- A saved-addresses UI (in Profile and selectable at Checkout) lists `GET /api/users/:phone/addresses`, supports create/edit/delete via the new endpoints.
- Editing a location opens the existing **`MapLocationPickerScreen.js`** (WebView + OpenStreetMap/Leaflet, no API key) to set lat/lng; the picked coordinates + address text are saved (Req 13.4–13.5).
- At checkout, selecting a saved address applies its label/coords/recipient to the order (Req 13.2–13.3); deleting removes it from the list (Req 13.6).

---

## Deployment (Requirement 22)

After user confirmation, all changes — migrations (211–214), backend handlers/routes, web panel changes, and Buyer App `.js` changes — are committed and pushed to the GitHub **main** branch through the standard pipeline (Req 22.1–22.2). In this sandbox, work is pushed to a feature branch and a PR is opened against `main` for the user to merge.

---

## Error Handling

| Surface | Condition | Behavior |
|---|---|---|
| Backend | Photo over per-variant (4), default-set (6), or product-total (20) limit | `400` with explicit limit message; no partial write (Req 12.6) |
| Backend | Default-variant id not belonging to product | `400`, default unchanged |
| Backend | Saved address not owned by user | `404`/`403`, no mutation |
| Web | Analytics fetch fails during poll | Keep last good data, retry next interval (Req 2.3) |
| App | Add-to-cart without variant (no default) | Block + prompt to choose variant (Req 17.1) |
| App | Quantity > stock | Clamp to stock + warning message (Req 20.2) |
| App | Invalid/expired promo | Show message, total unchanged (Req 21.3) |
| App | Empty quantity field | Treat as 1 until valid entry (Req 19.3) |

---


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Translation resolution never leaks raw keys

For any label key defined in the base language and any supported language, `translate(key, lang)` returns that language's value, or a defined fallback string — never the raw key and never empty.

**Validates: Requirements 1.1, 1.3**

### Property 2: Polling retains last successful data on failure

For any finite sequence of fetch outcomes (each success carrying a payload, or a failure), the polling hook's exposed `data` always equals the payload of the most recent successful fetch, or `null` if none has succeeded yet — a failure never overwrites or clears prior good data.

**Validates: Requirements 2.3**

### Property 3: Product-type breakdown is complete and exact

For any multiset of sold items across orders and cash sales within a range, the analytics breakdown contains exactly the distinct product types present, and each type's reported `units` and `revenue` equal the sums over the items of that type.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Time-series buckets tile only the selected range at the correct granularity

For any selected range of a given type (daily→1h, weekly→12h, monthly→1d, yearly→1w), every plotted current-series bucket lies within `[from, to)`, the buckets tile the range with no gaps or overlaps, and the bucket size matches the range type.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 5: Exactly two equal-length, index-aligned comparison series

For any valid time-series request, the response contains exactly two series (Current_Period and Previous_Period) of equal length and aligned by bucket index, where the previous range is `[from-(to-from), from)` — equal in length and immediately preceding the current range.

**Validates: Requirements 4.6, 4.7**

### Property 6: Category icon resolution always yields a renderable icon

For any category, the resolved catalog icon equals the category's configured icon when it is non-empty, and otherwise equals the default placeholder icon — the result is never empty.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 7: Top Companies ordering is monotonic in rank score

For any set of companies with positive-review counts and prior-order flags, the produced Top Companies order is sorted non-increasingly by rank score (prior-order weight plus positive-review count); in particular a company the user has ordered from outranks an otherwise-equal company they have not.

**Validates: Requirements 8.1, 8.2, 8.3**

### Property 8: Subscribed products precede non-subscribed products

For any product list, after `orderListing`, the index of every subscribed-company product is less than the index of every non-subscribed-company product.

**Validates: Requirements 9.1**

### Property 9: Round-robin interleaving is fair and lossless

For any grouping of subscribed products by company, the interleaved subscribed segment is a permutation of the inputs (no product lost or duplicated), and at every point in that segment the difference between the emitted counts of any two not-yet-exhausted companies is at most 1.

**Validates: Requirements 9.2, 9.3**

### Property 10: Exposed subscription status reflects flag and expiry

For any `(is_subscribed, subscription_expires_at, now)`, the exposed `isSubscribed` equals `is_subscribed AND (subscription_expires_at IS NULL OR subscription_expires_at > now)`.

**Validates: Requirements 9.4**

### Property 11: Uzbek label coverage is complete

For any required product-card, home-card, or selection label key, the Uzbek (`uz`) translation table contains a non-empty value.

**Validates: Requirements 10.1, 10.2, 10.3**

### Property 12: Gallery renders at most six photos

For any photo array, the number of photos rendered in the product gallery equals `min(length, 6)`.

**Validates: Requirements 11.1**

### Property 13: Photo limits are enforced and over-limit additions are rejected without writing

For any product with a given distribution of photos, an addition is accepted only if it keeps the variant's photos ≤ 4, the default set ≤ 6, and the product total (default set plus all variant photos) ≤ 20; any addition exceeding an applicable limit is rejected with a limit error and leaves stored photos unchanged.

**Validates: Requirements 12.1, 12.3, 12.5, 12.6**

### Property 14: Active photo set follows variant selection

For any product, the active gallery photo set equals the selected variant's photos when a variant is selected, and equals the product's default photo set when none is selected.

**Validates: Requirements 12.2, 12.4**

### Property 15: Saved-address CRUD round-trips

For any address payload, creating it then reading it back yields equal `label`, `address_text`, and coordinates; updating then reading reflects the new values; deleting then reading shows it absent from the user's list.

**Validates: Requirements 13.1, 13.5, 13.6**

### Property 16: Selecting a saved address applies it to the order

For any saved address the buyer selects at checkout, the order's delivery fields (label, address text, coordinates, recipient) equal that address's fields.

**Validates: Requirements 13.2, 13.3**

### Property 17: Variant selection survives product refresh

For any active color/size selection, if a product-data refresh still contains the selected variant, then after merging the refreshed data the selection is unchanged.

**Validates: Requirements 14.1, 14.2**

### Property 18: Ordered items preserve their variant size

For any ordered item that has a variant with a size, the size persisted into the order and read back in the orders view equals the originally selected size.

**Validates: Requirements 15.1, 15.2**

### Property 19: Quantity transitions and clamping respect stock

For any cart line with stock `S` and any quantity operation — plus, minus (when `q > 1`), or an entered field value `v` — the resulting quantity equals `clamp(intended, 1, S)`; when the intended value exceeds `S` the result is exactly `S` and a warning equal to `"Only S of this product are in stock at this company's warehouse"` is shown.

**Validates: Requirements 16.1, 16.2, 19.1, 19.2, 20.1, 20.2, 20.3**

### Property 20: Minus at quantity one never deletes silently (edge case)

For any cart line with quantity exactly 1, applying minus leaves the quantity at 1, keeps the line present, and triggers an explicit removal prompt.

**Validates: Requirements 16.3**

### Property 21: Empty quantity input is treated as one (edge case)

For any empty or non-numeric quantity-field input, `clampQuantity` returns 1.

**Validates: Requirements 19.3**

### Property 22: Variant products cannot be added without a variant

For any product that has variants, an add-to-cart / Buy Now attempt with neither an explicit selection nor a Default_Variant is blocked and prompts the buyer to choose a variant; when a Default_Variant exists and none is chosen, the applied variant equals the Default_Variant.

**Validates: Requirements 17.1, 18.2, 18.3**

### Property 23: Cart lines are unique per variant and re-adds increment

For any sequence of add operations, the cart contains at most one line per `(productId, variantId)` (and no variant-less line for a product that has variants); re-adding an existing variant increments that line's quantity (subject to the stock cap) rather than creating a new line.

**Validates: Requirements 17.2, 17.3**

### Property 24: At most one persisted default variant per product

For any product, setting its default to a valid variant of that product then reading it back returns that variant, and at most one default variant is stored per product.

**Validates: Requirements 18.1, 18.4**

### Property 25: Promo discount is bounded and consistent

For any promo-code configuration and order amount, the computed discount lies in `[0, orderAmount]`, a percent discount never exceeds its configured cap, the reported final amount equals `orderAmount - discount`, and an invalid or expired code yields zero discount leaving the order total unchanged.

**Validates: Requirements 21.2, 21.3**

---

## Testing Strategy

**Dual approach.** Property-based tests cover universal invariants across generated inputs (minimum 100 iterations each, tagged `Feature: marketplace-improvements, Property {n}: {text}`); example/edge and integration tests cover concrete scenarios, UI rendering, and wiring.

### Property-based tests (highest value)

Use a PBT library per layer — **Go**: `testing/quick` or `gopter` for backend; **TS/JS**: `fast-check` for web and app pure logic.

- **Round-robin fairness & losslessness (Property 9):** generate random company→products groupings; assert output is a permutation and the pairwise emitted-count gap among non-exhausted companies ≤ 1. High value: catches starvation/duplication bugs.
- **Quantity cap & transition invariants (Properties 19, 20, 21):** generate random stock, current quantity, and operations; assert `clamp(·,1,S)` and exact warning text. Catches the historic "minus deletes the line" and over-stock bugs.
- **Photo-count limits (Property 13):** generate random photo distributions and additions; assert accept/reject matches the 4 / 6 / 20 caps and that rejection performs no write.
- **Cart-line dedup / variant-keyed uniqueness (Property 23):** generate random add sequences; assert ≤ 1 line per `(productId, variantId)` and summed quantities.
- **Time-series tiling & two-line alignment (Properties 4, 5):** generate random ranges and event sets; assert bucket tiling, in-range filtering, equal-length aligned current/previous series, and the previous-range arithmetic.
- **Product-type breakdown completeness (Property 3):** generate random item multisets; assert breakdown keys == distinct types and per-type sums.
- **Promo discount bounds (Property 25):** generate random code configs/amounts; assert `0 ≤ discount ≤ amount`, cap respected, final == amount − discount.
- **Subscription derivation (Property 10)** and **ranking monotonicity (Property 7):** generate random flags/expiries and company stats.
- **Size preservation round-trip (Property 18)** and **saved-address CRUD round-trip (Property 15):** serialize→persist→read invariants.

### Example / edge-case unit tests

- Polling interval bound ∈ [15s, 30s] (Req 2.1); fetch-success state update (Req 2.2).
- Gallery timer behavior with fake timers: 3s advance, 5s pause-then-resume (Req 11.2–11.3).
- Minus-at-one prompt and empty-field→1 (Properties 20, 21 edges).
- Translation fallback for a missing key (Property 1).

### Integration / smoke tests

- Backend route wiring for new endpoints (variant photos, default-variant, saved addresses, timeseries, top companies with `userPhone`) — 1–3 representative calls each.
- Migrations 211–214 apply and roll back cleanly.
- Light-theme application to Admin/Company panels — snapshot/visual check (Req 6).
- Map picker (`MapLocationPickerScreen.js`) opens and returns coordinates — manual/integration (Req 13.4).
- Deployment smoke: pushed result includes migrations, backend, web, and app changes (Req 22).

### Notes

- All Buyer App tests target the **`.js`** runtime modules, consistent with the Metro resolution order documented above.
- Property tests for backend SQL aggregation (Properties 3, 4, 5) should exercise the pure bucketing/aggregation helpers with in-memory inputs (mocking the DB layer) to keep iterations cheap; one integration test per endpoint validates the real query.
