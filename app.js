/**
 * app.js — Interface e lógica de aplicação do "Meu Painel de Metas".
 * Depende de DB (db.js) e Charts (charts.js), carregados antes deste arquivo.
 */

(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Utilitários
  // ---------------------------------------------------------------------

  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  function formatMoney(n) {
    return BRL.format(Number(n) || 0);
  }

  function formatDate(isoOrDateStr) {
    if (!isoOrDateStr) return "";
    const d = new Date(isoOrDateStr);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatDateShort(isoOrDateStr) {
    const d = new Date(isoOrDateStr);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  function daysRemaining(deadline) {
    if (!deadline) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(deadline + "T00:00:00");
    if (isNaN(d)) return null;
    return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  }

  function pct(current, target) {
    if (!target || target <= 0) return 0;
    return Math.min(999, (current / target) * 100);
  }

  function clampPct(p) {
    return Math.max(0, Math.min(100, p));
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }
  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  const CATEGORY_MAP = Object.fromEntries(DB.CATEGORIES.map((c) => [c.id, c]));
  const PRIORITY_MAP = Object.fromEntries(DB.PRIORITIES.map((p) => [p.id, p]));

  const PALETTE = ["#6C5CE7", "#14B8A6", "#F5A524", "#EF4444", "#3B82F6", "#EC4899", "#22C55E", "#A855F7"];
  function colorForIndex(i) {
    return PALETTE[i % PALETTE.length];
  }

  // ---------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------

  function toast(message, type = "info") {
    const container = qs("#toast-container");
    const node = el(`<div class="toast ${type}"><span>${iconForToast(type)}</span><span>${message}</span></div>`);
    container.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transition = "opacity 0.2s ease";
      setTimeout(() => node.remove(), 220);
    }, 2600);
  }

  function iconForToast(type) {
    if (type === "success") return "✅";
    if (type === "error") return "⚠️";
    return "ℹ️";
  }

  // ---------------------------------------------------------------------
  // Confetti (celebração de meta concluída)
  // ---------------------------------------------------------------------

  function launchConfetti() {
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    document.body.appendChild(layer);
    const colors = PALETTE;
    const count = 60;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = 2.2 + Math.random() * 1.6 + "s";
      piece.style.animationDelay = Math.random() * 0.4 + "s";
      piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      layer.appendChild(piece);
    }
    setTimeout(() => layer.remove(), 4200);
  }

  // ---------------------------------------------------------------------
  // Confirmação genérica
  // ---------------------------------------------------------------------

  function showConfirm({ title, message, confirmLabel = "Confirmar", danger = false, onConfirm }) {
    const overlay = qs("#confirm-overlay");
    qs("#confirm-title", overlay).textContent = title;
    qs("#confirm-message", overlay).textContent = message;
    const confirmBtn = qs("#confirm-ok", overlay);
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = "btn " + (danger ? "btn-danger" : "btn-primary");
    overlay.classList.add("active");

    const cleanup = () => {
      overlay.classList.remove("active");
      confirmBtn.removeEventListener("click", onOk);
      qs("#confirm-cancel", overlay).removeEventListener("click", onCancel);
    };
    const onOk = () => {
      cleanup();
      onConfirm && onConfirm();
    };
    const onCancel = () => cleanup();

    confirmBtn.addEventListener("click", onOk);
    qs("#confirm-cancel", overlay).addEventListener("click", onCancel);
  }

  // ---------------------------------------------------------------------
  // Tema
  // ---------------------------------------------------------------------

  function applyTheme() {
    const { theme } = DB.getSettings();
    let resolved = theme;
    if (theme === "auto") {
      resolved = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", resolved);
    const metaTheme = qs("meta[name=theme-color]");
    if (metaTheme) metaTheme.setAttribute("content", resolved === "light" ? "#F4F5F7" : "#0B0E13");
  }

  window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    if (DB.getSettings().theme === "auto") applyTheme();
  });

  // ---------------------------------------------------------------------
  // Roteamento entre telas
  // ---------------------------------------------------------------------

  const SCREENS = ["painel", "metas", "analises", "historico", "conquistas", "configuracoes"];
  let currentScreen = "painel";
  let goalsFilter = { search: "", sort: "prioridade" };

  function goToScreen(name) {
    if (!SCREENS.includes(name)) return;
    currentScreen = name;
    qsa(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${name}`));
    qsa(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    renderCurrentScreen();
  }

  function renderCurrentScreen() {
    if (currentScreen === "painel") renderPainel();
    if (currentScreen === "metas") renderMetas();
    if (currentScreen === "analises") renderAnalises();
    if (currentScreen === "historico") renderHistorico();
    if (currentScreen === "conquistas") renderConquistas();
    if (currentScreen === "configuracoes") renderConfiguracoes();
  }

  // ---------------------------------------------------------------------
  // Painel principal
  // ---------------------------------------------------------------------

  function computeSummary() {
    const goals = DB.getGoals();
    const totalMetas = goals.reduce((s, g) => s + g.targetAmount, 0);
    const totalConquistado = goals.reduce((s, g) => s + g.currentAmount, 0);
    const progressoGeral = totalMetas > 0 ? (totalConquistado / totalMetas) * 100 : 0;
    const concluidas = goals.filter((g) => g.completedAt).length;
    return { totalMetas, totalConquistado, progressoGeral, concluidas, total: goals.length };
  }

  function buildInsights() {
    const goals = DB.getGoals();
    const insights = [];
    if (!goals.length) return insights;

    const main = goals.find((g) => g.isMain) || goals[0];
    if (main) {
      const p = clampPct(pct(main.currentAmount, main.targetAmount));
      insights.push(`🚀 Você já alcançou ${p.toFixed(0)}% da sua meta "${main.name}".`);
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    let monthTotal = 0;
    goals.forEach((g) =>
      g.contributions.forEach((c) => {
        if (new Date(c.date) >= startOfMonth) monthTotal += c.amount;
      })
    );
    if (monthTotal > 0) {
      insights.push(`💰 Você acumulou ${formatMoney(monthTotal)} este mês.`);
    }

    const nextGoal = goals
      .filter((g) => !g.completedAt)
      .sort((a, b) => pct(b.currentAmount, b.targetAmount) - pct(a.currentAmount, a.targetAmount))[0];
    if (nextGoal) {
      const remaining = Math.max(0, nextGoal.targetAmount - nextGoal.currentAmount);
      insights.push(`🎯 Faltam ${formatMoney(remaining)} para "${nextGoal.name}".`);
    }

    const overdueSoon = goals.find((g) => {
      if (g.completedAt || !g.deadline) return false;
      const dr = daysRemaining(g.deadline);
      return dr !== null && dr >= 0 && dr <= 15;
    });
    if (overdueSoon) {
      insights.push(`⏳ Faltam ${daysRemaining(overdueSoon.deadline)} dias para "${overdueSoon.name}".`);
    }

    const noContribThisMonth = goals.some((g) => {
      if (g.completedAt) return false;
      return !g.contributions.some((c) => new Date(c.date) >= startOfMonth);
    });
    if (noContribThisMonth) {
      insights.push("📌 Você ainda não registrou nenhum aporte este mês.");
    }

    return insights.slice(0, 4);
  }

  function renderPainel() {
    const container = qs("#screen-painel");
    const summary = computeSummary();
    const goals = DB.getGoals();
    const main = goals.find((g) => g.isMain) || goals.filter((g) => !g.completedAt)[0];

    let focusHtml = "";
    if (main) {
      const p = clampPct(pct(main.currentAmount, main.targetAmount));
      const remaining = Math.max(0, main.targetAmount - main.currentAmount);
      const dr = daysRemaining(main.deadline);
      let savingsHtml = "";
      if (dr !== null && dr > 0 && remaining > 0) {
        savingsHtml = `
          <div class="focus-savings">
            <div class="savings-chip"><div class="amount">${formatMoney(remaining / dr)}</div><div class="label">por dia</div></div>
            <div class="savings-chip"><div class="amount">${formatMoney((remaining / dr) * 7)}</div><div class="label">por semana</div></div>
            <div class="savings-chip"><div class="amount">${formatMoney((remaining / dr) * 30)}</div><div class="label">por mês</div></div>
          </div>`;
      }
      focusHtml = `
        <div class="focus-card">
          <div class="focus-eyebrow">🎯 Foco atual</div>
          <div class="focus-name">${main.icon} ${escapeHtml(main.name)}</div>
          <div class="focus-amounts"><strong>${formatMoney(main.currentAmount)}</strong> / ${formatMoney(main.targetAmount)}</div>
          <div class="progress-track"><div class="progress-fill ${p >= 100 ? "complete" : ""}" style="width:${p}%"></div></div>
          <div class="focus-meta-row">
            <span>${p.toFixed(1)}%</span>
            <span>${remaining > 0 ? `Faltam ${formatMoney(remaining)}` : "Meta concluída 🎉"}</span>
          </div>
          ${dr !== null ? `<div class="focus-meta-row"><span>${dr >= 0 ? `Faltam ${dr} dias` : "Prazo encerrado"}</span><span>${formatDate(main.deadline)}</span></div>` : ""}
          ${savingsHtml}
        </div>`;
    }

    const insights = buildInsights();
    const insightsHtml = insights.length
      ? `<div class="insights-list">${insights.map((i) => `<div class="insight-item">${i}</div>`).join("")}</div>`
      : "";

    container.innerHTML = `
      <div class="greeting">
        <h2>Olá 👋</h2>
        <p>Vamos alcançar seus objetivos.</p>
      </div>
      <div class="summary-grid">
        <div class="summary-card"><div class="label">Total das metas</div><div class="value">${formatMoney(summary.totalMetas)}</div></div>
        <div class="summary-card"><div class="label">Total conquistado</div><div class="value accent">${formatMoney(summary.totalConquistado)}</div></div>
        <div class="summary-card"><div class="label">Progresso geral</div><div class="value">${clampPct(summary.progressoGeral).toFixed(1)}%</div></div>
        <div class="summary-card"><div class="label">Metas concluídas</div><div class="value">${summary.concluidas} / ${summary.total}</div></div>
      </div>
      ${focusHtml}
      ${insights.length ? `<div class="section-title">Resumo inteligente</div>${insightsHtml}` : ""}
      ${
        !goals.length
          ? `<div class="empty-state">
              <div class="emoji">🎯</div>
              <h3>Nenhuma meta ainda</h3>
              <p>Crie sua primeira meta e comece a acompanhar seu progresso.</p>
              <button class="btn btn-primary" id="painel-nova-meta">+ Nova Meta</button>
            </div>`
          : ""
      }
    `;

    qs("#painel-nova-meta")?.addEventListener("click", () => openGoalForm());
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------------------------------------------------------------------
  // Tela de Metas
  // ---------------------------------------------------------------------

  function sortGoals(goals, sortBy) {
    const arr = [...goals];
    switch (sortBy) {
      case "prioridade":
        return arr.sort((a, b) => PRIORITY_MAP[a.priority].order - PRIORITY_MAP[b.priority].order);
      case "maior-progresso":
        return arr.sort((a, b) => pct(b.currentAmount, b.targetAmount) - pct(a.currentAmount, a.targetAmount));
      case "menor-progresso":
        return arr.sort((a, b) => pct(a.currentAmount, a.targetAmount) - pct(b.currentAmount, b.targetAmount));
      case "prazo":
        return arr.sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        });
      case "maior-valor":
        return arr.sort((a, b) => b.targetAmount - a.targetAmount);
      case "nome":
        return arr.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      default:
        return arr;
    }
  }

  function renderGoalCard(goal) {
    const p = clampPct(pct(goal.currentAmount, goal.targetAmount));
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    const dr = daysRemaining(goal.deadline);
    return `
      <div class="goal-card ${goal.completedAt ? "completed" : ""}" data-goal-id="${goal.id}">
        <div class="goal-card-header">
          <div class="goal-title">
            <span class="icon">${goal.icon}</span>
            <span class="name">${escapeHtml(goal.name)}</span>
          </div>
          <span class="priority-dot ${goal.priority}" title="Prioridade ${PRIORITY_MAP[goal.priority].label}"></span>
        </div>
        ${goal.completedAt ? `<span class="badge success">🎉 Concluída</span>` : goal.isMain ? `<span class="badge">🎯 Principal</span>` : ""}
        <div class="goal-amounts">
          <span class="current">${formatMoney(goal.currentAmount)}</span>
          <span class="target"> de ${formatMoney(goal.targetAmount)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill ${p >= 100 ? "complete" : ""}" style="width:${p}%"></div></div>
        <div class="goal-meta-line">
          <span>${p.toFixed(1)}%</span>
          <span>${remaining > 0 ? `Faltam ${formatMoney(remaining)}` : "Objetivo atingido"}</span>
        </div>
        ${goal.deadline ? `<div class="goal-meta-line"><span>Prazo: ${formatDate(goal.deadline)}</span><span>${dr !== null ? (dr >= 0 ? `${dr} dias` : "Encerrado") : ""}</span></div>` : ""}
        <div class="goal-actions">
          <button class="btn btn-secondary btn-sm" data-action="add" data-id="${goal.id}">+ Adicionar</button>
          <button class="btn btn-ghost btn-sm" data-action="detail" data-id="${goal.id}">Detalhes</button>
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${goal.id}">Editar</button>
        </div>
      </div>`;
  }

  function renderMetas() {
    const container = qs("#screen-metas");
    let goals = DB.getGoals().filter((g) => !g.completedAt);

    if (goalsFilter.search.trim()) {
      const q = goalsFilter.search.trim().toLowerCase();
      goals = goals.filter((g) => g.name.toLowerCase().includes(q));
    }
    goals = sortGoals(goals, goalsFilter.sort);

    container.innerHTML = `
      <div class="flex-between">
        <h2 style="font-size:20px;">Minhas Metas</h2>
      </div>
      <div class="toolbar-row mt-16">
        <input type="search" class="search-input" id="goal-search" placeholder="Pesquisar meta..." value="${escapeHtml(goalsFilter.search)}" aria-label="Pesquisar meta pelo nome" />
        <select class="select-input" id="goal-sort" aria-label="Ordenar metas">
          <option value="prioridade">Prioridade</option>
          <option value="maior-progresso">Maior progresso</option>
          <option value="menor-progresso">Menor progresso</option>
          <option value="prazo">Prazo mais próximo</option>
          <option value="maior-valor">Maior valor</option>
          <option value="nome">Nome</option>
        </select>
      </div>
      ${
        goals.length
          ? `<div class="goals-grid mt-16">${goals.map(renderGoalCard).join("")}</div>`
          : `<div class="empty-state">
              <div class="emoji">🔍</div>
              <h3>Nenhuma meta encontrada</h3>
              <p>Tente outra busca ou crie uma nova meta.</p>
            </div>`
      }
      <button class="btn btn-primary fab-new-goal" id="fab-nova-meta">+ Nova Meta</button>
    `;

    qs("#goal-sort").value = goalsFilter.sort;
    qs("#goal-search").addEventListener("input", (e) => {
      goalsFilter.search = e.target.value;
      renderMetas();
      // mantém o foco no campo de busca após re-renderizar
      const input = qs("#goal-search");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    qs("#goal-sort").addEventListener("change", (e) => {
      goalsFilter.sort = e.target.value;
      renderMetas();
    });
    qs("#fab-nova-meta").addEventListener("click", () => openGoalForm());
    bindGoalCardActions(container);
  }

  function bindGoalCardActions(container) {
    qsa("[data-action]", container).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === "add") openAddContribution(id);
        if (action === "detail") openGoalDetail(id);
        if (action === "edit") openGoalForm(id);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Formulário de Nova Meta / Editar Meta
  // ---------------------------------------------------------------------

  function openGoalForm(goalId = null) {
    const goal = goalId ? DB.getGoal(goalId) : null;
    const overlay = qs("#modal-overlay");
    const isEdit = Boolean(goal);

    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header">
          <h3>${isEdit ? "Editar Meta" : "Nova Meta"}</h3>
          <button class="close-btn" aria-label="Fechar" id="goal-form-close">&times;</button>
        </div>
        <form id="goal-form" novalidate>
          <div class="form-group">
            <label for="f-name">Nome da meta</label>
            <input class="form-control" id="f-name" name="name" placeholder="Ex: Comprar minha moto" value="${goal ? escapeHtml(goal.name) : ""}" required />
            <div class="error-text" data-error="name">Informe um nome para a meta.</div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="f-target">Valor objetivo</label>
              <input class="form-control" id="f-target" name="target" inputmode="decimal" placeholder="15000" value="${goal ? goal.targetAmount : ""}" required />
              <div class="error-text" data-error="target">Informe um valor objetivo maior que zero.</div>
            </div>
            <div class="form-group">
              <label for="f-current">${isEdit ? "Valor atual" : "Valor inicial"}</label>
              <input class="form-control" id="f-current" name="current" inputmode="decimal" placeholder="0" value="${goal ? goal.currentAmount : ""}" />
              <div class="error-text" data-error="current">O valor não pode ser negativo.</div>
            </div>
          </div>

          <div class="form-group">
            <label>Categoria</label>
            <div class="chip-group" id="f-category">
              ${DB.CATEGORIES.map(
                (c) => `<button type="button" class="chip-option ${goal?.category === c.id || (!goal && c.id === "outros") ? "selected" : ""}" data-value="${c.id}">${c.icon} ${c.label}</button>`
              ).join("")}
            </div>
          </div>

          <div class="form-group">
            <label>Prioridade</label>
            <div class="chip-group" id="f-priority">
              ${DB.PRIORITIES.map(
                (p) => `<button type="button" class="chip-option ${goal?.priority === p.id || (!goal && p.id === "media") ? "selected" : ""}" data-value="${p.id}">${p.icon} ${p.label}</button>`
              ).join("")}
            </div>
          </div>

          <div class="form-group">
            <label for="f-deadline">Data desejada para conclusão (opcional)</label>
            <input class="form-control" id="f-deadline" type="date" value="${goal?.deadline || ""}" />
            <div class="error-text" data-error="deadline">Escolha uma data futura.</div>
          </div>

          <div class="form-group">
            <label for="f-desc">Descrição / observação (opcional)</label>
            <textarea class="form-control" id="f-desc" placeholder="Detalhes sobre essa meta...">${goal ? escapeHtml(goal.description || "") : ""}</textarea>
          </div>

          <div class="form-group">
            <label class="chip-option" style="display:inline-flex;cursor:pointer;">
              <input type="checkbox" id="f-main" ${goal?.isMain ? "checked" : ""} style="margin-right:6px;" /> Definir como Meta Principal
            </label>
          </div>

          <button type="submit" class="btn btn-primary btn-block">${isEdit ? "Salvar alterações" : "Salvar meta"}</button>
          ${isEdit ? `<button type="button" class="btn btn-danger btn-block mt-8" id="goal-delete-btn">Excluir meta</button>` : ""}
        </form>
      </div>
    `;

    overlay.classList.add("active");
    qs("#goal-form-close").addEventListener("click", closeModal);

    qsa("#f-category .chip-option").forEach((chip) =>
      chip.addEventListener("click", () => {
        qsa("#f-category .chip-option").forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");
      })
    );
    qsa("#f-priority .chip-option").forEach((chip) =>
      chip.addEventListener("click", () => {
        qsa("#f-priority .chip-option").forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");
      })
    );

    if (isEdit) {
      qs("#goal-delete-btn").addEventListener("click", () => {
        showConfirm({
          title: "Excluir meta",
          message: `Tem certeza que deseja excluir "${goal.name}"? Essa ação não pode ser desfeita.`,
          confirmLabel: "Excluir",
          danger: true,
          onConfirm: () => {
            DB.excluirMeta(goal.id);
            closeModal();
            toast("Meta excluída.", "success");
            renderCurrentScreen();
          },
        });
      });
    }

    qs("#goal-form").addEventListener("submit", (e) => {
      e.preventDefault();
      submitGoalForm(goal);
    });
  }

  function clearFieldErrors(form) {
    qsa(".error-text", form).forEach((e) => e.classList.remove("visible"));
    qsa(".form-control", form).forEach((e) => e.classList.remove("invalid"));
  }

  function showFieldError(form, field) {
    qs(`[data-error="${field}"]`, form)?.classList.add("visible");
    qs(`#f-${field}`, form)?.classList.add("invalid");
  }

  function parseMoneyInput(str) {
    if (str === null || str === undefined || str === "") return 0;
    const normalized = String(str).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const n = parseFloat(normalized);
    return isNaN(n) ? NaN : n;
  }

  function submitGoalForm(existingGoal) {
    const form = qs("#goal-form");
    clearFieldErrors(form);

    const name = qs("#f-name", form).value.trim();
    const target = parseMoneyInput(qs("#f-target", form).value);
    const current = parseMoneyInput(qs("#f-current", form).value || "0");
    const category = qs("#f-category .chip-option.selected")?.dataset.value || "outros";
    const priority = qs("#f-priority .chip-option.selected")?.dataset.value || "media";
    const deadline = qs("#f-deadline", form).value || null;
    const description = qs("#f-desc", form).value;
    const isMain = qs("#f-main", form).checked;

    let valid = true;
    if (!name) {
      showFieldError(form, "name");
      valid = false;
    }
    if (!target || isNaN(target) || target <= 0) {
      showFieldError(form, "target");
      valid = false;
    }
    if (isNaN(current) || current < 0) {
      showFieldError(form, "current");
      valid = false;
    }
    if (deadline) {
      const d = new Date(deadline + "T00:00:00");
      if (isNaN(d)) {
        showFieldError(form, "deadline");
        valid = false;
      }
    }
    if (!valid) return;

    const proceed = () => {
      const icon = CATEGORY_MAP[category]?.icon || "🎯";
      if (existingGoal) {
        const wasIncomplete = !existingGoal.completedAt;
        DB.atualizarMeta(existingGoal.id, {
          name,
          targetAmount: target,
          currentAmount: current,
          category,
          priority,
          deadline,
          description,
          isMain,
          icon,
        });
        const updated = DB.getGoal(existingGoal.id);
        if (wasIncomplete && updated.completedAt) celebrateGoalCompletion(updated);
        toast("Meta atualizada.", "success");
      } else {
        DB.criarMeta({
          name,
          icon,
          category,
          priority,
          targetAmount: target,
          startAmount: current,
          deadline,
          description,
          isMain,
        });
        toast("Meta criada com sucesso.", "success");
      }
      runAchievementCheck();
      closeModal();
      renderCurrentScreen();
    };

    // valor absurdamente alto — pede confirmação
    if (target > 5000000 || current > 5000000) {
      showConfirm({
        title: "Confirmar valor",
        message: "O valor informado parece muito alto. Deseja continuar mesmo assim?",
        confirmLabel: "Continuar",
        onConfirm: proceed,
      });
      return;
    }

    proceed();
  }

  // ---------------------------------------------------------------------
  // Adicionar aporte
  // ---------------------------------------------------------------------

  function openAddContribution(goalId) {
    const goal = DB.getGoal(goalId);
    if (!goal) return;
    const overlay = qs("#modal-overlay");
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header">
          <h3>Adicionar valor · ${goal.icon} ${escapeHtml(goal.name)}</h3>
          <button class="close-btn" aria-label="Fechar" id="contrib-close">&times;</button>
        </div>
        <form id="contrib-form" novalidate>
          <div class="form-group">
            <label for="c-amount">Valor</label>
            <input class="form-control" id="c-amount" inputmode="decimal" placeholder="R$ 0,00" autofocus required />
            <div class="error-text" data-error="amount">Informe um valor maior que zero.</div>
          </div>
          <div class="form-group">
            <label for="c-date">Data</label>
            <input class="form-control" id="c-date" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          </div>
          <div class="form-group">
            <label for="c-note">Observação (opcional)</label>
            <input class="form-control" id="c-note" placeholder="Ex: Aporte mensal" />
          </div>
          <button type="submit" class="btn btn-primary btn-block">Adicionar</button>
        </form>
      </div>
    `;
    overlay.classList.add("active");
    qs("#contrib-close").addEventListener("click", closeModal);
    qs("#contrib-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      clearFieldErrors(form);
      const amount = parseMoneyInput(qs("#c-amount", form).value);
      const date = qs("#c-date", form).value || new Date().toISOString();
      const note = qs("#c-note", form).value;

      if (!amount || isNaN(amount) || amount <= 0) {
        showFieldError(form, "amount");
        return;
      }

      const doAdd = () => {
        const wasIncomplete = !goal.completedAt;
        DB.adicionarAporte(goal.id, { amount, date, note });
        const updated = DB.getGoal(goal.id);
        toast(`${formatMoney(amount)} adicionado a "${goal.name}".`, "success");
        if (wasIncomplete && updated.completedAt) {
          celebrateGoalCompletion(updated);
        }
        runAchievementCheck();
        closeModal();
        renderCurrentScreen();
      };

      const projected = goal.currentAmount + amount;
      if (goal.targetAmount > 0 && projected > goal.targetAmount && !goal.completedAt) {
        const surplus = projected - goal.targetAmount;
        showConfirm({
          title: "Meta será ultrapassada",
          message: `Esse valor ultrapassa o objetivo em ${formatMoney(surplus)}. Deseja considerar a meta como concluída?`,
          confirmLabel: "Sim, concluir meta",
          onConfirm: doAdd,
        });
        return;
      }

      if (amount > 1000000) {
        showConfirm({
          title: "Confirmar valor",
          message: "O valor informado parece muito alto. Deseja continuar mesmo assim?",
          confirmLabel: "Continuar",
          onConfirm: doAdd,
        });
        return;
      }

      doAdd();
    });
  }

  function celebrateGoalCompletion(goal) {
    launchConfetti();
    toast(`🎉 Meta concluída: ${goal.name}!`, "success");
  }

  // ---------------------------------------------------------------------
  // Detalhes da meta (histórico, estatísticas)
  // ---------------------------------------------------------------------

  function openGoalDetail(goalId) {
    const goal = DB.getGoal(goalId);
    if (!goal) return;
    const overlay = qs("#modal-overlay");
    const p = clampPct(pct(goal.currentAmount, goal.targetAmount));
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    const dr = daysRemaining(goal.deadline);

    const contributions = [...goal.contributions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalInvestido = contributions.reduce((s, c) => s + c.amount, 0);
    const maiorAporte = contributions.length ? Math.max(...contributions.map((c) => c.amount)) : 0;
    const media = contributions.length ? totalInvestido / contributions.length : 0;

    const grouped = groupByDate(contributions);

    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header">
          <h3>${goal.completedAt ? "🎉 Meta Concluída" : "Detalhes da Meta"}</h3>
          <button class="close-btn" aria-label="Fechar" id="detail-close">&times;</button>
        </div>

        <div class="detail-hero">
          <span class="icon">${goal.icon}</span>
          <div>${escapeHtml(goal.name)}</div>
          <div class="amounts">${formatMoney(goal.currentAmount)} <small>/ ${formatMoney(goal.targetAmount)}</small></div>
          <div class="progress-track mt-16"><div class="progress-fill ${p >= 100 ? "complete" : ""}" style="width:${p}%"></div></div>
          <div class="progress-label-row"><span>${p.toFixed(1)}%</span><span>${remaining > 0 ? `Faltam ${formatMoney(remaining)}` : "Concluída"}</span></div>
        </div>

        ${
          goal.deadline
            ? `<div class="stat-row">
                <div class="stat-box"><div class="value">${formatDate(goal.deadline)}</div><div class="label">Prazo</div></div>
                <div class="stat-box"><div class="value">${dr !== null ? (dr >= 0 ? dr : 0) : "-"}</div><div class="label">Dias restantes</div></div>
              </div>`
            : ""
        }

        <div class="stat-row">
          <div class="stat-box"><div class="value">${formatMoney(totalInvestido)}</div><div class="label">Total investido</div></div>
          <div class="stat-box"><div class="value">${contributions.length}</div><div class="label">Aportes</div></div>
          <div class="stat-box"><div class="value">${formatMoney(maiorAporte)}</div><div class="label">Maior aporte</div></div>
          <div class="stat-box"><div class="value">${formatMoney(media)}</div><div class="label">Média por aporte</div></div>
        </div>

        ${goal.description ? `<p class="text-secondary mt-16" style="font-size:13.5px;">${escapeHtml(goal.description)}</p>` : ""}

        <div class="section-title">Histórico</div>
        ${
          contributions.length
            ? grouped
                .map(
                  (group) => `
                <div class="date-group">${group.label}</div>
                ${group.items
                  .map(
                    (c) => `<div class="history-item">
                      <div>
                        <div class="history-amount">${formatMoney(c.amount)}</div>
                        ${c.note ? `<div class="history-note">${escapeHtml(c.note)}</div>` : ""}
                      </div>
                      <div class="history-meta">${formatDateShort(c.date)}</div>
                    </div>`
                  )
                  .join("")}
              `
                )
                .join("")
            : `<p class="text-tertiary" style="font-size:13px;">Nenhum aporte registrado ainda.</p>`
        }

        <div class="confirm-actions">
          <button class="btn btn-secondary" id="detail-edit">Editar</button>
          <button class="btn btn-primary" id="detail-add">+ Adicionar</button>
        </div>
        ${
          !goal.isMain && !goal.completedAt
            ? `<button class="btn btn-ghost btn-block mt-8" id="detail-set-main">Definir como meta principal</button>`
            : ""
        }
      </div>
    `;

    overlay.classList.add("active");
    qs("#detail-close").addEventListener("click", closeModal);
    qs("#detail-edit").addEventListener("click", () => openGoalForm(goal.id));
    qs("#detail-add").addEventListener("click", () => openAddContribution(goal.id));
    qs("#detail-set-main")?.addEventListener("click", () => {
      DB.definirMetaPrincipal(goal.id);
      toast("Meta definida como principal.", "success");
      closeModal();
      renderCurrentScreen();
    });
  }

  function groupByDate(contributions) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = new Map();
    contributions.forEach((c) => {
      const d = new Date(c.date);
      d.setHours(0, 0, 0, 0);
      let label;
      if (d.getTime() === today.getTime()) label = "Hoje";
      else if (d.getTime() === yesterday.getTime()) label = "Ontem";
      else label = formatDate(c.date);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(c);
    });
    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
  }

  function closeModal() {
    qs("#modal-overlay").classList.remove("active");
    qs("#modal-overlay").innerHTML = "";
  }

  // ---------------------------------------------------------------------
  // Tela de Análises (gráficos)
  // ---------------------------------------------------------------------

  function renderAnalises() {
    const container = qs("#screen-analises");
    const goals = DB.getGoals();

    container.innerHTML = `
      <h2 style="font-size:20px;margin-bottom:16px;">Análises</h2>

      <div class="card chart-card">
        <h3>Evolução do dinheiro acumulado</h3>
        <canvas id="chart-evolucao" height="200"></canvas>
      </div>

      <div class="card chart-card">
        <h3>Distribuição por meta</h3>
        <canvas id="chart-distribuicao" height="200"></canvas>
        <div class="donut-legend" id="legend-distribuicao"></div>
      </div>

      <div class="card chart-card">
        <h3>Progresso das metas</h3>
        <canvas id="chart-progresso"></canvas>
      </div>

      <div class="card chart-card">
        <h3>Aportes ao longo do tempo</h3>
        <canvas id="chart-aportes" height="200"></canvas>
      </div>
    `;

    if (!goals.length) {
      container.innerHTML += `<div class="empty-state"><div class="emoji">📊</div><h3>Sem dados ainda</h3><p>Cadastre metas e registre aportes para ver suas análises.</p></div>`;
    }

    // Evolução acumulada (todas as contribuições, cronológicas)
    const allContribs = [];
    goals.forEach((g) => g.contributions.forEach((c) => allContribs.push(c)));
    allContribs.sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    const evoPoints = allContribs.map((c) => {
      running += c.amount;
      return { date: c.date, value: running };
    });
    Charts.lineChart(qs("#chart-evolucao"), evoPoints, { color: getCssVar("--accent") });

    // Distribuição por meta
    const distSegments = goals
      .filter((g) => g.currentAmount > 0)
      .map((g, i) => ({ label: g.name, value: g.currentAmount, color: colorForIndex(i) }));
    Charts.donutChart(qs("#chart-distribuicao"), distSegments);
    qs("#legend-distribuicao").innerHTML = distSegments
      .map((s) => `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${escapeHtml(s.label)}</div>`)
      .join("");

    // Progresso das metas
    const progressItems = goals.map((g, i) => ({
      name: g.name,
      icon: g.icon,
      percent: clampPct(pct(g.currentAmount, g.targetAmount)),
      color: g.completedAt ? getCssVar("--accent-2") : colorForIndex(i),
    }));
    Charts.progressBars(qs("#chart-progresso"), progressItems);

    // Aportes por mês (últimos 6 meses)
    const months = lastNMonths(6);
    const monthTotals = months.map((m) => {
      const total = allContribs
        .filter((c) => {
          const d = new Date(c.date);
          return d.getFullYear() === m.year && d.getMonth() === m.month;
        })
        .reduce((s, c) => s + c.amount, 0);
      return { label: m.label, value: total };
    });
    Charts.barChart(qs("#chart-aportes"), monthTotals, { color: getCssVar("--accent-2") });
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function lastNMonths(n) {
    const arr = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      });
    }
    return arr;
  }

  // ---------------------------------------------------------------------
  // Tela de Histórico geral
  // ---------------------------------------------------------------------

  let historicoFilters = { goalId: "all", category: "all" };

  function renderHistorico() {
    const container = qs("#screen-historico");
    const goals = DB.getGoals();

    let entries = [];
    goals.forEach((g) => {
      g.contributions.forEach((c) => {
        entries.push({ ...c, goalId: g.id, goalName: g.name, goalIcon: g.icon, category: g.category });
      });
    });

    if (historicoFilters.goalId !== "all") entries = entries.filter((e) => e.goalId === historicoFilters.goalId);
    if (historicoFilters.category !== "all") entries = entries.filter((e) => e.category === historicoFilters.category);
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    const grouped = groupByDate(entries);

    container.innerHTML = `
      <h2 style="font-size:20px;">Histórico</h2>
      <div class="toolbar-row mt-16">
        <select class="select-input" id="hist-filter-goal">
          <option value="all">Todas as metas</option>
          ${goals.map((g) => `<option value="${g.id}">${g.icon} ${escapeHtml(g.name)}</option>`).join("")}
        </select>
        <select class="select-input" id="hist-filter-category">
          <option value="all">Todas as categorias</option>
          ${DB.CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join("")}
        </select>
      </div>
      <div class="card mt-16">
        ${
          entries.length
            ? grouped
                .map(
                  (group) => `
              <div class="date-group">${group.label}</div>
              ${group.items
                .map(
                  (e) => `<div class="history-item">
                  <div>
                    <div class="history-amount">${formatMoney(e.amount)} <span class="text-tertiary" style="font-weight:400;">— ${e.goalIcon} ${escapeHtml(e.goalName)}</span></div>
                    ${e.note ? `<div class="history-note">${escapeHtml(e.note)}</div>` : ""}
                  </div>
                  <div class="history-meta">${formatDateShort(e.date)}</div>
                </div>`
                )
                .join("")}
            `
                )
                .join("")
            : `<div class="empty-state"><div class="emoji">📜</div><h3>Nenhum aporte encontrado</h3><p>Ajuste os filtros ou registre um novo aporte em uma meta.</p></div>`
        }
      </div>
    `;

    qs("#hist-filter-goal").value = historicoFilters.goalId;
    qs("#hist-filter-category").value = historicoFilters.category;
    qs("#hist-filter-goal").addEventListener("change", (e) => {
      historicoFilters.goalId = e.target.value;
      renderHistorico();
    });
    qs("#hist-filter-category").addEventListener("change", (e) => {
      historicoFilters.category = e.target.value;
      renderHistorico();
    });
  }

  // ---------------------------------------------------------------------
  // Conquistas (badges + metas concluídas)
  // ---------------------------------------------------------------------

  function renderConquistas() {
    const container = qs("#screen-conquistas");
    const achievements = DB.getAllAchievements();
    const completedGoals = DB.getGoals().filter((g) => g.completedAt).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const totalConquistado = completedGoals.reduce((s, g) => s + g.targetAmount, 0);

    container.innerHTML = `
      <h2 style="font-size:20px;">Conquistas</h2>

      <div class="section-title">🏅 Badges</div>
      <div class="achievements-grid">
        ${achievements
          .map(
            (a) => `
          <div class="achievement-card ${a.unlocked ? "unlocked" : ""}">
            <span class="icon">${a.icon}</span>
            <div class="title">${a.label}</div>
            <div class="desc">${a.unlocked ? `Conquistado em ${formatDate(a.unlockedAt)}` : a.desc}</div>
          </div>`
          )
          .join("")}
      </div>

      <div class="section-title">🏆 Metas Concluídas</div>
      ${
        completedGoals.length
          ? `
          <div class="stat-row" style="grid-template-columns:1fr 1fr;">
            <div class="stat-box"><div class="value">${completedGoals.length}</div><div class="label">Metas concluídas</div></div>
            <div class="stat-box"><div class="value">${formatMoney(totalConquistado)}</div><div class="label">Valor total conquistado</div></div>
          </div>
          <div class="goals-grid mt-16">
            ${completedGoals
              .map(
                (g) => `
              <div class="goal-card completed">
                <div class="goal-title"><span class="icon">${g.icon}</span><span class="name">${escapeHtml(g.name)}</span></div>
                <div class="text-tertiary" style="font-size:12px;">Concluída em ${formatDate(g.completedAt)}</div>
                <div class="goal-amounts"><span class="current">${formatMoney(g.targetAmount)}</span></div>
              </div>`
              )
              .join("")}
          </div>`
          : `<div class="empty-state"><div class="emoji">🏆</div><h3>Nenhuma meta concluída ainda</h3><p>Continue economizando — sua primeira conquista está a caminho!</p></div>`
      }
    `;
  }

  function runAchievementCheck() {
    const newly = DB.evaluateAchievements();
    newly.forEach((a) => {
      toast(`${a.icon} Conquista desbloqueada: ${a.label}`, "success");
    });
  }

  // ---------------------------------------------------------------------
  // Configurações
  // ---------------------------------------------------------------------

  function renderConfiguracoes() {
    const container = qs("#screen-configuracoes");
    const settings = DB.getSettings();

    container.innerHTML = `
      <h2 style="font-size:20px;">Configurações</h2>

      <div class="settings-group mt-16">
        <div class="card">
          <div class="settings-row">
            <div>
              <div class="row-label">Tema</div>
              <div class="row-desc">Escolha a aparência do aplicativo</div>
            </div>
            <div class="theme-options" id="theme-options">
              <button data-value="dark" class="${settings.theme === "dark" ? "active" : ""}">Escuro</button>
              <button data-value="light" class="${settings.theme === "light" ? "active" : ""}">Claro</button>
              <button data-value="auto" class="${settings.theme === "auto" ? "active" : ""}">Automático</button>
            </div>
          </div>
          <div class="settings-row">
            <div>
              <div class="row-label">Moeda</div>
              <div class="row-desc">Formato de exibição dos valores</div>
            </div>
            <div class="text-secondary">R$ (Real brasileiro)</div>
          </div>
        </div>
      </div>

      <div class="section-title">Dados</div>
      <div class="card">
        <div class="settings-row">
          <div>
            <div class="row-label">Exportar meus dados</div>
            <div class="row-desc">Baixe um arquivo de backup em JSON</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-export">Exportar</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="row-label">Importar meus dados</div>
            <div class="row-desc">Restaure a partir de um arquivo de backup</div>
          </div>
          <label class="btn btn-secondary btn-sm" for="import-file" style="margin:0;">Importar</label>
          <input type="file" id="import-file" accept="application/json" class="visually-hidden" />
        </div>
        <div class="settings-row">
          <div>
            <div class="row-label">Apagar todos os dados</div>
            <div class="row-desc">Remove permanentemente todas as metas e o histórico</div>
          </div>
          <button class="btn btn-danger btn-sm" id="btn-reset">Apagar tudo</button>
        </div>
      </div>

      <div class="section-title">Sobre</div>
      <div class="card">
        <p class="text-secondary" style="font-size:13px;">Meu Painel de Metas — seus objetivos, sob controle. Todos os dados ficam salvos apenas neste dispositivo.</p>
      </div>
    `;

    qsa("#theme-options button").forEach((btn) => {
      btn.addEventListener("click", () => {
        DB.updateSettings({ theme: btn.dataset.value });
        applyTheme();
        renderConfiguracoes();
      });
    });

    qs("#btn-export").addEventListener("click", exportData);
    qs("#import-file").addEventListener("change", handleImportFile);
    qs("#btn-reset").addEventListener("click", () => {
      showConfirm({
        title: "Apagar todos os dados?",
        message: "Essa ação é irreversível. Todas as metas, aportes e conquistas serão apagados permanentemente.",
        confirmLabel: "Apagar",
        danger: true,
        onConfirm: () => {
          showConfirm({
            title: "Tem certeza absoluta?",
            message: "Confirme novamente para apagar todos os seus dados de uma vez por todas.",
            confirmLabel: "Sim, apagar tudo",
            danger: true,
            onConfirm: () => {
              DB.resetAll();
              toast("Todos os dados foram apagados.", "success");
              goToScreen("painel");
            },
          });
        },
      });
    });
  }

  function exportData() {
    const json = DB.exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `meu-painel-de-metas-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup exportado.", "success");
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      showConfirm({
        title: "Importar dados",
        message: "Isso substituirá todos os dados atuais pelos dados do arquivo selecionado. Deseja continuar?",
        confirmLabel: "Importar",
        onConfirm: () => {
          try {
            DB.importData(reader.result);
            toast("Dados importados com sucesso.", "success");
            applyTheme();
            goToScreen("painel");
          } catch (err) {
            console.error(err);
            toast("Não foi possível importar o arquivo.", "error");
          }
        },
      });
    };
    reader.onerror = () => toast("Erro ao ler o arquivo.", "error");
    reader.readAsText(file);
    e.target.value = "";
  }

  // ---------------------------------------------------------------------
  // Onboarding
  // ---------------------------------------------------------------------

  function maybeShowOnboarding() {
    const state = DB.getState();
    if (state.onboarded) return;
    const overlay = qs("#onboarding-overlay");
    overlay.classList.remove("hidden");
    qs("#onboarding-start").addEventListener("click", () => {
      DB.seedDemoData();
      DB.setOnboarded(true);
      overlay.classList.add("hidden");
      goToScreen("painel");
    });
    qs("#onboarding-empty").addEventListener("click", () => {
      DB.setOnboarded(true);
      overlay.classList.add("hidden");
      goToScreen("painel");
    });
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------

  function bindNav() {
    qsa(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => goToScreen(btn.dataset.screen));
    });
  }

  function bindGlobalModals() {
    qs("#modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal();
    });
    qs("#confirm-overlay").addEventListener("click", (e) => {
      if (e.target.id === "confirm-overlay") e.target.classList.remove("active");
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((err) => {
          console.warn("Falha ao registrar o Service Worker:", err);
        });
      });
    }
  }

  function init() {
    applyTheme();
    bindNav();
    bindGlobalModals();
    registerServiceWorker();
    DB.subscribe(() => {
      // mantém o tema e o conteúdo em sincronia sempre que os dados mudarem
      applyTheme();
    });
    goToScreen("painel");
    maybeShowOnboarding();
    runAchievementCheck();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
