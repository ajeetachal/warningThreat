/* ============================================================================
   CYBERSECURITY AWARENESS SIMULATION — SCRIPT
   ----------------------------------------------------------------------------
   100% client-side. No network requests, no storage (no cookies/localStorage),
   no device APIs (camera/mic/location/clipboard), no fingerprinting, no
   analytics. All "hacking" activity below is cosmetic text/UI only.

   CUSTOMIZATION QUICK-REFERENCE:
   - TERMINAL_LINES        -> the fake "system log" lines typed out on screen
   - DEFAULT_COUNTDOWN     -> starting countdown length in seconds (5-20)
   - SOUND_ENABLED_DEFAULT -> whether the alarm attempts to play on load
   - PROGRESS_BAR_LABELS   -> labels for the fake scanning progress bars
   ============================================================================ */

(function () {
  "use strict";

  /* ---------------------------------------------------------------------
     CONFIG — safe to edit
     --------------------------------------------------------------------- */
  const TERMINAL_LINES = [
    "Initializing scan...",
    "Scanning device...",
    "Suspicious activity detected...",
    "Analyzing file system...",
    "Encrypting files...",
    "Contacting remote server...",
    "Connection established (fake)...",
    "Awaiting instructions..."
  ];

  const PROGRESS_BAR_LABELS = [
    "System scan",
    "File index",
    "Network probe"
  ];

  let DEFAULT_COUNTDOWN = 15;      // seconds; trainer panel range is 5-20
  const SOUND_ENABLED_DEFAULT = true;

  /* ---------------------------------------------------------------------
     STATE (kept only in memory — nothing is persisted anywhere)
     --------------------------------------------------------------------- */
  const state = {
    countdownTotal: DEFAULT_COUNTDOWN,
    countdownRemaining: DEFAULT_COUNTDOWN,
    soundEnabled: SOUND_ENABLED_DEFAULT,
    timers: [],
    intervalId: null,
    audioCtx: null,
    alarmStopFn: null,
    running: false
  };

  /* ---------------------------------------------------------------------
     DOM refs
     --------------------------------------------------------------------- */
  const simScreen = document.getElementById("sim-screen");
  const revealScreen = document.getElementById("reveal-screen");
  const terminalBody = document.getElementById("terminal-body");
  const progressStack = document.getElementById("progress-stack");
  const countdownNum = document.getElementById("countdown-num");
  const glitchHeadline = document.querySelector(".glitch-headline");
  const srAnnouncer = document.getElementById("sr-announcer");

  const muteBtn = document.getElementById("mute-btn");
  const endSimBtn = document.getElementById("end-sim-btn");
  const restartBtn = document.getElementById("restart-btn");

  const trainerToggle = document.getElementById("trainer-toggle");
  const trainerPanel = document.getElementById("trainer-panel");
  const trainerClose = document.getElementById("trainer-close");
  const tcRestart = document.getElementById("tc-restart");
  const tcSkip = document.getElementById("tc-skip");
  const tcSound = document.getElementById("tc-sound");
  const tcFullscreen = document.getElementById("tc-fullscreen");
  const tcDuration = document.getElementById("tc-duration");
  const tcDurationVal = document.getElementById("tc-duration-val");

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* ---------------------------------------------------------------------
     Utility: track timeouts/intervals so we can clear them on restart
     --------------------------------------------------------------------- */
  function setTimer(fn, delay) {
    const id = setTimeout(fn, delay);
    state.timers.push(id);
    return id;
  }
  function clearAllTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
  }
  function announce(msg) {
    srAnnouncer.textContent = msg;
  }

  /* ---------------------------------------------------------------------
     AUDIO — synthesized alarm beep via Web Audio API (no external files,
     no network). Respects browser autoplay restrictions: if the browser
     blocks playback, we simply stay silent until the user interacts
     (e.g. taps the Mute/Unmute button), which is standard, expected
     behavior and requires no special handling beyond catching the error.
     --------------------------------------------------------------------- */
  function getAudioCtx() {
    if (!state.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      state.audioCtx = new AC();
    }
    return state.audioCtx;
  }

  function playAlarmBeep() {
    if (!state.soundEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    const resumeAndPlay = () => {
      const now = ctx.currentTime;
      // Two short alternating tones = a brief "alarm" beep pattern.
      [0, 0.28].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, now + offset);
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.06, now + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.24);
      });
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(resumeAndPlay).catch(() => {
        /* Autoplay blocked — silently ignore; user can enable via Mute button */
      });
    } else {
      resumeAndPlay();
    }
  }

  function stopAudioForGood() {
    if (state.audioCtx) {
      try { state.audioCtx.close(); } catch (e) { /* no-op */ }
      state.audioCtx = null;
    }
  }

  /* ---------------------------------------------------------------------
     Terminal typer — reveals TERMINAL_LINES one at a time
     --------------------------------------------------------------------- */
  function resetTerminal() {
    terminalBody.innerHTML = "";
  }

  function typeTerminalLines(totalDurationMs) {
    resetTerminal();
    const stepDelay = Math.max(500, totalDurationMs / (TERMINAL_LINES.length + 1));
    TERMINAL_LINES.forEach((line, idx) => {
      setTimer(() => {
        // remove caret from previous line
        const prevCaret = terminalBody.querySelector(".caret");
        if (prevCaret) prevCaret.remove();

        const div = document.createElement("div");
        div.className = "terminal-line";
        div.textContent = "> " + line;
        const caret = document.createElement("span");
        caret.className = "caret";
        div.appendChild(caret);
        terminalBody.appendChild(div);
        terminalBody.scrollTop = terminalBody.scrollHeight;
      }, idx * stepDelay);
    });
  }

  /* ---------------------------------------------------------------------
     Fake progress bars — random widths animating up over the countdown
     --------------------------------------------------------------------- */
  function buildProgressBars(totalDurationMs) {
    progressStack.innerHTML = "";
    PROGRESS_BAR_LABELS.forEach((label, i) => {
      const item = document.createElement("div");
      item.className = "progress-item";

      const labelRow = document.createElement("div");
      labelRow.className = "label-row";
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      const pctSpan = document.createElement("span");
      pctSpan.textContent = "0%";
      pctSpan.className = "pct-" + i;
      labelRow.appendChild(labelSpan);
      labelRow.appendChild(pctSpan);

      const track = document.createElement("div");
      track.className = "progress-track";
      const fill = document.createElement("div");
      fill.className = "progress-fill";
      fill.id = "progress-fill-" + i;
      track.appendChild(fill);

      item.appendChild(labelRow);
      item.appendChild(track);
      progressStack.appendChild(item);

      // Stagger + randomize each bar's fill for a "scanning" feel
      const startDelay = i * 220;
      const target = 78 + Math.random() * 22; // never *quite* finishes — it's fake
      setTimer(() => {
        fill.style.width = target + "%";
        pctSpan.textContent = Math.round(target) + "%";
      }, startDelay + 150);
    });
  }

  /* ---------------------------------------------------------------------
     Glitch + shake "events" — brief, occasional, NOT continuous strobing.
     Kept infrequent and short to remain photosensitivity-safe.
     --------------------------------------------------------------------- */
  function triggerGlitchEvent() {
    if (prefersReducedMotion) return;
    glitchHeadline.classList.add("glitch-active");
    simScreen.classList.add("shake-once");
    setTimer(() => {
      glitchHeadline.classList.remove("glitch-active");
      simScreen.classList.remove("shake-once");
    }, 420);
  }

  function scheduleGlitchEvents(totalDurationMs) {
    // A handful of glitch pulses spread across the countdown (max ~1 per 1.8s)
    const count = Math.max(2, Math.floor(totalDurationMs / 2200));
    for (let i = 1; i <= count; i++) {
      setTimer(triggerGlitchEvent, (totalDurationMs / (count + 1)) * i);
    }
  }

  /* ---------------------------------------------------------------------
     Countdown
     --------------------------------------------------------------------- */
  function startCountdown(totalSeconds) {
    state.countdownTotal = totalSeconds;
    state.countdownRemaining = totalSeconds;
    countdownNum.textContent = String(totalSeconds);

    state.intervalId = setInterval(() => {
      state.countdownRemaining -= 1;
      if (state.countdownRemaining <= 0) {
        clearInterval(state.intervalId);
        state.intervalId = null;
        countdownNum.textContent = "0";
        revealSimulation();
        return;
      }
      countdownNum.textContent = String(state.countdownRemaining);
      if (state.countdownRemaining <= 5) {
        announce(state.countdownRemaining + " seconds remaining.");
      }
    }, 1000);
  }

  /* ---------------------------------------------------------------------
     Phase control
     --------------------------------------------------------------------- */
  function startSimulation(durationSeconds) {
    clearAllTimers();
    state.running = true;

    simScreen.hidden = false;
    revealScreen.hidden = true;
    simScreen.style.display = "";
    revealScreen.style.display = "none";

    const totalMs = durationSeconds * 1000;

    buildProgressBars(totalMs);
    typeTerminalLines(totalMs);
    scheduleGlitchEvents(totalMs);
    startCountdown(durationSeconds);

    // Brief alarm beep pattern near the start, respecting autoplay rules
    playAlarmBeep();
    setTimer(playAlarmBeep, 900);

    announce("Training simulation started. This is not a real security event.");
  }

  function revealSimulation() {
    clearAllTimers();
    state.running = false;
    stopAudioForGood();

    simScreen.hidden = true;
    revealScreen.hidden = false;
    simScreen.style.display = "none";
    revealScreen.style.display = "";
    revealScreen.classList.remove("reveal-screen"); // restart CSS animation
    void revealScreen.offsetWidth; // force reflow
    revealScreen.classList.add("reveal-screen");

    announce("Simulation complete. This was a training exercise, not a real hack.");
    revealScreen.focus?.();
  }

  function restartSimulation() {
    stopAudioForGood();
    startSimulation(state.countdownTotal || DEFAULT_COUNTDOWN);
  }

  /* ---------------------------------------------------------------------
     Always-visible accessible controls
     --------------------------------------------------------------------- */
  muteBtn.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    muteBtn.setAttribute("aria-pressed", String(!state.soundEnabled));
    muteBtn.textContent = state.soundEnabled ? "🔊 Mute Sound" : "🔇 Unmute Sound";
    syncTrainerSoundButton();
    if (state.soundEnabled) {
      // A user gesture just happened (this click) — safe to try playing.
      playAlarmBeep();
    }
  });

  endSimBtn.addEventListener("click", revealSimulation);
  restartBtn.addEventListener("click", restartSimulation);

  /* ---------------------------------------------------------------------
     Trainer controls panel
     --------------------------------------------------------------------- */
  function openTrainerPanel() {
    trainerPanel.hidden = false;
    trainerToggle.setAttribute("aria-expanded", "true");
  }
  function closeTrainerPanel() {
    trainerPanel.hidden = true;
    trainerToggle.setAttribute("aria-expanded", "false");
  }

  trainerToggle.addEventListener("click", () => {
    if (trainerPanel.hidden) openTrainerPanel(); else closeTrainerPanel();
  });
  trainerClose.addEventListener("click", closeTrainerPanel);

  tcRestart.addEventListener("click", () => {
    restartSimulation();
    closeTrainerPanel();
  });

  tcSkip.addEventListener("click", () => {
    revealSimulation();
    closeTrainerPanel();
  });

  function syncTrainerSoundButton() {
    tcSound.setAttribute("aria-pressed", String(state.soundEnabled));
    tcSound.textContent = state.soundEnabled ? "🔊 Sound: On" : "🔇 Sound: Off";
  }
  tcSound.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    syncTrainerSoundButton();
    muteBtn.setAttribute("aria-pressed", String(!state.soundEnabled));
    muteBtn.textContent = state.soundEnabled ? "🔊 Mute Sound" : "🔇 Unmute Sound";
    if (state.soundEnabled) playAlarmBeep();
  });

  tcFullscreen.addEventListener("click", () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {
        /* Full-screen may be blocked by browser/OS — fail silently */
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  tcDuration.addEventListener("input", () => {
    const val = parseInt(tcDuration.value, 10);
    tcDurationVal.textContent = String(val);
    DEFAULT_COUNTDOWN = val;
    // If a simulation isn't actively counting down, update immediately;
    // otherwise it applies on next restart (announced in the panel note).
    if (!state.running) {
      state.countdownTotal = val;
      countdownNum.textContent = String(val);
    }
  });

  /* ---------------------------------------------------------------------
     Keyboard support: Esc closes trainer panel
     --------------------------------------------------------------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !trainerPanel.hidden) closeTrainerPanel();
  });

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */
  syncTrainerSoundButton();
  startSimulation(DEFAULT_COUNTDOWN);
})();
