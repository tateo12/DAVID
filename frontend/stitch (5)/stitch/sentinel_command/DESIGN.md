# Design System Specification: Security Command Aesthetic

## 1. Overview & Creative North Star
**Creative North Star: "The Sentinel’s Vigil"**

This design system moves beyond the "SaaS dashboard" trope, positioning itself as a high-fidelity tactical command interface. The aesthetic is rooted in **Precision Engineering** and **Intentional Depth**. We are creating a "Digital Vault"—an environment that feels impenetrable yet hyper-functional. 

To break the "template" look, we employ **Asymmetric Data Density**: areas of intense, monospace-driven technical detail juxtaposed with expansive, breathable headers. We reject standard grid lines in favor of **Tonal Sculpting**, where the interface is carved out of shadows and light rather than drawn with lines.

---

## 2. Colors & Surface Architecture
The palette is built on a foundation of "Void Space" (Deep Charcoal and Midnight Blue) electrified by high-vis accents.

### The "No-Line" Rule
**Standard 1px borders are strictly prohibited for sectioning.** 
Visual separation must be achieved through:
1.  **Tonal Shifts:** Moving from `surface` (#111316) to `surface_container_low` (#1a1c1f).
2.  **Negative Space:** Using the Spacing Scale (e.g., `8` or `10`) to create distinct functional islands.
3.  **Shadow-Casting:** Subtle ambient occlusion instead of a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical, stacked layers of smoked glass:
*   **Base Level:** `surface` (#111316) – The canvas.
*   **Sub-Section:** `surface_container_low` (#1a1c1f) – Depressed areas for secondary content.
*   **Active Module:** `surface_container_high` (#282a2d) – Floating bento-box panels.
*   **Prominent Interaction:** `surface_bright` (#37393d) – Elements requiring immediate focus.

### The "Glass & Gradient" Rule
For premium components (Modals, Hover states, Hero CTAs), use a **Glassmorphism Stack**:
*   **Background:** `surface_container` at 70% opacity.
*   **Blur:** `backdrop-filter: blur(12px)`.
*   **Glow:** A 1px inner-shadow or "Ghost Border" using `secondary_container` (#c3f400) at 15% opacity to simulate a light-catching edge.

---

## 3. Typography
The typographic system leverages a high-contrast pairing to emphasize the "Human vs. Machine" nature of AI safety.

*   **Human Layer (Inter):** Used for UI instructions, navigation, and titles. It provides the "Editorial" clarity.
    *   *Headline-LG:* 2rem. Tracking -0.02em. Use for high-level module titles.
    *   *Body-MD:* 0.875rem. The workhorse for all descriptive text.
*   **Machine Layer (JetBrains Mono/Space Grotesk):** Used for telemetry, data points, and code snippets.
    *   *Display-SM:* 2.25rem (Space Grotesk). Used for massive status numbers (e.g., "99.2% Threat Neutralized").
    *   *Label-SM:* 0.6875rem (Space Grotesk). All caps, 0.05em tracking. Use for metadata tags and technical timestamps.

---

## 4. Elevation & Depth
Depth is not a decoration; it is a navigational map.

*   **The Layering Principle:** Place a `surface_container_lowest` (#0c0e11) card inside a `surface_container_high` (#282a2d) panel to create a "nested tray" look. This communicates that the data is protected within the module.
*   **Ambient Shadows:** Use shadows only for floating overlays (Tooltips/Modals). 
    *   *Shadow Spec:* `box-shadow: 0 24px 48px -12px rgba(10, 15, 30, 0.5);` (Tinted with Midnight Blue).
*   **The "Ghost Border" Fallback:** If a boundary is required for accessibility, use `outline_variant` (#464555) at **15% opacity**. It should be felt, not seen.

---

## 5. Components & BEM Structure

### Buttons
*   **Primary (`.btn--primary`):** Background `primary_container` (#5d5fef), text `on_primary_container`. Subtle outer glow on hover using `primary` color.
*   **Tactical (`.btn--tactical`):** Background `secondary_container` (#c3f400), text `on_secondary_fixed`. Sharp corners (`rounded-sm`). Used for "Deploy" or "Authorize" actions.
*   **Ghost (`.btn--ghost`):** No background. `outline_variant` ghost-border.

### Bento-Box Modules (`.module-card`)
*   **Construction:** Use `surface_container_low`. 
*   **Header:** Use `label-sm` in `secondary` (#ffffff) for the module title, aligned top-left.
*   **Internal Spacing:** Use `4` (0.9rem) padding uniformly.
*   **Prohibition:** Never use divider lines inside a card. Use `surface_container_lowest` to wrap internal data groups.

### Inputs & Terminal Fields (`.input-field`)
*   **State:** Default state uses `surface_container_highest`. 
*   **Focus:** A 1px "Cyber Lime" (`secondary_fixed`) bottom-border only.
*   **Type:** Monospace for all user input to maintain the "Security Command" feel.

### Status Indicators (`.status-pill`)
*   **Critical:** `error` (#ffb4ab) with a soft pulse animation.
*   **Secure:** `secondary_fixed` (#c3f400) text with a 10% opacity background of the same color.

---

## 6. Do’s and Don'ts

### Do:
*   **Do** use asymmetric layouts. A large data visualization on the left (spanning 8 columns) balanced by small technical logs on the right (4 columns).
*   **Do** use `Cyber Lime` sparingly. It is a "warning" or "active" color. Overusing it degrades its tactical value.
*   **Do** ensure all icons are geometric and 2px stroke weight to match the `Inter` letterforms.

### Don't:
*   **Don't** use standard "Drop Shadows" on cards. Rely on tonal layering.
*   **Don't** use rounded corners larger than `xl` (0.75rem). The system should feel "engineered," not "bubbly."
*   **Don't** use pure white (#FFFFFF) for body text. Use `on_surface_variant` (#c7c4d7) to reduce eye strain in dark environments.

---

## 7. Implementation Note (BEM)
All components must follow strict BEM naming to allow LLM agents to easily parse and modify the structure:
`sentinel-[block]__[element]--[modifier]`
Example: `sentinel-monitor__graph--threat-detected`