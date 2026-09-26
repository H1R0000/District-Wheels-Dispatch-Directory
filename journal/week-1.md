# Reflection Journal — Week 1

## Week of: September 14–20, 2026

## My goal this week

My goal was to plan the District Wheels Dispatch Directory before building the full application. I wanted to define the main user flow, decide what information the app needs, create responsive wireframes, and establish a consistent visual system for the future interface.

## What I did

I wrote the project proposal and identified the fulfillment manager as the primary user. I planned four main screens: Buyer Directory, Buyer Details, Add Buyer, and Edit Buyer. I also mapped the main task of searching for a repeat buyer, selecting the correct shipping method and saved location, copying the required information, and pasting it into an LBC or J&T Express form.

I created desktop and mobile wireframes for the four screens. I documented the screen relationships, responsive behavior, component hierarchy, and reusable components using atomic-design levels. I then created a visual design system based on the District Wheels yellow (`#FFD200`). It includes color roles, typography, an 8px spacing system, buttons, form controls, copy-field feedback, and accessibility rules.

I exported the wireframes and design system as PDFs. During review, I corrected inconsistent button-label padding, centered text more carefully, improved spacing between labels and controls, and adjusted content that extended outside its cards. I also organized the written documentation into one `docs` folder and removed the temporary website build so the GitHub repository now focuses on project documentation.

## What blocked me

The first PDF version had inconsistent spacing. Some button labels did not look vertically centered, metadata sat too close to other elements, and part of the accessibility checklist extended beyond its card. I had to adjust the shared component measurements and inspect the affected pages again.

The main technical issue that is still unresolved is how to let one buyer have multiple addresses and LBC pickup locations while allowing only one default of each type. I have planned to use an Express API transaction and PostgreSQL partial unique indexes, but I have not implemented or tested that rule yet.

I also had to clarify where each course deliverable belongs. The project code belongs in a public GitHub repository, the reports, documentation, and journal belong in the course workspace, and the presentation belongs on Google Drive.

## What I learned

I learned that wireframes are useful for testing the order and structure of a task before writing application code. Planning both desktop and mobile layouts showed me which controls should stack and which information must remain easy to copy on a smaller screen.

I also learned that a design system needs more than a list of colors. It should show how color, typography, spacing, components, states, and accessibility rules work together. Small details such as consistent internal padding and true vertical alignment make the result look much more deliberate.

Finally, I learned that project organization is part of documentation quality. Each deliverable needs a clear location and submission link, and the repository should not contain temporary output that no longer serves the final submission.
