```markdown
# Design System Document: The Sovereign Vault

## 1. Overview & Creative North Star

**Creative North Star: The Sovereign Vault**
This design system moves away from the ephemeral "web" aesthetic and toward the permanence of a physical high-security asset. We are building a "Digital Safe"—an interface that feels machined, weighted, and unshakeable. By combining the technical rigor of a terminal with the spacious elegance of a high-end editorial layout, we convey "Quiet Confidence."

To break the "template" look, we reject standard card-and-shadow metaphors. Instead, we utilize severe verticality, intentional asymmetry in information density, and a 640-720px focused column that demands the user's full attention. This is not a "dashboard" to be glanced at; it is a tool to be operated with precision.

---

## 2. Colors

The palette is a study in "Chromatic Silence." We rely on a monochromatic spectrum of deep slates and off-whites to signify technical authority.

*   **Primary (`#c6c6c7`):** Reserved for active technical states and primary actions. It represents the "steel" of the vault.
*   **Surface Hierarchy:** Our depth is created through a "Dark-on-Dark" nesting strategy.
    *   **Base:** `surface` (`#0e0e0e`)
    *   **Secondary Zones:** `surface_container_low` (`#131313`)
    *   **Interactive Elements:** `surface_container_high` (`#1f2020`)
*   **The "No-Line" Rule:** To maintain a premium feel, 1px solid borders are prohibited for sectioning layout areas. Boundaries between the navigation, the main tool area, and the footer must be defined solely through background color shifts (e.g., a `surface_container_low` section sitting on a `surface` background).
*   **Signature Textures:** For high-priority CTAs, use a subtle linear gradient transitioning from `primary` (`#c6c6c7`) to `primary_container` (`#454747`) at a 145-degree angle. This provides a "brushed metal" finish that feels bespoke.

---

## 3. Typography

The typography strategy creates a tension between "Technical Data" and "Human Intent."

*   **Display & Headline (Space Grotesk):** This monospace-adjacent face is used for technical data, transaction hashes, and headers. It should feel like it was stamped into the UI. Use `display-lg` for terminal-style entry points to command the center-of-screen focus.
*   **Body & Title (Inter):** A clean, neutral sans-serif that provides "Human" readability. This font handles all instructional text, making the technical aspects of crypto privacy feel approachable and safe.
*   **Hierarchy as Identity:** Use extreme scale shifts. A large `display-md` technical hash should sit directly above a small, whisper-quiet `body-sm` explanation. This contrast creates an editorial, high-end feel.

---

## 4. Elevation & Depth

We reject the "floating" nature of the modern web. Elements do not float; they are recessed or embossed into the surface.

*   **The Layering Principle:** Depth is achieved by "stacking" surface tiers. To highlight a specific data set, place it in a `surface_container_lowest` (`#000000`) well within a `surface_container` area. This creates a "machined out" look.
*   **Ambient Shadows:** If an element must float (e.g., a critical modal), use a highly diffused shadow: `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4)`. The shadow must feel like ambient light being blocked, not a drop-shadow.
*   **The "Ghost Border" Fallback:** Where a container requires a hard edge for accessibility, use a "Ghost Border": the `outline_variant` token (`#484848`) at 15% opacity. It should be barely visible, felt rather than seen.
*   **Glassmorphism:** For overlays or "Safe Door" interactions, use `surface_container` at 80% opacity with a `backdrop-blur: 12px`. This maintains the "Native OS" feel of a high-end privacy tool.

---

## 5. Components

### Buttons
*   **Primary:** Sharp 0px corners. Background is the `primary` to `primary_container` gradient. Text is `on_primary` (`#3f4041`), all-caps, using `label-md`.
*   **Secondary:** No background. A Ghost Border (`outline_variant` at 20%) and `primary` text.
*   **State:** On hover, the primary button should shift to `primary_fixed`, creating a subtle "lit from within" effect.

### Input Fields
*   **Style:** Recessed. Background is `surface_container_lowest`. 0px radius. 
*   **Technical Readout:** Input text defaults to `Space Grotesk` (Monospace). The cursor should be a solid block, mimicking a terminal.
*   **Error State:** Use `error_dim` (`#bb5551`) for the label and a subtle `error_container` (`#7f2927`) background shift.

### Lists & Transaction Feeds
*   **Rule:** Forbid the use of horizontal divider lines. 
*   **Separation:** Use vertical whitespace (16px–24px) or alternate background shifts between `surface_container_low` and `surface_container_lowest` to group data points.

### The "Vault Status" Chip
*   A custom component for this tool. A small `surface_bright` block with a 2px `primary` dot. It signals the "Live" connection to the blockchain. It should always be fixed to the top-right of the 720px container.

---

## 6. Do's and Don'ts

### Do
*   **Do** embrace the "Dead Space." If a screen only requires one input, let that input sit alone in the center of the 640px column with 120px of top margin.
*   **Do** use 0px border-radii for everything. Sharp corners imply precision and technical rigidity.
*   **Do** treat transaction hashes as art. Use `letter-spacing: -0.02em` on Monospace headings to make them feel tighter and more "designed."

### Don't
*   **Don't** use any "Crypto-Bro" energy: no neon greens, no glowing "cyber" lines, and no playful illustrations.
*   **Don't** use standard icons. If an icon is needed, use ultra-thin (1pt) stroke weights or technical symbols (e.g., `[+]` instead of a rounded plus icon).
*   **Don't** use transitions that are "bouncy." All animations (fades, slides) should be linear or ease-out with short durations (150ms) to feel like mechanical switches.

---

**Director's Final Note:** This design system succeeds when the user feels like they are operating a piece of high-end hardware. Every pixel must feel intentional, heavy, and secure. If it feels "light" or "webby," increase the whitespace and darken the surfaces.```