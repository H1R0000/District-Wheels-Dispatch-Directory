# District Wheels Dispatch Directory

District Wheels Dispatch Directory is a planned fulfillment tool for finding repeat buyers and copying their saved shipping information into LBC or J&T Express forms. The current Week 1 increment is an interactive, responsive wireframe board that documents the app's four screens, component architecture, and primary task flow before the React, Express, and PostgreSQL implementation begins.

## Submission link

Submit the public GitHub URL for this `README.md` after the project repository is created. The rendered README page on GitHub is the intended documentation submission.

## Current status

Week 1 planning prototype. The responsive wireframes and design system are complete. The production application, REST API, and PostgreSQL database are not implemented yet.

## Requirements

To run the current prototype locally, install:

- [Git](https://git-scm.com/) for obtaining the project.
- Python 3.10 or newer for the local static server.
- A current browser such as Chrome, Edge, or Firefox.

The prototype uses plain HTML, CSS, and JavaScript. It has no package dependencies and does not require `npm install`.

## Setup and installation

1. Clone the project's public GitHub repository after it has been connected:

   ```bash
   git clone <public-github-repository-url>
   ```

2. Enter the project directory:

   ```bash
   cd DCW_Dispatch_Directory
   ```

3. Confirm that the static site files are present:

   ```text
   dist/index.html
   dist/styles.css
   dist/wireframe.js
   ```

4. No dependency installation or database setup is required for this Week 1 prototype.

### Environment and configuration

The current prototype requires no environment variables, secrets, or external services.

Do not add real buyer records or courier credentials to the repository. The finished application will use placeholder values in an `.env.example` file and keep real secrets in an untracked `.env` file.

### Database setup

There is no database in the Week 1 increment. The planned PostgreSQL database will be added in a later increment and seeded only with fictional buyer and shipping data.

## How to run it

From the project root, start a local server:

```bash
python -m http.server 4173 --directory dist
```

On Windows, if `python` is not recognized, use:

```powershell
py -m http.server 4173 --directory dist
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173) in a browser.

When it works, the first screen is the **District Wheels Dispatch Directory** planning board. Its navigation contains Screen map, Screen wireframes, Component tree, Task walkthrough, and Week 1 report.

Stop the server with `Ctrl+C` in the terminal.

## Features and usage

### Screen map

The screen map documents the intended navigation among:

- Buyer Directory
- Buyer Details
- Add Buyer
- Edit Buyer

It also shows where the user returns after saving or canceling a buyer form.

### Responsive screen wireframes

1. Open **02 Screen wireframes**.
2. Select Buyer Directory, Buyer Details, Add Buyer, or Edit Buyer.
3. Select **Both**, **Desktop**, or **Phone** to change the viewport comparison.
4. Review the labels inside each wireframe to understand the planned content and actions.

The current controls switch between planning views. Search, save, edit, delete, and copy actions are visual placeholders and do not change stored data.

### Component architecture

Open **03 Component tree** to review:

- Page-level components for the four screens.
- Organisms such as `AppHeader` and `LocationDialog`.
- Molecules such as `SearchBar`, `BuyerCard`, and `CopyField`.
- Atoms such as buttons, inputs, tags, and feedback text.

The atomic-design table records where each component appears and the props it is expected to receive.

### Task walkthrough

Open **04 Task walkthrough** to follow the primary fulfillment flow:

1. Search for a repeat buyer.
2. Open the buyer record.
3. Choose the shipping method.
4. Select a saved address or LBC pickup location.
5. Copy the required values.
6. Paste them into the external courier form.

### Current endpoints

The Week 1 prototype has no API endpoints. Planned Express routes will cover buyers, addresses, LBC pickup locations, and couriers after the database is implemented.

## Project structure

```text
DCW_Dispatch_Directory/
|-- dist/
|   |-- index.html          # Interactive wireframe board
|   |-- styles.css          # Responsive wireframe styles
|   |-- wireframe.js        # Screen and viewport switching
|   |-- report.html         # Hosted Week 1 increment report
|   `-- report.css          # Increment report styling
|-- docs/
|   `-- images/             # README screenshots
|-- output/
|   `-- pdf/                # Exported wireframe and design-system PDFs
|-- 01-proposal-answered.md # Project proposal
|-- District-Wheels-Wireframes.md
|-- REPORT.md               # Week 1 increment report
`-- README.md               # Project documentation
```

## Screenshots

### Desktop wireframe comparison

![Desktop view of the responsive District Wheels wireframe board](docs/images/wireframe-board.png)

### Phone layout

![Phone-width view of the District Wheels screen map](docs/images/wireframe-mobile.png)

## Known issues and next steps

### Known issues

- The project is currently a planning prototype, not the finished dispatch application.
- Buyer records, addresses, pickup locations, and courier choices are placeholders.
- Search, copy, create, edit, delete, and save controls do not yet perform data operations.
- The public GitHub repository URL still needs to replace the clone placeholder in this README.
- The database rule that allows only one default address and one default LBC pickup location per buyer is designed but not implemented or tested.

### Next steps

- Build the four screens as React routes and reusable components.
- Create the Node/Express REST API.
- Add PostgreSQL migrations and fictional seed data.
- Implement search and buyer CRUD operations.
- Add address and LBC pickup-location management.
- Add clipboard actions and text-based success or failure feedback.
- Add validation, database transactions, and useful loading, empty, and error states.
- Test responsive layouts, keyboard operation, and accessibility.
- Replace the repository placeholder and document the final environment variables, database commands, and API endpoints.

## Supporting files

- [Project proposal](01-proposal-answered.md)
- [Week 1 increment report](REPORT.md)
- [Wireframe documentation](District-Wheels-Wireframes.md)
- [Wireframe PDF](output/pdf/District-Wheels-Wireframes.pdf)
- [Design-system PDF](output/pdf/District-Wheels-Design-System.pdf)
