const DB_KEY = "nexum-club-v3";

const TARIFFS = [
  { id: "base", name: "Базовый тариф", price: 170, mins: 60, type: "hour" },
  { id: "p3", name: "Пакет 3 часа", price: 470, mins: 180, type: "pack" },
  { id: "p5", name: "Пакет 5 часов", price: 700, mins: 300, type: "pack" },
  { id: "night", name: "Пакет Ночь (22:00-8:00)", price: 810, mins: 600, type: "pack", showDuration: false },
  { id: "morning", name: "Пакет Утро (08:00-12:00)", price: 340, mins: 240, type: "pack", showDuration: false },
  { id: "day", name: "Пакет День (12:00-17:00)", price: 470, mins: 300, type: "pack", showDuration: false },
];

const ROLE_LABEL = {
  owner: "Главный админ",
  admin: "Админ",
  user: "Пользователь",
};

function now() {
  return Date.now();
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeUser(extra) {
  return {
    id: uid(),
    role: "user",
    name: "",
    email: "",
    pass: "",
    money: 0,
    bonus: 0,
    minutes: 0,
    status: "СТАНДАРТ",
    blocked: null,
    session: null,
    history: [],
    createdAt: now(),
    ...extra,
  };
}

function emptyDb() {
  const owner = makeUser({
    id: "owner-root",
    role: "owner",
    name: "Главный администратор",
    email: "owner@nexum.local",
    pass: "owner123",
    status: "OWNER",
  });
  const admin = makeUser({
    id: "admin-staff",
    role: "admin",
    name: "Администратор клуба",
    email: "admin@nexum.local",
    pass: "admin123",
    status: "АДМИН",
  });
  return {
    users: [owner, admin],
    sessionEmail: null,
    chats: {},
    ledger: [],
    notifications: [],
  };
}

function loadDb() {
  try {
    const raw = JSON.parse(localStorage.getItem(DB_KEY));
    if (!raw || !Array.isArray(raw.users)) return emptyDb();
    raw.ledger = raw.ledger || [];
    return raw;
  } catch {
    return emptyDb();
  }
}

function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

let db = loadDb();
if (!db.users.some((u) => u.role === "owner")) {
  db = emptyDb();
  saveDb(db);
}

function isStaff(u) {
  return u && (u.role === "admin" || u.role === "owner");
}

function isOwner(u) {
  return u && u.role === "owner";
}

function findUser(email) {
  return db.users.find((u) => u.email === String(email || "").toLowerCase());
}

function current() {
  return findUser(db.sessionEmail);
}

function login(email, pass) {
  const u = findUser(email);
  if (!u || u.pass !== pass) return { ok: false, error: "Неверный email или пароль" };
  db.sessionEmail = u.email;
  saveDb(db);
  return { ok: true, user: u };
}

function logout() {
  db.sessionEmail = null;
  saveDb(db);
}

function register({ name, email, pass }) {
  email = String(email).trim().toLowerCase();
  if (findUser(email)) return { ok: false, error: "Email уже зарегистрирован" };
  const u = makeUser({
    name: String(name || "").trim() || email.split("@")[0],
    email,
    pass,
  });
  db.users.push(u);
  db.sessionEmail = u.email;
  saveDb(db);
  return { ok: true, user: u };
}

function requireUser() {
  const u = current();
  if (!u) {
    location.href = "index.html";
    return null;
  }
  return u;
}

function patchUser(id, fn) {
  const u = db.users.find((x) => x.id === id);
  if (!u) return null;
  fn(u);
  saveDb(db);
  return u;
}

function pushLedger(entry) {
  db.ledger = db.ledger || [];
  db.ledger.unshift({ id: uid(), t: now(), ...entry });
  saveDb(db);
}

function isBlocked(u) {
  if (!u || !u.blocked) return false;
  if (u.blocked.until && u.blocked.until < now()) {
    u.blocked = null;
    saveDb(db);
    return false;
  }
  return true;
}

function topUpMoney(userId, amount) {
  amount = Math.round(Number(amount));
  if (amount <= 0) return;
  const bonus = Math.round(amount * 0.05);
  const u = patchUser(userId, (x) => {
    x.money += amount;
    x.bonus += bonus;
    x.history = x.history || [];
    x.history.unshift({ t: now(), text: `Пополнение ${amount} ₽ + кэшбэк ${bonus} ₽ бонусами` });
  });
  pushLedger({ type: "topup", amount, bonus, userId, note: "Пополнение основного счёта" });
  return u;
}

function addBonus(userId, amount, adminName) {
  amount = Math.round(Number(amount));
  pushLedger({ type: "gift_bonus", amount, userId, note: `Бонусы от ${adminName}` });
  return patchUser(userId, (u) => {
    u.bonus += amount;
    u.history = u.history || [];
    u.history.unshift({ t: now(), text: `${adminName} начислил бонусы: ${amount} ₽` });
  });
}

function addMinutes(userId, mins, adminName) {
  mins = Math.round(Number(mins));
  return patchUser(userId, (u) => {
    u.minutes += mins;
    u.history = u.history || [];
    u.history.unshift({ t: now(), text: `${adminName} добавил ${mins} мин` });
  });
}

function addMoney(userId, amount, adminName) {
  amount = Math.round(Number(amount));
  pushLedger({ type: "gift_money", amount, userId, note: `Реальные ₽ от ${adminName}` });
  return patchUser(userId, (u) => {
    u.money += amount;
    u.history = u.history || [];
    u.history.unshift({ t: now(), text: `${adminName} начислил на основной счёт ${amount} ₽` });
  });
}

function grantAdmin(userId, adminName) {
  return patchUser(userId, (u) => {
    if (u.role === "owner") return;
    u.role = "admin";
    u.status = "АДМИН";
    u.history = u.history || [];
    u.history.unshift({ t: now(), text: `${adminName} выдал роль администратора` });
  });
}

function revokeAdmin(userId, adminName) {
  return patchUser(userId, (u) => {
    if (u.role === "owner") return;
    u.role = "user";
    u.status = "СТАНДАРТ";
    u.history = u.history || [];
    u.history.unshift({ t: now(), text: `${adminName} снял роль администратора` });
  });
}

function blockUser(userId, { hours, reason, admin, forever }) {
  const target = db.users.find((x) => x.id === userId);
  if (!target || target.role === "owner") return null;
  if (target.role === "admin" && admin.role !== "owner") return null;
  const h = forever ? 24 * 365 * 10 : Number(hours);
  const until = now() + h * 3600 * 1000;
  return patchUser(userId, (u) => {
    u.blocked = {
      byId: admin.id,
      byName: admin.name,
      reason: String(reason || "").trim(),
      until,
      forever: !!forever,
      at: now(),
    };
    if (u.session) u.session = null;
  });
}

function unblockUser(userId) {
  return patchUser(userId, (u) => {
    u.blocked = null;
  });
}

function messages(userId) {
  db.chats = db.chats || {};
  return db.chats[userId] || [];
}

function sendChat({ userId, fromRole, fromName, text }) {
  db.chats = db.chats || {};
  db.chats[userId] = db.chats[userId] || [];
  db.chats[userId].push({ id: uid(), fromRole, fromName, text: String(text).trim(), t: now() });
  saveDb(db);
}

function spendForPack(u, tariff) {
  if (u.money + u.bonus < tariff.price) return false;

  let left = tariff.price;
  const fromMoney = Math.min(u.money, left);
  u.money -= fromMoney;
  left -= fromMoney;
  const fromBonus = Math.min(u.bonus, left);
  u.bonus -= fromBonus;
  left -= fromBonus;
  u.minutes += tariff.mins;
  u.history = u.history || [];
  u.history.unshift({ t: now(), text: `Оплачен тариф «${tariff.name}» за ${tariff.price} ₽` });
  pushLedger({
    type: "sale",
    amount: tariff.price,
    profit: fromMoney,
    bonusSpent: fromBonus,
    userId: u.id,
    note: tariff.name,
  });
  saveDb(db);
  return true;
}

function startSession(u, tariffId) {
  const tariff = TARIFFS.find((t) => t.id === tariffId) || TARIFFS[0];
  if (u.minutes <= 0) {
    if (!spendForPack(u, tariff)) return { ok: false, error: "Недостаточно средств на счетах" };
  }
  if (u.minutes <= 0) return { ok: false, error: "Нет минут для старта сессии" };
  u.session = {
    startedAt: now(),
    tariffId: tariff.id,
    tariffName: tariff.name,
    leftMs: u.minutes * 60 * 1000,
  };
  u.minutes = 0;
  saveDb(db);
  return { ok: true };
}

function purchaseSessionPackage(u, tariffId) {
  const tariff = TARIFFS.find((t) => t.id === tariffId);
  if (!tariff) return { ok: false, error: "Пакет не найден" };

  tickSession(u);
  const isExtension = Boolean(u.session);
  if (!spendForPack(u, tariff)) {
    return { ok: false, error: "Недостаточно средств на счетах" };
  }

  if (isExtension) {
    const currentTime = now();
    const elapsed = currentTime - u.session.startedAt;
    const remainMs = Math.max(0, u.session.leftMs - elapsed);
    u.session.startedAt = currentTime;
    u.session.leftMs = remainMs + u.minutes * 60 * 1000;
    u.session.tariffId = tariff.id;
    u.session.tariffName = tariff.name;
    u.minutes = 0;
    u.history = u.history || [];
    u.history.unshift({ t: currentTime, text: `Сессия продлена пакетом «${tariff.name}» на ${tariff.mins} мин` });
    saveDb(db);
    return { ok: true, mode: "extended", tariff };
  }

  const result = startSession(u, tariff.id);
  return result.ok ? { ...result, mode: "started", tariff } : result;
}
function tickSession(u) {
  if (!u || !u.session) return u;
  const elapsed = now() - u.session.startedAt;
  const remain = u.session.leftMs - elapsed;
  if (remain <= 0) {
    u.minutes = 0;
    u.session = null;
    u.history = u.history || [];
    u.history.unshift({ t: now(), text: "Сессия завершена" });
    saveDb(db);
  }
  return u;
}

function endSession(u) {
  tickSession(u);
  if (!u || !u.session) return { ok: false, error: "Активная сессия уже завершена" };

  const elapsed = now() - u.session.startedAt;
  const remainMs = Math.max(0, u.session.leftMs - elapsed);
  const remainingMins = Math.ceil(remainMs / 60000);
  u.session = null;
  u.minutes = 0;
  u.history = u.history || [];
  u.history.unshift({ t: now(), text: `Сессия завершена пользователем. Сгорело ${remainingMins} мин` });
  saveDb(db);
  return { ok: true, remainingMins };
}
function visibleUsers(viewer) {
  if (!viewer) return [];
  if (viewer.role === "owner") return db.users.filter((u) => u.id !== viewer.id);
  if (viewer.role === "admin") return db.users.filter((u) => u.role === "user");
  return [];
}

function analytics() {
  const ledger = db.ledger || [];
  const income = ledger.filter((x) => x.type === "topup").reduce((s, x) => s + (x.amount || 0), 0);
  const profit = ledger.filter((x) => x.type === "sale").reduce((s, x) => s + (x.profit || 0), 0);
  const sales = ledger.filter((x) => x.type === "sale").reduce((s, x) => s + (x.amount || 0), 0);
  const gifts = ledger.filter((x) => x.type === "gift_money").reduce((s, x) => s + (x.amount || 0), 0);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 86400000;
    const label = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    const dayIncome = ledger.filter((x) => x.type === "topup" && x.t >= start && x.t < end).reduce((s, x) => s + x.amount, 0);
    const dayProfit = ledger.filter((x) => x.type === "sale" && x.t >= start && x.t < end).reduce((s, x) => s + (x.profit || 0), 0);
    days.push({ label, income: dayIncome, profit: dayProfit });
  }
  return {
    income,
    profit,
    sales,
    gifts,
    users: db.users.filter((u) => u.role === "user").length,
    staff: db.users.filter((u) => u.role === "admin").length,
    days,
  };
}

window.Nexum = {
  TARIFFS,
  ROLE_LABEL,
  db,
  saveDb,
  loadDb,
  isStaff,
  isOwner,
  findUser,
  current,
  login,
  logout,
  register,
  requireUser,
  isBlocked,
  topUpMoney,
  addBonus,
  addMinutes,
  addMoney,
  grantAdmin,
  revokeAdmin,
  blockUser,
  unblockUser,
  messages,
  sendChat,
  startSession,
  purchaseSessionPackage,
  tickSession,
  endSession,
  visibleUsers,
  analytics,
  now,
};
