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
  const commonBlockDurations = [
    { value: "1", label: "1 час" },
    { value: "24", label: "1 день" },
    { value: "168", label: "7 дней" },
    { value: "720", label: "30 дней" },
  ];
  const ownerBlockDurations = [
    { value: "4320", label: "6 месяцев" },
    { value: "8760", label: "1 год" },
    { value: "forever", label: "Навсегда" },
  ];
  let actionDialogTrigger = null;

  $("adminHint").textContent = owner
    ? "Главный админ: клиенты, роли, настоящие ₽, блокировка навсегда и аналитика."
    : "Админ: минуты, бонусы, блокировка до 30 дней и чат. Настоящие ₽ недоступны.";

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

  function drawChat(forceBottom = false) {
    const u = selected();
    if (!u) return;
    const box = $("adminChatBox");
    const messages = Nexum.messages(u.id);
    const lastMessage = messages[messages.length - 1];
    const signature = `${u.id}:${messages.length}:${lastMessage?.id || ""}`;
    const initialRender = box.dataset.chatSignature === undefined;
    if (!forceBottom && box.dataset.chatSignature === signature) return;
    const previousScrollTop = box.scrollTop;
    const distanceFromBottom = box.scrollHeight - box.clientHeight - box.scrollTop;
    const wasNearBottom = distanceFromBottom <= 48;
    box.innerHTML = messages
      .map(
        (m) => `<div class="bubble ${m.fromRole === "user" ? "them" : "me"}"><b>${m.fromName}</b><br />${m.text}<div class="muted">${fmt(m.t)}</div></div>`
      )
      .join("");
    box.dataset.chatSignature = signature;
    if (forceBottom || initialRender || wasNearBottom) box.scrollTop = box.scrollHeight;
    else box.scrollTop = previousScrollTop;
  }

  function refreshSelectedUser() {
    const u = selected();
    if (!u) return;
    const blocked = Nexum.isBlocked(u);
    $("mName").textContent = u.name;
    $("mMail").textContent = `${u.email} · ${Nexum.ROLE_LABEL[u.role]} · ${Math.round(u.money)} ₽ · бонусы ${Math.round(u.bonus)} · ${u.minutes} мин`;
    $("ownerRoleRow").classList.toggle("hidden", !owner || u.role === "owner");
    $("unban").classList.toggle("hidden", !blocked);
    $("openBlockModal").textContent = blocked ? "Изменить блокировку" : "Заблокировать";
  }

  function openActionDialog(dialog, trigger, focusTarget) {
    actionDialogTrigger = trigger;
    $("userModal").setAttribute("aria-hidden", "true");
    dialog.classList.remove("hidden");
    requestAnimationFrame(() => focusTarget.focus());
  }

  function closeActionDialog(dialog, restoreFocus = true) {
    if (dialog.classList.contains("hidden")) return;
    dialog.classList.add("hidden");
    $("userModal").removeAttribute("aria-hidden");
    if (restoreFocus && actionDialogTrigger) actionDialogTrigger.focus();
    actionDialogTrigger = null;
  }

  function closeUserModal() {
    closeActionDialog($("rublesModal"), false);
    closeActionDialog($("adminBlockModal"), false);
    $("userModal").classList.add("hidden");
    $("userModal").removeAttribute("aria-hidden");
    clearInterval(timer);
  }

  function openUser(id) {
    selectedId = id;
    refreshSelectedUser();
    $("userModal").classList.remove("hidden");
    drawChat(true);
    clearInterval(timer);
    timer = setInterval(drawChat, 1500);
    requestAnimationFrame(() => $("openRublesModal").focus());
  }

  document.querySelector("#table").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) openUser(b.dataset.open);
  });

  $("closeUser").onclick = closeUserModal;

  $("minsForm").onsubmit = (e) => {
    e.preventDefault();
    Nexum.addMinutes(selectedId, new FormData(e.target).get("mins"), staff.name);
    toast("Минуты начислены");
    refreshSelectedUser();
    renderTable();
  };

  $("openRublesModal").onclick = (e) => {
    $("rublesForm").reset();
    $("rublesType").value = "bonus";
    $("rublesType").disabled = !owner;
    $("rublesTypeLabel").classList.toggle("locked-field", !owner);
    $("rublesTypeNote").textContent = owner
      ? "Главный администратор может выбрать любой тип рублей."
      : "Администратор может начислять только бонусные рубли.";
    $("rublesError").textContent = "";
    openActionDialog($("rublesModal"), e.currentTarget, owner ? $("rublesType") : $("rublesAmount"));
  };

  $("closeRublesModal").onclick = () => closeActionDialog($("rublesModal"));

  $("rublesForm").onsubmit = (e) => {
    e.preventDefault();
    const amount = Number($("rublesAmount").value);
    const type = owner ? $("rublesType").value : "bonus";
    if (!Number.isInteger(amount) || amount < 1) {
      $("rublesError").textContent = "Введите целое количество рублей больше нуля.";
      $("rublesAmount").focus();
      return;
    }
    const result = Nexum.creditRubles(selectedId, { type, amount, admin: staff });
    if (!result) {
      $("rublesError").textContent = "Не удалось начислить рубли. Проверьте выбранный тип и сумму.";
      return;
    }
    closeActionDialog($("rublesModal"));
    toast(type === "money" ? "Настоящие рубли начислены" : "Бонусные рубли начислены");
    refreshSelectedUser();
    renderTable();
  };

  $("makeAdmin").onclick = () => {
    if (!owner) return;
    Nexum.grantAdmin(selectedId, staff.name);
    toast("Роль админа выдана");
    refreshSelectedUser();
    renderTable();
  };
  $("dropAdmin").onclick = () => {
    if (!owner) return;
    Nexum.revokeAdmin(selectedId, staff.name);
    toast("Роль админа снята");
    refreshSelectedUser();
    renderTable();
  };

  $("openBlockModal").onclick = (e) => {
    const durations = owner
      ? [...commonBlockDurations, ...ownerBlockDurations]
      : commonBlockDurations;
    $("blockDuration").innerHTML = durations
      .map((duration) => `<option value="${duration.value}">${duration.label}</option>`)
      .join("");
    $("blockForm").reset();
    $("blockDuration").value = "24";
    $("blockError").textContent = "";
    openActionDialog($("adminBlockModal"), e.currentTarget, $("blockDuration"));
  };

  $("closeBlockModal").onclick = () => closeActionDialog($("adminBlockModal"));

  $("blockForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const duration = String(fd.get("duration"));
    const reason = String(fd.get("reason") || "").trim();
    if (!reason) {
      $("blockError").textContent = "Укажите причину блокировки.";
      $("blockReason").focus();
      return;
    }
    const res = Nexum.blockUser(selectedId, {
      hours: duration === "forever" ? undefined : Number(duration),
      forever: duration === "forever",
      reason,
      admin: staff,
    });
    if (!res) {
      $("blockError").textContent = "Нельзя заблокировать этого пользователя на выбранный срок.";
      return;
    }
    closeActionDialog($("adminBlockModal"));
    toast(duration === "forever" ? "Пользователь заблокирован навсегда" : "Пользователь заблокирован");
    refreshSelectedUser();
    renderTable();
  };

  $("unban").onclick = () => {
    Nexum.unblockUser(selectedId);
    toast("Блок снят");
    refreshSelectedUser();
    renderTable();
  };
  $("adminChatForm").onsubmit = (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get("text");
    Nexum.sendChat({ userId: selectedId, fromRole: staff.role, fromName: staff.name, text });
    e.target.reset();
    drawChat(true);
  };

  [$("rublesModal"), $("adminBlockModal")].forEach((dialog) => {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeActionDialog(dialog);
    });
  });

  $("userModal").addEventListener("click", (e) => {
    if (e.target === $("userModal")) closeUserModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("rublesModal").classList.contains("hidden")) closeActionDialog($("rublesModal"));
    else if (!$("adminBlockModal").classList.contains("hidden")) closeActionDialog($("adminBlockModal"));
    else if (!$("userModal").classList.contains("hidden")) closeUserModal();
  });

  setInterval(() => {
    if (!$("adminDrawer").classList.contains("hidden") && !$("adminUsersView").classList.contains("hidden")) {
      renderTable();
    }
  }, 3000);
}
