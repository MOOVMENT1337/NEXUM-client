const DB_KEY = "nexum-club-v2";

const TARIFFS = [
  { id: "base", name: "Базовый тариф", price: 170, mins: 60, type: "hour" },
  { id: "p3", name: "Пакет 3 часа", price: 470, mins: 180, type: "pack" },
  { id: "p5", name: "Пакет 5 часов", price: 700, mins: 300, type: "pack" },
  { id: "night", name: "Пакет Ночь (22:00-8:00)", price: 810, mins: 600, type: "pack" },
  { id: "morning", name: "Пакет Утро (08:00-12:00)", price: 340, mins: 240, type: "pack" },
  { id: "day", name: "Пакет День (12:00-17:00)", price: 470, mins: 300, type: "pack" },
];

function now() {
  return Date.now();
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyDb() {
  const admin = {
    id: "admin-root",
    role: "admin",
    name: "Администратор NEXUM",
    email: "admin@nexum.local",
    pass: "admin123",
    money: 0,
    bonus: 0,
    minutes: 0,
    status: "АДМИН",
    blocked: null,
    createdAt: now(),
  };
  return {
    users: [admin],
    sessionEmail: null,
    chats: {},
    notifications: [],
  };
}

function loadDb() {
  try {
    const raw = JSON.parse(localStorage.getItem(DB_KEY));
    if (!raw || !Array.isArray(raw.users)) return emptyDb();
    return raw;
  } catch {
    return emptyDb();
  }
}

function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

let db = loadDb();
if (!db.users.some((u) => u.role === "admin")) {
  db = emptyDb();
  saveDb(db);
}

function users() {
  return db.users.filter((u) => u.role === "user");
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
  const u = {
    id: uid(),
    role: "user",
    name: name.trim() || email.split("@")[0],
    email,
    pass,
    money: 0,
    bonus: 0,
    minutes: 0,
    status: "СТАНДАРТ",
    blocked: null,
    session: null,
    history: [],
    createdAt: now(),
  };
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
  return patchUser(userId, (u) => {
    u.money += amount;
    u.bonus += bonus;
    u.history = u.history || [];
    u.history.unshift({ t: now(), text: `Пополнение ${amount} ₽ + кэшбэк ${bonus} ₽ бонусами` });
  });
}

function addBonus(userId, amount, adminName) {
  amount = Math.round(Number(amount));
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

function blockUser(userId, { hours, reason, admin }) {
  const until = now() + Number(hours) * 3600 * 1000;
  return patchUser(userId, (u) => {
    u.blocked = {
      byId: admin.id,
      byName: admin.name,
      reason: reason.trim(),
      until,
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

function chatKey(userId) {
  return userId;
}

function messages(userId) {
  db.chats = db.chats || {};
  return db.chats[chatKey(userId)] || [];
}

function sendChat({ userId, fromRole, fromName, text }) {
  db.chats = db.chats || {};
  const key = chatKey(userId);
  db.chats[key] = db.chats[key] || [];
  db.chats[key].push({ id: uid(), fromRole, fromName, text: text.trim(), t: now() });
  saveDb(db);
}

function spendForPack(u, tariff) {
  let left = tariff.price;
  const fromMoney = Math.min(u.money, left);
  u.money -= fromMoney;
  left -= fromMoney;
  const fromBonus = Math.min(u.bonus, left);
  u.bonus -= fromBonus;
  left -= fromBonus;
  if (left > 0) return false;
  u.minutes += tariff.mins;
  u.history = u.history || [];
  u.history.unshift({ t: now(), text: `Оплачен тариф «${tariff.name}» за ${tariff.price} ₽` });
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
    return u;
  }
  return u;
}

function stopSession(u) {
  if (!u.session) return;
  const elapsed = now() - u.session.startedAt;
  const remainMs = Math.max(0, u.session.leftMs - elapsed);
  u.minutes = Math.floor(remainMs / 60000);
  u.session = null;
  u.history = u.history || [];
  u.history.unshift({ t: now(), text: "Сессия остановлена" });
  saveDb(db);
}

window.Nexum = {
  TARIFFS,
  db,
  saveDb,
  loadDb,
  users,
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
  blockUser,
  unblockUser,
  messages,
  sendChat,
  startSession,
  tickSession,
  stopSession,
  now,
};
