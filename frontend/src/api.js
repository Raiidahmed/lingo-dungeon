// Player data lives in localStorage so the game can be hosted as a static site.
// Each method mirrors the response shape of the old Flask route it replaced.
// The "token" kept under lingo_token is just the signed-in profile's key.
const PROFILES_KEY = 'lingo_profiles';
const VALID_THEMES = new Set(['crimson', 'violet', 'teal', 'amber', 'mint', 'sky']);

const getToken = () => localStorage.getItem('lingo_token');

function loadProfiles() {
  // Null prototype so names like "constructor" or "__proto__" are plain keys.
  const profiles = Object.create(null);
  try {
    return Object.assign(profiles, JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}'));
  } catch {
    return profiles;
  }
}

function saveProfiles(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function currentProfile(profiles) {
  const token = getToken();
  const profile = token ? profiles[token] : null;
  if (!profile) throw new Error('Unauthorized');
  return profile;
}

// Load the signed-in profile, let fn change it, and write it back.
function updateProfile(fn) {
  const profiles = loadProfiles();
  fn(currentProfile(profiles));
  saveProfiles(profiles);
  return { ok: true };
}

function toInt(value, fallback, min) {
  const n = Math.trunc(Number(value));
  return Math.max(min, Number.isFinite(n) ? n : fallback);
}

function publicUser(p) {
  return {
    id: p.id,
    username: p.username,
    accent_theme: p.accent_theme,
    word_bank: p.word_bank,
    levels_completed: p.levels_completed,
  };
}

const publicSave = (p) => ({ snapshot: p.save?.snapshot ?? null, status: p.save?.status ?? {} });

export const api = {
  login: async (username) => {
    const name = String(username ?? '').trim();
    if (!name || name.length > 24) throw new Error('Username must be 1-24 characters');
    const canonical = name.toUpperCase();
    const token = canonical.toLowerCase();
    const profiles = loadProfiles();
    if (!profiles[token]) {
      profiles[token] = {
        id: Object.keys(profiles).length + 1,
        username: canonical,
        accent_theme: 'crimson',
        levels_completed: [],
        word_bank: [],
        save: null,
        best: null,
      };
      saveProfiles(profiles);
    }
    const profile = profiles[token];
    return { token, user: publicUser(profile), save: publicSave(profile) };
  },

  logout: async () => ({ ok: true }),

  me: async () => {
    const profile = currentProfile(loadProfiles());
    const user = publicUser(profile);
    return { user, word_bank: user.word_bank, save: publicSave(profile) };
  },

  // Only the profile's best run is kept; nothing displays it since the leaderboard was removed.
  submitScore: async (level, score, time_ms) => updateProfile(p => {
    const run = { level: toInt(level, 1, 1), score: toInt(score, 0, 0), time_ms: toInt(time_ms, 0, 0) };
    if (!p.best || run.score > p.best.score) p.best = { ...run, created_at: new Date().toISOString() };
  }),

  addWords: async (words, source) => updateProfile(p => {
    const added_at = new Date().toISOString();
    for (const w of words ?? []) {
      const word_es = String(w?.es ?? '').trim();
      const word_en = String(w?.en ?? '').trim();
      if (!word_es || !word_en) continue;
      // Newest first, one entry per word
      p.word_bank = [
        { word_es, word_en, source: String(source ?? '').slice(0, 48), added_at },
        ...p.word_bank.filter(x => x.word_es !== word_es),
      ];
    }
  }),

  setTheme: async (theme) => {
    const id = String(theme ?? 'crimson');
    if (!VALID_THEMES.has(id)) throw new Error('Invalid theme');
    return updateProfile(p => { p.accent_theme = id; });
  },

  saveGame: async (snapshot, status) => updateProfile(p => {
    p.save = { snapshot: snapshot ?? null, status: status ?? {} };
  }),

  markLevelComplete: async (level) => updateProfile(p => {
    const n = toInt(level, 1, 1);
    if (!p.levels_completed.includes(n)) {
      p.levels_completed = [...p.levels_completed, n].sort((a, b) => a - b);
    }
  }),

  // Debug: clear scores, saves, and level progress for every profile in this browser.
  wipeProgress: async () => {
    const profiles = loadProfiles();
    for (const p of Object.values(profiles)) {
      p.best = null;
      p.save = null;
      p.levels_completed = [];
    }
    saveProfiles(profiles);
    return { ok: true, message: 'Scores, saves, and level progress wiped.' };
  },
};
