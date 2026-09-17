const board = document.querySelector("#wireframes");
const screenButtons = [...document.querySelectorAll("[data-screen]")];
const sheets = [...document.querySelectorAll("[data-sheet]")];
const viewButtons = [...document.querySelectorAll("[data-view-choice]")];

screenButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.screen;
    screenButtons.forEach((item) =>
      item.setAttribute("aria-pressed", String(item === button)),
    );
    sheets.forEach((sheet) =>
      sheet.classList.toggle("is-active", sheet.dataset.sheet === target),
    );
  });
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    board.dataset.view = button.dataset.viewChoice;
    viewButtons.forEach((item) =>
      item.setAttribute("aria-pressed", String(item === button)),
    );
  });
});
