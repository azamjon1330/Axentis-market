# Requirements Document

## Introduction

This feature delivers a coordinated set of marketplace improvements spanning the web Advanced Analytics dashboards, the web admin and company/store panels, the Expo React Native buyer app, and the Go backend. The work is full end-to-end: it includes database migrations, Go API endpoints, web panel changes, and app rendering for per-variant photos, company default variants, and saved delivery addresses.

The improvements are grouped into eight functional areas: Analytics, Web Design, Catalog & Recommendations, Translations, Product Gallery & Variants, Cart & Checkout, Delivery Addresses, and Promo Codes. "Real-time" behavior is implemented as auto-refresh polling (15 to 30 second interval) for analytics data and as instant in-memory language switching through a React context (no page reload). The map picker for delivery addresses uses the free OpenStreetMap / Leaflet provider and builds on the existing WebView-based map screen. After confirmation, final fixes are pushed to the GitHub main branch.

## Glossary

- **Web_Analytics**: The web-based Advanced Analytics dashboard rendered by the analytics panel components (e.g., `AdvancedAnalytics.tsx`) used by admin and company users.
- **Admin_Panel**: The web administration interface (`AdminPanel.tsx` and related `Admin*` components).
- **Company_Panel**: The web company/store management interface (`CompanyPanel.tsx` and related `Company*` components).
- **Buyer_App**: The Expo React Native mobile application located under `Homepage/`, whose runtime files are the `.js` files.
- **Backend**: The Go backend service located under `backend/`, including its HTTP handlers, models, and SQL migrations.
- **Product**: A sellable item card. A Product may have zero or more Variants.
- **Variant**: A single purchasable combination of attributes (color and/or size) for a Product, stored in the `product_variants` table, each with its own price and stock quantity.
- **Default_Variant**: A single Variant of a Product that a company designates in the Company_Panel to be auto-selected when a buyer adds the Product to cart or uses Buy Now.
- **Variant_Photo**: An image associated with a specific Variant of a Product.
- **Default_Photo_Set**: The set of Product-level photos displayed when no Variant is selected.
- **Subscription**: A paid or designated status that a company holds, which grants its Products elevated ranking in Buyer_App listings.
- **Top_Companies**: A promotion section in the Buyer_App that surfaces companies selected by positive-review volume and by the viewing user's prior order history.
- **Round_Robin_Ordering**: An ordering scheme that interleaves Products from multiple subscribed companies so that no single company dominates, re-randomized on each reload.
- **Saved_Address**: A labeled delivery address belonging to a user, persisted in the Backend and selectable for future orders.
- **Map_Picker**: The OpenStreetMap/Leaflet map screen used to set or edit the coordinates of a Saved_Address, built on the existing WebView map screen.
- **Promo_Code**: A discount coupon stored in the `promo_codes` table, applicable to an order.
- **Granularity**: The time-bucket size used to plot the Orders & Revenue chart for a selected date range.
- **Current_Period**: The user-selected date range plotted on the Orders & Revenue chart.
- **Previous_Period**: The immediately preceding date range of equal length, plotted for growth comparison.
- **Polling_Interval**: The fixed time between automatic analytics data refreshes, between 15 and 30 seconds.

## Requirements

### Requirement 1 — Real-time language switching in Web Analytics

**User Story:** As an analytics viewer, I want the interface language to change instantly when I switch languages, so that I can read the dashboard without reloading the page.

#### Acceptance Criteria

1. WHEN a user selects a different language in the Web_Analytics, THE Web_Analytics SHALL update all visible labels to the selected language without a page reload.
2. THE Web_Analytics SHALL apply language changes through an in-memory React language context.
3. WHILE a language is selected, THE Web_Analytics SHALL render all chart labels, axis labels, and legends in the selected language.

### Requirement 2 — Auto-refreshing analytics data

**User Story:** As an analytics viewer, I want analytics data to update automatically, so that I see current figures without manual refresh.

#### Acceptance Criteria

1. WHILE the Web_Analytics is open, THE Web_Analytics SHALL re-request analytics data at a Polling_Interval between 15 and 30 seconds.
2. WHEN new analytics data is received, THE Web_Analytics SHALL update the displayed values and charts without a page reload.
3. IF an analytics data request fails, THEN THE Web_Analytics SHALL retain the most recent successfully loaded data and retry at the next Polling_Interval.

### Requirement 3 — Advanced analytics shows all sold product types

**User Story:** As an analytics viewer, I want advanced analytics to include every sold product type, so that I see a complete breakdown of sales.

#### Acceptance Criteria

1. THE Web_Analytics SHALL display sales data for every product type that has recorded sales, including futbolka, sportivka, kostyum, and krossovka.
2. WHEN multiple product types have recorded sales in the selected date range, THE Web_Analytics SHALL display each product type as a distinct entry.
3. IF the data source currently returns only one product type, THEN THE Backend SHALL aggregate sales across all product types so that THE Web_Analytics receives the complete set.

### Requirement 4 — Orders & Revenue chart range, granularity, and two-line comparison

**User Story:** As an analytics viewer, I want the Orders & Revenue chart to show only my selected range at an appropriate granularity with a single comparison line, so that I can read growth clearly.

#### Acceptance Criteria

1. THE Web_Analytics SHALL plot the Orders & Revenue chart using only data within the selected date range.
2. WHERE the selected range is weekly, THE Web_Analytics SHALL plot one data point per 12 hours.
3. WHERE the selected range is daily, THE Web_Analytics SHALL plot one data point per hour.
4. WHERE the selected range is monthly, THE Web_Analytics SHALL plot one data point per day.
5. WHERE the selected range is yearly, THE Web_Analytics SHALL plot one data point per week.
6. THE Web_Analytics SHALL render the Orders & Revenue chart with exactly two lines: one for the Current_Period and one for the Previous_Period.
7. THE Web_Analytics SHALL compute the Previous_Period as the date range of equal length immediately preceding the Current_Period.

### Requirement 5 — Payment history note (low priority)

**User Story:** As a product owner, I want the payment history item recorded as low priority, so that it is tracked without blocking the current release.

#### Acceptance Criteria

1. THE Web_Analytics payment history improvement SHALL be recorded as a low-priority item and is out of scope for the current release.

### Requirement 6 — Light/day theme appearance on web panels

**User Story:** As a web panel user, I want the light theme to render correctly, so that the admin and company panels are readable in day mode.

#### Acceptance Criteria

1. WHILE the light theme is active, THE Admin_Panel SHALL render all text with sufficient contrast against its background.
2. WHILE the light theme is active, THE Company_Panel SHALL render all text with sufficient contrast against its background.
3. WHEN a user switches between light and dark themes, THE Admin_Panel SHALL apply the selected theme to all panel sections.
4. WHEN a user switches between light and dark themes, THE Company_Panel SHALL apply the selected theme to all panel sections.

### Requirement 7 — Category icons shown in app catalog

**User Story:** As a buyer, I want category icons that admins configure to appear in the app catalog, so that categories are visually identifiable.

#### Acceptance Criteria

1. WHEN a category has an icon configured in the Admin_Panel, THE Buyer_App SHALL display that icon for the category in the catalog panel.
2. IF a category has no configured icon, THEN THE Buyer_App SHALL display a default placeholder icon for that category.
3. WHEN an admin updates a category icon, THE Buyer_App SHALL display the updated icon on the next catalog load.

### Requirement 8 — Top companies promotion section

**User Story:** As a buyer, I want a Top Companies section that highlights well-reviewed companies and ones I have ordered from, so that I discover trusted sellers.

#### Acceptance Criteria

1. THE Buyer_App SHALL display a Top_Companies section that promotes companies with a high count of positive reviews more often than other companies.
2. WHERE the viewing user has prior orders from a company, THE Buyer_App SHALL promote that company in the Top_Companies section more often than companies the user has not ordered from.
3. THE Backend SHALL provide the ranked list of companies for the Top_Companies section based on positive-review count and the user's prior order history.

### Requirement 9 — Subscription-based product ranking

**User Story:** As a subscribed company, I want my products to appear first with fair rotation among subscribers, so that subscription provides visibility without one company dominating.

#### Acceptance Criteria

1. THE Buyer_App SHALL display Products from companies with an active Subscription before Products from companies without an active Subscription.
2. WHILE multiple subscribed companies have Products in a listing, THE Buyer_App SHALL order their Products using Round_Robin_Ordering across the subscribed companies.
3. WHEN a buyer reloads a listing, THE Buyer_App SHALL re-randomize the order of subscribed companies used for Round_Robin_Ordering.
4. THE Backend SHALL expose Subscription status per company so that the Buyer_App can apply subscription-based ranking.

### Requirement 10 — Uzbek translations for product and home card labels

**User Story:** As an Uzbek-speaking buyer, I want product and home card labels translated, so that the app is readable in Uzbek.

#### Acceptance Criteria

1. WHERE the selected app language is Uzbek, THE Buyer_App SHALL display product card labels in Uzbek.
2. WHERE the selected app language is Uzbek, THE Buyer_App SHALL display home card labels in Uzbek.
3. WHERE the selected app language is Uzbek, THE Buyer_App SHALL display the selection label and selection text in Uzbek.

### Requirement 11 — Product image gallery

**User Story:** As a buyer, I want a scrolling product image gallery, so that I can view multiple product photos clearly.

#### Acceptance Criteria

1. THE Buyer_App SHALL display up to 6 photos in the Product image gallery.
2. WHILE the Product gallery is displayed and not under manual interaction, THE Buyer_App SHALL auto-scroll to the next photo every 3 seconds.
3. WHEN a buyer manually scrolls the gallery, THE Buyer_App SHALL pause auto-scroll for 5 seconds and then resume auto-scroll.
4. THE Buyer_App SHALL render the Product gallery visually separated from the Product text content.

### Requirement 12 — Per-variant photos

**User Story:** As a buyer, I want product photos to change when I select a color variant, so that I see images matching my selection.

#### Acceptance Criteria

1. THE Backend SHALL store up to 4 Variant_Photos per Variant.
2. WHEN a buyer selects a Variant, THE Buyer_App SHALL animate the transition to and display the selected Variant's photos.
3. THE Backend SHALL store up to 6 photos in the Default_Photo_Set for a Product.
4. WHILE no Variant is selected, THE Buyer_App SHALL display the Default_Photo_Set.
5. THE Backend SHALL limit a single Product to a maximum of 20 photos across its Default_Photo_Set and all Variant_Photos.
6. IF a buyer attempts to add a photo beyond an applicable limit, THEN THE Backend SHALL reject the addition and return an error indicating the limit.

### Requirement 13 — Saved delivery addresses

**User Story:** As a buyer, I want to save and label delivery addresses and edit them on a map, so that I can reuse them for future orders.

#### Acceptance Criteria

1. WHEN a buyer saves a delivery address with a label, THE Backend SHALL persist the Saved_Address associated with the buyer.
2. THE Buyer_App SHALL display the buyer's Saved_Addresses for selection during checkout.
3. WHEN a buyer selects a Saved_Address for an order, THE Buyer_App SHALL apply that address to the order.
4. WHEN a buyer edits a Saved_Address location, THE Buyer_App SHALL open the Map_Picker using OpenStreetMap/Leaflet to set the coordinates.
5. WHEN a buyer updates a Saved_Address, THE Backend SHALL persist the updated label and coordinates.
6. WHEN a buyer deletes a Saved_Address, THE Backend SHALL remove the Saved_Address from the buyer's saved list.

### Requirement 14 — Stable variant selection

**User Story:** As a buyer, I want my size and color selection to persist, so that it does not reset unexpectedly while I shop.

#### Acceptance Criteria

1. WHILE a buyer has selected a color and size for a Product, THE Buyer_App SHALL retain that selection until the buyer changes it or leaves the Product.
2. IF the Product data refreshes while a buyer has an active selection, THEN THE Buyer_App SHALL preserve the buyer's current color and size selection.

### Requirement 15 — Sizes shown in orders

**User Story:** As a buyer, I want the selected size to appear in my orders, so that I can confirm what I purchased.

#### Acceptance Criteria

1. THE Buyer_App SHALL display the selected size for each ordered item in the orders view.
2. WHERE an ordered item has a Variant with a size, THE Buyer_App SHALL display that size in the order detail.

### Requirement 16 — Quantity increment and decrement behavior

**User Story:** As a buyer, I want plus and minus controls to behave predictably, so that I do not lose cart items unexpectedly.

#### Acceptance Criteria

1. WHEN a buyer taps the plus control on a cart line, THE Buyer_App SHALL increase that line's quantity by 1.
2. WHEN a buyer taps the minus control on a cart line with quantity greater than 1, THE Buyer_App SHALL decrease that line's quantity by 1.
3. WHILE a cart line quantity equals 1, WHEN a buyer taps the minus control, THE Buyer_App SHALL keep the quantity at 1 and prompt for explicit removal rather than silently deleting the line.

### Requirement 17 — No variant-less cart lines

**User Story:** As a buyer, I want the cart to require a chosen variant, so that I do not get duplicate or variant-less lines.

#### Acceptance Criteria

1. IF a Product has Variants and a buyer attempts to add it to cart without choosing a Variant, THEN THE Buyer_App SHALL block the add-to-cart action and prompt the buyer to choose a Variant.
2. THE Buyer_App SHALL NOT create a duplicate variant-less cart line for a Product that has Variants.
3. WHEN a buyer adds a Variant already present in the cart, THE Buyer_App SHALL increment the existing matching cart line rather than creating a new line.

### Requirement 18 — Company default variant

**User Story:** As a company, I want to set a default variant, so that buyers can quickly add a product while still being able to choose otherwise.

#### Acceptance Criteria

1. THE Company_Panel SHALL allow a company to designate one Default_Variant per Product.
2. WHEN a buyer uses Buy Now or Add to Cart for a Product that has a Default_Variant, THE Buyer_App SHALL apply the Default_Variant automatically.
3. IF a Product has Variants but no Default_Variant, THEN THE Buyer_App SHALL require the buyer to choose a color and then a size before adding the Product to cart.
4. THE Backend SHALL persist the Default_Variant designation for each Product.

### Requirement 19 — Editable cart quantity field

**User Story:** As a buyer, I want to type a cart quantity directly, so that I can set arbitrary amounts efficiently.

#### Acceptance Criteria

1. THE Buyer_App SHALL provide an editable quantity field for each cart line.
2. WHEN a buyer enters a quantity value in the editable field, THE Buyer_App SHALL set the cart line quantity to the entered value subject to the stock limit defined in Requirement 20.
3. IF a buyer clears the quantity field, THEN THE Buyer_App SHALL treat the value as 1 until a valid value is entered.

### Requirement 20 — Quantity capped at available stock

**User Story:** As a buyer, I want quantities limited to available stock with a clear message, so that I do not order more than exists.

#### Acceptance Criteria

1. THE Buyer_App SHALL cap a cart line quantity at the available stock of the selected Variant.
2. WHEN a buyer attempts to set a quantity greater than the available Variant stock, THE Buyer_App SHALL limit the quantity to the available stock and display a warning message indicating how many units are in stock.
3. THE Buyer_App SHALL phrase the warning message in the form "Only N of this product are in stock at this company's warehouse", where N is the available Variant stock.

### Requirement 21 — Promo codes visible in app

**User Story:** As a buyer, I want promo codes to appear in the app, so that I can apply available discounts.

#### Acceptance Criteria

1. THE Buyer_App SHALL render available Promo_Codes provided by the Backend.
2. WHEN a buyer applies a valid Promo_Code at checkout, THE Buyer_App SHALL display the resulting discount on the order total.
3. IF a buyer applies an invalid or expired Promo_Code, THEN THE Buyer_App SHALL display an error message and leave the order total unchanged.

### Requirement 22 — Deployment to GitHub main branch

**User Story:** As a product owner, I want the final fixes pushed to the main branch after confirmation, so that the changes are released through the standard pipeline.

#### Acceptance Criteria

1. WHEN the user confirms the changes are ready, THE delivery process SHALL push the final fixes to the GitHub main branch.
2. THE delivery process SHALL include the database migrations, Backend endpoints, web panel changes, and Buyer_App changes in the pushed result.
