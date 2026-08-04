/* Conversor de Monedas VE — versión standalone (PWA/APK).
   Todo corre en el propio dispositivo: sin backend propio. Las tasas se
   piden directo a las APIs públicas y el estado/historial se guardan en
   localStorage (persisten aunque cierres la app o el celular se apague). */

const MONEDAS = [
  { key: "ves",      nombre: "Bolívar",          cod: "VES",  base: true },
  { key: "bcv",      nombre: "Dólar BCV",         cod: "USD",  unidad: "Bs por USD" },
  { key: "paralelo", nombre: "Dólar Paralelo",    cod: "USD",  unidad: "Bs por USD" },
  { key: "usdt",     nombre: "Dólar USDT",        cod: "USDT", unidad: "Bs por USDT" },
  { key: "eur",      nombre: "Euro",              cod: "EUR",  unidad: "Bs por EUR" },
  { key: "cop",      nombre: "Peso colombiano",   cod: "COP",  unidad: "Bs por COP" },
];
const RATE_KEYS = ["bcv", "paralelo", "usdt", "eur", "cop"];

const LS_STATE = "monedasVE.state.v1";
const LS_HIST = "monedasVE.historial.v1";

const DEFAULT_STATE = {
  bridge: "bcv",
  usd_factors: { eur_per_usd: 0.92, cop_per_usd: 4000.0, updated: null, source: "valores por defecto" },
  rates: {
    bcv:      { value: 40.0, updated: null, manual: true, source: "valor por defecto" },
    paralelo: { value: 45.0, updated: null, manual: true, source: "valor por defecto" },
    usdt:     { value: 45.0, updated: null, manual: true, source: "valor por defecto" },
    eur:      { value: 43.5, updated: null, manual: true, source: "valor por defecto" },
    cop:      { value: 0.01, updated: null, manual: true, source: "valor por defecto" },
  },
};

let estado = null;
let historial = [];
let origen = { key: null, amount: null };
let chart = null;

/* ============================ persistencia =============================== */
function loadState() {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* localStorage corrupto o bloqueado: usar valores por defecto */ }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function saveState() { localStorage.setItem(LS_STATE, JSON.stringify(estado)); }

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_HIST);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignorar */ }
  return [];
}
function appendHistory(tipo) {
  const registro = {
    timestamp: new Date().toISOString(),
    tipo,
    bridge: estado.bridge,
    bcv: estado.rates.bcv.value,
    paralelo: estado.rates.paralelo.value,
    usdt: estado.rates.usdt.value,
    eur: estado.rates.eur.value,
    cop: estado.rates.cop.value,
  };
  historial.push(registro);
  localStorage.setItem(LS_HIST, JSON.stringify(historial));
  return registro;
}

/* ============================ conversión =================================== */
function mapaVesPorUnidad() {
  const m = { ves: 1 };
  for (const k of RATE_KEYS) m[k] = Number(estado.rates[k].value);
  return m;
}
function convertir(amount, origin) {
  const m = mapaVesPorUnidad();
  const ves = Number(amount) * m[origin];
  const out = {};
  for (const k of Object.keys(m)) out[k] = ves / m[k];
  return out;
}
function recomputeCross(bridgeValue, eurPerUsd, copPerUsd) {
  return { eur: bridgeValue / eurPerUsd, cop: bridgeValue / copPerUsd };
}
function recomputeDerived() {
  const f = estado.usd_factors;
  if (!f || !f.eur_per_usd || !f.cop_per_usd) return;
  const bridgeValue = estado.rates[estado.bridge].value;
  const cruces = recomputeCross(bridgeValue, f.eur_per_usd, f.cop_per_usd);
  for (const k of ["eur", "cop"]) {
    if (!estado.rates[k].manual) {
      estado.rates[k].value = cruces[k];
      estado.rates[k].updated = f.updated;
      estado.rates[k].source = `open.er-api.com (puente ${estado.bridge.toUpperCase()})`;
    }
  }
}

/* ============================ fuentes de tasas (internet) =================== */
const TIMEOUT_MS = 12000;

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

async function pydolarveMonitor(page, monitor) {
  const data = await getJSON(`https://pydolarve.org/api/v1/dollar?page=${page}`);
  const monitores = data.monitors || data;
  const info = monitores[monitor];
  if (!info) throw new Error("monitor no encontrado: " + monitor);
  return { value: Number(info.price), updated: info.last_update || new Date().toISOString(), source: `pydolarve/${page}:${monitor}` };
}

async function srcBcvPydolarve() { return pydolarveMonitor("enparalelovzla", "bcv"); }
async function srcBcvDolarapi() {
  const d = await getJSON("https://ve.dolarapi.com/v1/dolares/oficial");
  return { value: Number(d.promedio), updated: d.fechaActualizacion, source: "dolarapi:oficial" };
}
async function srcParaleloPydolarve() { return pydolarveMonitor("enparalelovzla", "enparalelovzla"); }
async function srcParaleloDolarapi() {
  const d = await getJSON("https://ve.dolarapi.com/v1/dolares/paralelo");
  return { value: Number(d.promedio), updated: d.fechaActualizacion, source: "dolarapi:paralelo" };
}
async function srcUsdtPydolarve() { return pydolarveMonitor("criptodolar", "usdt"); }
async function srcUsdtCriptoya() {
  const d = await getJSON("https://criptoya.com/api/usdt/ves/1");
  const b = d.binancep2p;
  const value = (Number(b.totalAsk) + Number(b.totalBid)) / 2;
  return { value, updated: new Date(b.time * 1000).toISOString(), source: "criptoya:binancep2p" };
}

async function tryChain(fns, warnings, etiqueta) {
  const errores = [];
  for (const fn of fns) {
    try {
      return await fn();
    } catch (e) {
      errores.push(`${fn.name}: ${e.name || "Error"}`);
    }
  }
  warnings.push(`No se pudo actualizar ${etiqueta} (${errores.join("; ")})`);
  return null;
}

async function fetchUsdRates(warnings) {
  const resultado = {};
  const cadenas = {
    bcv: [srcBcvPydolarve, srcBcvDolarapi],
    paralelo: [srcParaleloPydolarve, srcParaleloDolarapi],
    usdt: [srcUsdtPydolarve, srcUsdtCriptoya],
  };
  for (const clave of Object.keys(cadenas)) {
    const info = await tryChain(cadenas[clave], warnings, clave);
    if (info) resultado[clave] = info;
  }
  return resultado;
}

async function fetchEurCopFactors(warnings) {
  try {
    const data = await getJSON("https://open.er-api.com/v6/latest/USD");
    return {
      eur_per_usd: Number(data.rates.EUR),
      cop_per_usd: Number(data.rates.COP),
      updated: data.time_last_update_utc || new Date().toISOString(),
      source: "open.er-api.com",
    };
  } catch (e) {
    warnings.push(`No se pudieron actualizar EUR/COP (open.er-api.com: ${e.name || "Error"})`);
    return null;
  }
}

/* ============================ utilidades numéricas =========================== */
function parseNum(str) {
  if (str == null) return NaN;
  str = String(str).trim().replace(/\s/g, "");
  if (str === "") return NaN;
  if (str.indexOf(",") > -1 && str.indexOf(".") === -1) str = str.replace(",", ".");
  else str = str.replace(/,/g, "");
  return parseFloat(str);
}
function fmtMonto(n) {
  if (!isFinite(n)) return "";
  return new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(n);
}
function rawStr(n) {
  if (!isFinite(n)) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6, useGrouping: false });
}
function fmtTasa(n) {
  if (!isFinite(n)) return "—";
  let dec = 2;
  if (n < 1) dec = 6; else if (n < 100) dec = 4;
  return new Intl.NumberFormat("es-VE", { maximumFractionDigits: dec }).format(n);
}
function fmtFecha(iso) {
  if (!iso) return "sin actualizar";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
}

/* ============================ render ========================================= */
function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  for (const mon of MONEDAS) {
    const card = document.createElement("div");
    card.className = "moneda" + (mon.base ? " base" : "");

    const r = estado.rates[mon.key];
    let tasaHTML;
    if (mon.base) {
      tasaHTML = `<div class="tasa-linea"><span>Moneda base del país</span></div>`;
    } else {
      const manual = r.manual ? `<span class="badge-manual">MANUAL</span>` : "";
      tasaHTML = `
        <div class="tasa-linea">
          <span class="tasa-valor">
            <span class="num">${fmtTasa(r.value)}</span> ${mon.unidad}${manual}
            <div class="fecha">Actualizado: ${fmtFecha(r.updated)}</div>
          </span>
          <button class="btn-editar" data-edit="${mon.key}" title="Editar tasa a mano">✏️</button>
        </div>`;
    }

    card.innerHTML = `
      <div class="cabecera">
        <div class="nombre">${mon.nombre}<span class="cod">${mon.cod}</span></div>
      </div>
      <input class="monto" id="monto-${mon.key}" inputmode="decimal"
             autocomplete="off" placeholder="0" />
      ${tasaHTML}`;
    grid.appendChild(card);
  }

  for (const mon of MONEDAS) {
    const inp = document.getElementById("monto-" + mon.key);
    inp.addEventListener("input", () => onInputMonto(mon.key));
    inp.addEventListener("focus", () => {
      const n = parseNum(inp.value);
      inp.value = isNaN(n) ? "" : rawStr(n);
    });
    inp.addEventListener("blur", () => {
      const n = parseNum(inp.value);
      inp.value = isNaN(n) ? "" : fmtMonto(n);
    });
  }

  grid.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => abrirEditor(btn.dataset.edit));
  });

  document.getElementById("bridge-select").value = estado.bridge;
}

function onInputMonto(key) {
  const inp = document.getElementById("monto-" + key);
  const val = parseNum(inp.value);
  if (isNaN(val)) {
    for (const mon of MONEDAS) if (mon.key !== key) document.getElementById("monto-" + mon.key).value = "";
    origen = { key: null, amount: null };
    return;
  }
  origen = { key, amount: val };
  const res = convertir(val, key);
  for (const mon of MONEDAS) {
    if (mon.key === key) continue;
    document.getElementById("monto-" + mon.key).value = fmtMonto(res[mon.key]);
  }
}
function recalcular() {
  if (!origen.key || origen.amount == null || isNaN(origen.amount)) return;
  const res = convertir(origen.amount, origen.key);
  for (const mon of MONEDAS) {
    const inp = document.getElementById("monto-" + mon.key);
    if (inp === document.activeElement) continue;
    inp.value = fmtMonto(res[mon.key]);
  }
}

/* ============================ editor manual de tasa =========================== */
function abrirEditor(key) {
  const r = estado.rates[key];
  const card = document.getElementById("monto-" + key).closest(".moneda");
  const linea = card.querySelector(".tasa-linea");
  const editor = document.createElement("div");
  editor.className = "editor";
  editor.innerHTML = `
    <input type="text" inputmode="decimal" value="${rawStr(Number(r.value))}" />
    <button class="btn primary" data-guardar>Guardar</button>
    <button class="btn" data-cancelar>Cancelar</button>`;
  linea.replaceWith(editor);
  const input = editor.querySelector("input");
  input.focus();
  input.select();

  editor.querySelector("[data-cancelar]").addEventListener("click", renderGrid);
  editor.querySelector("[data-guardar]").addEventListener("click", () => {
    const nuevo = parseNum(input.value);
    if (isNaN(nuevo) || nuevo <= 0) { alert("Ingresa un número mayor que cero."); return; }
    guardarTasaManual(key, nuevo);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") editor.querySelector("[data-guardar]").click();
    if (e.key === "Escape") renderGrid();
  });
}

function guardarTasaManual(key, value) {
  const ahora = new Date().toISOString();
  estado.rates[key] = { value, updated: ahora, manual: true, source: "manual" };
  recomputeDerived();
  saveState();
  appendHistory("manual");
  renderGrid();
  recalcular();
  mostrarAviso(`Tasa ${key.toUpperCase()} actualizada a mano.`, "ok");
}

/* ============================ actualizar desde internet ======================= */
async function actualizarTasas() {
  const btn = document.getElementById("btn-actualizar");
  if (!navigator.onLine) {
    mostrarAviso("Sin conexión a internet: no se pudieron pedir tasas nuevas. Se conservan los últimos valores guardados; puedes editarlos a mano.", "info");
    return;
  }
  btn.disabled = true;
  btn.textContent = "⏳ Actualizando...";
  const warnings = [];
  try {
    const usd = await fetchUsdRates(warnings);
    for (const clave of Object.keys(usd)) {
      estado.rates[clave] = { value: usd[clave].value, updated: usd[clave].updated, manual: false, source: usd[clave].source };
    }
    const factors = await fetchEurCopFactors(warnings);
    if (factors) {
      estado.usd_factors = factors;
      estado.rates.eur.manual = false;
      estado.rates.cop.manual = false;
    }
    recomputeDerived();
    saveState();
    appendHistory("auto");
    renderGrid();
    recalcular();
    if (warnings.length) {
      mostrarAviso("Actualización parcial:\n• " + warnings.join("\n• ") + "\nSe conservaron los últimos valores conocidos.", "info");
    } else {
      mostrarAviso("Tasas actualizadas correctamente desde internet.", "ok");
    }
  } catch (e) {
    mostrarAviso("No se pudo conectar para actualizar. Se conservan los últimos valores; puedes editarlos a mano.", "info");
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Actualizar tasas";
  }
}

/* ============================ puente EUR/COP =================================== */
function cambiarBridge(bridge) {
  estado.bridge = bridge;
  recomputeDerived();
  saveState();
  renderGrid();
  recalcular();
}

/* ============================ avisos ============================================ */
let avisoTimer = null;
function mostrarAviso(texto, tipo) {
  const el = document.getElementById("aviso");
  el.textContent = texto;
  el.className = "aviso" + (tipo === "ok" ? " ok" : tipo === "info" ? " info" : "");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.className = "aviso oculto"; }, 8000);
}
function actualizarBadgeConexion() {
  const el = document.getElementById("offline-aviso");
  if (navigator.onLine) {
    el.className = "aviso oculto";
  } else {
    el.textContent = "📴 Sin conexión: mostrando los últimos valores guardados en este dispositivo. Puedes seguir convirtiendo y editando tasas a mano.";
    el.className = "aviso info";
  }
}

/* ============================ historial ========================================== */
function renderHistorial() {
  const tbody = document.querySelector("#tabla-historial tbody");
  tbody.innerHTML = "";
  for (const reg of historial.slice().reverse()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtFecha(reg.timestamp)}</td>
      <td class="tipo-${reg.tipo}">${reg.tipo}</td>
      <td>${fmtTasa(reg.bcv)}</td>
      <td>${fmtTasa(reg.paralelo)}</td>
      <td>${fmtTasa(reg.usdt)}</td>
      <td>${fmtTasa(reg.eur)}</td>
      <td>${fmtTasa(reg.cop)}</td>`;
    tbody.appendChild(tr);
  }
  dibujarChart();
}
function dibujarChart() {
  const fallback = document.getElementById("chart-fallback");
  if (typeof Chart === "undefined") { fallback.classList.remove("oculto"); return; }
  const labels = historial.map((r) => fmtFecha(r.timestamp));
  const ds = (campo, color) => ({
    label: campo.toUpperCase(), data: historial.map((r) => r[campo]),
    borderColor: color, backgroundColor: color, tension: 0.25, pointRadius: 2,
  });
  const cfg = {
    type: "line",
    data: { labels, datasets: [ds("bcv", "#4f8cff"), ds("paralelo", "#ffb547"), ds("usdt", "#2fd08a")] },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#e6e8ec" } } },
      scales: {
        x: { ticks: { color: "#9aa2b1", maxTicksLimit: 8 }, grid: { color: "#2a2f3a" } },
        y: { ticks: { color: "#9aa2b1" }, grid: { color: "#2a2f3a" } },
      },
    },
  };
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("chart"), cfg);
}
function borrarHistorial() {
  if (!confirm("¿Borrar todo el historial guardado en este dispositivo? Esta acción no se puede deshacer.")) return;
  historial = [];
  localStorage.setItem(LS_HIST, JSON.stringify(historial));
  renderHistorial();
}

/* ============================ pestañas =========================================== */
function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      if (tab.dataset.tab === "historial") renderHistorial();
    });
  });
}

/* ============================ arranque ============================================ */
function init() {
  estado = loadState();
  historial = loadHistory();

  initTabs();
  document.getElementById("btn-actualizar").addEventListener("click", actualizarTasas);
  document.getElementById("bridge-select").addEventListener("change", (e) => cambiarBridge(e.target.value));
  document.getElementById("btn-borrar-historial").addEventListener("click", borrarHistorial);
  window.addEventListener("online", actualizarBadgeConexion);
  window.addEventListener("offline", actualizarBadgeConexion);

  renderGrid();
  actualizarBadgeConexion();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => { /* no crítico */ });
  }
}

document.addEventListener("DOMContentLoaded", init);
