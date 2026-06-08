# Implementation Plan: Marketplace Improvements

## Overview

This plan implements all 22 requirements and 25 correctness properties end-to-end across four surfaces: the Go backend (`backend/`), the Vite/React/TS web panels (`src/`), the Expo React Native buyer app (`Homepage/`, **`.js` runtime files only**), and the PostgreSQL schema (goose migrations).

Work is ordered by dependency: database migrations first, then backend endpoints, then web panels, then the app `.js` runtime, then property-based/edge tests, and finally deployment via a feature branch + PR against `main`.

**Critical app rule:** Metro resolves `.js` before `.tsx`, so the `.js` files are authoritative at runtime. Every app behavioral change MUST be applied to the `.js` file (porting newer logic from the `.tsx` sibling where needed). Never rely on `.tsx` shipping.

## Tasks

- [x] 1. Database migrations (goose, additive, backward compatible)
  - [x] 1.1 Add migration 211 — per-variant photos
    - Create `backend/migrations/211_*.sql` adding `product_variants.photos JSONB NOT NULL DEFAULT '[]'::jsonb` with matching `+goose Down` drop
    - _Requirements: 12.1, 12.2_
  - [x] 1.2 Add migration 212 — product default variant
    - Create `backend/migrations/212_*.sql` adding `products.default_variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL` plus `idx_products_default_variant`, with `+goose Down`
    - _Requirements: 18.1, 18.4_
  - [x] 1.3 Add migration 213 — company subscription (paid ranking)
    - Create `backend/migrations/213_*.sql` adding `companies.is_subscribed BOOLEAN NOT NULL DEFAULT FALSE`, `companies.subscription_expires_at TIMESTAMPTZ`, partial index `idx_companies_subscription`, with `+goose Down`
    - _Requirements: 9.1, 9.4_
  - [x] 1.4 Add migration 214 — saved delivery addresses
    - Create `backend/migrations/214_*.sql` with `saved_addresses` table (user_id FK ON DELETE CASCADE, label, address_text, latitude/longitude NUMERIC(9,6), recipient_name, is_default, timestamps) plus `idx_saved_addresses_user`, with `+goose Down`
    - _Requirements: 13.1_
  - [x]* 1.5 Write migration apply/rollback integration test
    - Verify migrations 211–214 apply and roll back cleanly against a test DB
    - _Requirements: 12.1, 18.4, 9.4, 13.1_

- [x] 2. Checkpoint - migrations apply cleanly
  - Ensure all migrations apply and roll back, ask the user if questions arise.

- [x] 3. Backend — per-variant photo CRUD + limits (Go)
  - [x] 3.1 Implement `validatePhotoLimits` and variant photo handlers
    - Create `backend/routes/handlers/product_variants.go` with `POST`/`DELETE` `/api/products/:id/variants/:variantId/photos`; enforce ≤4 per variant, ≤6 default set, ≤20 product total; reject over-limit with `400` and explicit message, no partial write
    - Update `UploadProductImages` so the 6-cap on `products.images` participates in the 20-total check (reject, not truncate)
    - Extend `GetProductVariants` to return per-variant `photos`; `GetProductByID` returns `images` + `defaultVariantId`
    - Wire routes into `backend/routes/routes.go` under the variant group
    - _Requirements: 12.1, 12.3, 12.5, 12.6_
  - [x]* 3.2 Write property test for photo-limit enforcement
    - **Property 13: Photo limits are enforced and over-limit additions are rejected without writing**
    - **Validates: Requirements 12.1, 12.3, 12.5, 12.6**

- [x] 4. Backend — default variant set/get (Go)
  - [x] 4.1 Implement default-variant endpoint
    - Add `PUT /api/products/:id/default-variant` (body `{ "variantId": <id|null> }`); validate the variant belongs to the product (else `400`, unchanged); set `products.default_variant_id`
    - Include `defaultVariantId` in `GetProductByID` / `GetProducts`
    - _Requirements: 18.1, 18.4_
  - [x]* 4.2 Write property test for default-variant persistence
    - **Property 24: At most one persisted default variant per product**
    - **Validates: Requirements 18.1, 18.4**

- [x] 5. Backend — user-aware Top Companies ranking (Go)
  - [x] 5.1 Rework `GetTopCompanies` to be user-aware
    - Add optional `?userPhone=<phone>` query param; rank by `positive_reviews` and `has_prior_order` using the design's scored SQL ordering; include `is_subscribed`; fall back to review count when phone absent
    - _Requirements: 8.1, 8.2, 8.3_
  - [x]* 5.2 Write property test for ranking monotonicity
    - **Property 7: Top Companies ordering is monotonic in rank score**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 6. Backend — subscription status exposure + toggle (Go)
  - [x] 6.1 Expose and toggle company subscription
    - Add derived `isSubscribed` (`is_subscribed AND (expires IS NULL OR expires > NOW())`) to `GetProducts` and `GetCompanies`
    - Add admin route `PUT /api/companies/:id/subscription` with `{ "isSubscribed": bool, "expiresAt": <ts|null> }`
    - _Requirements: 9.4_
  - [x]* 6.2 Write property test for subscription derivation
    - **Property 10: Exposed subscription status reflects flag and expiry**
    - **Validates: Requirements 9.4**

- [x] 7. Backend — saved addresses CRUD (Go)
  - [x] 7.1 Implement saved-addresses handlers and routes
    - Create `backend/routes/handlers/saved_addresses.go` with `GET/POST/PUT/DELETE /api/users/:phone/addresses[/:addressId]`; enforce ownership (`404`/`403` on mismatch, no mutation); clear other rows' `is_default` in-transaction when `isDefault=true`
    - Wire route group into `routes.go`
    - _Requirements: 13.1, 13.5, 13.6_
  - [x]* 7.2 Write property test for saved-address CRUD round-trip
    - **Property 15: Saved-address CRUD round-trips**
    - **Validates: Requirements 13.1, 13.5, 13.6**

- [x] 8. Backend — analytics product-type breakdown fix (Go)
  - [x] 8.1 Add complete product-type breakdown to analytics
    - In `GetCompanyAnalytics`, add server-side `productTypeBreakdown: [{ productType, units, revenue }]` unioning orders + cash sales, grouped by `item->>'type'`, normalizing type keys, covering every type with recorded sales (omit absent types)
    - _Requirements: 3.1, 3.2, 3.3_
  - [x]* 8.2 Write property test for breakdown completeness
    - **Property 3: Product-type breakdown is complete and exact**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 9. Backend — analytics time-series with granularity + previous period (Go)
  - [x] 9.1 Implement granularity-aware timeseries endpoint
    - Add `GET /api/analytics/company/:companyId/timeseries?range=&from=&to=` over orders + cash sales; bucket by range (daily→1h, weekly→12h, monthly→1d, yearly→1w); zero-fill empty buckets within range only
    - Return `{ granularity, current[], previous[] }` where `previous` covers `[from-(to-from), from)`, bucketed identically and index-aligned to `current`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [x]* 9.2 Write property test for bucket tiling and granularity
    - **Property 4: Time-series buckets tile only the selected range at the correct granularity**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
  - [x]* 9.3 Write property test for two-line aligned comparison series
    - **Property 5: Exactly two equal-length, index-aligned comparison series**
    - **Validates: Requirements 4.6, 4.7**

- [x] 10. Backend — confirm promo-code endpoints (Go)
  - [x] 10.1 Verify and align promo-code routes
    - Confirm `GET /api/promo-codes/company/:companyId`, `POST /api/promo-codes/validate`, `POST /api/promo-codes/redeem` behave per spec; ensure `validate` returns bounded `{valid, discount, finalAmount, message}` with `0 ≤ discount ≤ orderAmount`, percent cap respected, `finalAmount = orderAmount - discount`, and zero discount for invalid/expired
    - _Requirements: 21.1, 21.2, 21.3_
  - [x]* 10.2 Write property test for promo discount bounds
    - **Property 25: Promo discount is bounded and consistent**
    - **Validates: Requirements 21.2, 21.3**

- [x] 11. Checkpoint - backend endpoints complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [x] 12. Web — real-time language into analytics (TS)
  - [x] 12.1 Make analytics consume language context reactively
    - In `AdvancedAnalytics.tsx` and `Admin*`/`Company*` analytics children, read all labels, chart axis labels, legends, and tooltips from `src/utils/translations` via context each render (no value captured on mount) so language switches update labels with no reload
    - _Requirements: 1.1, 1.2, 1.3_
  - [x]* 12.2 Write property test for translation resolution
    - **Property 1: Translation resolution never leaks raw keys**
    - **Validates: Requirements 1.1, 1.3**

- [x] 13. Web — analytics polling hook (TS)
  - [x] 13.1 Implement `usePolling` hook and wire into analytics fetches
    - Create `usePolling<T>(fetcher, intervalMs)` with fixed interval 15000–30000 (default 20000); on failure retain last good data and retry next tick; update values/charts in place on success
    - _Requirements: 2.1, 2.2, 2.3_
  - [x]* 13.2 Write property test for polling data retention
    - **Property 2: Polling retains last successful data on failure**
    - **Validates: Requirements 2.3**
  - [x]* 13.3 Write unit test for polling interval bound and success update
    - Assert interval ∈ [15s, 30s] (Req 2.1) and in-place update on success (Req 2.2) using fake timers
    - _Requirements: 2.1, 2.2_

- [x] 14. Web — two-line Orders & Revenue chart with dynamic granularity (TS)
  - [x] 14.1 Rebuild chart to plot two aligned lines from timeseries endpoint
    - Fetch `/timeseries` with the selected `range`; render exactly two lines (Current_Period, Previous_Period) index-aligned by bucket; remove any prior multi-line/all-time overlays; format X-axis ticks from returned `granularity`; plot only in-range data
    - _Requirements: 4.1, 4.6, 4.7_

- [x] 15. Web — light-theme CSS fixes for admin & company panels (TS/CSS)
  - [x] 15.1 Scope dark rules and add light-theme tokens
    - Scope `src/dark-theme.css` (and unscoped `src/index.css` overrides) strictly under the dark selector; add explicit light-theme color tokens for panel surfaces/text; audit `AdminPanel.tsx` and `CompanyPanel.tsx` sections so all read theme tokens and toggling applies everywhere with sufficient contrast
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 16. Web — Company Panel default-variant selector + per-variant photo upload (TS)
  - [x] 16.1 Add default-variant selector and per-variant photo uploaders
    - In `CompanyPanel.tsx` product editor: dropdown/radio selecting one (or none) default variant calling `PUT /api/products/:id/default-variant`; per-variant uploader (≤4) calling the variant photos endpoint with client pre-check of 4/variant + 20/product caps surfacing backend limit errors; keep default-set uploader ≤6
    - _Requirements: 18.1, 12.1, 12.3, 12.6_

- [x] 17. Checkpoint - web panels complete
  - Ensure web builds and tests pass, ask the user if questions arise.

- [x] 18. App (.js runtime) — catalog category icons
  - [x] 18.1 Render category icons with placeholder fallback
    - In `CategoryProductsScreen.js` / catalog list (`.js`), render `category.icon`; when empty render a default placeholder; icons refresh on next catalog load via re-fetch
    - _Requirements: 7.1, 7.2, 7.3_
  - [x]* 18.2 Write property test for icon resolution
    - **Property 6: Category icon resolution always yields a renderable icon**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 19. App (.js runtime) — Top Companies section + subscription round-robin ordering
  - [x] 19.1 Render Top Companies section
    - In the Home `.js` runtime, render a Top Companies section from `getTopCompanies(userPhone)`, visible when more than one company is returned, with higher-ranked companies shown first/more prominently
    - _Requirements: 8.1, 8.2_
  - [x] 19.2 Implement `orderListing` subscription round-robin
    - Add a pure ordering function (`.js`): partition subscribed vs non-subscribed (using `isSubscribed`), subscribed first; shuffle subscribed company order with a per-reload `seed` (re-randomized each load); round-robin interleave one product per company per pass; append non-subscribed after
    - _Requirements: 9.1, 9.2, 9.3_
  - [x]* 19.3 Write property test for subscribed-first ordering
    - **Property 8: Subscribed products precede non-subscribed products**
    - **Validates: Requirements 9.1**
  - [x]* 19.4 Write property test for round-robin fairness and losslessness
    - **Property 9: Round-robin interleaving is fair and lossless**
    - **Validates: Requirements 9.2, 9.3**

- [x] 20. App (.js runtime) — Uzbek translations
  - [x] 20.1 Add missing Uzbek keys
    - In `LanguageContext.js`, add Uzbek (`uz`) values for product-card labels, home-card labels, and selection label/text; ensure instant in-memory switch (no reload)
    - _Requirements: 10.1, 10.2, 10.3_
  - [x]* 20.2 Write property test for Uzbek label coverage
    - **Property 11: Uzbek label coverage is complete**
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 21. App (.js runtime) — product image gallery with auto-scroll
  - [x] 21.1 Build gallery component in `ProductDetailScreen.js`
    - Render up to 6 photos; auto-scroll to next every 3s via interval on a horizontal list; on manual scroll (`onScrollBeginDrag`) pause 5s then resume; render in a container visually separated from product text
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x]* 21.2 Write property test for gallery photo cap
    - **Property 12: Gallery renders at most six photos**
    - **Validates: Requirements 11.1**
  - [x]* 21.3 Write unit test for auto-scroll timing with fake timers
    - Assert 3s advance and 5s pause-then-resume behavior
    - _Requirements: 11.2, 11.3_

- [x] 22. App (.js runtime) — per-variant photo switching
  - [x] 22.1 Swap gallery photo set on variant selection
    - In `ProductDetailScreen.js`, swap to the selected variant's `photos` with an `Animated` cross-fade; show product `images` (default set) when no variant selected
    - _Requirements: 12.2, 12.4_
  - [x]* 22.2 Write property test for active photo set selection
    - **Property 14: Active photo set follows variant selection**
    - **Validates: Requirements 12.2, 12.4**

- [x] 23. App (.js runtime) — stable variant selection
  - [x] 23.1 Preserve color/size across product refresh
    - Keep `selectedColor`/`selectedSize` in screen state keyed to product; merge refreshed product fields without resetting selection; only reset if the selected variant disappeared
    - _Requirements: 14.1, 14.2_
  - [x]* 23.2 Write property test for selection survival across refresh
    - **Property 17: Variant selection survives product refresh**
    - **Validates: Requirements 14.1, 14.2**

- [x] 24. App (.js runtime) — sizes shown in orders
  - [x] 24.1 Persist and render selected size in orders
    - Carry selected variant `size` (and `color`) into the order `items` payload at checkout so it survives in `orders.items` JSON; render size per item in `OrdersScreen`/order detail (`.js`)
    - _Requirements: 15.1, 15.2_
  - [x]* 24.2 Write property test for size preservation round-trip
    - **Property 18: Ordered items preserve their variant size**
    - **Validates: Requirements 15.1, 15.2**

- [x] 25. App (.js runtime) — cart quantity controls (plus/minus + editable + stock cap)
  - [x] 25.1 Make `CartContext.js` variant-aware and implement quantity controls
    - Key cart lines by `(productId, variantId)`; plus → +1 capped at stock; minus at q>1 → −1; minus at q==1 → keep at 1 and prompt explicit removal (never silent delete); editable `TextInput` per line committing `clamp(intToValue,1,stock)`; empty field treated as 1; over-stock clamps to stock and shows `"Only N of this product are in stock at this company's warehouse"`
    - _Requirements: 16.1, 16.2, 16.3, 19.1, 19.2, 19.3, 20.1, 20.2, 20.3_
  - [x]* 25.2 Write property test for quantity clamping and transitions
    - **Property 19: Quantity transitions and clamping respect stock**
    - **Validates: Requirements 16.1, 16.2, 19.1, 19.2, 20.1, 20.2, 20.3**
  - [x]* 25.3 Write property test for minus-at-one edge case
    - **Property 20: Minus at quantity one never deletes silently**
    - **Validates: Requirements 16.3**
  - [x]* 25.4 Write property test for empty-field-to-one edge case
    - **Property 21: Empty quantity input is treated as one**
    - **Validates: Requirements 19.3**

- [x] 26. App (.js runtime) — variant-required add-to-cart + dedup + default-variant auto-apply
  - [x] 26.1 Enforce variant rules and default-variant on add
    - In product/cart `.js`: if product has variants and none chosen, auto-apply Default_Variant if present, else block and prompt to choose color then size; never create a variant-less line for a product with variants; adding an existing `(productId, variantId)` increments the existing line (subject to stock cap) rather than duplicating
    - _Requirements: 17.1, 17.2, 17.3, 18.2, 18.3_
  - [x]* 26.2 Write property test for variant-required add behavior
    - **Property 22: Variant products cannot be added without a variant**
    - **Validates: Requirements 17.1, 18.2, 18.3**
  - [x]* 26.3 Write property test for per-variant line uniqueness and increment
    - **Property 23: Cart lines are unique per variant and re-adds increment**
    - **Validates: Requirements 17.2, 17.3**

- [x] 27. App (.js runtime) — promo codes rendering
  - [x] 27.1 Render and apply promo codes
    - In cart/checkout `.js`, render available codes from `GET /api/promo-codes/company/:companyId`; apply via `POST /api/promo-codes/validate` (show discount on success, show returned message + leave total unchanged on invalid/expired); call `redeem` on order placement
    - _Requirements: 21.1, 21.2, 21.3_

- [x] 28. App (.js runtime) — saved addresses + map picker
  - [x] 28.1 Implement saved-addresses UI and map picker integration
    - In Profile and Checkout `.js`: list `GET /api/users/:phone/addresses`, support create/edit/delete; editing location opens `MapLocationPickerScreen.js` (WebView + OpenStreetMap/Leaflet) to set lat/lng; selecting a saved address at checkout applies its label/coords/recipient to the order; deletion removes it from the list
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6_
  - [x]* 28.2 Write property test for selected-address application
    - **Property 16: Selecting a saved address applies it to the order**
    - **Validates: Requirements 13.2, 13.3**

- [x] 29. Checkpoint - app runtime complete
  - Ensure all app tests pass, ask the user if questions arise.

- [ ] 30. Deployment — push to GitHub main
  - [-] 30.1 Commit and push all changes via feature branch + PR
    - Commit migrations (211–214), backend handlers/routes, web panel changes, and Buyer App `.js` changes; push to a feature branch and open a PR against `main` for the user to merge (standard pipeline)
    - _Requirements: 22.1, 22.2_

## Notes

- Tasks marked with `*` are optional (property/unit/integration tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references the specific requirement sub-clauses it satisfies for traceability; test sub-tasks reference the exact correctness property from the design.
- All Buyer App tasks target the **`.js`** runtime modules (not `.tsx`), consistent with Metro's `.js`-before-`.tsx` resolution.
- Property-based tests use Go (`testing/quick`/`gopter`) for backend and `fast-check` for web/app pure logic, minimum 100 iterations each.
- Checkpoints provide incremental validation at each surface boundary.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1", "9.1", "10.1"] },
    { "id": 2, "tasks": ["3.2", "4.2", "5.2", "6.2", "7.2", "8.2", "9.2", "9.3", "10.2"] },
    { "id": 3, "tasks": ["12.1", "13.1", "14.1", "15.1", "16.1"] },
    { "id": 4, "tasks": ["12.2", "13.2", "13.3"] },
    { "id": 5, "tasks": ["18.1", "19.1", "19.2", "20.1", "21.1", "22.1", "23.1", "24.1", "25.1", "26.1", "27.1", "28.1"] },
    { "id": 6, "tasks": ["18.2", "19.3", "19.4", "20.2", "21.2", "21.3", "22.2", "23.2", "24.2", "25.2", "25.3", "25.4", "26.2", "26.3", "28.2"] },
    { "id": 7, "tasks": ["30.1"] }
  ]
}
```
