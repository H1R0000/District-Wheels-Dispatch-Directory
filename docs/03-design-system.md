# Design system

The [design-system PDF](pdf/District-Wheels-Design-System.pdf) is the visual reference for swatches, typography, spacing, components, and responsive behavior. The values below describe the current interface in [client/src/styles.css](../client/src/styles.css).

## Colour

| Role | Light theme | Dark theme | Use |
| --- | --- | --- | --- |
| Action yellow | `#FFD200` | `#FFD200` | Primary emphasis, active markers, and keyboard focus. |
| Text | `#11110F` | `#F3F2ED` | Main readable text. |
| Page surface | `#F5F4EF` | `#10100F` | Background. |
| Raised surface | `#FFFEF9` | `#191918` | Cards, fields, and header. |
| Divider | `#D9D7CF` | `#383835` | Borders and row separators. |
| Error text | `#851D14` | `#FFB4AA` | Error messages. |

Yellow actions use dark text (`#11110F`). The theme-specific text and surface colors are defined as CSS custom properties, so the same components work in both themes.

## Type and spacing

The interface uses Inter for body text, controls, and headings. The design reference uses an 8px spacing scale; the current CSS also uses responsive values where the layout needs them. Headings are larger and heavier than field labels, while helper text and record metadata are smaller.

## Components and states

Buttons, navigation links, search fields, buyer records, copy controls, form choices, and the assistant panel use shared styles. Keyboard focus is visible with a yellow outline. Hover and selected states change the surface or border; errors use their own text and background colors. Loading, empty, error, and populated views are distinct so users can tell what the app is doing.

## Responsive rules

The layout narrows to a single task-ordered column on phones. Navigation changes to a menu, forms stack, and buyer records show essential details without horizontal scrolling. The current mobile and desktop views are in the [mockup document](02-mockup.md).

## In code

Color roles and component rules live in [`client/src/styles.css`](../client/src/styles.css), with dark-theme values under `:root[data-theme="dark"]`. Focus styles use `:focus-visible`; reduced-motion rules limit animation when the user requests it. The PDF records the original design decisions, while the CSS is the source for the implemented interface.
