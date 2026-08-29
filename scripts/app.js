const KEY = "nexum-demo-v1";

const CLUBS = [
  {
    id: "shelepikha",
    name: "NEXUM Шелепиха",
    addr: "Шелепихинская наб., 34",
    metro: "Шелепиха",
    from: 150,
    img: "assets/club1.jpg",
    pcs: 18,
  },
  {
    id: "mitino",
    name: "NEXUM Митино",
    addr: "Муравская, 38к2",
    metro: "Пятницкое шоссе",
    from: 120,
    img: "assets/club2.jpg",
    pcs: 24,
  },
  {
    id: "kievskaya",
    name: "NEXUM Киевская",
    addr: "Киевская ул., 2",
    metro: "Киевская",
    from: 175,
    img: "assets/club3.jpg",
    pcs: 20,
  },
];

const PACKS = [
  { id: "h1", title: "1 час", mins: 60, price: 150, note: "Будни, стандарт", hit: false },
  { id: "d3", title: "День · 3 часа", mins: 180, price: 400, note: "08:00–16:00", hit: true },
  { id: "e3", title: "Вечер · 3 часа", mins: 180, price: 470, note: "16:00–21:00", hit: false },
  { id: "n10", title: "Ночь · 10 часов", mins: 600, price: 750, note: "22:00–08:00", hit: false },
];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { users: [], session: null };
  } catch {
    return { users: [], session: null };
  }
}
function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

let db = load();
let pendingPack = null;
let selectedPc = null;
let authMode = "login";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function currentUser() {
  if (!db.session) return null;
  return db.users.find((u) => u.email === db.session);
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 2600);
}

function go(view) {
  ["home", "clubs", "shop", "book", "cabinet"].forEach((v) => {
    const node = $(`#view-${v}`);
    if (node) node.classList.toggle("hidden", v !== view);
  });
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.go === view));
  if ((view === "book" || view === "cabinet") && !currentUser()) {
    openAuth();
    go("home");
  }
  if (view === "book") renderHall();
  if (view === "cabinet") renderCabinet();
}

function renderClubs(target) {
  target.innerHTML = CLUBS.map(
    (c) => `
    <article class="card club-card">
      <img src="${c.img}" alt="${c.name}" />
      <div class="card-body">
        <h3>${c.name}</h3>
        <p class="meta">${c.addr}<br />м. ${c.metro}</p>
        <p class="price">от ${c.from} ₽/ч</p>
        <button class="btn btn-ghost" style="margin-top:12px" data-go="book">Забронировать</button>
      </div>
    </article>`
  ).join("");
}

function renderPacks(target) {
  target.innerHTML = PACKS.map(
    (p) => `
    <article class="card pkg ${p.hit ? "hit" : ""}">
      ${p.hit ? '<div class="tag">Хит</div>' : '<div class="tag">Пакет</div>'}
      <h3>${p.title}</h3>
      <div class="sum">${p.price} ₽ <small>/ ${p.mins} мин</small></div>
      <p>${p.note}</p>
      <button class="btn btn-gold" data-buy="${p.id}">Купить</button>
    </article>`
  ).join("");
}

function renderAuthUI() {
  const u = currentUser();
  $("#btnAuth").classList.toggle("hidden", !!u);
  $("#btnOut").classList.toggle("hidden", !u);
  $("#balanceChip").classList.toggle("show", !!u);
  if (u) $("#balanceChip").textContent = `${u.minutes} мин`;
}

function openAuth() {
  $("#authModal").classList.remove("hidden");
  $("#authErr").textContent = "";
}
function closeAuth() {
  $("#authModal").classList.add("hidden");
}

function setTab(mode) {
  authMode = mode;
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === (mode === "login" ? "login" : "reg")));
  $(".only-reg").classList.toggle("hidden", mode !== "reg");
  $("#authTitle").textContent = mode === "login" ? "Войти в NEXUM" : "Создать аккаунт";
}

function handleAuth(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const pass = String(fd.get("pass") || "");
  const nick = String(fd.get("nick") || "").trim() || email.split("@")[0];
  const err = $("#authErr");
  err.textContent = "";

  if (authMode === "reg") {
    if (db.users.some((u) => u.email === email)) {
      err.textContent = "Такой email уже есть. Войди.";
      return;
    }
    db.users.push({
      email,
      pass,
      nick,
      minutes: 30,
      bonus: 150,
      history: [{ t: Date.now(), type: "bonus", text: "Стартовые 30 мин + 150 ₽ бонусов" }],
      bookings: [],
    });
    db.session = email;
    save(db);
    closeAuth();
    renderAuthUI();
    toast("Аккаунт создан. На баланс начислены 30 минут.");
    go("cabinet");
    return;
  }

  const u = db.users.find((x) => x.email === email && x.pass === pass);
  if (!u) {
    err.textContent = "Неверный email или пароль.";
    return;
  }
  db.session = email;
  save(db);
  closeAuth();
  renderAuthUI();
  toast(`С возвращением, ${u.nick}`);
  go("cabinet");
}

function logout() {
  db.session = null;
  save(db);
  renderAuthUI();
  go("home");
}

function startBuy(id) {
  const u = currentUser();
  if (!u) {
    openAuth();
    return;
  }
  pendingPack = PACKS.find((p) => p.id === id);
  if (!pendingPack) return;
  $("#payInfo").textContent = `${pendingPack.title} · ${pendingPack.mins} мин · ${pendingPack.price} ₽ (демо)`;
  $("#payModal").classList.remove("hidden");
}

function pay(e) {
  e.preventDefault();
  const u = currentUser();
  if (!u || !pendingPack) return;
  u.minutes += pendingPack.mins;
  u.history.unshift({
    t: Date.now(),
    type: "buy",
    text: `Пакет «${pendingPack.title}»: +${pendingPack.mins} мин (демо ${pendingPack.price} ₽)`,
  });
  save(db);
  pendingPack = null;
  $("#payModal").classList.add("hidden");
  e.target.reset();
  renderAuthUI();
  toast("Оплата прошла (демо). Минуты на балансе.");
  go("cabinet");
}

function seedBusy(clubId, date) {
  const seed = [...clubId, ...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  const busy = new Set();
  for (let i = 1; i <= 6; i++) busy.add(((seed * i) % 24) + 1);
  return busy;
}

function renderHall() {
  const sel = $("#bookClub");
  if (!sel.options.length) {
    sel.innerHTML = CLUBS.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  }
  const date = $("#bookDate");
  if (!date.value) {
    const d = new Date();
    date.value = d.toISOString().slice(0, 10);
  }
  const club = CLUBS.find((c) => c.id === sel.value) || CLUBS[0];
  const busy = seedBusy(club.id, date.value);
  selectedPc = null;
  $("#pcGrid").innerHTML = Array.from({ length: club.pcs }, (_, i) => {
    const n = i + 1;
    const isBusy = busy.has(n);
    return `<button type="button" class="pc ${isBusy ? "busy" : "free"}" data-pc="${n}" ${isBusy ? "disabled" : ""}>PC-${String(n).padStart(2, "0")}<br /><span class="meta">${isBusy ? "занят" : "свободен"}</span></button>`;
  }).join("");
}

function confirmBook() {
  const u = currentUser();
  if (!u) return openAuth();
  if (!selectedPc) return toast("Сначала выбери ПК");
  const dur = Number($("#bookDur").value);
  if (u.minutes < dur) {
    toast("Не хватает минут. Купи пакет.");
    go("shop");
    return;
  }
  const club = CLUBS.find((c) => c.id === $("#bookClub").value);
  u.minutes -= dur;
  const rec = {
    club: club.name,
    pc: selectedPc,
    date: $("#bookDate").value,
    time: $("#bookTime").value,
    dur,
  };
  u.bookings.unshift(rec);
  u.history.unshift({
    t: Date.now(),
    type: "book",
    text: `Бронь ${club.name} · PC-${String(selectedPc).padStart(2, "0")} · ${rec.date} ${rec.time} · −${dur} мин`,
  });
  save(db);
  renderAuthUI();
  toast("Место забронировано");
  go("cabinet");
}

function renderCabinet() {
  const u = currentUser();
  if (!u) return;
  $("#hello").textContent = u.nick;
  $("#statMin").textContent = u.minutes;
  $("#statBonus").textContent = `${u.bonus} ₽`;
  $("#statBooks").textContent = u.bookings.length;
  const hist = u.history.slice(0, 12);
  $("#history").innerHTML = hist.length
    ? hist
        .map(
          (h) =>
            `<div class="row"><span>${h.text}</span><span class="meta">${new Date(h.t).toLocaleString("ru-RU")}</span></div>`
        )
        .join("")
    : `<p class="meta">Пока пусто</p>`;
}

function bind() {
  document.addEventListener("click", (e) => {
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) {
      go(goBtn.dataset.go);
      return;
    }
    const buy = e.target.closest("[data-buy]");
    if (buy) startBuy(buy.dataset.buy);
    const pc = e.target.closest(".pc.free");
    if (pc) {
      selectedPc = Number(pc.dataset.pc);
      $$(".pc").forEach((p) => p.classList.toggle("sel", p === pc));
      $("#bookHint").textContent = `Выбран PC-${String(selectedPc).padStart(2, "0")}`;
    }
    const tab = e.target.closest("[data-tab]");
    if (tab) setTab(tab.dataset.tab === "login" ? "login" : "reg");
  });

  $("#btnAuth").onclick = openAuth;
  $("#btnOut").onclick = logout;
  $("#closeAuth").onclick = closeAuth;
  $("#authForm").onsubmit = handleAuth;
  $("#payForm").onsubmit = pay;
  $("#closePay").onclick = () => $("#payModal").classList.add("hidden");
  $("#confirmBook").onclick = confirmBook;
  $("#bookClub").onchange = renderHall;
  $("#bookDate").onchange = renderHall;
  $$(".brand").forEach((b) => (b.onclick = () => go("home")));
}

renderClubs($("#clubPreview"));
renderClubs($("#clubList"));
renderPacks($("#pkgPreview"));
renderPacks($("#pkgList"));
bind();
renderAuthUI();
go("home");
