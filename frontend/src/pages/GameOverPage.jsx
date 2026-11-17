import { useStore } from '../store.js';
import { getLevelCount } from '../engine/dungeon.js';

export default function GameOverPage() {
  const { gameResult, startGame, setScreen, setLanguage, language: selectedLanguage } = useStore();
  const { won, level, language = selectedLanguage, score, time_ms, wordsPassed } = gameResult ?? {};

  function fmtTime(ms) {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const levelCount = getLevelCount(language);

  function play(n) {
    setLanguage(language);
    startGame(n);
  }

  return (
    <div className="page" style={{ justifyContent: 'center', minHeight: '100dvh' }}>
      <div className="page-title" style={{ color: 'var(--text)' }}>
        {won ? 'VICTORY!' : 'GAME OVER'}
      </div>
      <div className="subtitle">
        {won ? `You conquered all ${levelCount} levels!` : `You fell on Level ${level}`}
      </div>

      <div className="card" style={{ width: '100%', maxWidth: 320 }}>
        <div className="card-title">RESULTS</div>
        <div className="stat-row">
          <span className="stat-label">LEVEL REACHED</span>
          <span className="stat-value">{level}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">SCORE</span>
          <span className="stat-value">{score}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">TIME</span>
          <span className="stat-value">{fmtTime(time_ms)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">WORDS LEARNED</span>
          <span className="stat-value">{wordsPassed ?? 0}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
        {won
          ? <button className="btn btn-accent" onClick={() => play(1)}>PLAY AGAIN</button>
          : <button className="btn btn-accent" onClick={() => play(level)}>TRY LEVEL {level} AGAIN</button>}
        <button className="btn" onClick={() => setScreen('status')}>LEVEL SELECT</button>
        <button className="btn btn-ghost" onClick={() => setScreen('menu')}>MENU</button>
      </div>
    </div>
  );
}
