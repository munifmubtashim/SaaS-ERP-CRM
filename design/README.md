# design

`owner-dashboard/` is the approved UI design: the owner dashboard, Sales / POS, Inventory and Products, each in
light and dark, desktop and phone ("glass" style). It is the source copy of a Claude Design canvas:
https://claude.ai/artifact/XPUvd2SsM8kcAJKDTwaA8n (open it there to view; these `.dc.html` files need the
canvas runtime and do not open on their own).

- Colour tokens used by the app come from the `light` and `night` objects in `owner-dashboard/Main.dc.html`
  and are copied into `packages/frontend/src/styles/tokens.css` (Tailwind reads them). Change the design first, then the tokens.
- All names and amounts in the design are invented sample data.
- Replaces the earlier `design/` mockups and the `demo/` prototype (removed 14 Nov 2026).
