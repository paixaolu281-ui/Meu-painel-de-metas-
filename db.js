/**
 * db.js — Camada única de acesso a dados do "Meu Painel de Metas".
 *
 * Todo o app fala com o localStorage através deste arquivo. Nenhum outro
 * módulo deve chamar localStorage diretamente — isso mantém a persistência
 * organizada e fácil de trocar (ex: por IndexedDB) no futuro.
 */

const DB = (() => {
  const STORAGE_KEY = "meu-painel-de-metas:v1";

  const DEFAULT_STATE = {
    version: 1,
    onboarded: false,
    settings: {
      theme: "dark", // 'dark' | 'light' | 'auto'
      currency: "BRL",
    },
    goals: [], // ver criarMeta() para o formato de cada meta
    unlockedAchievements: [], // [{ id, unlockedAt }]
    demoDataActive: false,
  };

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredCloneState(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      // merge raso para proteger contra versões antigas sem algum campo novo
      return {
        ...structuredCloneState(DEFAULT_STATE),
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      };
    } catch (err) {
      console.error("Falha ao ler dados salvos, iniciando estado novo.", err);
      return structuredCloneState(DEFAULT_STATE);
    }
  }

  function structuredCloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error("Falha ao salvar dados.", err);
      return false;
    }
  }

  let state = load();

  const listeners = new Set();
  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function persistAndNotify() {
    save(state);
    notify();
  }

  // ---------- Estado geral ----------

  function getState() {
    return state;
  }

  function setOnboarded(value) {
    state.onboarded = value;
    persistAndNotify();
  }

  function getSettings() {
    return state.settings;
  }

  function updateSettings(partial) {
    state.settings = { ...state.settings, ...partial };
    persistAndNotify();
  }

  // ---------- Metas ----------

  const CATEGORIES = [
    { id: "veiculo", label: "Veículo", icon: "🏍️" },
    { id: "casa", label: "Casa", icon: "🏠" },
    { id: "reserva", label: "Reserva", icon: "💰" },
    { id: "viagem", label: "Viagem", icon: "✈️" },
    { id: "eletronicos", label: "Eletrônicos", icon: "📱" },
    { id: "estudos", label: "Estudos", icon: "🎓" },
    { id: "pessoal", label: "Pessoal", icon: "❤️" },
    { id: "outros", label: "Outros", icon: "🎯" },
  ];

  const PRIORITIES = [
    { id: "alta", label: "Alta", icon: "🔴", order: 0 },
    { id: "media", label: "Média", icon: "🟡", order: 1 },
    { id: "baixa", label: "Baixa", icon: "🟢", order: 2 },
  ];

  function getGoals() {
    return state.goals;
  }

  function getGoal(id) {
    return state.goals.find((g) => g.id === id) || null;
  }

  function criarMeta({
    name,
    icon,
    category,
    priority,
    targetAmount,
    startAmount,
    deadline,
    description,
    isMain,
  }) {
    const goal = {
      id: uid("goal"),
      name: name.trim(),
      icon: icon || (CATEGORIES.find((c) => c.id === category) || {}).icon || "🎯",
      category: category || "outros",
      priority: priority || "media",
      targetAmount: Number(targetAmount) || 0,
      currentAmount: Number(startAmount) || 0,
      deadline: deadline || null,
      description: (description || "").trim(),
      createdAt: nowISO(),
      completedAt: null,
      isMain: Boolean(isMain),
      contributions:
        Number(startAmount) > 0
          ? [
              {
                id: uid("contrib"),
                amount: Number(startAmount),
                date: nowISO(),
                note: "Valor inicial",
              },
            ]
          : [],
    };

    if (goal.isMain) {
      state.goals.forEach((g) => (g.isMain = false));
    }

    state.goals.push(goal);
    checkCompletion(goal);
    persistAndNotify();
    return goal;
  }

  function atualizarMeta(id, partial) {
    const goal = getGoal(id);
    if (!goal) return null;

    if (partial.isMain) {
      state.goals.forEach((g) => (g.isMain = false));
    }

    Object.assign(goal, partial);
    if (partial.targetAmount !== undefined) goal.targetAmount = Number(partial.targetAmount) || 0;
    if (partial.currentAmount !== undefined) goal.currentAmount = Number(partial.currentAmount) || 0;

    checkCompletion(goal);
    persistAndNotify();
    return goal;
  }

  function excluirMeta(id) {
    state.goals = state.goals.filter((g) => g.id !== id);
    persistAndNotify();
  }

  function definirMetaPrincipal(id) {
    state.goals.forEach((g) => (g.isMain = g.id === id));
    persistAndNotify();
  }

  function adicionarAporte(goalId, { amount, date, note }) {
    const goal = getGoal(goalId);
    if (!goal) return null;
    const value = Number(amount);
    if (!value || value <= 0) return null;

    goal.contributions.push({
      id: uid("contrib"),
      amount: value,
      date: date || nowISO(),
      note: (note || "").trim(),
    });
    goal.currentAmount = round2(goal.currentAmount + value);

    checkCompletion(goal);
    persistAndNotify();
    return goal;
  }

  function checkCompletion(goal) {
    if (goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount && !goal.completedAt) {
      goal.completedAt = nowISO();
    } else if (goal.currentAmount < goal.targetAmount && goal.completedAt) {
      // usuário editou valores para baixo depois de concluída — reabre a meta
      goal.completedAt = null;
    }
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // ---------- Conquistas ----------

  const ACHIEVEMENT_DEFS = [
    { id: "first-100", icon: "🏅", label: "Primeiros R$ 100", desc: "Acumule R$ 100 no total." },
    { id: "first-500", icon: "🏅", label: "Primeiros R$ 500", desc: "Acumule R$ 500 no total." },
    { id: "first-1000", icon: "🏅", label: "Primeiros R$ 1.000", desc: "Acumule R$ 1.000 no total." },
    { id: "acc-5000", icon: "💎", label: "R$ 5.000 acumulados", desc: "Acumule R$ 5.000 no total." },
    { id: "acc-10000", icon: "💎", label: "R$ 10.000 acumulados", desc: "Acumule R$ 10.000 no total." },
    { id: "streak-7", icon: "🔥", label: "7 dias economizando", desc: "Registre aportes em 7 dias diferentes." },
    { id: "streak-30", icon: "🔥", label: "30 dias economizando", desc: "Registre aportes em 30 dias diferentes." },
    { id: "first-goal-done", icon: "🎯", label: "Primeira meta concluída", desc: "Conclua sua primeira meta." },
    { id: "goals-3", icon: "🏆", label: "3 metas concluídas", desc: "Conclua 3 metas." },
    { id: "goals-5", icon: "👑", label: "5 metas concluídas", desc: "Conclua 5 metas." },
  ];

  function getAllAchievements() {
    const unlockedMap = new Map(state.unlockedAchievements.map((a) => [a.id, a.unlockedAt]));
    return ACHIEVEMENT_DEFS.map((def) => ({
      ...def,
      unlocked: unlockedMap.has(def.id),
      unlockedAt: unlockedMap.get(def.id) || null,
    }));
  }

  function unlock(id) {
    if (state.unlockedAchievements.some((a) => a.id === id)) return false;
    state.unlockedAchievements.push({ id, unlockedAt: nowISO() });
    return true;
  }

  /** Reavalia todas as conquistas com base no estado atual. Retorna as recém-desbloqueadas. */
  function evaluateAchievements() {
    const totalAccumulated = state.goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const completedGoals = state.goals.filter((g) => g.completedAt);
    const contributionDays = new Set();
    state.goals.forEach((g) =>
      g.contributions.forEach((c) => contributionDays.add(c.date.slice(0, 10)))
    );

    const newlyUnlocked = [];
    const tryUnlock = (id, condition) => {
      if (condition && unlock(id)) {
        newlyUnlocked.push(ACHIEVEMENT_DEFS.find((d) => d.id === id));
      }
    };

    tryUnlock("first-100", totalAccumulated >= 100);
    tryUnlock("first-500", totalAccumulated >= 500);
    tryUnlock("first-1000", totalAccumulated >= 1000);
    tryUnlock("acc-5000", totalAccumulated >= 5000);
    tryUnlock("acc-10000", totalAccumulated >= 10000);
    tryUnlock("streak-7", contributionDays.size >= 7);
    tryUnlock("streak-30", contributionDays.size >= 30);
    tryUnlock("first-goal-done", completedGoals.length >= 1);
    tryUnlock("goals-3", completedGoals.length >= 3);
    tryUnlock("goals-5", completedGoals.length >= 5);

    if (newlyUnlocked.length) persistAndNotify();
    return newlyUnlocked;
  }

  // ---------- Dados de demonstração ----------

  function seedDemoData() {
    if (state.goals.length > 0) return;
    state.demoDataActive = true;

    const demo = [
      {
        name: "Minha Moto",
        icon: "🏍️",
        category: "veiculo",
        priority: "alta",
        targetAmount: 15000,
        startAmount: 6500,
        deadline: addDays(90),
        description: "Moto para o trabalho e lazer.",
        isMain: true,
      },
      {
        name: "Reserva Financeira",
        icon: "💰",
        category: "reserva",
        priority: "alta",
        targetAmount: 10000,
        startAmount: 4000,
        deadline: null,
        description: "Reserva de emergência equivalente a 6 meses.",
        isMain: false,
      },
      {
        name: "Viagem",
        icon: "✈️",
        category: "viagem",
        priority: "media",
        targetAmount: 5000,
        startAmount: 1500,
        deadline: addDays(180),
        description: "",
        isMain: false,
      },
    ];

    demo.forEach((d) => criarMeta(d));
    evaluateAchievements();
    persistAndNotify();
  }

  function addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function removeDemoData() {
    if (!state.demoDataActive) return;
    state.goals = [];
    state.unlockedAchievements = [];
    state.demoDataActive = false;
    persistAndNotify();
  }

  // ---------- Exportação / Importação / Reset ----------

  function exportData() {
    return JSON.stringify(state, null, 2);
  }

  function importData(json) {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.goals)) {
      throw new Error("Arquivo inválido: estrutura de metas não encontrada.");
    }
    state = {
      ...structuredCloneState(DEFAULT_STATE),
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
    };
    persistAndNotify();
  }

  function resetAll() {
    state = structuredCloneState(DEFAULT_STATE);
    persistAndNotify();
  }

  return {
    subscribe,
    getState,
    setOnboarded,
    getSettings,
    updateSettings,
    CATEGORIES,
    PRIORITIES,
    getGoals,
    getGoal,
    criarMeta,
    atualizarMeta,
    excluirMeta,
    definirMetaPrincipal,
    adicionarAporte,
    getAllAchievements,
    evaluateAchievements,
    seedDemoData,
    removeDemoData,
    exportData,
    importData,
    resetAll,
  };
})();
