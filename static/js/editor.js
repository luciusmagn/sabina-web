/* Friendly editor for content.json. Unlocks with the editor password, builds a
   grouped form of every text field (cs/en side by side; file paths shown but
   de-emphasised), and saves back through the password-protected API. */

const loginForm = document.getElementById("login-form");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");
const editorPane = document.getElementById("editor-pane");
const fieldsEl = document.getElementById("fields");
const saveBar = document.getElementById("savebar");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

let password = "";
let original = null;

/* --- helpers --- */

const NICE_LABELS = {
  cs: "Čeština (CZ)", en: "English (EN)",
  meta: "Meta (browser tab)", title: "Title", description: "Description",
  hero: "Name (hero)", tagline: "Tagline", tiles: "Tile labels", contact: "Contact",
  email: "E-mail", linkedinUrl: "LinkedIn URL", linkedinLabel: "LinkedIn label",
  ui: "Buttons & labels", visualIdentity: "Visual identity", detail: "Detail",
  label: "Label", caption: "Caption", wideImage: "Wide image (file)", sideImage: "Side image (file)",
  devices: "Devices (files)", productSets: "Product sets", layout: "Layout (advanced)",
  images: "Images (files)", rows: "Rows (files)", profilePhotos: "Profile photos",
  photos: "Photos (files)", text: "Text", books: "Books", author: "Author",
  activity: "Activity", image: "Image (file)", videos: "Videos", name: "Name",
  work: "Work done", link: "Link (URL)", poster: "Poster (file)", src: "Video (file)",
  kontakt: "Contact", viz: "Visual identity", produkt: "Product photos",
  profilovky: "Profile photos", videa: "Videos", typografie: "Typography",
  themeToggle: "Theme toggle", languageToggle: "Language toggle", languageButton: "Language button",
  scrollDown: "Scroll hint", close: "Close", previous: "Previous", next: "Next", enlarge: "Enlarge",
};

function humanize(key) {
  if (NICE_LABELS[key] !== undefined) return NICE_LABELS[key];
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

const isCsEn = (v) =>
  v && typeof v === "object" && !Array.isArray(v) &&
  ("cs" in v || "en" in v) && typeof (v.cs ?? v.en) === "string";

const isFilePath = (s) => typeof s === "string" && /^\/.+\.(png|jpe?g|mp4|svg|ico|webm)$/i.test(s);

function itemLabel(item, index) {
  if (item && typeof item === "object") {
    const meaningful =
      item.title || (item.name && (item.name.cs || item.name.en)) ||
      (item.label && (item.label.cs || item.label.en));
    if (meaningful) return meaningful;
  }
  return `#${index + 1}`;
}

/* --- form building --- */

function makeInput(value, pathArr, tech) {
  const wrap = document.createElement("div");
  wrap.className = "field" + (tech ? " field--tech" : "");
  const id = pathArr.join(".");
  const label = document.createElement("label");
  label.textContent = humanize(pathArr[pathArr.length - 1]);
  label.setAttribute("for", id);
  const input = document.createElement(String(value).length > 60 ? "textarea" : "input");
  input.id = id;
  input.dataset.path = id;
  input.value = value;
  if (typeof value === "number") input.dataset.type = "number";
  wrap.append(label, input);
  return wrap;
}

function makeCsEn(pair, pathArr) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.textContent = humanize(pathArr[pathArr.length - 1]);
  wrap.append(label);
  const row = document.createElement("div");
  row.className = "pair";
  for (const lang of ["cs", "en"]) {
    if (!(lang in pair)) continue;
    const col = document.createElement("div");
    const tag = document.createElement("span");
    tag.className = "lang";
    tag.textContent = lang === "cs" ? "CZ" : "EN";
    const input = document.createElement(String(pair[lang]).length > 60 ? "textarea" : "input");
    input.dataset.path = [...pathArr, lang].join(".");
    input.value = pair[lang];
    col.append(tag, input);
    row.append(col);
  }
  wrap.append(row);
  return wrap;
}

// Returns a DOM node for the value, or null if there's nothing worth showing.
function renderNode(key, value, pathArr, depth) {
  if (key === "_readme") return null;
  if (key === "layout") return makeInput(value, pathArr, true);

  if (isCsEn(value)) return makeCsEn(value, pathArr);

  if (typeof value === "string") return makeInput(value, pathArr, isFilePath(value));
  if (typeof value === "number") return makeInput(value, pathArr, true);

  if (Array.isArray(value)) {
    const group = document.createElement(depth === 0 ? "section" : "div");
    group.className = depth === 0 ? "group" : "sub-group";
    const legend = document.createElement("div");
    legend.className = "legend";
    legend.textContent = humanize(key);
    group.append(legend);
    let any = false;
    value.forEach((item, i) => {
      // primitive array item (e.g. a list of file paths)
      if (typeof item !== "object" || item === null) {
        const node = renderNode(i, item, [...pathArr, i], depth + 1);
        if (node) { group.append(node); any = true; }
        return;
      }
      const sub = document.createElement("div");
      sub.className = "sub-group";
      const sl = document.createElement("div");
      sl.className = "legend";
      sl.textContent = itemLabel(item, i);
      sub.append(sl);
      let subAny = false;
      for (const k of Object.keys(item)) {
        const node = renderNode(k, item[k], [...pathArr, i, k], depth + 2);
        if (node) { sub.append(node); subAny = true; }
      }
      if (subAny) { group.append(sub); any = true; }
    });
    return any ? group : null;
  }

  if (value && typeof value === "object") {
    const group = document.createElement(depth === 0 ? "section" : "div");
    group.className = depth === 0 ? "group" : "sub-group";
    const legend = document.createElement("div");
    legend.className = "legend";
    legend.textContent = humanize(key);
    group.append(legend);
    let any = false;
    for (const k of Object.keys(value)) {
      const node = renderNode(k, value[k], [...pathArr, k], depth + 1);
      if (node) { group.append(node); any = true; }
    }
    return any ? group : null;
  }

  return null;
}

function buildForm(content) {
  fieldsEl.replaceChildren();

  if (Array.isArray(content._readme)) {
    const note = document.createElement("div");
    note.className = "note";
    note.innerHTML =
      "<strong>Jak na to / How to edit:</strong><ul>" +
      content._readme.slice(1).map((l) => `<li>${l.replace(/</g, "&lt;")}</li>`).join("") +
      "</ul>";
    fieldsEl.append(note);
  }

  for (const key of Object.keys(content)) {
    const node = renderNode(key, content[key], [key], 0);
    if (node) {
      // wrap bare top-level fields (strings / cs-en) in their own card
      if (!node.classList.contains("group")) {
        const card = document.createElement("section");
        card.className = "group";
        card.append(node);
        fieldsEl.append(card);
      } else {
        fieldsEl.append(node);
      }
    }
  }
}

/* --- save --- */

function setDeep(obj, pathArr, value) {
  let cur = obj;
  for (let i = 0; i < pathArr.length - 1; i++) cur = cur[pathArr[i]];
  cur[pathArr[pathArr.length - 1]] = value;
}

function collect() {
  const next = structuredClone(original);
  fieldsEl.querySelectorAll("[data-path]").forEach((input) => {
    const pathArr = input.dataset.path.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
    let value = input.value;
    if (input.dataset.type === "number") value = Number(value);
    setDeep(next, pathArr, value);
  });
  return next;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

async function save() {
  setStatus("Ukládám… / Saving…", "");
  try {
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Editor-Password": password },
      body: JSON.stringify(collect(), null, 2),
    });
    if (res.ok) setStatus("Uloženo ✓ / Saved", "ok");
    else if (res.status === 401) setStatus("Heslo vypršelo — načti stránku znovu / Session expired, reload", "err");
    else setStatus("Chyba při ukládání / Save failed", "err");
  } catch (e) {
    setStatus("Chyba sítě / Network error", "err");
  }
}

/* --- login --- */

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  password = passwordInput.value;
  try {
    const auth = await fetch("/api/login", { method: "POST", headers: { "X-Editor-Password": password } });
    if (!auth.ok) { loginError.hidden = false; return; }
    const res = await fetch("/api/content");
    original = await res.json();
    buildForm(original);
    document.getElementById("login").hidden = true;
    editorPane.hidden = false;
    saveBar.hidden = false;
  } catch (e) {
    loginError.hidden = false;
  }
});

saveBtn.addEventListener("click", save);
