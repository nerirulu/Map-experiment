const CATEGORIES = {
  writers: { label: "Escriptores", color: "#4E7A54" },
  musicians: { label: "Músics", color: "#A15D5D" },
  arquitects: { label: "Arquitectes", color: "#3E6485" },
  artists: { label: "Artistes plàstics", color: "#7a53b9" },
  kings: { label: "Reis", color: "#050505" },
  scientists: { label: "Científics", color: "#24c204" },
  philosophers: { label: "Filòsofs i intel·lectuals", color: "#D9A03C" },
  politicians: { label: "Polítics", color: "#cf3f1b" },
  others: { label: "Altres", color: "#999690" }
};

let entries = [];
let activeCategories = new Set(Object.keys(CATEGORIES));
let markers = {}; // id -> leaflet marker
let bars = {};    // id -> DOM timeline bar element
let workDots = {}; // id -> array of DOM work dot elements

const map = L.map("map", { scrollWheelZoom: true }).setView([20, 10], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 18
}).addTo(map);

function formatDates(entry) {
  if (entry.date_end && entry.date_end !== entry.date_start) {
    return `${entry.date_start} – ${entry.date_end}`;
  }
  return `${entry.date_start}`;
}

function markerIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #FBF8EE;box-shadow:0 0 0 1px ${color};"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

/* ---------------- Filters ---------------- */

function buildFilters() {
  const nav = document.getElementById("filters");
  Object.entries(CATEGORIES).forEach(([key, meta]) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.dataset.category = key;
    btn.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${meta.label}`;
    btn.addEventListener("click", () => toggleCategory(key, btn));
    nav.appendChild(btn);
  });
}

function toggleCategory(key, btn) {
  if (activeCategories.has(key)) {
    activeCategories.delete(key);
    btn.classList.add("inactive");
  } else {
    activeCategories.add(key);
    btn.classList.remove("inactive");
  }
  applyFilter();
}

function applyFilter() {
  entries.forEach(entry => {
    const visible = activeCategories.has(entry.category);
    const marker = markers[entry.id];
    const bar = bars[entry.id];
    const row = bar ? bar.parentElement : null;
    if (visible) {
      if (!map.hasLayer(marker)) marker.addTo(map);
      bar.style.display = "";
      if (row) row.style.display = "";
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
      bar.style.display = "none";
      (workDots[entry.id] || []).forEach(d => d.style.display = "none");
      if (row && !hasVisibleBar(row)) row.style.display = "none";
    }
  });
}

function hasVisibleBar(row) {
  return Array.from(row.querySelectorAll(".tl-bar")).some(b => b.style.display !== "none");
}

/* ---------------- Map ---------------- */

function buildMap() {
  entries.forEach(entry => {
    const color = CATEGORIES[entry.category].color;
    const marker = L.marker([entry.lat, entry.lng], { icon: markerIcon(color) });
    marker.bindPopup(`<strong>${entry.title}</strong><br>${entry.country}, ${formatDates(entry)}`);
    marker.on("click", () => selectEntry(entry.id));
    marker.addTo(map);
    markers[entry.id] = marker;
  });
}

/* ---------------- Global time-axis timeline ---------------- */

let GLOBAL_MIN, GLOBAL_MAX, SPAN;

function buildGlobalTimeline() {
  const wrap = document.getElementById("global-timeline");

  // 1) compute the overall range across all entries
  const starts = entries.map(e => e.date_start);
  const ends = entries.map(e => e.date_end || e.date_start);
  GLOBAL_MIN = Math.min(...starts, ...ends);
  GLOBAL_MAX = Math.max(...starts, ...ends);
  SPAN = GLOBAL_MAX - GLOBAL_MIN || 1;

  // 2) timeline track container
  const track = document.createElement("div");
  track.className = "tl-track";
  wrap.appendChild(track);

  // 3) year ruler (label ticks)
  const ruler = document.createElement("div");
  ruler.className = "tl-ruler";
  const rulerWidth = Math.max(window.innerWidth, 600);
  ruler.style.width = rulerWidth + "px";
  const step = SPAN > 150 ? 25 : SPAN > 75 ? 10 : SPAN > 30 ? 5 : 2;
  for (let y = Math.ceil(GLOBAL_MIN / step) * step; y <= GLOBAL_MAX; y += step) {
    const tick = document.createElement("span");
    tick.className = "tl-tick";
    tick.textContent = y;
    tick.style.left = `${toX(y)}%`;
    ruler.appendChild(tick);
  }
  track.appendChild(ruler);

  // 4) axis line
  const axis = document.createElement("div");
  axis.className = "tl-axis";
  track.appendChild(axis);

  // 5) assign each entry to a row (greedy packing so bars never overlap)
  const rows = packRows(entries);

  rows.forEach(rowEntries => {
    const lane = document.createElement("div");
    lane.className = "tl-lane";
    lane.style.width = rulerWidth + "px";

    rowEntries.forEach(entry => {
      const bar = document.createElement("div");
      bar.className = "tl-bar";
      bar.style.setProperty("--cat-color", CATEGORIES[entry.category].color);
      bar.dataset.id = entry.id;
      bar.style.left = `${toX(entry.date_start)}%`;
      bar.style.width = `${toX(entry.date_end || entry.date_start) - toX(entry.date_start)}%`;
      bar.innerHTML = `
        <span class="tl-bar-label">${entry.title}</span>
        <span class="tl-bar-years">${formatDates(entry)}</span>
      `;
      bar.addEventListener("click", () => selectEntry(entry.id));
      lane.appendChild(bar);
      bars[entry.id] = bar;

      // 6) work markers (dots) positioned on the timeline
      const dots = [];
      (entry.works || []).forEach(work => {
        const dot = document.createElement("div");
        dot.className = "tl-work-dot";
        dot.style.left = `${toX(work.year)}%`;
        dot.title = work.title;
        dot.innerHTML = `<span class="tl-work-tip">${work.title} (${work.year})</span>`;
        dot.style.display = "none"; // hidden until person selected
        lane.appendChild(dot);
        dots.push(dot);
      });
      workDots[entry.id] = dots;
    });

    track.appendChild(lane);
  });
}

function toX(year) {
  return ((year - GLOBAL_MIN) / SPAN) * 100;
}

function packRows(items) {
  // sort by start then end, greedily place each on first compatible row
  const sorted = [...items].sort((a, b) => a.date_start - b.date_start || (a.date_end || a.date_start) - (b.date_end || b.date_start));
  const rows = [];
  sorted.forEach(entry => {
    const start = entry.date_start;
    const end = entry.date_end || entry.date_start;
    let placed = false;
    for (const row of rows) {
      const last = row[row.length - 1];
      const lastEnd = last.date_end || last.date_start;
      if (start >= lastEnd) {
        row.push(entry);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([entry]);
  });
  return rows;
}

/* ---------------- Selection + detail panel ---------------- */

function selectEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  Object.values(bars).forEach(b => b.classList.remove("active"));
  // hide all work dots, then show only the selected person's dots
  Object.values(workDots).forEach(arr => arr.forEach(d => d.style.display = "none"));
  (workDots[id] || []).forEach(d => d.style.display = "");

  bars[id].classList.add("active");
  bars[id].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  map.panTo([entry.lat, entry.lng]);
  markers[id].openPopup();

  showDetail(entry);
}

function showDetail(entry) {
  const meta = CATEGORIES[entry.category];
  const panel = document.getElementById("detail-panel");
  panel.style.setProperty("--cat-color", meta.color);
  document.getElementById("detail-category").textContent = meta.label.toUpperCase();
  document.getElementById("detail-title").textContent = entry.title;
  document.getElementById("detail-meta").textContent = `${entry.country} · ${formatDates(entry)}`;

  const img = document.getElementById("detail-image");
  if (entry.image) {
    img.src = entry.image;
    img.alt = entry.title;
    img.style.display = "";
  } else {
    img.style.display = "none";
  }

  document.getElementById("detail-description").textContent = entry.description;

  // periods — mini vertical list inside the panel with explanations
  const periodsEl = document.getElementById("detail-periods");
  periodsEl.innerHTML = "";
  (entry.periods || []).forEach(p => {
    const item = document.createElement("div");
    item.className = "period-item";
    item.innerHTML = `
      <div class="period-head">
        <span class="period-years">${p.date_start} – ${p.date_end}</span>
        <span class="period-label">${p.label}</span>
      </div>
      ${p.description ? `<p class="period-desc">${p.description}</p>` : ""}
    `;
    periodsEl.appendChild(item);
  });

  // works — favourite pieces with extensive descriptions + images
  const worksEl = document.getElementById("detail-works");
  worksEl.innerHTML = "";
  (entry.works || []).forEach(work => {
    const item = document.createElement("div");
    item.className = "work-item";
    item.innerHTML = `
      <p class="work-title">${work.title} <span class="work-year">(${work.year})</span></p>
      ${work.image ? `<img class="work-image" src="${work.image}" alt="${work.title}" />` : ""}
      <p class="work-desc">${work.description}</p>
    `;
    worksEl.appendChild(item);
  });

  // references
  const refsEl = document.getElementById("detail-references");
  refsEl.innerHTML = "";
  (entry.references || []).forEach(ref => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = ref.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = ref.label;
    li.appendChild(a);
    refsEl.appendChild(li);
  });

  panel.hidden = false;
}

document.getElementById("detail-close").addEventListener("click", () => {
  document.getElementById("detail-panel").hidden = true;
});

/* ---------------- Init ---------------- */

fetch("data.json")
  .then(res => res.json())
  .then(data => {
    entries = data;
    buildFilters();
    buildMap();
    buildGlobalTimeline();
  });