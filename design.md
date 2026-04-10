# Wraith — UI Design Brief

## What this is

Wraith is a privacy tool for sending and receiving crypto on Horizen. It uses stealth addresses so there's no on-chain link between sender and recipient. The app should feel like a tool built by people who care about privacy and craft — not a generic DeFi dashboard.

## Personality

Quiet confidence. The app handles serious cryptography but shouldn't feel intimidating. Think of it like a well-made safe — solid, precise, trustworthy, but not cold. There's a sense of calm control. The user is doing something powerful (transacting privately) and the interface should reflect that without being dramatic about it.

No gimmicks, no unnecessary motion, no crypto-bro energy. No glowing neon, no matrix-style falling text, no padlock icons everywhere. Privacy is the default here, not a feature being sold.

## Tone

- Understated, not flashy
- Technical but approachable — a developer would respect it, a non-developer wouldn't be lost
- Sparse — every element earns its place
- Feels like a native OS tool more than a web app

## Typography

Strong preference for a monospace or semi-monospace font for the brand and headings. Body text can be a clean sans-serif. Addresses, keys, and meta-addresses should always be in monospace and should feel natural in the layout, not like afterthoughts crammed into boxes.

## Layout

Single column, centered, narrow max-width (around 640–720px). Generous whitespace. No sidebar. No complex grid. The content breathes.

Navigation is minimal — four links (Setup, Send, Receive, About) plus a wallet connect button. This can be a simple top bar or even just tabs. It shouldn't dominate the page.

## Pages

### Home

The landing page. Should communicate what Wraith is in one sentence and direct users to the four sections. Not a marketing page — more like an index. Cards or links to Setup, Send, Receive, and About. Brief, clear.

### Setup

A short guided flow:

1. User connects wallet (if not already connected)
2. User clicks a button to sign a message (explain briefly that this derives their keys, no transaction involved)
3. Their stealth meta-address appears — this is a long hex string and it should be displayed in a way that feels intentional, not ugly. Think of how a PGP key looks in a well-designed key manager. Include a copy button.
4. A second action to register the meta-address on-chain. Simple button, transaction confirmation feedback.

The flow is linear and short. Don't over-design it. Progress indicators are fine but not strictly necessary for a 2-step flow.

### Send

The most important page for first-time users. Two inputs:

- **Recipient**: Either a stealth meta-address (long hex string starting with `st:eth:0x...`) or a regular wallet address (which gets looked up from the on-chain registry). The input should gracefully handle both and give feedback about which type was detected.
- **Amount**: ETH amount. Simple text input.

One primary action button. After clicking, the user goes through two wallet confirmations (transfer + announcement). Show clear status for each step — the user should never wonder "did that work?"

After both transactions confirm, show a success state with the stealth address that was generated. This is a satisfying moment — make it feel like the transfer actually happened.

### Receive

This is the scanning page. The user clicks a button to scan the blockchain for incoming stealth transfers. This might take a moment.

Results appear as a list of stealth addresses that belong to the user, each showing:

- The stealth address
- Its balance
- A way to reveal the private key (hidden by default, with a deliberate reveal action)

The private key reveal should feel appropriately guarded — not buried, but not casually exposed either. When shown, it should be visually distinct (maybe a different background treatment) to signal "this is sensitive."

If no transfers are found, say so plainly. Don't make the empty state feel like an error.

### About

Static content explaining how stealth addresses work. Should feel like good documentation — clear headings, short paragraphs, links to the ERC specs and references. Not a wall of text. Not a FAQ accordion. Just clean prose.

## Components

### Wallet connect button

Use the RainbowKit connect button. It can be lightly styled to match the overall feel but doesn't need to be custom-built. Place it in the top right of the nav.

### Buttons

Two tiers: primary actions (generate keys, send, scan) and secondary actions (copy, reveal key, register). Primary buttons should have clear visual weight. Secondary actions can be text-style or ghost buttons.

### Inputs

Clean, simple text inputs. No floating labels. Placeholder text that actually helps. Inputs for hex strings (meta-addresses, wallet addresses) should use monospace font.

### Status / feedback

Transaction states (pending, confirming, confirmed) should be communicated inline near the action that triggered them. No toast notifications. No modals. Keep the user's eyes on the content. Success should feel definitive. Errors should be clear and specific, not generic "something went wrong" messages.

### Hex strings

Addresses, meta-addresses, transaction hashes, and private keys appear frequently. They should always be in monospace, with enough font size to be readable but not so large they dominate. Long strings should break naturally (word-break) rather than overflow. Consider truncating with a copy-to-full option where appropriate.

## Responsive behavior

Mobile should work but this is primarily a desktop tool (users need wallet extensions). The single-column layout naturally adapts. Navigation can collapse to a simple row of links or a minimal menu. Inputs should be full-width on mobile.

## What to avoid

- Dashboard aesthetics (stats cards, charts, KPI numbers)
- Overly rounded corners everywhere
- Shadows for depth — prefer borders or subtle background shifts
- Icon overload — use text labels over icons when possible
- Loading spinners in the center of the page — keep loading indicators near the action
- Marketing language in the UI — the app is the product, not a pitch deck
