const u0 = Nexum.requireUser();
if (u0 && Nexum.isStaff(u0)) {
  document.getElementById("railStaff").classList.add("show");
  if (Nexum.isOwner(u0)) document.getElementById("openStats").classList.remove("hidden");
}

let pendingTariffId = null;
let chatTimer = null;
let blockedChatOpen = false;
const CREDITED_TIME_ID = "credited";

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

function formatCount(value, forms) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${value} ${forms[2]}`;
  if (mod10 === 1) return `${value} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4) return `${value} ${forms[1]}`;
  return `${value} ${forms[2]}`;
}

function formatBlockDuration(block) {
  if (block.forever) return "НАВСЕГДА";
  const storedHours = Number(block.durationHours);
  const elapsedHours = Math.round((Number(block.until) - Number(block.at)) / 3600000);
  const hours = storedHours > 0
    ? storedHours
    : (Number.isFinite(elapsedHours) && elapsedHours > 0 ? elapsedHours : 1);
  const labels = {
    1: "1 час",
    24: "1 день",
    168: "7 дней",
    720: "30 дней",
    4320: "6 месяцев",
    8760: "1 год",
  };
  if (labels[hours]) return labels[hours];
  if (hours % 24 === 0) return formatCount(hours / 24, ["день", "дня", "дней"]);
  return formatCount(hours, ["час", "часа", "часов"]);
}

function sessionPackageOptions() {
  const u = user();
  const credited = Math.floor(Number(u?.minutes) || 0);
  const options = [...Nexum.TARIFFS];
  if (credited > 0) {
    options.unshift({
      id: CREDITED_TIME_ID,
      name: `Начисленное время (${credited} мин.)`,
      price: 0,
      mins: credited,
      isCredited: true,
    });
  }
  return options;
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
  $("bonus").textContent = `${Math.round(u.bonus)} ₽`;

  if (u.session) {
    const remainMs = Math.max(0, u.session.leftMs - (Date.now() - u.session.startedAt));
    const mins = Math.ceil(remainMs / 60000);
    $("leftMins").textContent = String(mins);
    $("leftUntil").textContent = fmtTime(Date.now() + remainMs);
    $("startLabel").textContent = "Продлить сессию";
    $("startSession").classList.add("is-active");
    $("sessionActionIcon").innerHTML = '<path d="M11 5a7 7 0 1 0 6.2 10.25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17 5v5h-5M12 8v4l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    $("logoutLabel").textContent = "Завершить сессию";
    $("logoutIcon").innerHTML = '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>';
    $("logout").classList.add("ends-session");
  } else {
    $("leftMins").textContent = "Сессия не начата";
    $("leftUntil").textContent = "Сессия не начата";
    $("startLabel").textContent = "Начать сессию";
    $("startSession").classList.remove("is-active");
    $("sessionActionIcon").innerHTML = '<path d="M8 6v12l12-6z"/>';
    $("logoutLabel").textContent = "Выйти из аккаунта";
    $("logoutIcon").innerHTML = '<path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2M3 12h11M11 8l4 4-4 4"/>';
    $("logout").classList.remove("ends-session");
    $("endSessionModal").classList.add("hidden");
  }

  $("tariffList").innerHTML = Nexum.TARIFFS.map(
    (t) => `<div class="tariff tariff-preview">
      <strong>${t.name}</strong><b>${t.price} ₽</b>
    </div>`
  ).join("");

  if (Nexum.isBlocked(u) && !blockedChatOpen) showBlock(u);
  else $("blockModal").classList.add("hidden");
}

function showBlock(u) {
  const b = u.blocked;
  $("blockText").innerHTML = `
    <b>Администратор:</b> ${b.byName}<br />
    <b>Когда:</b> ${fmtTime(b.at)}<br />
    <b>Срок блокировки:</b> ${formatBlockDuration(b)}<br />
    <b>Причина:</b> ${b.reason}
  `;
  $("blockModal").classList.remove("hidden");
}

function info(title, body) {
  $("infoTitle").textContent = title;
  $("infoBody").textContent = body;
  $("infoModal").classList.remove("hidden");
}

function drawChat(box, forceBottom = false) {
  const u = user();
  const messages = Nexum.messages(u.id);
  const lastMessage = messages[messages.length - 1];
  const signature = `${messages.length}:${lastMessage?.id || ""}`;
  const initialRender = box.dataset.chatSignature === undefined;
  if (!forceBottom && box.dataset.chatSignature === signature) return;
  const previousScrollTop = box.scrollTop;
  const distanceFromBottom = box.scrollHeight - box.clientHeight - box.scrollTop;
  const wasNearBottom = distanceFromBottom <= 48;
  box.innerHTML = messages
    .map(
      (m) => `<div class="bubble ${m.fromRole === "user" ? "me" : "them"}"><b>${m.fromName}</b><br />${m.text}<div class="muted">${fmtTime(m.t)}</div></div>`
    )
    .join("");
  box.dataset.chatSignature = signature;
  if (forceBottom || initialRender || wasNearBottom) box.scrollTop = box.scrollHeight;
  else box.scrollTop = previousScrollTop;
}

function drawRightChat(forceBottom = false) {
  drawChat($("rightChatBox"), forceBottom);
}

function drawBlockedChat(forceBottom = false) {
  drawChat($("chatBox"), forceBottom);
}

function startChatUpdates(draw) {
  clearInterval(chatTimer);
  draw();
  chatTimer = setInterval(draw, 1500);
}

function openBlockedChat() {
  blockedChatOpen = true;
  $("chatModal").classList.remove("hidden");
  startChatUpdates(drawBlockedChat);
}

function showRightPanel(panel) {
  const showChat = panel === "chat";
  $("tariffCard").classList.toggle("hidden", showChat);
  $("rightChatPanel").classList.toggle("hidden", !showChat);
  $("focusTariffs").classList.toggle("pill-red", !showChat);
  $("focusTariffs").classList.toggle("pill-ghost", showChat);
  $("openChat").classList.toggle("pill-red", showChat);
  $("openChat").classList.toggle("pill-ghost", !showChat);
  $("focusTariffs").setAttribute("aria-pressed", String(!showChat));
  $("openChat").setAttribute("aria-pressed", String(showChat));
  clearInterval(chatTimer);
  if (showChat) startChatUpdates(drawRightChat);
}

function renderSessionPackages() {
  $("sessionPackageList").innerHTML = sessionPackageOptions().map(
    (t) => `<button class="package-option ${t.isCredited ? "credited-time" : ""}" type="button" data-package-id="${t.id}">
      <span class="package-option-top"><strong>${t.name}</strong><b>${t.isCredited ? "Без оплаты" : `${t.price} ₽`}</b></span>
    </button>`
  ).join("");
}

function closePackageFlow() {
  $("packageModal").classList.add("hidden");
  $("packageConfirmModal").classList.add("hidden");
  pendingTariffId = null;
}

function openPackagePicker() {
  const u = user();
  if (Nexum.isBlocked(u)) return;
  Nexum.tickSession(u);
  const extending = Boolean(u.session);
  $("packageModalTitle").textContent = extending ? "Продлить сессию" : "Начать сессию";
  $("packageModalHint").textContent = extending
    ? "Выберите пакет — его время добавится к текущей сессии."
    : "Выберите пакет для новой игровой сессии.";
  renderSessionPackages();
  $("packageConfirmModal").classList.add("hidden");
  $("packageModal").classList.remove("hidden");
}

function openPackageConfirmation(tariffId) {
  const tariff = sessionPackageOptions().find((t) => t.id === tariffId);
  if (!tariff) return;
  pendingTariffId = tariff.id;
  const extending = Boolean(user().session);
  $("packageConfirmTitle").textContent = extending ? "Подтверждение продления" : "Подтверждение пакета";
  if (tariff.isCredited) {
    $("packageConfirmHint").textContent = extending
      ? "Начисленные минуты будут добавлены к активной сессии без списания средств."
      : "Сессия запустится на начисленные минуты без списания средств.";
  } else {
    const credited = Math.floor(Number(user().minutes) || 0);
    $("packageConfirmHint").textContent = extending
      ? "После оплаты время пакета сразу добавится к активной сессии."
      : `После оплаты сессия запустится автоматически.${credited > 0 ? ` Также будут использованы начисленные минуты: ${credited}.` : ""}`;
  }
  $("confirmPackageName").textContent = tariff.name;
  $("confirmPackagePrice").textContent = `${tariff.price} ₽`;
  $("confirmPackagePurchase").textContent = tariff.isCredited
    ? (extending ? "Использовать и продлить" : "Использовать и начать")
    : (extending ? "Оплатить и продлить" : "Оплатить и начать");
  $("packageModal").classList.add("hidden");
  $("packageConfirmModal").classList.remove("hidden");
}

$("sessionPackageList").addEventListener("click", (e) => {
  const option = e.target.closest("[data-package-id]");
  if (option) openPackageConfirmation(option.dataset.packageId);
});

$("closePackages").onclick = closePackageFlow;
$("cancelPackagePurchase").onclick = closePackageFlow;
$("backToPackages").onclick = () => {
  pendingTariffId = null;
  openPackagePicker();
};
$("confirmPackagePurchase").onclick = () => {
  if (!pendingTariffId) return;
  const result = pendingTariffId === CREDITED_TIME_ID
    ? Nexum.useCreditedMinutes(user())
    : Nexum.purchaseSessionPackage(user(), pendingTariffId);
  if (!result.ok) {
    toast(result.error);
    render();
    return;
  }
  closePackageFlow();
  toast(result.mode === "extended" ? "Сессия продлена" : "Сессия запущена");
  render();
};

[$("packageModal"), $("packageConfirmModal")].forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closePackageFlow();
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (!$("packageModal").classList.contains("hidden") || !$("packageConfirmModal").classList.contains("hidden"))) {
    closePackageFlow();
  }
});

$("focusTariffs").onclick = () => showRightPanel("tariffs");
$("openChat").onclick = () => showRightPanel("chat");
$("closeChat").onclick = () => {
  blockedChatOpen = false;
  $("chatModal").classList.add("hidden");
  clearInterval(chatTimer);
  render();
};
$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const u = user();
  const text = new FormData(e.target).get("text");
  Nexum.sendChat({ userId: u.id, fromRole: "user", fromName: u.name, text });
  e.target.reset();
  drawBlockedChat(true);
};
$("rightChatForm").onsubmit = (e) => {
  e.preventDefault();
  const u = user();
  const text = new FormData(e.target).get("text");
  Nexum.sendChat({ userId: u.id, fromRole: "user", fromName: u.name, text });
  e.target.reset();
  drawRightChat(true);
};

$("topMoney").onclick = () => {
  if (Nexum.isBlocked(user())) return;
  $("payForm").reset();
  $("topUpError").textContent = "";
  $("topUpCardError").textContent = "";
  document.querySelectorAll("[data-topup-amount]").forEach((button) => button.classList.remove("is-selected"));
  $("payModal").classList.remove("hidden");
  $("topUpAmount").focus();
};
$("closePay").onclick = () => $("payModal").classList.add("hidden");

function syncTopUpPresets() {
  const amount = Number($("topUpAmount").value);
  document.querySelectorAll("[data-topup-amount]").forEach((button) => {
    button.classList.toggle("is-selected", Number(button.dataset.topupAmount) === amount);
  });
}

$("topUpAmount").addEventListener("input", () => {
  $("topUpError").textContent = "";
  syncTopUpPresets();
});
$("topUpCard").addEventListener("input", () => ($("topUpCardError").textContent = ""));

document.querySelectorAll("[data-topup-amount]").forEach((button) => {
  button.onclick = () => {
    $("topUpAmount").value = button.dataset.topupAmount;
    $("topUpError").textContent = "";
    syncTopUpPresets();
    $("topUpAmount").focus();
  };
});

$("payForm").onsubmit = (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const amountValue = String(data.get("amount") || "").trim();
  const amount = Number(amountValue);
  const card = String(data.get("card") || "").trim();
  $("topUpError").textContent = "";
  $("topUpCardError").textContent = "";
  if (!amountValue) {
    $("topUpError").textContent = "Введите сумму пополнения";
    $("topUpAmount").focus();
    return;
  }
  if (!Number.isInteger(amount)) {
    $("topUpError").textContent = "Введите сумму в целых рублях";
    $("topUpAmount").focus();
    return;
  }
  if (amount < Nexum.MIN_TOP_UP) {
    $("topUpError").textContent = `Минимальная сумма пополнения — ${Nexum.MIN_TOP_UP} ₽`;
    $("topUpAmount").focus();
    return;
  }
  if (!card) {
    $("topUpCardError").textContent = "Введите номер карты";
    $("topUpCard").focus();
    return;
  }
  const result = Nexum.topUpMoney(user().id, amount);
  if (!result) {
    $("topUpError").textContent = "Не удалось пополнить счёт. Проверьте введённую сумму.";
    return;
  }
  $("payModal").classList.add("hidden");
  toast(`Зачислено ${amount} ₽ и ${Math.round(amount * 0.05)} ₽ бонусами`);
  render();
};

$("startSession").onclick = openPackagePicker;

function closeEndSessionModal() {
  $("endSessionModal").classList.add("hidden");
}

function closeLogoutModal() {
  $("logoutModal").classList.add("hidden");
}

function openLogoutConfirmation() {
  $("logoutModal").classList.remove("hidden");
}

function openEndSessionConfirmation() {
  const u = user();
  Nexum.tickSession(u);
  if (!u.session) {
    render();
    openLogoutConfirmation();
    return;
  }
  const remainMs = Math.max(0, u.session.leftMs - (Date.now() - u.session.startedAt));
  const remainingMins = Math.ceil(remainMs / 60000);
  $("endSessionWarning").textContent = `Вы точно хотите завершить сессию? Оставшиеся ${remainingMins} мин. сгорят без возможности восстановления.`;
  $("endSessionModal").classList.remove("hidden");
}

function performLogout() {
  Nexum.logout();
  location.href = "index.html";
}

$("logout").onclick = () => {
  const u = user();
  Nexum.tickSession(u);
  if (u.session) openEndSessionConfirmation();
  else openLogoutConfirmation();
};
$("confirmEndSession").onclick = () => {
  const result = Nexum.endSession(user());
  closeEndSessionModal();
  if (!result.ok) toast(result.error);
  else toast("Сессия завершена. Оставшиеся минуты сгорели.");
  render();
};
$("cancelEndSession").onclick = closeEndSessionModal;
$("confirmLogout").onclick = performLogout;
$("cancelLogout").onclick = closeLogoutModal;
$("blockOut").onclick = openLogoutConfirmation;

[$("endSessionModal"), $("logoutModal")].forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeEndSessionModal();
  closeLogoutModal();
});

$("blockChat").onclick = () => {
  $("blockModal").classList.add("hidden");
  openBlockedChat();
};
$("toDesktop").onclick = () => info("Рабочий стол", "В демо оболочка клуба не сворачивается в Windows. Это кнопка как в клиенте LANGAME.");
$("pickGame").onclick = () => info("Выбрать игру", "Каталог игр появится после старта сессии. Сейчас это заглушка интерфейса.");
$("report").onclick = () => {
  showRightPanel("chat");
  const u = user();
  Nexum.sendChat({
    userId: u.id,
    fromRole: "user",
    fromName: u.name,
    text: "Сообщение о проблеме с ПК / сессией.",
  });
  drawRightChat(true);
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
