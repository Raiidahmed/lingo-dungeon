import { useStore } from '../store.js';
import { getLevelCount, getLevelName } from '../engine/dungeon.js';

const LANGUAGES = [
  { id: 'ja', flag: '🇯🇵', name: 'JAPANESE',   native: '日本語'    },
  { id: 'es', flag: '🇪🇸', name: 'SPANISH',    native: 'Español'   },
];

export default function StatusPage() {
  const { user, save, setScreen, startGame, language, setLanguage } = useStore();
  const status = save?.status ?? {};
  const snapshot = save?.snapshot ?? null;
  const wordBank = user?.word_bank ?? [];
  const completed = user?.levels_completed ?? [];
  const levelCount = getLevelCount(language);
  const doneCount = completed.filter(k => k.startsWith(`${language}:`)).length;

  const currentLevel = status.levelIndex ?? 1;
  const hasResume = !!snapshot;

  return (
    <div className="page">
      <div className="page-title" style={{ fontSize: 14 }}>STATUS</div>
      <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 16px' }}
        onClick={() => setScreen('menu')}>← BACK</button>

      {/* Save recap */}
      <div className="card">
        <div className="card-title">CURRENT RUN</div>
        {hasResume ? (
          <>
            {status.language && (
              <div className="stat-row">
                <span className="stat-label">COURSE</span>
                <span className="stat-value">{LANGUAGES.find(l => l.id === status.language)?.name}</span>
              </div>
            )}
            <div className="stat-row">
              <span className="stat-label">LEVEL</span>
              <span className="stat-value">{status.levelName || `Level ${currentLevel}`}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">SCORE</span>
              <span className="stat-value">{status.score ?? 0} XP</span>
            </div>
            <button className="btn btn-accent" style={{ marginTop: 12 }}
              onClick={() => startGame(currentLevel, true)}>
              ▶ RESUME LEVEL {currentLevel}
            </button>
          </>
        ) : (
          <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>No active run. Start below.</div>
        )}
      </div>

      {/* Language selector */}
      <div className="card">
        <div className="card-title">STUDY LANGUAGE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {LANGUAGES.map(lang => {
            const active = language === lang.id;
            return (
              <button
                key={lang.id}
                className="btn"
                style={{
                  padding: '12px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  borderColor: active ? 'var(--accent)' : undefined,
                  background: active ? 'rgba(var(--accent-rgb,204,34,68),0.08)' : undefined,
                }}
                onClick={() => setLanguage(lang.id)}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{lang.flag}</span>
                <span style={{ fontSize: 6, color: 'var(--text)' }}>
                  {lang.name}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'sans-serif', color: active ? 'var(--text)' : 'var(--text-dim)' }}>
                  {lang.native}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Level selector with completion status */}
      <div className="card">
        <div className="card-title">LEVELS — {doneCount}/{levelCount} COMPLETED</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: levelCount }, (_, i) => i + 1).map(n => {
            const done = completed.includes(`${language}:${n}`);
            return (
              <button
                key={n}
                className="btn"
                style={{
                  padding: '10px 12px',
                  fontSize: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderColor: done ? 'var(--accent)' : undefined,
                  color: 'var(--text)',
                }}
                onClick={() => startGame(n, false)}
              >
                <span>
                  {n}.&nbsp;
                  {language === 'ja'
                    ? <span style={{ fontFamily: 'var(--font-ja)', fontSize: 13 }}>{getLevelName(n, language)}</span>
                    : getLevelName(n, language)}
                </span>
                <span style={{ fontSize: 10 }}>{done ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Word bank preview */}
      {wordBank.length > 0 && (
        <div className="card" style={{ width: '100%', overflowY: 'auto', maxHeight: 200 }}>
          <div className="card-title">WORD BANK ({wordBank.length})</div>
          {wordBank.slice(0, 20).map((w, i) => (
            <div key={i} className="word-row">
              <span className={`word-es${/[\u3040-\u30ff\u4e00-\u9faf]/.test(w.word_es) ? ' ja' : ''}`}>{w.word_es}</span>
              <span className="word-en">{w.word_en}</span>
            </div>
          ))}
          {wordBank.length > 20 && (
            <div style={{ fontSize: 7, color: 'var(--text-dim)', paddingTop: 6 }}>
              +{wordBank.length - 20} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
