const staff = Nexum.current();
if (!staff || !Nexum.isStaff(staff)) {
  /* regular user — skip admin UI */
} else {
  let selectedId = null;
  let timer = null;

  const $ = (id) => document.getElementById(id);
  const toast = (t) => {
    const el = $("toast");
    el.textContent = t;
    el.style.display = "block";
    setTimeout(() => (el.style.display = "none"), 2200);
  };
  const fmt = (ts) => new Date(ts).toLocaleString("ru-RU");
  const owner = Nexum.isOwner(staff);

  $("adminHint").textContent = owner
    ? "Главный админ: клиенты, роли, реальные ₽, вечный бан и аналитика."
    : "Админ: минуты, бонусы, блок по часам и чат. Реальный баланс недоступен.";

  function renderTable() {
    const tb = document.querySelector("#table tbody");
    tb.innerHTML = Nexum.visibleUsers(staff)
      .map((u) => {
        const blocked = Nexum.isBlocked(u);
        const sess = u.session ? "идёт" : "нет";
        return `<tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${Nexum.ROLE_LABEL[u.role] || u.role}</td>
        <td>${Math.round(u.money)}</td>
        <td>${Math.round(u.bonus)}</td>
        <td>${u.minutes}</td>
        <td>${sess}</td>
        <td>${blocked ? '<span class="tag bad">блок</span>' : '<span class="tag ok">ок</span>'}</td>
        <td><button class="btn btn-ghost" data-open="${u.id}">Открыть</button></td>
      </tr>`;
      })
      .join("");
  }

  function renderStats() {
    const a = Nexum.analytics();
    $("stIncome").textContent = `${a.income} ₽`;
    $("stProfit").textContent = `${a.profit} ₽`;
    $("stSales").textContent = `${a.sales} ₽`;
    $("stPeople").textContent = `${a.users} / ${a.staff}`;
    const max = Math.max(1, ...a.days.flatMap((d) => [d.income, d.profit]));
    $("chart").innerHTML = a.days
      .map(
        (d) => `<div class="bar-col">
        <div class="bars">
          <div class="bar in" style="height:${Math.round((d.income / max) * 140)}px" title="Пришло ${d.income}"></div>
          <div class="bar pr" style="height:${Math.round((d.profit / max) * 140)}px" title="Прибыль ${d.profit}"></div>
        </div>
        <span class="muted">${d.label}</span>
      </div>`
      )
      .join("");
  }

  function showUsers() {
    $("adminUsersView").classList.remove("hidden");
    $("adminStatsView").classList.add("hidden");
    $("openAdmin").classList.add("on");
    $("openStats").classList.remove("on");
    $("adminDrawer").classList.remove("hidden");
    renderTable();
  }

  function showStats() {
    $("adminUsersView").classList.add("hidden");
    $("adminStatsView").classList.remove("hidden");
    $("openAdmin").classList.remove("on");
    $("openStats").classList.add("on");
    $("adminDrawer").classList.remove("hidden");
    renderStats();
  }

  $("openAdmin").onclick = showUsers;
  $("openStats").onclick = showStats;
  $("closeAdmin").onclick = () => {
    $("adminDrawer").classList.add("hidden");
    $("openAdmin").classList.remove("on");
    $("openStats").classList.remove("on");
  };

  function selected() {
    return Nexum.db.users.find((u) => u.id === selectedId);
  }

  function drawChat() {
    const u = selected();
    if (!u) return;
    const box = $("adminChatBox");
    box.innerHTML = Nexum.messages(u.id)
      .map(
        (m) => `<div class="bubble ${m.fromRole === "user" ? "them" : "me"}"><b>${m.fromName}</b><br />${m.text}<div class="muted">${fmt(m.t)}</div></div>`
      )
      .join("");
    box.scrollTop = box.scrollHeight;
  }

  function openUser(id) {
    selectedId = id;
    const u = selected();
    $("mName").textContent = u.name;
    $("mMail").textContent = `${u.email} · ${Nexum.ROLE_LABEL[u.role]} · ${Math.round(u.money)} ₽ · бонусы ${Math.round(u.bonus)} · ${u.minutes} мин`;
    $("moneyForm").classList.toggle("hidden", !owner);
    $("ownerRoleRow").classList.toggle("hidden", !owner || u.role === "owner");
    $("banForever").classList.toggle("hidden", !owner);
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
    Nexum.addMinutes(selectedId, new FormData(e.target).get("mins"), staff.name);
    toast("Минуты начислены");
    renderTable();
  };
  $("bonusForm").onsubmit = (e) => {
    e.preventDefault();
    Nexum.addBonus(selectedId, new FormData(e.target).get("bonus"), staff.name);
    toast("Бонусы начислены");
    renderTable();
  };
  $("moneyForm").onsubmit = (e) => {
    e.preventDefault();
    if (!owner) return;
    Nexum.addMoney(selectedId, new FormData(e.target).get("money"), staff.name);
    toast("Реальные рубли начислены");
    renderTable();
  };
  $("makeAdmin").onclick = () => {
    if (!owner) return;
    Nexum.grantAdmin(selectedId, staff.name);
    toast("Роль админа выдана");
    openUser(selectedId);
    renderTable();
  };
  $("dropAdmin").onclick = () => {
    if (!owner) return;
    Nexum.revokeAdmin(selectedId, staff.name);
    toast("Роль админа снята");
    openUser(selectedId);
    renderTable();
  };
  $("blockForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = Nexum.blockUser(selectedId, {
      hours: fd.get("hours"),
      reason: fd.get("reason"),
      admin: staff,
    });
    toast(res ? "Пользователь заблокирован" : "Нельзя заблокировать этого пользователя");
    renderTable();
  };
  $("banForever").onclick = () => {
    const reason = document.querySelector("#blockForm [name=reason]").value || "Блокировка главным админом";
    const res = Nexum.blockUser(selectedId, { forever: true, reason, admin: staff });
    toast(res ? "Бан на 10 лет" : "Нельзя заблокировать");
    renderTable();
  };
  $("unban").onclick = () => {
    Nexum.unblockUser(selectedId);
    toast("Блок снят");
    renderTable();
  };
  $("adminChatForm").onsubmit = (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get("text");
    Nexum.sendChat({ userId: selectedId, fromRole: staff.role, fromName: staff.name, text });
    e.target.reset();
    drawChat();
  };

  setInterval(() => {
    if (!$("adminDrawer").classList.contains("hidden") && !$("adminUsersView").classList.contains("hidden")) {
      renderTable();
    }
  }, 3000);
}
