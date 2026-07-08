/* ============================================================
   4Drivers — controle de manutenções e gastos com veículos
   App 100% client-side: dados no localStorage, PWA offline.
   ============================================================ */

"use strict";

/* ---------------- Store ---------------- */

const STORAGE_KEY = "4drivers_v1";

const defaultData = () => ({
  vehicles: [],     // {id, name, brand, model, year, plate, fuel, color, createdAt}
  fuelings: [],     // {id, vehicleId, date, odometer, liters, pricePerLiter, total, fullTank, station}
  expenses: [],     // {id, vehicleId, date, category, description, amount, odometer}
  services: [],     // {id, vehicleId, date, odometer, type, description, cost, workshop}
  odometers: [],    // {id, vehicleId, date, value, source}  source: manual|fueling|service
  maintenances: [], // {id, vehicleId, title, notes, dueDate, dueKm, repeatMonths, repeatKm, doneAt, lastNotified}
  settings: { notifDays: 15, notifKm: 500, notifEnabled: false },
});

let db = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultData(), parsed, {
      settings: Object.assign(defaultData().settings, parsed.settings || {}),
    });
  } catch (e) {
    console.error("Erro ao carregar dados:", e);
    return defaultData();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------------- Formatting / utils ---------------- */

const fmtBRL = (v) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtNum = (v, dec = 0) =>
  (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtKm = (v) => fmtNum(v) + " km";

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const daysBetween = (isoA, isoB) =>
  Math.round((new Date(isoB) - new Date(isoA)) / 86400000);

function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const num = (v) => {
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};

/** Arredonda para N casas decimais sem o erro binário do toFixed (ex.: 226,765 → 226,77). */
const round = (v, dec = 2) => {
  const m = Math.pow(10, dec);
  return Math.round(parseFloat((v * m).toFixed(4))) / m;
};

/* ---------------- Domain constants ---------------- */

const EXPENSE_CATEGORIES = [
  { id: "ipva", label: "IPVA / Licenciamento", icon: "🏛️" },
  { id: "seguro", label: "Seguro", icon: "🛡️" },
  { id: "multa", label: "Multa", icon: "🚨" },
  { id: "estacionamento", label: "Estacionamento", icon: "🅿️" },
  { id: "pedagio", label: "Pedágio", icon: "🛣️" },
  { id: "lavagem", label: "Lavagem / Estética", icon: "🧽" },
  { id: "acessorio", label: "Acessórios / Equipamentos", icon: "🔊" },
  { id: "financiamento", label: "Financiamento / Parcela", icon: "🏦" },
  { id: "outros", label: "Outros", icon: "📎" },
];

const SERVICE_TYPES = [
  { id: "oleo", label: "Troca de óleo e filtros", icon: "🛢️" },
  { id: "pneus", label: "Pneus / Rodízio / Balanceamento", icon: "🛞" },
  { id: "freios", label: "Freios", icon: "🛑" },
  { id: "suspensao", label: "Suspensão / Alinhamento", icon: "🔩" },
  { id: "bateria", label: "Bateria", icon: "🔋" },
  { id: "arrefecimento", label: "Arrefecimento", icon: "🌡️" },
  { id: "correia", label: "Correias / Velas", icon: "⚙️" },
  { id: "ar", label: "Ar-condicionado", icon: "❄️" },
  { id: "eletrica", label: "Elétrica", icon: "⚡" },
  { id: "funilaria", label: "Funilaria / Pintura", icon: "🎨" },
  { id: "revisao", label: "Revisão geral", icon: "🔧" },
  { id: "outros", label: "Outros", icon: "🧰" },
];

const FUEL_TYPES = ["Gasolina", "Etanol", "Diesel", "GNV", "Flex", "Elétrico", "Híbrido"];

const VEHICLE_COLORS = ["#007aff", "#34c759", "#ff9500", "#ff3b30", "#af52de", "#30b0c7", "#8e8e93", "#ffcc00"];
const VEHICLE_ICONS = ["🚗", "🚙", "🛻", "🏍️", "🚐", "🚚", "⚡"];

const catById = (list, id) => list.find((c) => c.id === id) || list[list.length - 1];

/* ---------------- Domain logic ---------------- */

/** Todas as leituras de odômetro de um veículo (manuais + abastecimentos + serviços), ordenadas por data. */
function allOdometerReadings(vehicleId) {
  const readings = [];
  for (const o of db.odometers) if (o.vehicleId === vehicleId && o.value > 0) readings.push({ date: o.date, value: o.value });
  for (const f of db.fuelings) if (f.vehicleId === vehicleId && f.odometer > 0) readings.push({ date: f.date, value: f.odometer });
  for (const s of db.services) if (s.vehicleId === vehicleId && s.odometer > 0) readings.push({ date: s.date, value: s.odometer });
  readings.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.value - b.value));
  return readings;
}

/** Odômetro atual estimado (última leitura registrada). */
function currentOdometer(vehicleId) {
  const readings = allOdometerReadings(vehicleId);
  if (!readings.length) return null;
  return readings.reduce((max, r) => Math.max(max, r.value), 0);
}

/** Média de km/dia com base nas leituras dos últimos ~120 dias (mínimo 2 leituras, 7 dias de intervalo). */
function avgKmPerDay(vehicleId) {
  const readings = allOdometerReadings(vehicleId);
  if (readings.length < 2) return null;
  const last = readings[readings.length - 1];
  // pega a leitura mais antiga dentro da janela de 120 dias antes da última
  const windowStart = readings.filter((r) => daysBetween(r.date, last.date) <= 120);
  const first = windowStart[0];
  const days = daysBetween(first.date, last.date);
  const km = last.value - first.value;
  if (days < 7 || km <= 0) {
    // fallback: usa todo o histórico
    const f0 = readings[0];
    const allDays = daysBetween(f0.date, last.date);
    const allKm = last.value - f0.value;
    if (allDays < 1 || allKm <= 0) return null;
    return allKm / allDays;
  }
  return km / days;
}

/** Status de uma manutenção programada: {state: 'ok'|'soon'|'overdue', detail, projectedDate, progress} */
function maintenanceStatus(m) {
  const s = db.settings;
  const today = todayISO();
  const odo = currentOdometer(m.vehicleId);
  const kmDay = avgKmPerDay(m.vehicleId);

  let state = "ok";
  const details = [];
  let progress = null;
  let projectedDate = null;

  if (m.dueDate) {
    const diff = daysBetween(today, m.dueDate);
    if (diff < 0) { state = "overdue"; details.push(`venceu em ${fmtDate(m.dueDate)} (${Math.abs(diff)} dia${Math.abs(diff) > 1 ? "s" : ""} atrás)`); }
    else if (diff <= s.notifDays) { if (state !== "overdue") state = "soon"; details.push(diff === 0 ? "vence hoje" : `vence em ${diff} dia${diff > 1 ? "s" : ""} (${fmtDate(m.dueDate)})`); }
    else details.push(`agendada para ${fmtDate(m.dueDate)}`);
  }

  if (m.dueKm && odo != null) {
    const remaining = m.dueKm - odo;
    if (remaining <= 0) { state = "overdue"; details.push(`passou ${fmtKm(Math.abs(remaining))} do limite (${fmtKm(m.dueKm)})`); }
    else if (remaining <= s.notifKm) { if (state !== "overdue") state = "soon"; details.push(`faltam ${fmtKm(remaining)}`); }
    else details.push(`faltam ${fmtKm(remaining)} (aos ${fmtKm(m.dueKm)})`);

    if (kmDay && remaining > 0) {
      const daysLeft = Math.round(remaining / kmDay);
      const d = new Date();
      d.setDate(d.getDate() + daysLeft);
      projectedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      details.push(`previsão: ${fmtDate(projectedDate)} (~${fmtNum(kmDay, 0)} km/dia)`);
    }
    // progresso: usa janela do intervalo de repetição, senão 5000 km como referência visual
    const span = m.repeatKm || 5000;
    progress = Math.min(1, Math.max(0, 1 - remaining / span));
    if (remaining <= 0) progress = 1;
  } else if (m.dueKm && odo == null) {
    details.push(`aos ${fmtKm(m.dueKm)} — registre o odômetro para acompanhar`);
  }

  if (m.dueDate && progress == null) {
    const spanDays = (m.repeatMonths || 6) * 30;
    const diff = daysBetween(today, m.dueDate);
    progress = Math.min(1, Math.max(0, 1 - diff / spanDays));
  }

  return { state, detail: details.join(" · "), projectedDate, progress };
}

/** Consumo médio (km/l) do veículo com base nos abastecimentos com odômetro. */
function avgConsumption(vehicleId) {
  const fuels = db.fuelings
    .filter((f) => f.vehicleId === vehicleId && f.odometer > 0 && f.liters > 0)
    .sort((a, b) => a.odometer - b.odometer);
  if (fuels.length < 2) return null;
  let km = 0, liters = 0;
  for (let i = 1; i < fuels.length; i++) {
    const dist = fuels[i].odometer - fuels[i - 1].odometer;
    if (dist > 0 && dist < 3000) { km += dist; liters += fuels[i].liters; }
  }
  return liters > 0 ? km / liters : null;
}

/** Total gasto num período [startISO, endISO] (inclusive), por veículo (null = todos). */
function totalsInPeriod(vehicleId, startISO, endISO) {
  const inRange = (r) =>
    (!vehicleId || r.vehicleId === vehicleId) && r.date >= startISO && r.date <= endISO;
  const fuel = db.fuelings.filter(inRange).reduce((s, f) => s + (f.total || 0), 0);
  const exp = db.expenses.filter(inRange).reduce((s, e) => s + (e.amount || 0), 0);
  const srv = db.services.filter(inRange).reduce((s, x) => s + (x.cost || 0), 0);
  return { fuel, exp, srv, total: fuel + exp + srv };
}

/** Custo por km no histórico completo do veículo. */
function costPerKm(vehicleId) {
  const readings = allOdometerReadings(vehicleId);
  if (readings.length < 2) return null;
  const km = readings[readings.length - 1].value - readings[0].value;
  if (km <= 0) return null;
  const start = readings[0].date, end = readings[readings.length - 1].date;
  const t = totalsInPeriod(vehicleId, start, end);
  return t.total > 0 ? t.total / km : null;
}

/* ---------------- Notifications & alerts ---------------- */

function pendingAlerts() {
  const alerts = [];
  for (const m of db.maintenances) {
    if (m.doneAt) continue;
    const v = db.vehicles.find((x) => x.id === m.vehicleId);
    if (!v) continue;
    const st = maintenanceStatus(m);
    if (st.state === "overdue" || st.state === "soon") {
      alerts.push({ maintenance: m, vehicle: v, status: st });
    }
  }
  alerts.sort((a, b) => (a.status.state === "overdue" ? -1 : 1) - (b.status.state === "overdue" ? -1 : 1));
  return alerts;
}

const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/** Situação atual da permissão de notificação, com orientação para o usuário. */
function notifPermissionInfo() {
  if (!("Notification" in window)) {
    if (isIOS() && !isStandalone())
      return { state: "ios-install", text: "No iPhone/iPad as notificações só funcionam com o app instalado: toque em Compartilhar → “Adicionar à Tela de Início” (iOS 16.4+), abra por lá e ative de novo." };
    return { state: "unsupported", text: "Este navegador não suporta notificações." };
  }
  if (Notification.permission === "denied")
    return { state: "denied", text: "As notificações estão bloqueadas para este site no navegador. Para desbloquear: toque no cadeado 🔒 na barra de endereço (ou ⋮ → Configurações do site) → Notificações → Permitir, e ative de novo aqui." };
  if (Notification.permission === "granted")
    return { state: "granted", text: "" };
  return { state: "ask", text: "" }; // ainda não foi perguntado
}

/** Exibe uma notificação. Prefere o service worker (obrigatório no Android/iOS); cai para o construtor no desktop. */
async function showNotif(title, options) {
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return true;
      }
    }
  } catch (e) { /* tenta o fallback */ }
  try {
    new Notification(title, options);
    return true;
  } catch (e) {
    return false;
  }
}

async function requestNotifPermission() {
  const info = notifPermissionInfo();
  if (info.state === "unsupported" || info.state === "ios-install" || info.state === "denied") {
    if (info.text) toast(info.text);
    return false;
  }
  if (info.state === "granted") return true;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

async function checkAndNotify() {
  if (!db.settings.notifEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
  const today = todayISO();
  let changed = false;
  for (const a of pendingAlerts()) {
    const m = a.maintenance;
    if (m.lastNotified === today) continue; // no máximo 1 notificação por item por dia
    const title = a.status.state === "overdue" ? "⚠️ Manutenção vencida" : "🔔 Manutenção próxima";
    const shown = await showNotif(title, {
      body: `${a.vehicle.name}: ${m.title} — ${a.status.detail}`,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "4drivers-" + m.id,
    });
    if (shown) { m.lastNotified = today; changed = true; }
  }
  if (changed) save();
}

function updateAlertBadge() {
  const badge = document.getElementById("alert-badge");
  const n = pendingAlerts().length;
  badge.hidden = n === 0;
  badge.textContent = n;
}

/* ---------------- App state & routing ---------------- */

const state = {
  route: "home",
  vehicleFilter: "",     // "" = todos
  recordsTab: "fuelings", // fuelings | expenses | services | odometers
};

const ROUTES = [
  { id: "home", label: "Início", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>` },
  { id: "records", label: "Registros", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>` },
  { id: "vehicles", label: "Veículos", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><path d="M4 11h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1"/><path d="M3 12v4a1 1 0 0 0 1 1h1"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/></svg>` },
  { id: "maintenance", label: "Manutenção", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6V21h3.4l5.7-5.7a4.5 4.5 0 0 0 5.6-6L14.5 12l-2.5-2.5 2.7-3.2z"/></svg>` },
  { id: "settings", label: "Ajustes", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>` },
];

const PAGE_TITLES = { home: "Início", records: "Registros", vehicles: "Veículos", maintenance: "Manutenção", settings: "Ajustes" };

function navigate(route) {
  state.route = route;
  render();
  document.getElementById("view").scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ---------------- Rendering shell ---------------- */

function renderNav() {
  const links = document.getElementById("sidebar-links");
  const tabbar = document.getElementById("tabbar");
  links.innerHTML = ROUTES.map(
    (r) => `<button class="nav-link ${state.route === r.id ? "active" : ""}" data-route="${r.id}">
      <span style="width:22px;height:22px;display:inline-flex">${r.icon}</span>${r.label}</button>`
  ).join("");
  tabbar.innerHTML = ROUTES.map(
    (r) => `<button class="tab-item ${state.route === r.id ? "active" : ""}" data-route="${r.id}">
      ${r.icon}<span>${r.label}</span></button>`
  ).join("");
  document.querySelectorAll("[data-route]").forEach((b) =>
    b.addEventListener("click", () => navigate(b.dataset.route)));
}

function renderVehicleFilter() {
  const sel = document.getElementById("vehicle-filter");
  if (!db.vehicles.length) { sel.style.display = "none"; return; }
  sel.style.display = "";
  sel.innerHTML =
    `<option value="">Todos os veículos</option>` +
    db.vehicles.map((v) => `<option value="${v.id}" ${state.vehicleFilter === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("");
}

function render() {
  renderNav();
  renderVehicleFilter();
  updateAlertBadge();
  document.getElementById("page-title").textContent = PAGE_TITLES[state.route];
  const view = document.getElementById("view");
  switch (state.route) {
    case "home": view.innerHTML = viewHome(); break;
    case "records": view.innerHTML = viewRecords(); break;
    case "vehicles": view.innerHTML = viewVehicles(); break;
    case "maintenance": view.innerHTML = viewMaintenance(); break;
    case "settings": view.innerHTML = viewSettings(); break;
  }
  bindViewEvents(view);
}

/* ---------------- Views ---------------- */

function filteredVehicleIds() {
  return state.vehicleFilter ? [state.vehicleFilter] : db.vehicles.map((v) => v.id);
}

function viewHome() {
  if (!db.vehicles.length) {
    return `<div class="empty-state card card-pad">
      <div class="empty-icon">🚗</div>
      <h2 style="margin-bottom:6px">Bem-vindo ao 4Drivers</h2>
      <p>Cadastre seu primeiro veículo para começar a controlar gastos, abastecimentos e manutenções.</p>
      <button class="btn-primary" data-action="add-vehicle">Cadastrar veículo</button>
    </div>`;
  }

  const vid = state.vehicleFilter || null;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const t = totalsInPeriod(vid, monthStart, todayISO());

  // stats agregadas
  let cons = null, cpk = null, odoText = "—";
  if (vid) {
    cons = avgConsumption(vid);
    cpk = costPerKm(vid);
    const odo = currentOdometer(vid);
    odoText = odo != null ? fmtKm(odo) : "sem registro";
  } else {
    const vals = db.vehicles.map((v) => avgConsumption(v.id)).filter((x) => x != null);
    if (vals.length) cons = vals.reduce((a, b) => a + b, 0) / vals.length;
    const cpks = db.vehicles.map((v) => costPerKm(v.id)).filter((x) => x != null);
    if (cpks.length) cpk = cpks.reduce((a, b) => a + b, 0) / cpks.length;
    odoText = db.vehicles.length + " veículo" + (db.vehicles.length > 1 ? "s" : "");
  }

  const alerts = pendingAlerts().filter((a) => !vid || a.maintenance.vehicleId === vid);

  const alertsHtml = alerts.length
    ? alerts.map((a) => `
      <div class="alert-banner ${a.status.state}" data-action="goto-maintenance" role="button">
        <div class="row-icon" style="background:${a.status.state === "overdue" ? "var(--red-soft)" : "var(--orange-soft)"}">${a.status.state === "overdue" ? "⚠️" : "🔔"}</div>
        <div>
          <div class="alert-title">${esc(a.maintenance.title)} — ${esc(a.vehicle.name)}</div>
          <div class="alert-sub">${esc(a.status.detail)}</div>
        </div>
      </div>`).join("")
    : "";

  const recent = recentActivity(vid, 6);

  return `
    ${alertsHtml ? `<div class="section-title">Atenção</div>${alertsHtml}` : ""}

    <div class="section-title">Resumo do mês</div>
    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-label">💸 Gasto no mês</div>
        <div class="stat-value">${fmtBRL(t.total)}</div>
        <div class="stat-sub">⛽ ${fmtBRL(t.fuel)} · 🔧 ${fmtBRL(t.srv)} · 📎 ${fmtBRL(t.exp)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">⛽ Consumo médio</div>
        <div class="stat-value">${cons ? fmtNum(cons, 1) + " km/l" : "—"}</div>
        <div class="stat-sub">${cons ? "com base nos abastecimentos" : "registre 2+ abastecimentos"}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">📏 Custo por km</div>
        <div class="stat-value">${cpk ? fmtBRL(cpk) : "—"}</div>
        <div class="stat-sub">${cpk ? "histórico completo" : "precisa de odômetro"}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">🧭 Odômetro</div>
        <div class="stat-value" style="font-size:18px">${esc(odoText)}</div>
        <div class="stat-sub">${vid ? kmPerDayText(vid) : "selecione um veículo"}</div>
      </div>
    </div>

    <div class="section-title">Gastos — últimos 6 meses</div>
    <div class="card">${monthlyChart(vid)}</div>

    <div class="section-title">Atividade recente
      <button class="link-btn" data-action="goto-records">Ver tudo</button>
    </div>
    <div class="card">
      ${recent.length ? recent.map(activityRow).join("") : `<div class="empty-state"><p>Nenhum registro ainda. Toque em ＋ para adicionar.</p></div>`}
    </div>`;
}

function kmPerDayText(vehicleId) {
  const k = avgKmPerDay(vehicleId);
  return k ? `média de ${fmtNum(k, 0)} km/dia` : "registre o odômetro com frequência";
}

function recentActivity(vehicleId, limit) {
  const items = [];
  const match = (r) => !vehicleId || r.vehicleId === vehicleId;
  for (const f of db.fuelings) if (match(f)) items.push({ kind: "fueling", date: f.date, r: f });
  for (const e of db.expenses) if (match(e)) items.push({ kind: "expense", date: e.date, r: e });
  for (const s of db.services) if (match(s)) items.push({ kind: "service", date: s.date, r: s });
  items.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  return items.slice(0, limit);
}

function vehicleName(id) {
  const v = db.vehicles.find((x) => x.id === id);
  return v ? v.name : "—";
}

function activityRow(item) {
  const { kind, r } = item;
  if (kind === "fueling") {
    return `<button class="list-row" data-action="edit-fueling" data-id="${r.id}">
      <div class="row-icon" style="background:var(--teal-soft)">⛽</div>
      <div class="row-main">
        <div class="row-title">Abastecimento · ${fmtNum(r.liters, 1)} L</div>
        <div class="row-sub">${esc(vehicleName(r.vehicleId))}${r.odometer ? " · " + fmtKm(r.odometer) : ""}</div>
      </div>
      <div class="row-end"><div class="row-value">${fmtBRL(r.total)}</div><div class="row-date">${fmtDateShort(r.date)}</div></div>
    </button>`;
  }
  if (kind === "expense") {
    const cat = catById(EXPENSE_CATEGORIES, r.category);
    return `<button class="list-row" data-action="edit-expense" data-id="${r.id}">
      <div class="row-icon" style="background:var(--purple-soft)">${cat.icon}</div>
      <div class="row-main">
        <div class="row-title">${esc(r.description || cat.label)}</div>
        <div class="row-sub">${esc(vehicleName(r.vehicleId))} · ${cat.label}</div>
      </div>
      <div class="row-end"><div class="row-value">${fmtBRL(r.amount)}</div><div class="row-date">${fmtDateShort(r.date)}</div></div>
    </button>`;
  }
  const typ = catById(SERVICE_TYPES, r.type);
  return `<button class="list-row" data-action="edit-service" data-id="${r.id}">
    <div class="row-icon" style="background:var(--orange-soft)">${typ.icon}</div>
    <div class="row-main">
      <div class="row-title">${esc(r.description || typ.label)}</div>
      <div class="row-sub">${esc(vehicleName(r.vehicleId))}${r.odometer ? " · " + fmtKm(r.odometer) : ""}</div>
    </div>
    <div class="row-end"><div class="row-value">${fmtBRL(r.cost)}</div><div class="row-date">${fmtDateShort(r.date)}</div></div>
  </button>`;
}

/* ---- Registros ---- */

function viewRecords() {
  const tabs = [
    { id: "fuelings", label: "⛽ Abastecimentos" },
    { id: "expenses", label: "💸 Gastos" },
    { id: "services", label: "🔧 Serviços" },
    { id: "odometers", label: "🧭 Odômetro" },
  ];
  const chips = `<div class="chip-row">${tabs.map((t) =>
    `<button class="chip ${state.recordsTab === t.id ? "active" : ""}" data-action="records-tab" data-tab="${t.id}">${t.label}</button>`).join("")}</div>`;

  const vid = state.vehicleFilter || null;
  const match = (r) => !vid || r.vehicleId === vid;
  const byDateDesc = (a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0);

  let listHtml = "", addAction = "", addLabel = "";

  if (state.recordsTab === "fuelings") {
    const items = db.fuelings.filter(match).sort(byDateDesc);
    addAction = "add-fueling"; addLabel = "Registrar abastecimento";
    listHtml = items.map((f) => activityRow({ kind: "fueling", r: f })).join("");
  } else if (state.recordsTab === "expenses") {
    const items = db.expenses.filter(match).sort(byDateDesc);
    addAction = "add-expense"; addLabel = "Registrar gasto";
    listHtml = items.map((e) => activityRow({ kind: "expense", r: e })).join("");
  } else if (state.recordsTab === "services") {
    const items = db.services.filter(match).sort(byDateDesc);
    addAction = "add-service"; addLabel = "Registrar serviço";
    listHtml = items.map((s) => activityRow({ kind: "service", r: s })).join("");
  } else {
    const items = db.odometers.filter(match).sort(byDateDesc);
    addAction = "add-odometer"; addLabel = "Registrar odômetro";
    listHtml = items.map((o) => `
      <button class="list-row" data-action="edit-odometer" data-id="${o.id}">
        <div class="row-icon" style="background:var(--tint-soft)">🧭</div>
        <div class="row-main">
          <div class="row-title mono">${fmtKm(o.value)}</div>
          <div class="row-sub">${esc(vehicleName(o.vehicleId))}</div>
        </div>
        <div class="row-end"><div class="row-date">${fmtDate(o.date)}</div></div>
      </button>`).join("");
  }

  return `${chips}
    <div class="card">
      ${listHtml || `<div class="empty-state"><p>Nenhum registro por aqui ainda.</p>
        <button class="btn-primary" data-action="${addAction}">${addLabel}</button></div>`}
    </div>
    ${listHtml ? `<button class="btn-secondary" style="width:100%" data-action="${addAction}">＋ ${addLabel}</button>` : ""}`;
}

/* ---- Veículos ---- */

function viewVehicles() {
  if (!db.vehicles.length) {
    return `<div class="empty-state card card-pad">
      <div class="empty-icon">🚙</div>
      <p>Nenhum veículo cadastrado. Adicione carro, moto, caminhão ou o que você dirige.</p>
      <button class="btn-primary" data-action="add-vehicle">Cadastrar veículo</button>
    </div>`;
  }
  const cards = db.vehicles.map((v) => {
    const odo = currentOdometer(v.id);
    const cons = avgConsumption(v.id);
    const monthStart = todayISO().slice(0, 8) + "01";
    const t = totalsInPeriod(v.id, monthStart, todayISO());
    return `<button class="vehicle-card" data-action="edit-vehicle" data-id="${v.id}">
      <div class="vehicle-avatar" style="background:${v.color}22;color:${v.color}">${v.icon || "🚗"}</div>
      <div class="row-main">
        <h3>${esc(v.name)}</h3>
        <div class="veh-sub">${esc([v.brand, v.model, v.year].filter(Boolean).join(" · "))}${v.plate ? " · " + esc(v.plate) : ""}</div>
        <div class="veh-km">${odo != null ? "🧭 " + fmtKm(odo) : "🧭 sem registro de km"}${cons ? ` · ⛽ ${fmtNum(cons, 1)} km/l` : ""}</div>
      </div>
      <div class="row-end">
        <div class="row-value">${fmtBRL(t.total)}</div>
        <div class="row-date">este mês</div>
      </div>
    </button>`;
  }).join("");
  return `${cards}
    <button class="btn-secondary" style="width:100%" data-action="add-vehicle">＋ Adicionar veículo</button>`;
}

/* ---- Manutenção ---- */

function viewMaintenance() {
  const vid = state.vehicleFilter || null;
  const items = db.maintenances.filter((m) => !vid || m.vehicleId === vid);
  const pending = items.filter((m) => !m.doneAt);
  const done = items.filter((m) => m.doneAt).sort((a, b) => (b.doneAt > a.doneAt ? 1 : -1)).slice(0, 10);

  // ordena pendentes: vencidas → próximas → ok
  const rank = { overdue: 0, soon: 1, ok: 2 };
  const withStatus = pending.map((m) => ({ m, st: maintenanceStatus(m) }));
  withStatus.sort((a, b) => rank[a.st.state] - rank[b.st.state]);

  const pendingHtml = withStatus.map(({ m, st }) => {
    const v = db.vehicles.find((x) => x.id === m.vehicleId);
    const progressClass = st.state === "overdue" ? "over" : st.state === "soon" ? "warn" : "";
    return `<div class="maint-item">
      <div class="maint-head">
        <span class="status-dot ${st.state}"></span>
        <div class="row-main" data-action="edit-maintenance" data-id="${m.id}" role="button">
          <div class="row-title">${esc(m.title)}</div>
          <div class="maint-meta">${esc(v ? v.name : "—")} · ${esc(st.detail || "sem critério definido")}</div>
        </div>
      </div>
      ${st.progress != null ? `<div class="progress-track"><div class="progress-fill ${progressClass}" style="width:${Math.round(st.progress * 100)}%"></div></div>` : ""}
      <div class="maint-actions">
        <button class="btn-small done" data-action="complete-maintenance" data-id="${m.id}">✓ Concluir</button>
        <button class="btn-small edit" data-action="edit-maintenance" data-id="${m.id}">Editar</button>
      </div>
    </div>`;
  }).join("");

  const doneHtml = done.map((m) => {
    const v = db.vehicles.find((x) => x.id === m.vehicleId);
    return `<button class="list-row" data-action="edit-maintenance" data-id="${m.id}">
      <div class="row-icon" style="background:var(--green-soft)">✅</div>
      <div class="row-main">
        <div class="row-title">${esc(m.title)}</div>
        <div class="row-sub">${esc(v ? v.name : "—")} · concluída em ${fmtDate(m.doneAt)}</div>
      </div>
    </button>`;
  }).join("");

  return `
    <div class="section-title">Programadas</div>
    <div class="card">
      ${pendingHtml || `<div class="empty-state"><p>Nenhuma manutenção programada. Agende por data ou por quilometragem — o app projeta a data com base na sua média de km.</p>
        <button class="btn-primary" data-action="add-maintenance">Programar manutenção</button></div>`}
    </div>
    ${pendingHtml ? `<button class="btn-secondary" style="width:100%" data-action="add-maintenance">＋ Programar manutenção</button>` : ""}
    ${doneHtml ? `<div class="section-title">Concluídas recentemente</div><div class="card">${doneHtml}</div>` : ""}`;
}

/* ---- Ajustes ---- */

function viewSettings() {
  const s = db.settings;
  const info = notifPermissionInfo();
  const enabled = s.notifEnabled && info.state === "granted";
  let notifHint = "As notificações são exibidas quando o app está aberto ou instalado na tela inicial.";
  if (info.state === "denied") notifHint = "🚫 " + info.text;
  else if (info.state === "ios-install") notifHint = "📲 " + info.text;
  else if (info.state === "unsupported") notifHint = "⚠️ " + info.text;
  else if (enabled) notifHint = "✅ Notificações ativas. " + notifHint;

  const counts = `${db.vehicles.length} veículos · ${db.fuelings.length} abastecimentos · ${db.expenses.length} gastos · ${db.services.length} serviços · ${db.maintenances.length} manutenções`;
  return `
    <div class="section-title">Alertas e notificações</div>
    <div class="form-group">
      <div class="form-row">
        <label style="width:auto;flex:1">Notificações no dispositivo</label>
        <input type="checkbox" id="set-notif" ${enabled ? "checked" : ""} ${info.state === "unsupported" || info.state === "ios-install" ? "disabled" : ""}>
      </div>
      <div class="form-row">
        <label style="width:auto;flex:1">Avisar com antecedência de</label>
        <input type="number" id="set-notif-days" value="${s.notifDays}" min="1" max="90" style="max-width:70px">
        <span class="unit">dias</span>
      </div>
      <div class="form-row">
        <label style="width:auto;flex:1">Avisar quando faltar</label>
        <input type="number" id="set-notif-km" value="${s.notifKm}" min="50" max="5000" step="50" style="max-width:80px">
        <span class="unit">km</span>
      </div>
      ${enabled ? `<button class="list-row" data-action="test-notification">
        <div class="row-icon" style="background:var(--tint-soft)">🔔</div>
        <div class="row-main"><div class="row-title">Enviar notificação de teste</div>
        <div class="row-sub">Confira se os avisos chegam neste aparelho</div></div>
      </button>` : ""}
    </div>
    <div class="form-hint">${notifHint}</div>

    <div class="section-title">Dados</div>
    <div class="form-group">
      <button class="list-row" data-action="export-data">
        <div class="row-icon" style="background:var(--tint-soft)">📤</div>
        <div class="row-main"><div class="row-title">Exportar backup (JSON)</div>
        <div class="row-sub">Salve seus dados em arquivo</div></div>
      </button>
      <button class="list-row" data-action="import-data">
        <div class="row-icon" style="background:var(--green-soft)">📥</div>
        <div class="row-main"><div class="row-title">Importar backup</div>
        <div class="row-sub">Restaura a partir de um arquivo JSON</div></div>
      </button>
      <button class="list-row" data-action="export-csv">
        <div class="row-icon" style="background:var(--purple-soft)">📊</div>
        <div class="row-main"><div class="row-title">Exportar gastos (CSV)</div>
        <div class="row-sub">Para abrir em planilhas</div></div>
      </button>
    </div>
    <div class="form-hint">${counts}</div>

    <div class="form-group">
      <button class="btn-danger-plain" data-action="wipe-data">Apagar todos os dados</button>
    </div>

    <div class="card" style="margin-top:20px">
      <details class="about">
        <summary>Sobre o 4Drivers</summary>
        <div>
          <p>Controle de manutenções e gastos com veículos. Seus dados ficam armazenados <strong>apenas neste dispositivo</strong> (navegador). Use o backup para transferir entre aparelhos.</p>
          <p style="margin-top:8px">💡 Dica: no celular, use "Adicionar à Tela de Início" para instalar como app.</p>
        </div>
      </details>
    </div>`;
}

/* ---------------- Monthly chart (SVG) ---------------- */

function monthlyChart(vehicleId) {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-31`;
    const t = totalsInPeriod(vehicleId, start, end);
    months.push({ label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), ...t });
  }
  const max = Math.max(...months.map((m) => m.total), 1);

  const W = 560, H = 190, padL = 8, padB = 30, padT = 26;
  const bw = 34, gap = (W - padL * 2) / 6;
  const colors = { fuel: "var(--teal)", srv: "var(--orange)", exp: "var(--purple)" };

  let bars = "";
  months.forEach((m, i) => {
    const x = padL + gap * i + (gap - bw) / 2;
    const scale = (H - padT - padB) / max;
    let yCursor = H - padB;
    for (const key of ["fuel", "srv", "exp"]) {
      const h = m[key] * scale;
      if (h > 0.5) {
        yCursor -= h;
        bars += `<rect x="${x}" y="${yCursor}" width="${bw}" height="${h}" rx="3" fill="${colors[key]}" opacity="0.9"/>`;
      }
    }
    if (m.total > 0) {
      bars += `<text x="${x + bw / 2}" y="${yCursor - 7}" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.65">${m.total >= 1000 ? fmtNum(m.total / 1000, 1) + "k" : fmtNum(m.total, 0)}</text>`;
    }
    bars += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.55">${m.label}</text>`;
  });

  return `<div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:420px;display:block" role="img" aria-label="Gastos mensais">
        <line x1="${padL}" y1="${H - padB}" x2="${W - padL}" y2="${H - padB}" stroke="currentColor" opacity="0.15"/>
        ${bars}
      </svg>
    </div>
    <div class="chart-legend">
      <span><span class="legend-swatch" style="background:var(--teal)"></span>Combustível</span>
      <span><span class="legend-swatch" style="background:var(--orange)"></span>Serviços</span>
      <span><span class="legend-swatch" style="background:var(--purple)"></span>Outros gastos</span>
    </div>`;
}

/* ---------------- Modal & forms ---------------- */

let modalSaveHandler = null;

function openModal(title, bodyHtml, onSave) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  modalSaveHandler = onSave;
  document.getElementById("modal-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("modal-backdrop").hidden = true;
  document.getElementById("modal-body").innerHTML = "";
  document.body.style.overflow = "";
  modalSaveHandler = null;
}

const field = (id) => document.getElementById(id);
const fieldVal = (id) => field(id)?.value?.trim() ?? "";

function vehicleSelectHtml(selectedId) {
  const sel = selectedId || state.vehicleFilter || (db.vehicles[0] && db.vehicles[0].id) || "";
  return db.vehicles.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.name)}</option>`).join("");
}

function requireVehicle() {
  if (db.vehicles.length) return true;
  toast("Cadastre um veículo primeiro");
  openVehicleForm();
  return false;
}

/* ---- Veículo ---- */

function openVehicleForm(vehicle) {
  const v = vehicle || { name: "", brand: "", model: "", year: "", plate: "", fuel: "Flex", color: VEHICLE_COLORS[0], icon: "🚗" };
  const isEdit = !!vehicle;
  const body = `
    <div class="form-group">
      <div class="form-row"><label>Apelido *</label><input id="f-name" value="${esc(v.name)}" placeholder="Ex.: Meu Onix"></div>
      <div class="form-row"><label>Marca</label><input id="f-brand" value="${esc(v.brand)}" placeholder="Chevrolet"></div>
      <div class="form-row"><label>Modelo</label><input id="f-model" value="${esc(v.model)}" placeholder="Onix 1.0 LT"></div>
      <div class="form-row"><label>Ano</label><input id="f-year" value="${esc(v.year)}" inputmode="numeric" placeholder="2022"></div>
      <div class="form-row"><label>Placa</label><input id="f-plate" value="${esc(v.plate)}" placeholder="ABC1D23" style="text-transform:uppercase"></div>
      <div class="form-row"><label>Combustível</label>
        <select id="f-fuel">${FUEL_TYPES.map((f) => `<option ${f === v.fuel ? "selected" : ""}>${f}</option>`).join("")}</select>
      </div>
      ${isEdit ? "" : `<div class="form-row"><label>Odômetro atual</label><input id="f-odo" inputmode="numeric" placeholder="45000"><span class="unit">km</span></div>`}
    </div>
    <div class="form-group">
      <div class="form-row" style="border-bottom:1px solid var(--separator)"><label style="width:auto">Ícone</label>
        <div style="display:flex;gap:6px;margin-left:auto">${VEHICLE_ICONS.map((ic) =>
          `<button type="button" class="color-swatch icon-choice ${ic === v.icon ? "selected" : ""}" data-icon="${ic}" style="background:var(--fill);font-size:17px">${ic}</button>`).join("")}</div>
      </div>
      <div class="color-picker">${VEHICLE_COLORS.map((c) =>
        `<button type="button" class="color-swatch color-choice ${c === v.color ? "selected" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}
      </div>
    </div>
    ${isEdit ? `<div class="form-group"><button class="btn-danger-plain" id="f-delete">Excluir veículo e todos os registros</button></div>` : ""}`;

  openModal(isEdit ? "Editar veículo" : "Novo veículo", body, () => {
    const name = fieldVal("f-name");
    if (!name) { toast("Informe um apelido para o veículo"); return false; }
    const icon = document.querySelector(".icon-choice.selected")?.dataset.icon || "🚗";
    const color = document.querySelector(".color-choice.selected")?.dataset.color || VEHICLE_COLORS[0];
    if (isEdit) {
      Object.assign(vehicle, { name, brand: fieldVal("f-brand"), model: fieldVal("f-model"), year: fieldVal("f-year"), plate: fieldVal("f-plate").toUpperCase(), fuel: fieldVal("f-fuel"), icon, color });
    } else {
      const nv = { id: uid(), name, brand: fieldVal("f-brand"), model: fieldVal("f-model"), year: fieldVal("f-year"), plate: fieldVal("f-plate").toUpperCase(), fuel: fieldVal("f-fuel"), icon, color, createdAt: todayISO() };
      db.vehicles.push(nv);
      const odo = num(fieldVal("f-odo"));
      if (odo) db.odometers.push({ id: uid(), vehicleId: nv.id, date: todayISO(), value: odo, source: "manual" });
    }
    save();
    toast(isEdit ? "Veículo atualizado" : "Veículo cadastrado 🚗");
    return true;
  });

  document.querySelectorAll(".icon-choice").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".icon-choice").forEach((x) => x.classList.remove("selected"));
    b.classList.add("selected");
  }));
  document.querySelectorAll(".color-choice").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".color-choice").forEach((x) => x.classList.remove("selected"));
    b.classList.add("selected");
  }));
  if (isEdit) field("f-delete")?.addEventListener("click", () => {
    if (!confirm(`Excluir "${vehicle.name}" e TODOS os registros dele? Essa ação não pode ser desfeita.`)) return;
    db.vehicles = db.vehicles.filter((x) => x.id !== vehicle.id);
    for (const key of ["fuelings", "expenses", "services", "odometers", "maintenances"])
      db[key] = db[key].filter((x) => x.vehicleId !== vehicle.id);
    if (state.vehicleFilter === vehicle.id) state.vehicleFilter = "";
    save(); closeModal(); render(); toast("Veículo excluído");
  });
}

/* ---- Abastecimento ---- */

function openFuelingForm(fueling) {
  if (!fueling && !requireVehicle()) return;
  const f = fueling || { vehicleId: "", date: todayISO(), odometer: "", liters: "", pricePerLiter: "", total: "", fullTank: true, station: "" };
  const isEdit = !!fueling;
  const body = `
    <div class="form-group">
      <div class="form-row"><label>Veículo</label><select id="f-vehicle">${vehicleSelectHtml(f.vehicleId)}</select></div>
      <div class="form-row"><label>Data</label><input id="f-date" type="date" value="${f.date}"></div>
      <div class="form-row"><label>Odômetro</label><input id="f-odo" inputmode="decimal" value="${f.odometer || ""}" placeholder="45230"><span class="unit">km</span></div>
      <div class="form-row"><label>Litros</label><input id="f-liters" inputmode="decimal" value="${f.liters || ""}" placeholder="38,5"><span class="unit">L</span></div>
      <div class="form-row"><label>Preço / litro</label><input id="f-price" inputmode="decimal" value="${f.pricePerLiter || ""}" placeholder="5,89"><span class="unit">R$</span></div>
      <div class="form-row"><label>Total</label><input id="f-total" inputmode="decimal" value="${f.total || ""}" placeholder="226,77"><span class="unit">R$</span></div>
      <div class="form-row"><label style="width:auto;flex:1">Tanque cheio</label><input type="checkbox" id="f-full" ${f.fullTank ? "checked" : ""}></div>
      <div class="form-row"><label>Posto</label><input id="f-station" value="${esc(f.station)}" placeholder="opcional"></div>
    </div>
    <div class="form-hint">Preencha 2 dos 3 campos (litros, preço, total) que o app calcula o terceiro. Informar o odômetro permite calcular consumo e projeções.</div>
    ${isEdit ? `<div class="form-group"><button class="btn-danger-plain" id="f-delete">Excluir abastecimento</button></div>` : ""}`;

  openModal(isEdit ? "Editar abastecimento" : "Abastecimento", body, () => {
    let liters = num(fieldVal("f-liters")), price = num(fieldVal("f-price")), total = num(fieldVal("f-total"));
    if (liters && price && !total) total = round(liters * price, 2);
    else if (liters && total && !price) price = round(total / liters, 3);
    else if (price && total && !liters) liters = round(total / price, 2);
    if (!total || total <= 0) { toast("Informe pelo menos 2 valores (litros, preço, total)"); return false; }
    const rec = {
      vehicleId: fieldVal("f-vehicle"), date: fieldVal("f-date") || todayISO(),
      odometer: num(fieldVal("f-odo")) || 0, liters: liters || 0, pricePerLiter: price || 0,
      total, fullTank: field("f-full").checked, station: fieldVal("f-station"),
    };
    if (isEdit) Object.assign(fueling, rec);
    else db.fuelings.push({ id: uid(), ...rec });
    save();
    toast(isEdit ? "Abastecimento atualizado" : "Abastecimento registrado ⛽");
    return true;
  });

  // cálculo automático do terceiro campo
  const recalc = (changed) => {
    const l = num(fieldVal("f-liters")), p = num(fieldVal("f-price")), t = num(fieldVal("f-total"));
    if (changed !== "f-total" && l && p) field("f-total").value = round(l * p, 2).toFixed(2);
    else if (changed === "f-total" && t && l && !p) field("f-price").value = round(t / l, 3).toFixed(3);
    else if (changed === "f-total" && t && p && !l) field("f-liters").value = round(t / p, 2).toFixed(2);
  };
  for (const id of ["f-liters", "f-price", "f-total"])
    field(id).addEventListener("input", () => recalc(id));

  if (isEdit) field("f-delete")?.addEventListener("click", () => {
    if (!confirm("Excluir este abastecimento?")) return;
    db.fuelings = db.fuelings.filter((x) => x.id !== fueling.id);
    save(); closeModal(); render(); toast("Excluído");
  });
}

/* ---- Gasto ---- */

function openExpenseForm(expense) {
  if (!expense && !requireVehicle()) return;
  const e = expense || { vehicleId: "", date: todayISO(), category: "outros", description: "", amount: "" };
  const isEdit = !!expense;
  const body = `
    <div class="form-group">
      <div class="form-row"><label>Veículo</label><select id="f-vehicle">${vehicleSelectHtml(e.vehicleId)}</select></div>
      <div class="form-row"><label>Data</label><input id="f-date" type="date" value="${e.date}"></div>
      <div class="form-row"><label>Categoria</label>
        <select id="f-cat">${EXPENSE_CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === e.category ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("")}</select>
      </div>
      <div class="form-row"><label>Descrição</label><input id="f-desc" value="${esc(e.description)}" placeholder="opcional"></div>
      <div class="form-row"><label>Valor *</label><input id="f-amount" inputmode="decimal" value="${e.amount || ""}" placeholder="150,00"><span class="unit">R$</span></div>
    </div>
    ${isEdit ? `<div class="form-group"><button class="btn-danger-plain" id="f-delete">Excluir gasto</button></div>` : ""}`;

  openModal(isEdit ? "Editar gasto" : "Novo gasto", body, () => {
    const amount = num(fieldVal("f-amount"));
    if (!amount || amount <= 0) { toast("Informe o valor do gasto"); return false; }
    const rec = { vehicleId: fieldVal("f-vehicle"), date: fieldVal("f-date") || todayISO(), category: fieldVal("f-cat"), description: fieldVal("f-desc"), amount };
    if (isEdit) Object.assign(expense, rec);
    else db.expenses.push({ id: uid(), ...rec });
    save();
    toast(isEdit ? "Gasto atualizado" : "Gasto registrado 💸");
    return true;
  });

  if (isEdit) field("f-delete")?.addEventListener("click", () => {
    if (!confirm("Excluir este gasto?")) return;
    db.expenses = db.expenses.filter((x) => x.id !== expense.id);
    save(); closeModal(); render(); toast("Excluído");
  });
}

/* ---- Serviço ---- */

function openServiceForm(service) {
  if (!service && !requireVehicle()) return;
  const s = service || { vehicleId: "", date: todayISO(), odometer: "", type: "oleo", description: "", cost: "", workshop: "" };
  const isEdit = !!service;
  const body = `
    <div class="form-group">
      <div class="form-row"><label>Veículo</label><select id="f-vehicle">${vehicleSelectHtml(s.vehicleId)}</select></div>
      <div class="form-row"><label>Data</label><input id="f-date" type="date" value="${s.date}"></div>
      <div class="form-row"><label>Tipo</label>
        <select id="f-type">${SERVICE_TYPES.map((t) => `<option value="${t.id}" ${t.id === s.type ? "selected" : ""}>${t.icon} ${t.label}</option>`).join("")}</select>
      </div>
      <div class="form-row"><label>Descrição</label><input id="f-desc" value="${esc(s.description)}" placeholder="Ex.: óleo 5W30 + filtro"></div>
      <div class="form-row"><label>Custo *</label><input id="f-cost" inputmode="decimal" value="${s.cost || ""}" placeholder="280,00"><span class="unit">R$</span></div>
      <div class="form-row"><label>Odômetro</label><input id="f-odo" inputmode="decimal" value="${s.odometer || ""}" placeholder="45230"><span class="unit">km</span></div>
      <div class="form-row"><label>Oficina</label><input id="f-workshop" value="${esc(s.workshop)}" placeholder="opcional"></div>
    </div>
    ${isEdit ? `<div class="form-group"><button class="btn-danger-plain" id="f-delete">Excluir serviço</button></div>` : ""}`;

  openModal(isEdit ? "Editar serviço" : "Serviço / manutenção realizada", body, () => {
    const cost = num(fieldVal("f-cost"));
    if (cost == null || cost < 0) { toast("Informe o custo (pode ser 0)"); return false; }
    const rec = { vehicleId: fieldVal("f-vehicle"), date: fieldVal("f-date") || todayISO(), type: fieldVal("f-type"), description: fieldVal("f-desc"), cost, odometer: num(fieldVal("f-odo")) || 0, workshop: fieldVal("f-workshop") };
    if (isEdit) Object.assign(service, rec);
    else db.services.push({ id: uid(), ...rec });
    save();
    toast(isEdit ? "Serviço atualizado" : "Serviço registrado 🔧");
    return true;
  });

  if (isEdit) field("f-delete")?.addEventListener("click", () => {
    if (!confirm("Excluir este serviço?")) return;
    db.services = db.services.filter((x) => x.id !== service.id);
    save(); closeModal(); render(); toast("Excluído");
  });
}

/* ---- Odômetro ---- */

function openOdometerForm(odometer) {
  if (!odometer && !requireVehicle()) return;
  const o = odometer || { vehicleId: "", date: todayISO(), value: "" };
  const isEdit = !!odometer;
  const body = `
    <div class="form-group">
      <div class="form-row"><label>Veículo</label><select id="f-vehicle">${vehicleSelectHtml(o.vehicleId)}</select></div>
      <div class="form-row"><label>Data</label><input id="f-date" type="date" value="${o.date}"></div>
      <div class="form-row"><label>Odômetro *</label><input id="f-value" inputmode="decimal" value="${o.value || ""}" placeholder="45230"><span class="unit">km</span></div>
    </div>
    <div class="form-hint">Registre o odômetro com frequência (ex.: 1x por semana). É com essa média que o app projeta a data das manutenções por quilometragem.</div>
    ${isEdit ? `<div class="form-group"><button class="btn-danger-plain" id="f-delete">Excluir leitura</button></div>` : ""}`;

  openModal(isEdit ? "Editar leitura" : "Registrar odômetro", body, () => {
    const value = num(fieldVal("f-value"));
    if (!value || value <= 0) { toast("Informe a quilometragem"); return false; }
    const rec = { vehicleId: fieldVal("f-vehicle"), date: fieldVal("f-date") || todayISO(), value, source: "manual" };
    if (isEdit) Object.assign(odometer, rec);
    else db.odometers.push({ id: uid(), ...rec });
    save();
    toast("Odômetro registrado 🧭");
    return true;
  });

  if (isEdit) field("f-delete")?.addEventListener("click", () => {
    if (!confirm("Excluir esta leitura?")) return;
    db.odometers = db.odometers.filter((x) => x.id !== odometer.id);
    save(); closeModal(); render(); toast("Excluído");
  });
}

/* ---- Manutenção programada ---- */

function openMaintenanceForm(maint, presetVehicleId) {
  if (!maint && !requireVehicle()) return;
  const m = maint || { vehicleId: presetVehicleId || "", title: "", notes: "", dueDate: "", dueKm: "", repeatMonths: "", repeatKm: "" };
  const isEdit = !!maint;
  const suggestions = ["Troca de óleo", "Revisão", "Pneus", "Alinhamento e balanceamento", "Filtro de ar", "Pastilhas de freio", "Correia dentada", "IPVA", "Seguro"];
  const odo = m.vehicleId ? currentOdometer(m.vehicleId) : (db.vehicles[0] ? currentOdometer(db.vehicles[0].id) : null);

  const body = `
    <div class="form-group">
      <div class="form-row"><label>Veículo</label><select id="f-vehicle">${vehicleSelectHtml(m.vehicleId)}</select></div>
      <div class="form-row"><label>Título *</label><input id="f-title" value="${esc(m.title)}" placeholder="Ex.: Troca de óleo" list="maint-suggestions"></div>
      <datalist id="maint-suggestions">${suggestions.map((s) => `<option value="${s}">`).join("")}</datalist>
      <div class="form-row"><label>Observações</label><input id="f-notes" value="${esc(m.notes)}" placeholder="opcional"></div>
    </div>

    <div class="section-title" style="margin-top:4px">Quando fazer? (data, km ou ambos)</div>
    <div class="form-group">
      <div class="form-row"><label>Data marcada</label><input id="f-duedate" type="date" value="${m.dueDate || ""}"></div>
      <div class="form-row"><label>Ao atingir</label><input id="f-duekm" inputmode="numeric" value="${m.dueKm || ""}" placeholder="${odo ? fmtNum(odo + 5000) : "50000"}"><span class="unit">km</span></div>
    </div>
    <div class="form-hint">${odo != null ? `Odômetro atual: <strong>${fmtKm(odo)}</strong>. ` : ""}Se definir por km, o app projeta a data prevista usando sua média de km/dia.</div>

    <div class="section-title" style="margin-top:4px">Repetição (opcional)</div>
    <div class="form-group">
      <div class="form-row"><label>Repetir a cada</label><input id="f-repmonths" inputmode="numeric" value="${m.repeatMonths || ""}" placeholder="6"><span class="unit">meses</span></div>
      <div class="form-row"><label>ou a cada</label><input id="f-repkm" inputmode="numeric" value="${m.repeatKm || ""}" placeholder="10000"><span class="unit">km</span></div>
    </div>
    <div class="form-hint">Ao concluir, uma nova manutenção é criada automaticamente com o próximo prazo.</div>
    ${isEdit ? `<div class="form-group"><button class="btn-danger-plain" id="f-delete">Excluir manutenção</button></div>` : ""}`;

  openModal(isEdit ? "Editar manutenção" : "Programar manutenção", body, () => {
    const title = fieldVal("f-title");
    if (!title) { toast("Dê um título para a manutenção"); return false; }
    const dueDate = fieldVal("f-duedate");
    const dueKm = num(fieldVal("f-duekm"));
    if (!dueDate && !dueKm) { toast("Defina uma data ou uma quilometragem"); return false; }
    const rec = {
      vehicleId: fieldVal("f-vehicle"), title, notes: fieldVal("f-notes"),
      dueDate: dueDate || "", dueKm: dueKm || 0,
      repeatMonths: num(fieldVal("f-repmonths")) || 0, repeatKm: num(fieldVal("f-repkm")) || 0,
    };
    if (isEdit) Object.assign(maint, rec);
    else db.maintenances.push({ id: uid(), ...rec, doneAt: "", lastNotified: "" });
    save();
    toast(isEdit ? "Manutenção atualizada" : "Manutenção programada 📅");
    return true;
  });

  if (isEdit) field("f-delete")?.addEventListener("click", () => {
    if (!confirm("Excluir esta manutenção programada?")) return;
    db.maintenances = db.maintenances.filter((x) => x.id !== maint.id);
    save(); closeModal(); render(); toast("Excluído");
  });
}

/** Concluir manutenção: opcionalmente registra como serviço e recria se houver repetição. */
function completeMaintenance(m) {
  const v = db.vehicles.find((x) => x.id === m.vehicleId);
  const odo = currentOdometer(m.vehicleId);
  const body = `
    <div class="form-hint" style="margin:4px 0 12px;padding:0 4px">Concluir <strong>${esc(m.title)}</strong>${v ? " — " + esc(v.name) : ""}. Informe os dados do serviço realizado (opcional):</div>
    <div class="form-group">
      <div class="form-row"><label>Data</label><input id="f-date" type="date" value="${todayISO()}"></div>
      <div class="form-row"><label>Odômetro</label><input id="f-odo" inputmode="decimal" value="${odo || ""}"><span class="unit">km</span></div>
      <div class="form-row"><label>Custo</label><input id="f-cost" inputmode="decimal" placeholder="0,00"><span class="unit">R$</span></div>
      <div class="form-row"><label style="width:auto;flex:1">Registrar como serviço</label><input type="checkbox" id="f-as-service" checked></div>
    </div>
    ${m.repeatMonths || m.repeatKm ? `<div class="form-hint">🔁 Será criada a próxima ocorrência automaticamente (${m.repeatMonths ? `a cada ${m.repeatMonths} meses` : ""}${m.repeatMonths && m.repeatKm ? " / " : ""}${m.repeatKm ? `a cada ${fmtKm(m.repeatKm)}` : ""}).</div>` : ""}`;

  openModal("Concluir manutenção", body, () => {
    const date = fieldVal("f-date") || todayISO();
    const odoVal = num(fieldVal("f-odo")) || 0;
    const cost = num(fieldVal("f-cost")) || 0;
    m.doneAt = date;
    if (field("f-as-service").checked) {
      db.services.push({ id: uid(), vehicleId: m.vehicleId, date, type: "revisao", description: m.title, cost, odometer: odoVal, workshop: "" });
    } else if (odoVal) {
      db.odometers.push({ id: uid(), vehicleId: m.vehicleId, date, value: odoVal, source: "manual" });
    }
    // repetição: cria próxima ocorrência
    if (m.repeatMonths || m.repeatKm) {
      const next = {
        id: uid(), vehicleId: m.vehicleId, title: m.title, notes: m.notes,
        dueDate: m.repeatMonths ? addMonths(date, m.repeatMonths) : "",
        dueKm: m.repeatKm ? (odoVal || currentOdometer(m.vehicleId) || m.dueKm || 0) + m.repeatKm : 0,
        repeatMonths: m.repeatMonths, repeatKm: m.repeatKm, doneAt: "", lastNotified: "",
      };
      db.maintenances.push(next);
    }
    save();
    toast("Manutenção concluída ✅");
    return true;
  });
}

/* ---------------- Add menu ---------------- */

function openAddMenu() {
  const body = `
    <div class="form-group">
      <button class="list-row" data-add="fueling"><div class="row-icon" style="background:var(--teal-soft)">⛽</div><div class="row-main"><div class="row-title">Abastecimento</div><div class="row-sub">Litros, valor e odômetro</div></div></button>
      <button class="list-row" data-add="expense"><div class="row-icon" style="background:var(--purple-soft)">💸</div><div class="row-main"><div class="row-title">Gasto</div><div class="row-sub">IPVA, seguro, pedágio, multa…</div></div></button>
      <button class="list-row" data-add="service"><div class="row-icon" style="background:var(--orange-soft)">🔧</div><div class="row-main"><div class="row-title">Serviço realizado</div><div class="row-sub">Troca de óleo, freios, revisão…</div></div></button>
      <button class="list-row" data-add="odometer"><div class="row-icon" style="background:var(--tint-soft)">🧭</div><div class="row-main"><div class="row-title">Leitura de odômetro</div><div class="row-sub">Atualiza a média de km/dia</div></div></button>
      <button class="list-row" data-add="maintenance"><div class="row-icon" style="background:var(--green-soft)">📅</div><div class="row-main"><div class="row-title">Programar manutenção</div><div class="row-sub">Por data ou quilometragem</div></div></button>
      <button class="list-row" data-add="vehicle"><div class="row-icon" style="background:var(--fill)">🚗</div><div class="row-main"><div class="row-title">Veículo</div><div class="row-sub">Adicionar novo veículo</div></div></button>
    </div>`;
  openModal("Adicionar", body, null);
  document.getElementById("modal-save").style.visibility = "hidden";
  document.querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", () => {
      const kind = b.dataset.add;
      closeModal();
      document.getElementById("modal-save").style.visibility = "";
      if (kind === "fueling") openFuelingForm();
      else if (kind === "expense") openExpenseForm();
      else if (kind === "service") openServiceForm();
      else if (kind === "odometer") openOdometerForm();
      else if (kind === "maintenance") openMaintenanceForm();
      else if (kind === "vehicle") openVehicleForm();
    }));
}

/* ---------------- Import / export ---------------- */

function exportJSON() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  downloadBlob(blob, `4drivers-backup-${todayISO()}.json`);
  toast("Backup exportado 📤");
}

function exportCSV() {
  const rows = [["data", "veiculo", "tipo", "categoria", "descricao", "valor", "odometro", "litros"]];
  const vname = (id) => vehicleName(id);
  for (const f of db.fuelings) rows.push([f.date, vname(f.vehicleId), "abastecimento", "combustivel", f.station || "", f.total, f.odometer || "", f.liters]);
  for (const e of db.expenses) rows.push([e.date, vname(e.vehicleId), "gasto", e.category, e.description || "", e.amount, "", ""]);
  for (const s of db.services) rows.push([s.date, vname(s.vehicleId), "servico", s.type, s.description || "", s.cost, s.odometer || "", ""]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `4drivers-gastos-${todayISO()}.csv`);
  toast("CSV exportado 📊");
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.vehicles)) throw new Error("formato inválido");
        if (!confirm("Importar backup? Os dados atuais serão SUBSTITUÍDOS.")) return;
        db = Object.assign(defaultData(), parsed, { settings: Object.assign(defaultData().settings, parsed.settings || {}) });
        save(); render();
        toast("Backup importado ✅");
      } catch (e) {
        toast("Arquivo inválido — use um backup do 4Drivers");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/* ---------------- Toast ---------------- */

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------------- Event binding ---------------- */

function bindViewEvents(root) {
  root.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const action = el.dataset.action;
      const id = el.dataset.id;
      switch (action) {
        case "add-vehicle": openVehicleForm(); break;
        case "edit-vehicle": openVehicleForm(db.vehicles.find((x) => x.id === id)); break;
        case "add-fueling": openFuelingForm(); break;
        case "edit-fueling": openFuelingForm(db.fuelings.find((x) => x.id === id)); break;
        case "add-expense": openExpenseForm(); break;
        case "edit-expense": openExpenseForm(db.expenses.find((x) => x.id === id)); break;
        case "add-service": openServiceForm(); break;
        case "edit-service": openServiceForm(db.services.find((x) => x.id === id)); break;
        case "add-odometer": openOdometerForm(); break;
        case "edit-odometer": openOdometerForm(db.odometers.find((x) => x.id === id)); break;
        case "add-maintenance": openMaintenanceForm(); break;
        case "edit-maintenance": openMaintenanceForm(db.maintenances.find((x) => x.id === id)); break;
        case "complete-maintenance": completeMaintenance(db.maintenances.find((x) => x.id === id)); break;
        case "records-tab": state.recordsTab = el.dataset.tab; render(); break;
        case "goto-records": navigate("records"); break;
        case "goto-maintenance": navigate("maintenance"); break;
        case "test-notification":
          showNotif("🔔 4Drivers", {
            body: "Notificações funcionando! Você será avisado sobre manutenções vencidas ou próximas.",
            icon: "icons/icon-192.png",
            badge: "icons/icon-192.png",
            tag: "4drivers-test",
          }).then((shown) => toast(shown ? "Notificação de teste enviada" : "Não foi possível exibir — verifique as permissões"));
          break;
        case "export-data": exportJSON(); break;
        case "import-data": importJSON(); break;
        case "export-csv": exportCSV(); break;
        case "wipe-data":
          if (confirm("Apagar TODOS os dados do 4Drivers neste dispositivo? Essa ação não pode ser desfeita.")) {
            if (confirm("Tem certeza? Considere exportar um backup antes.")) {
              db = defaultData(); save(); render(); toast("Dados apagados");
            }
          }
          break;
      }
    });
  });

  // ajustes: inputs com persistência imediata
  if (state.route === "settings") {
    field("set-notif")?.addEventListener("change", async (ev) => {
      if (ev.target.checked) {
        const ok = await requestNotifPermission();
        if (!ok) {
          ev.target.checked = false;
          render(); // atualiza a dica com a orientação de desbloqueio
          return;
        }
        db.settings.notifEnabled = true;
        save();
        toast("Notificações ativadas 🔔");
        checkAndNotify();
        render();
      } else {
        db.settings.notifEnabled = false;
        save();
        render();
      }
    });
    field("set-notif-days")?.addEventListener("change", (ev) => {
      const v = parseInt(ev.target.value, 10);
      if (v >= 1) { db.settings.notifDays = v; save(); updateAlertBadge(); }
    });
    field("set-notif-km")?.addEventListener("change", (ev) => {
      const v = parseInt(ev.target.value, 10);
      if (v >= 1) { db.settings.notifKm = v; save(); updateAlertBadge(); }
    });
  }
}

/* ---------------- Init ---------------- */

function init() {
  // navegação e filtro
  document.getElementById("vehicle-filter").addEventListener("change", (ev) => {
    state.vehicleFilter = ev.target.value;
    render();
  });
  document.getElementById("fab").addEventListener("click", openAddMenu);
  document.getElementById("btn-add-desktop").addEventListener("click", openAddMenu);
  document.getElementById("btn-notifications").addEventListener("click", () => navigate("maintenance"));

  // modal
  document.getElementById("modal-cancel").addEventListener("click", () => {
    document.getElementById("modal-save").style.visibility = "";
    closeModal();
  });
  document.getElementById("modal-save").addEventListener("click", () => {
    if (modalSaveHandler && modalSaveHandler() !== false) {
      closeModal();
      render();
    }
  });
  document.getElementById("modal-backdrop").addEventListener("click", (ev) => {
    if (ev.target.id === "modal-backdrop") {
      document.getElementById("modal-save").style.visibility = "";
      closeModal();
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !document.getElementById("modal-backdrop").hidden) closeModal();
  });

  render();

  // notificações: checa ao abrir e a cada 30 min com o app aberto
  checkAndNotify();
  setInterval(checkAndNotify, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { checkAndNotify(); updateAlertBadge(); }
  });

  // service worker (PWA offline)
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
