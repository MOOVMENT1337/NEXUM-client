const me = Nexum.requireUser();
if (me && me.role !== "admin") location.href = "cabinet.html";

let selectedId = null;
let timer = null;

function $(id) {
  return document.getElementById(id);
}
function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 2200);
}
function fmt(ts) {
  return new Date(ts).toLocaleString("ru-RU");
}

document.getElementById("adminName").textContent = me.name;
document.getElementById("logout").onclick = () => {
  Nexum.logout();
  location.href = "index.html";
};

function renderTable() {
  const tb = document.querySelector("#table tbody");
  tb.innerHTML = Nexum.users()
    .map((u) => {
      const blocked = Nexum.isBlocked(u);
      return `<tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${Math.round(u.money)}</td>
        <td>${Math.round(u.bonus)}</td>
        <td>${u.minutes}</td>
        <td>${blocked ? '<span class="tag bad">блок</span>' : '<span class="tag ok">ок</span>'}</td>
        <td><button class="btn btn-ghost" data-open="${u.id}">Открыть</button></td>
      </tr>`;
    })
    .join("");
}

function selected() {
  return Nexum.db.users.find((u) => u.id === selectedId);
}

function drawChat() {
  const u = selected();
  if (!u) return;
  const box = $("chatBox");
  box.innerHTML = Nexum.messages(u.id)
    .map(
      (m) => `<div class="bubble ${m.fromRole === "admin" ? "me" : "them"}"><b>${m.fromName}</b><br />${m.text}<div class="muted">${fmt(m.t)}</div></div>`
    )
    .join("");
  box.scrollTop = box.scrollHeight;
}

function openUser(id) {
  selectedId = id;
  const u = selected();
  $("mName").textContent = u.name;
  $("mMail").textContent = u.email;
  $("userModal").classList.remove("hidden");
  drawChat();
  clearInterval(timer);
  timer = setInterval(drawChat, 1500);
}

document.querySelector("#table").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (b) openUser(b.dataset.open);
});

$("closeUser").onclick = () => {
  $("userModal").classList.add("hidden");
  clearInterval(timer);
};

$("minsForm").onsubmit = (e) => {
  e.preventDefault();
  const mins = new FormData(e.target).get("mins");
  Nexum.addMinutes(selectedId, mins, me.name);
  toast("Минуты начислены");
  renderTable();
};
$("bonusForm").onsubmit = (e) => {
  e.preventDefault();
  const bonus = new FormData(e.target).get("bonus");
  Nexum.addBonus(selectedId, bonus, me.name);
  toast("Бонусы начислены");
  renderTable();
};
$("blockForm").onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  Nexum.blockUser(selectedId, {
    hours: fd.get("hours"),
    reason: fd.get("reason"),
    admin: me,
  });
  toast("Пользователь заблокирован");
  renderTable();
};
$("unban").onclick = () => {
  Nexum.unblockUser(selectedId);
  toast("Блок снят");
  renderTable();
};
$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const text = new FormData(e.target).get("text");
  Nexum.sendChat({ userId: selectedId, fromRole: "admin", fromName: me.name, text });
  e.target.reset();
  drawChat();
};

renderTable();
setInterval(renderTable, 3000);
