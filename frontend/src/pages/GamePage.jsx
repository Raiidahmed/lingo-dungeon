import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { loadLevel, tryMove, TILE, MAP_W, MAP_H, getLevelCount, getLevelName } from '../engine/dungeon.js';
import { preloadMouseImages } from '../engine/mouseAssets.js';
import { render, getCanvasSize, createRenderCache } from '../engine/renderer.js';

const MAX_HEARTS = 3;
const MOVE_COOLDOWN = 120;
const isJapanese = (s) => /[぀-ヿ一-龯]/.test(s);

export default function GamePage() {
  const { startLevel, resumeMode, save, endGame, user, theme, language, lightMode, ui, updateWordBank, setScreen } = useStore();

  // --- Mutable game state (refs, no re-render) ---
  const levelRef        = useRef(startLevel);
  const levelDataRef    = useRef(null);   // { grid, playerStart, locks, npcs, challenges, name, numLocks }
  const gridRef         = useRef(null);
  const playerRef       = useRef(null);
  const solvedLocksRef  = useRef(new Set()); // "col,row" strings of solved locks
  const scoreRef        = useRef(0);
  const heartsRef       = useRef(MAX_HEARTS);
  const startTimeRef    = useRef(Date.now());
  const learnedWordsRef = useRef([]);     // words learned this run (all levels)
  const levelWordsStartRef = useRef(0);   // index into learnedWordsRef where this level began
  const particlesRef    = useRef([]);
  const keysRef         = useRef(new Set());
  const rafRef          = useRef(null);
  const lastMoveRef     = useRef(0);
  const challengeActiveRef = useRef(false);
  const dialogueActiveRef  = useRef(false);
  const levelClearRef      = useRef(false);
  const gameOverRef        = useRef(false);
  const choiceTimerRef     = useRef(null);  // cleared on unmount to prevent state updates after teardown
  const toastTimerRef      = useRef(null);
  const ctxRef             = useRef(null);  // canvas context cached once at mount
  const renderCacheRef     = useRef(createRenderCache());
  const viewRef            = useRef({
    accent: theme.accent,
    canvasTint: lightMode ? (ui?.canvasTint ?? 0.58) : 0,
  });

  // --- React state (triggers re-render) ---
  const [hearts,       setHearts]       = useState(MAX_HEARTS);
  const [score,        setScore]        = useState(0);
  const [levelName,    setLevelName]    = useState('');
  const [levelN,       setLevelN]       = useState(startLevel);
  const [elapsed,      setElapsed]      = useState(0);
  const [challenge,    setChallenge]    = useState(null);  // { prompt, choices, answer(idx), hint, reward, lockKey, lockType }
  const [wrongPicks,   setWrongPicks]   = useState([]);    // choice indexes already tried and wrong
  const [solved,       setSolved]       = useState(false); // right answer picked; showing the explanation
  const [dialogue,     setDialogue]     = useState(null);  // { npc, lineIndex }
  const [locks,        setLocks]        = useState({ open: 0, total: 0 });
  const [levelClear,   setLevelClear]   = useState(null);  // { level, name, words, nextN, nextName }
  const [toast,        setToast]        = useState(null);

  const canvasRef    = useRef(null);
  const containerRef = useRef(null);

  // Keep a ref to dialogue so advanceDialogue can read current state from the RAF keydown handler
  const dialogueRef = useRef(null);
  useEffect(() => { dialogueRef.current = dialogue; }, [dialogue]);
  useEffect(() => {
    viewRef.current = {
      accent: theme.accent,
      canvasTint: lightMode ? (ui?.canvasTint ?? 0.58) : 0,
    };
    renderCacheRef.current.key = '';
  }, [theme.accent, lightMode, ui?.canvasTint]);

  // --- Level loading ---
  // carry: advancing within a run, so score and run time continue (hearts refill)
  function initLevel(n, snapshot = null, carry = false) {
    const safeLevel = Math.min(Math.max(n, 1), getLevelCount(language));
    const data = loadLevel(safeLevel, language);
    levelDataRef.current = data;
    renderCacheRef.current.key = '';
    // Deep copy grid so mutations don't affect the source
    gridRef.current = data.grid.map(row => [...row]);
    solvedLocksRef.current = new Set();

    if (snapshot && snapshot.levelIndex === safeLevel) {
      // Restore from snapshot
      playerRef.current = snapshot.playerPos;
      scoreRef.current  = snapshot.score;
      heartsRef.current = snapshot.hearts;
      startTimeRef.current = Date.now() - (snapshot.elapsedMs || 0);
      // Re-open solved locks
      for (const key of (snapshot.solvedLocks || [])) {
        solvedLocksRef.current.add(key);
        const [c, r] = key.split(',').map(Number);
        const lockInfo = data.locks[key];
        if (lockInfo) {
          gridRef.current[r][c] = lockInfo.type === 'chest' ? TILE.CHEST_O : TILE.DOOR_O;
        }
      }
      setHearts(snapshot.hearts);
      setScore(snapshot.score);
    } else {
      playerRef.current = { ...data.playerStart };
      heartsRef.current = MAX_HEARTS;
      setHearts(MAX_HEARTS);
      if (!carry) {
        scoreRef.current = 0;
        startTimeRef.current = Date.now();
        setScore(0);
      }
    }

    levelRef.current = safeLevel;
    levelWordsStartRef.current = learnedWordsRef.current.length;
    setLevelN(safeLevel);
    setLevelName(data.name);
    setLocks({ open: solvedLocksRef.current.size, total: data.numLocks });

    if (language === 'ja') preloadMouseImages(data.challenges);
  }

  function isExitOpen() {
    return solvedLocksRef.current.size >= levelDataRef.current.numLocks;
  }

  function showToast(text) {
    setToast(text);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }

  function addParticle(col, row, text, color) {
    particlesRef.current.push({
      x: (col * 32 + 16),
      y: (row * 32),
      text, color, alpha: 1, vy: -1.2, life: 60,
    });
  }

  // --- Save helpers ---
  function buildSnapshot() {
    return {
      language,
      levelIndex:   levelRef.current,
      solvedLocks:  [...solvedLocksRef.current],
      playerPos:    { ...playerRef.current },
      score:        scoreRef.current,
      hearts:       heartsRef.current,
      elapsedMs:    Date.now() - startTimeRef.current,
    };
  }
  function buildStatus() {
    return {
      language,
      levelIndex:  levelRef.current,
      levelName:   levelDataRef.current?.name ?? '',
      score:       scoreRef.current,
      wordCount:   learnedWordsRef.current.length,
    };
  }

  // --- Challenge trigger ---
  function tryOpenChallenge(targetCol, targetRow) {
    const key = `${targetCol},${targetRow}`;
    if (solvedLocksRef.current.has(key)) return;
    const lockInfo = levelDataRef.current.locks[key];
    if (!lockInfo) return;
    const ch = levelDataRef.current.challenges[lockInfo.challengeId];
    if (!ch) return;
    challengeActiveRef.current = true;
    setWrongPicks([]);
    setSolved(false);
    setChallenge({ ...ch, lockKey: key, lockType: lockInfo.type });
  }

  function closeChallenge() {
    challengeActiveRef.current = false;
    setChallenge(null);
    setWrongPicks([]);
    setSolved(false);
  }

  // --- NPC interaction ---
  function findNPCAt(pos) {
    return levelDataRef.current?.npcs?.find(n =>
      n.col === pos.col && n.row === pos.row
    ) ?? null;
  }

  function findNearbyNPC(player) {
    return levelDataRef.current?.npcs?.find(n =>
      Math.max(Math.abs(n.col - player.col), Math.abs(n.row - player.row)) <= 1
    ) ?? null;
  }

  function openNPCDialogue(npc) {
    if (!npc) return false;
    dialogueActiveRef.current = true;
    const dlg = { npc, lineIndex: 0 };
    dialogueRef.current = dlg;
    setDialogue(dlg);
    return true;
  }

  function tryTalkNPC(player) {
    return openNPCDialogue(findNearbyNPC(player));
  }

  // --- Shared move execution (keyboard and D-pad both route here) ---
  function applyMove(dx, dy) {
    const now = performance.now();
    if (now - lastMoveRef.current < MOVE_COOLDOWN) return;
    if (challengeActiveRef.current || dialogueActiveRef.current || levelClearRef.current) return;

    const target = {
      col: playerRef.current.col + dx,
      row: playerRef.current.row + dy,
    };
    if (target.row < 0 || target.row >= MAP_H || target.col < 0 || target.col >= MAP_W) return;
    const targetTile = gridRef.current[target.row][target.col];

    const targetNPC = findNPCAt(target);
    if (targetNPC) {
      openNPCDialogue(targetNPC);
      lastMoveRef.current = now;
      return;
    }

    if (targetTile === TILE.DOOR_C || targetTile === TILE.CHEST_C) {
      tryOpenChallenge(target.col, target.row);
      lastMoveRef.current = now;
      return;
    }

    if (targetTile === TILE.STAIRS && !isExitOpen()) {
      const { size } = solvedLocksRef.current;
      showToast(`The stairs are sealed. Open every lock first (${size}/${levelDataRef.current.numLocks}).`);
      lastMoveRef.current = now;
      return;
    }

    const newPos = tryMove(gridRef.current, playerRef.current, dx, dy, isExitOpen());
    if (newPos.col === playerRef.current.col && newPos.row === playerRef.current.row) return;
    playerRef.current = newPos;
    lastMoveRef.current = now;

    if (gridRef.current[newPos.row][newPos.col] === TILE.STAIRS && isExitOpen()) {
      const completedLevel = levelRef.current;
      const nextN = completedLevel + 1;
      api.markLevelComplete(completedLevel, language).catch(e => console.warn('markLevelComplete', e));
      scoreRef.current += 200;
      setScore(scoreRef.current);
      api.submitScore(completedLevel, scoreRef.current, Date.now() - startTimeRef.current)
        .catch(e => console.warn('submitScore', e));
      if (nextN > getLevelCount(language)) {
        finishGame(true);
      } else {
        const clear = {
          level: completedLevel,
          name: levelDataRef.current.name,
          words: learnedWordsRef.current.slice(levelWordsStartRef.current),
          nextN,
          nextName: getLevelName(nextN, language),
        };
        // Load the next level behind the card and save it, so quitting here keeps the progress
        initLevel(nextN, null, true);
        api.saveGame(buildSnapshot(), buildStatus()).catch(e => console.warn('saveGame', e));
        levelClearRef.current = true;
        setLevelClear(clear);
      }
    }
  }

  function closeLevelClear() {
    levelClearRef.current = false;
    setLevelClear(null);
  }

  // --- Input processing (keyboard polling, runs every RAF tick) ---
  function processInput() {
    let dx = 0, dy = 0;
    if (keysRef.current.has('ArrowLeft')  || keysRef.current.has('a')) dx = -1;
    if (keysRef.current.has('ArrowRight') || keysRef.current.has('d')) dx =  1;
    if (keysRef.current.has('ArrowUp')    || keysRef.current.has('w')) dy = -1;
    if (keysRef.current.has('ArrowDown')  || keysRef.current.has('s')) dy =  1;
    if (!dx && !dy) return;
    applyMove(dx, dy);
  }

  // --- Challenge answer ---
  // Right: open the lock and show the explanation until the player continues.
  // Wrong: lose a heart, show the hint, and let them try the remaining choices.
  function handleChoice(choiceIdx) {
    if (!challenge || solved || heartsRef.current <= 0) return;
    if (choiceIdx >= challenge.choices.length || wrongPicks.includes(choiceIdx)) return;
    const [c, r] = challenge.lockKey.split(',').map(Number);

    if (choiceIdx === challenge.answer) {
      setSolved(true);
      gridRef.current[r][c] = challenge.lockType === 'chest' ? TILE.CHEST_O : TILE.DOOR_O;
      solvedLocksRef.current.add(challenge.lockKey);
      scoreRef.current += 100;
      setScore(scoreRef.current);
      setLocks(l => ({ ...l, open: solvedLocksRef.current.size }));
      addParticle(c, r, '+100', '#22cc66');
      // Extract word pair: first quoted = Spanish, second quoted or correct choice = English
      const rewardMatches = (challenge.reward || '').match(/'([^']+)'|"([^"]+)"/g) || [];
      const word_es = rewardMatches[0]?.replace(/['"]/g, '') || null;
      const word_en = rewardMatches[1]?.replace(/['"]/g, '') || challenge.choices[challenge.answer] || null;
      // Only store if they differ (skip reverse-translation challenges where answer is the Spanish word)
      if (word_es && word_en && word_es.toLowerCase() !== word_en.toLowerCase() && word_es.length <= 32) {
        if (!learnedWordsRef.current.some(w => w.word_es === word_es)) {
          learnedWordsRef.current.push({ word_es, word_en });
        }
        api.addWords([{ es: word_es, en: word_en }], `Level ${levelRef.current}`)
          .catch(e => console.warn('addWords', e));
      }
      // Auto-save after correct answer
      api.saveGame(buildSnapshot(), buildStatus()).catch(e => console.warn('saveGame', e));
      return;
    }

    setWrongPicks(picks => [...picks, choiceIdx]);
    scoreRef.current = Math.max(0, scoreRef.current - 25);
    setScore(scoreRef.current);
    addParticle(c, r, '-25', '#ff3355');
    const newH = heartsRef.current - 1;
    heartsRef.current = newH;
    setHearts(newH);
    if (newH <= 0) {
      // Let the last wrong pick register before leaving the level
      choiceTimerRef.current = setTimeout(() => {
        closeChallenge();
        finishGame(false);
      }, 900);
    }
  }

  // --- Dialogue advance ---
  function advanceDialogue() {
    const dlg = dialogueRef.current;
    if (!dlg) return;
    const lines = dlg.npc.dialogue;
    if (dlg.lineIndex + 1 < lines.length) {
      const next = { ...dlg, lineIndex: dlg.lineIndex + 1 };
      dialogueRef.current = next;
      setDialogue(next);
    } else {
      closeDialogue();
    }
  }

  function closeDialogue() {
    dialogueActiveRef.current = false;
    dialogueRef.current = null;
    setDialogue(null);
  }

  // Keys for open modals. The window listener is attached once at mount, so it
  // calls through this ref to see the current challenge state.
  const modalKeysRef = useRef(null);
  modalKeysRef.current = (e) => {
    // Let a focused button handle its own Enter/Space
    const onButton = e.target?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ');
    if (levelClearRef.current) {
      if (!onButton && (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E')) closeLevelClear();
      return true;
    }
    if (challenge) {
      if (/^[1-9]$/.test(e.key)) handleChoice(Number(e.key) - 1);
      else if (solved && !onButton && (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E')) closeChallenge();
      else if (!solved && e.key === 'Escape' && heartsRef.current > 0) closeChallenge();
      return true;
    }
    if (dialogueActiveRef.current) {
      if (!onButton && (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E')) advanceDialogue();
      else if (e.key === 'Escape') closeDialogue();
      return true;
    }
    return false;
  };

  // --- Game over / finish ---
  function finishGame(won) {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    const time_ms = Date.now() - startTimeRef.current;
    const level   = levelRef.current;
    const finalScore = scoreRef.current;
    api.submitScore(level, finalScore, time_ms).catch(e => console.warn('submitScore', e));
    api.saveGame(null, {}).catch(e => console.warn('saveGame', e));
    // Refresh user data (word bank already submitted per-answer, just sync store)
    api.me().then(d => updateWordBank(d.user?.word_bank ?? [])).catch(() => {});
    endGame({ won, level, language, score: finalScore, time_ms, wordsPassed: learnedWordsRef.current.length });
  }

  // --- D-pad: move exactly once per tap, delegates to shared applyMove ---
  function moveDir(dx, dy) {
    applyMove(dx, dy);
  }

  // --- Render loop ---
  function renderFrame() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    particlesRef.current = particlesRef.current
      .map(p => ({ ...p, y: p.y + p.vy, alpha: p.alpha - 0.016, life: p.life - 1 }))
      .filter(p => p.life > 0);
    render(ctx, {
      grid: gridRef.current,
      player: playerRef.current,
      solvedLocks: solvedLocksRef.current,
      exitOpen: isExitOpen(),
      particles: particlesRef.current,
      npcs: levelDataRef.current?.npcs ?? [],
      levelN: levelRef.current,
      language: language,
      locks: levelDataRef.current?.locks,
      challenges: levelDataRef.current?.challenges,
      textureSet: levelDataRef.current?.textureSet,
    }, viewRef.current.accent, viewRef.current.canvasTint, renderCacheRef.current);
  }

  // --- Mount ---
  useEffect(() => {
    const snapshot = (resumeMode && save?.snapshot) ? save.snapshot : null;
    learnedWordsRef.current = [];
    initLevel(resumeMode && snapshot ? snapshot.levelIndex : startLevel, snapshot);
    gameOverRef.current = false;

    // Cache canvas context — valid for the lifetime of this canvas element
    ctxRef.current = canvasRef.current.getContext('2d');

    function scaleCanvas() {
      const canvas = canvasRef.current;
      const cont   = containerRef.current;
      if (!canvas || !cont) return;
      const { width: cw, height: ch } = getCanvasSize();
      const scale = Math.max(0.1, Math.min(cont.clientWidth / cw, cont.clientHeight / ch, 2));
      canvas.style.width  = `${cw * scale}px`;
      canvas.style.height = `${ch * scale}px`;
      canvas.width  = cw;
      canvas.height = ch;
    }
    scaleCanvas();
    window.addEventListener('resize', scaleCanvas);

    function onKeyDown(e) {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','s','d','w'].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
      }
      if (e.repeat) return;
      if (modalKeysRef.current(e)) return;
      if (e.key === 'e' || e.key === 'E') {
        tryTalkNPC(playerRef.current);
      }
    }
    function onKeyUp(e) { keysRef.current.delete(e.key); }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);

    function loop() {
      processInput();
      renderFrame();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(choiceTimerRef.current);
      clearTimeout(toastTimerRef.current);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', scaleCanvas);
      clearInterval(timer);
    };
  }, []);

  function fmtTime(s) {
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }

  return (
    <div className={`game-wrap${language === 'ja' ? ' ja-mode' : ''}`}>
      {/* HUD */}
      <div className="hud">
        <div className="hud-left">
          <div className="hud-level">{levelName || `LEVEL ${levelN}`}</div>
          <div className="hud-score">{score} XP</div>
        </div>
        <div className="hud-center">
          <div className="hearts">
            {Array.from({ length: MAX_HEARTS }).map((_, i) => (
              <span key={i} className={`heart${i >= hearts ? ' empty' : ''}`}>♥</span>
            ))}
          </div>
          <div className={`hud-locks${locks.open >= locks.total ? ' open' : ''}`}>
            {locks.open >= locks.total ? 'STAIRS OPEN' : `LOCKS ${locks.open}/${locks.total}`}
          </div>
        </div>
        <div className="hud-right">
          <div className="hud-timer">{fmtTime(elapsed)}</div>
          <button
            style={{ fontSize: 6, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}
            onClick={() => {
              api.saveGame(buildSnapshot(), buildStatus()).catch(e => console.warn('saveGame', e));
              api.submitScore(levelRef.current, scoreRef.current, Date.now() - startTimeRef.current).catch(e => console.warn('submitScore', e));
              api.me().then(d => updateWordBank(d.user?.word_bank ?? [])).catch(() => {});
              cancelAnimationFrame(rafRef.current);
              setScreen('menu');
            }}
          >QUIT</button>
        </div>
      </div>

      {/* Canvas */}
      <div className="canvas-area" ref={containerRef}>
        <canvas id="dungeon" ref={canvasRef} />
        {toast && <div className="toast">{toast}</div>}
      </div>

      {/* Controls — dpad left, action button right */}
      <div className="controls-bar">
        <div className="dpad">
          <button className="dpad-btn dpad-up"    onPointerDown={() => moveDir(0,-1)}>▲</button>
          <button className="dpad-btn dpad-left"  onPointerDown={() => moveDir(-1,0)}>◀</button>
          <div className="dpad-center" />
          <button className="dpad-btn dpad-right" onPointerDown={() => moveDir(1,0)}>▶</button>
          <button className="dpad-btn dpad-down"  onPointerDown={() => moveDir(0,1)}>▼</button>
        </div>
        <button
          className="action-btn"
          style={{ marginRight: '8px' }}
          onPointerDown={() => {
            if (!challengeActiveRef.current && !dialogueActiveRef.current)
              tryTalkNPC(playerRef.current);
          }}
        >
          <span className="talk-bubble">
            <svg width="72" height="64" viewBox="0 0 72 64" fill="none">
              <rect x="2" y="2" width="68" height="40" rx="9" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M12 42 L10 61 L30 42" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
            </svg>
            <span className="talk-bubble-text">ACTION</span>
          </span>
        </button>
      </div>

      {/* NPC Dialogue modal */}
      {dialogue && (
        <div className="challenge-overlay">
          <div className="challenge-box">
            <div className="challenge-label" style={{ color: 'var(--text)' }}>
              {dialogue.npc.name}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text)', lineHeight: 1.8, minHeight: 60 }}>
              {dialogue.npc.dialogue[dialogue.lineIndex]}
            </div>
            <button className="btn btn-accent" onClick={advanceDialogue}>
              {dialogue.lineIndex + 1 < dialogue.npc.dialogue.length ? 'Next ▶' : 'Close ✕'}
            </button>
          </div>
        </div>
      )}

      {/* Level clear card — the next level is already loaded behind it */}
      {levelClear && (
        <div className="challenge-overlay">
          <div className="challenge-box">
            <div className="challenge-label">★ LEVEL {levelClear.level} CLEAR ★</div>
            <div className="level-clear-name">{levelClear.name}</div>
            <div className="stat-row">
              <span className="stat-label">STAIRS BONUS</span>
              <span className="stat-value">+200 XP</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">RUN TOTAL</span>
              <span className="stat-value">{score} XP</span>
            </div>
            {levelClear.words.length > 0 && (
              <div>
                <div className="stat-label" style={{ marginBottom: 6 }}>NEW WORDS</div>
                {levelClear.words.slice(0, 8).map((w, i) => (
                  <div key={i} className="word-row">
                    <span className={`word-es${isJapanese(w.word_es) ? ' ja' : ''}`}>{w.word_es}</span>
                    <span className="word-en">{w.word_en}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 7, color: 'var(--text-dim)', lineHeight: 1.8 }}>
              NEXT: {levelClear.nextN}. {levelClear.nextName}
              <br />Hearts refilled.
            </div>
            <button className="btn btn-accent" onClick={closeLevelClear}>
              CONTINUE ▶ <span className="key-hint">(ENTER)</span>
            </button>
          </div>
        </div>
      )}

      {/* Challenge modal */}
      {challenge && (
        <div className="challenge-overlay">
          <div className="challenge-box">
            <div className="challenge-label">⚡ CHALLENGE ⚡</div>
            {challenge.display && (
              <div style={{
                fontSize: 56,
                textAlign: 'center',
                fontFamily: 'var(--font-ja)',
                color: 'var(--text)',
                lineHeight: 1.1,
              }}>
                {challenge.display}
              </div>
            )}
            <div style={{ fontSize: 9, color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
              {challenge.prompt}
            </div>
            {wrongPicks.length > 0 && !solved && challenge.hint && (
              <div style={{ fontSize: 7, color: 'var(--text)', fontStyle: 'italic', borderLeft: '4px solid #c8a020', paddingLeft: 8, lineHeight: 1.8 }}>
                💡 {challenge.hint}
              </div>
            )}
            <div className="choices">
              {challenge.choices.map((c, i) => (
                <button
                  key={i}
                  className={`choice-btn${
                    solved && i === challenge.answer ? ' correct' :
                    wrongPicks.includes(i) ? ' wrong' : ''
                  }`}
                  style={challenge.choiceStyle === 'hiragana'
                    ? { fontSize: 22, fontFamily: 'var(--font-ja)', padding: '10px 4px' }
                    : undefined}
                  onClick={() => handleChoice(i)}
                  disabled={solved || hearts <= 0 || wrongPicks.includes(i)}
                >
                  <span className="choice-key">{i + 1}</span>
                  {c}
                </button>
              ))}
            </div>
            {solved ? (
              <>
                <div className="challenge-reward">✓ {challenge.reward || 'Correct!'}</div>
                <button className="btn btn-accent" onClick={closeChallenge}>CONTINUE ▶</button>
              </>
            ) : hearts > 0 && (
              <button className="btn btn-ghost challenge-back" onClick={closeChallenge}>
                BACK AWAY <span className="key-hint">(ESC)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
