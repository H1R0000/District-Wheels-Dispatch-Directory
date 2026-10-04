# Mockup

## Low fidelity

The [wireframe documentation](wireframes.md) maps the original four screens, their desktop and phone layouts, component tree, and the search-to-copy task. The [wireframe PDF](pdf/District-Wheels-Wireframes.pdf) contains the exported visual mockups.

### Screen map

```text
Buyer Directory → Buyer Details → Edit Buyer
       └────────→ Add Buyer ───→ Buyer Details
```

The Directory is the entry point. A buyer record leads to details, where the user selects the shipping method and location, copies values, or opens Edit Buyer. Add Buyer returns to the saved record after a successful save.

## High fidelity

These current screenshots show the demo's Buyer Directory and responsive layout. They are examples of the implemented interface, while the linked wireframes show the earlier plan.

### Desktop directory

![Desktop Buyer Directory with Dispatch Assistant open](screenshots/directory-desktop-2026-10-04.png)

### Phone directory

![Phone Buyer Directory](screenshots/directory-mobile-2026-10-04.png)

## Design implementation

- District Wheels yellow marks key actions and focus states; dark and light themes use the same visual roles.
- The desktop header keeps navigation visible. At narrower widths it collapses into a menu, while primary page actions stay near the page heading.
- Buyer results use rows with courier and delivery information on desktop and compact stacked records on a phone.
- Loading, empty, error, and saved states give feedback during the dispatch workflow.

The [design-system document](03-design-system.md) records the visual rules, and the [main README](../README.md#3-features-and-usage) describes the implemented routes and controls.

## Honest note

The initial wireframes predate the demo, assistant, and owner backup page. Their layout sketches are planning evidence; the screenshots above show the later interface. The full four-screen wireframe set remains available rather than being presented as a pixel-perfect image of the current app.
