const u0 = Nexum.requireUser();
if (u0 && Nexum.isStaff(u0)) {
  document.getElementById("railStaff").classList.add("show");
  if (Nexum.isOwner(u0)) document.getElementById("openStats").classList.remove("hidden");
}

let selectedTariff = "base";
let chatTimer = null;

function $(id) {
  return document.getElementById(id);
}

function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 2400);
}

function fmtMoney(n) {
  return `${Math.round(n)} ₽`;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString("ru-RU");
}

function user() {
  return Nexum.current();
}

function render() {
  const u = user();
  if (!u) return;
  Nexum.tickSession(u);
  $("userName").textContent = u.name;
  $("userMail").textContent = u.email;
  $("userStatus").textContent = u.status || "СТАНДАРТ";
  $("money").textContent = fmtMoney(u.money);
  $("bonus").textContent = `${Math.round(u.bonus)} ₽ бонусный счёт`;

  if (u.session) {
    const remainMs = Math.max(0, u.session.leftMs - (Date.now() - u.session.startedAt));
    const mins = Math.ceil(remainMs / 60000);
    $("leftMins").textContent = String(mins);
    $("leftUntil").textContent = fmtTime(Date.now() + remainMs);
    $("startLabel").textContent = "Стоп сессия";
  } else {
    $("leftMins").textContent = "Сессия не начата";
    $("leftUntil").textContent = "Сессия не начата";
    $("startLabel").textContent = "Начать сессию";
  }

  $("tariffList").innerHTML = Nexum.TARIFFS.map(
    (t) => `<button class="tariff ${t.id === selectedTariff ? "on" : ""}" data-id="${t.id}">
      <span>${t.name}</span><b>${t.price} ₽</b>
    </button>`
  ).join("");

  if (Nexum.isBlocked(u)) showBlock(u);
  else $("blockModal").classList.add("hidden");
}

function showBlock(u) {
  const b = u.blocked;
  $("blockText").innerHTML = `
    <b>Администратор:</b> ${b.byName}<br />
    <b>Когда:</b> ${fmtTime(b.at)}<br />
    <b>До:</b> ${b.until ? fmtTime(b.until) : "бессрочно"}<br />
    <b>Причина:</b> ${b.reason}
  `;
  $("blockModal").classList.remove("hidden");
}

function info(title, body) {
  $("infoTitle").textContent = title;
  $("infoBody").textContent = body;
  $("infoModal").classList.remove("hidden");
}

function drawChat() {
  const u = user();
  const box = $("chatBox");
  box.innerHTML = Nexum.messages(u.id)
    .map(
      (m) => `<div class="bubble ${m.fromRole === "user" ? "me" : "them"}"><b>${m.fromName}</b><br />${m.text}<div class="muted">${fmtTime(m.t)}</div></div>`
    )
    .join("");
  box.scrollTop = box.scrollHeight;
}

function openChat() {
  $("chatModal").classList.remove("hidden");
  drawChat();
  clearInterval(chatTimer);
  chatTimer = setInterval(drawChat, 1500);
}

$("tariffList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-id]");
  if (!b) return;
  selectedTariff = b.dataset.id;
  render();
});

$("focusTariffs").onclick = () => $("tariffCard").scrollIntoView({ behavior: "smooth", block: "center" });
$("openChat").onclick = openChat;
$("closeChat").onclick = () => {
  $("chatModal").classList.add("hidden");
  clearInterval(chatTimer);
};
$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const u = user();
  const text = new FormData(e.target).get("text");
  Nexum.sendChat({ userId: u.id, fromRole: "user", fromName: u.name, text });
  e.target.reset();
  drawChat();
};

$("topMoney").onclick = () => {
  if (Nexum.isBlocked(user())) return;
  $("payModal").classList.remove("hidden");
};
$("closePay").onclick = () => $("payModal").classList.add("hidden");
$("payForm").onsubmit = (e) => {
  e.preventDefault();
  const amount = Number(new FormData(e.target).get("amount"));
  Nexum.topUpMoney(user().id, amount);
  $("payModal").classList.add("hidden");
  toast(`Зачислено ${amount} ₽ и ${Math.round(amount * 0.05)} ₽ бонусами`);
  render();
};
$("topBonusInfo").onclick = () =>
  info("Бонусный счёт", "Бонусы нельзя купить картой. 5% с каждого пополнения основного счёта падают сюда. Админ тоже может начислить бонусы.");

$("startSession").onclick = () => {
  const u = user();
  if (Nexum.isBlocked(u)) return;
  if (u.session) {
    Nexum.stopSession(u);
    toast("Сессия остановлена");
    render();
    return;
  }
  const res = Nexum.startSession(u, selectedTariff);
  if (!res.ok) return toast(res.error);
  toast("Сессия запущена");
  render();
};

$("logout").onclick = () => {
  Nexum.logout();
  location.href = "index.html";
};
$("blockOut").onclick = $("logout").onclick;
$("blockChat").onclick = () => {
  $("blockModal").classList.add("hidden");
  openChat();
};
$("toDesktop").onclick = () => info("Рабочий стол", "В демо оболочка клуба не сворачивается в Windows. Это кнопка как в клиенте LANGAME.");
$("pickGame").onclick = () => info("Выбрать игру", "Каталог игр появится после старта сессии. Сейчас это заглушка интерфейса.");
$("report").onclick = () => {
  openChat();
  const u = user();
  Nexum.sendChat({
    userId: u.id,
    fromRole: "user",
    fromName: u.name,
    text: "Сообщение о проблеме с ПК / сессией.",
  });
  drawChat();
};
$("closeInfo").onclick = () => $("infoModal").classList.add("hidden");

$("themeBtn").onclick = () => {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", cur);
  localStorage.setItem("nexum-theme", cur);
};
document.documentElement.setAttribute("data-theme", localStorage.getItem("nexum-theme") || "dark");

setInterval(render, 1000);
render();
