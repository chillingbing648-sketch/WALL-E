/* ================================================================
   WALL·E — AI Mental Wellness Companion  v3.0
   script.js — Full modular rewrite
   ----------------------------------------------------------------
   Modules:
     AppController   — Auth, navigation, init
     MoodSystem      — Mood logging & rendering
     Analytics       — Dashboard stats, charts, wellness score
     AICompanion     — Chat, personalities, avatar
     JournalSystem   — Journal CRUD
     HabitSystem     — Habits & streaks
     BoostSystem     — Gratitude, meditation, affirmations
     AnalyticsSystem — Insights, recommendations, monthly report
================================================================ */

'use strict';

/* ══════════════════════════════════════════════════════════════
   GLOBAL STATE & CONSTANTS
══════════════════════════════════════════════════════════════ */
const KEYS = {
  USERS:       'walle_users',
  CURRENT:     'walle_current_user',
  MOODS:       'walle_moods',
  JOURNAL:     'walle_journal',
  HABITS:      'walle_habits',
  HABIT_LOG:   'walle_habit_log',
  CHAT:        'walle_chat',
  PERSONALITY: 'walle_personality',
  GRATITUDE:   'walle_gratitude',
  MEMORIES:    'walle_memories',
  MOMENTS:     'walle_moments',
  STARS:       'walle_stars',
};

const MOOD_EMOJI = { Happy:'😊', Calm:'😌', Neutral:'😐', Stressed:'😰', Sad:'😢' };
let _currentUser = null;
let _selectedMood = null;
const _chatReplyTimers = new Set();

/* Chart instances */
let _chartMoodTrend = null;
let _chartMoodDist  = null;
let _chartHabit     = null;
let _chartRptMood   = null;
let _chartRptHabit  = null;

/* Breathing exercise state */
let _breathActive = false;
let _breathTimer  = null;
let _breathPhase  = 0;
let _breathCycles = 0;
const BREATH_MAX  = 4;
const BREATH_PHASES = [
  { label:'Inhale',  cls:'inhale', ms:4000, hint:'Breathe in slowly through your nose… (4 seconds)' },
  { label:'Hold',    cls:'hold',   ms:7000, hint:'Hold your breath gently… (7 seconds)' },
  { label:'Exhale',  cls:'exhale', ms:8000, hint:'Breathe out completely through your mouth… (8 seconds)' },
];

/* Meditation state */
let _medActive    = false;
let _medInterval  = null;
let _medSecsLeft  = 180;
let _medSecsTotal = 180;
let _medPhaseIdx  = 0;
let _medPhaseTick = 0;
const MED_PHASES = [
  { label:'Breathe in…',  secs:4 }, { label:'Hold gently…', secs:4 },
  { label:'Breathe out…', secs:6 }, { label:'Rest…',        secs:2 },
];

/* Report state */
let _reportOffset    = 0;
let _bigAffCat       = 'all';
let _bigAffLastIdx   = -1;
let _insAffLastIdx   = -1;
let _editJournalId   = null;

/* ── helpers ── */
function _$  (id)   { return document.getElementById(id); }
function _qs (sel)  { return document.querySelector(sel); }
function _qsa(sel)  { return document.querySelectorAll(sel); }
function _setText(id, val) { const e=_$(id); if(e) e.textContent = val; }
function _setWidth(id, pct){ const e=_$(id); if(e) e.style.width = Math.min(pct,100)+'%'; }
function _esc(str)  { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _dateKey(d){ return d.toISOString().slice(0,10); }
function _todayKey(){ return _dateKey(new Date()); }
function _rand(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
function _safeId(id) { const value=Number(id); return Number.isSafeInteger(value)&&value>=0?value:0; }
function _colorToken(name, fallback) {
  if(typeof getComputedStyle!=='function') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback;
}
function _withAlpha(hex, alpha) { return /^#[\da-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex; }

/* Browser persistence boundary. Existing keys and JSON shapes stay unchanged. */
const Storage = {
  _corruptKeys: new Set(),
  readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError) this._corruptKeys.add(key);
      console.warn(`WALL·E could not read stored data for "${key}".`, error);
      return fallback;
    }
  },
  writeJSON(key, value) {
    if (this._corruptKeys.has(key)) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`WALL·E could not save stored data for "${key}".`, error);
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); return true; }
    catch (error) { console.warn(`WALL·E could not remove stored data for "${key}".`, error); return false; }
  },
  readUser(key, username, fallback) {
    const bucket = this.readJSON(key, {});
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return fallback;
    const value = Object.prototype.hasOwnProperty.call(bucket,username) ? bucket[username] : undefined;
    if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
    if (fallback && typeof fallback === 'object') return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    return value ?? fallback;
  },
  writeUser(key, username, value) {
    const bucket = this.readJSON(key, {});
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return false;
    Object.defineProperty(bucket,username,{value,writable:true,enumerable:true,configurable:true});
    return this.writeJSON(key, bucket);
  },
};

/* One motion owner for section choreography, selected state reactions and counters. */
/* One cohesive motion architect for section choreography, tactile feedback, companion life and counters. */
const MotionSystem = {
  _contexts: new Map(),
  _transient: new Set(),
  _countTweens: new Map(),
  _wallETween: null,
  _initialized: false,

  reduced() { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; },

  init() {
    if (this._initialized) return;
    this._initialized = true;
    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
    }
    document.documentElement.classList.toggle('motion-gsap', !!window.gsap);

    // Initial companion life
    this.initCompanionLife();

    // Tactile button micro-interaction listeners (delegated)
    this.initButtonInteractions();

    window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', event => {
      if (event.matches) {
        this._contexts.forEach(context => context.revert());
        this._contexts.clear();
        this.stopTransient();
        this.finishCounts();
        this.stopCompanionLife();
      } else {
        this.initCompanionLife();
        const active = _qs('.page-section.active');
        if (active) this.show(active, active);
      }
    });
  },

  _track(tween) {
    if (!tween) return tween;
    this._transient.add(tween);
    tween.eventCallback?.('onComplete', () => this._transient.delete(tween));
    return tween;
  },

  stopTransient() {
    this._transient.forEach(tween => tween.kill());
    this._transient.clear();
  },

  finishCounts() {
    this._countTweens.forEach((entry, element) => {
      entry.tween.kill();
      element.textContent = entry.format(entry.value);
    });
    this._countTweens.clear();
  },

  _leave(section) {
    if (!section) return;
    this._contexts.get(section)?.revert();
    this._contexts.delete(section);
    this.stopTransient();
  },

  cleanup() {
    this._contexts.forEach(context => context.revert());
    this._contexts.clear();
    this.stopTransient();
    this.finishCounts();
    this.stopCompanionLife();
  },

  /* Smooth Section Entry Choreography */
  show(previous, next) {
    if (previous && previous !== next) this._leave(previous);
    if (!next || (previous === next && this._contexts.has(next))) return;
    if (!window.gsap || this.reduced()) return;

    const gsap = window.gsap;
    const context = gsap.context(() => {
      // 1. Whole Section Entrance: soft atmospheric fade + gentle lift
      gsap.fromTo(
        next,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.42, ease: 'power2.out', clearProps: 'transform' }
      );

      // 2. Page Header & Subtitle: sequential subtle reveal
      const header = next.querySelector('.page-header');
      if (header) {
        const title = header.querySelector('.page-title');
        const sub = header.querySelector('.page-subtitle');
        const headerEls = [title, sub].filter(Boolean);
        if (headerEls.length) {
          gsap.from(headerEls, {
            autoAlpha: 0,
            y: 9,
            duration: 0.45,
            stagger: 0.08,
            ease: 'power3.out',
            delay: 0.06,
            clearProps: 'transform'
          });
        }
      }

      // 3. Section Motion Reveals (Cards, Rows, Grids)
      const reveals = Array.from(next.querySelectorAll('.motion-reveal'));
      const vh = window.innerHeight;
      const visible = reveals.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < vh * 0.92;
      });
      const belowFold = reveals.filter(el => !visible.includes(el));

      if (visible.length) {
        gsap.from(visible, {
          autoAlpha: 0,
          y: 16,
          duration: 0.5,
          stagger: 0.075,
          ease: 'power2.out',
          delay: 0.12,
          clearProps: 'transform'
        });
      }

      belowFold.forEach(el => {
        if (window.ScrollTrigger) {
          gsap.from(el, {
            autoAlpha: 0,
            y: 18,
            duration: 0.52,
            ease: 'power2.out',
            clearProps: 'transform',
            scrollTrigger: {
              trigger: el,
              start: 'top 88%',
              once: true
            }
          });
        } else {
          gsap.from(el, {
            autoAlpha: 0,
            y: 18,
            duration: 0.52,
            ease: 'power2.out',
            clearProps: 'transform'
          });
        }
      });
    }, next);

    this._contexts.set(next, context);
    window.ScrollTrigger?.refresh();
  },

  /* Smooth Progress Ring & Breakdown Bars Animation */
  animateRing(ringElement, targetScore, previousScore = 0) {
    if (!ringElement) return;
    const targetOffset = 314 - 314 * (targetScore / 100);
    if (!window.gsap || this.reduced()) {
      ringElement.style.strokeDashoffset = targetOffset;
      return;
    }
    const currentOffset = parseFloat(ringElement.style.strokeDashoffset) || (314 - 314 * (previousScore / 100));
    const obj = { offset: currentOffset };
    this._track(
      window.gsap.to(obj, {
        offset: targetOffset,
        duration: 1.1,
        ease: 'power2.out',
        onUpdate: () => {
          ringElement.style.strokeDashoffset = obj.offset;
        }
      })
    );
  },

  /* WALL·E Character Idle & Emotional Life */
  initCompanionLife() {
    if (!window.gsap || this.reduced() || this._wallETween) return;
    const face = _$('avatar-face');
    const glow = _$('avatar-glow');
    if (!face) return;

    // Organic idle floating - soft, calm, non-cartoonish
    const tl = window.gsap.timeline({ repeat: -1, yoyo: true });
    tl.to(face, {
      y: -3.5,
      rotation: 0.8,
      duration: 3.2,
      ease: 'sine.inOut'
    }).to(face, {
      y: 0,
      rotation: -0.5,
      duration: 3.0,
      ease: 'sine.inOut'
    });

    if (glow) {
      window.gsap.to(glow, {
        scale: 1.08,
        opacity: 0.85,
        duration: 2.8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
    }

    this._wallETween = tl;
  },

  stopCompanionLife() {
    if (this._wallETween) {
      this._wallETween.kill();
      this._wallETween = null;
    }
    const face = _$('avatar-face');
    const glow = _$('avatar-glow');
    if (window.gsap) {
      if (face) window.gsap.killTweensOf(face);
      if (glow) window.gsap.killTweensOf(glow);
    }
  },

  /* Mood Selection Tactile Feedback */
  moodReact(button) {
    if (!window.gsap || this.reduced()) return;
    const face = _$('avatar-face');
    const glow = _$('avatar-glow');
    const moodTxt = _$('avatar-mood-txt');
    const tl = window.gsap.timeline({ defaults: { ease: 'power2.out' } });

    // Tactile button bounce
    if (button) {
      tl.fromTo(button, { scale: 0.94 }, { scale: 1, duration: 0.24, ease: 'back.out(2)', clearProps: 'transform' });
    }

    // Companion acknowledges selection with subtle head tilt & warmth
    if (face) {
      tl.fromTo(
        face,
        { scale: 0.92, rotation: -2.5 },
        { scale: 1, rotation: 0, duration: 0.38, ease: 'back.out(1.6)', clearProps: 'transform' },
        '-=0.12'
      );
    }
    if (glow) {
      tl.fromTo(glow, { scale: 1.25, opacity: 1 }, { scale: 1, opacity: 0.7, duration: 0.45 }, '-=0.3');
    }
    if (moodTxt) {
      tl.fromTo(moodTxt, { autoAlpha: 0.4, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.28, clearProps: 'transform' }, '-=0.25');
    }
    this._track(tl);
  },

  /* Generic Tactile Button Interactions */
  initButtonInteractions() {
    if (this.reduced() || !window.gsap) return;
    // Fast, subtle button clicks across the app
    document.addEventListener('pointerdown', event => {
      const btn = event.target.closest('.btn-primary, .btn-ghost, .stat-tile, .pbar-btn, .mini-reset-btn');
      if (!btn) return;
      window.gsap.to(btn, { scale: 0.97, duration: 0.1, ease: 'power1.out' });
    });
    document.addEventListener('pointerup', event => {
      const btn = event.target.closest('.btn-primary, .btn-ghost, .stat-tile, .pbar-btn, .mini-reset-btn');
      if (!btn) return;
      window.gsap.to(btn, { scale: 1, duration: 0.18, ease: 'power2.out', clearProps: 'transform' });
    });
  },

  /* Quick Element Pulse */
  pulse(element) {
    if (!element || !window.gsap || this.reduced()) return;
    window.gsap.killTweensOf(element);
    this._track(
      window.gsap.fromTo(element, { scale: 0.94 }, { scale: 1, duration: 0.38, ease: 'back.out(1.8)', clearProps: 'transform' })
    );
  },

  /* Numeric Counter Tweening (Tabular) */
  count(element, value, format = number => String(number)) {
    const next = Number(value);
    if (!element || !Number.isFinite(next)) return;
    if (!window.gsap || this.reduced()) {
      element.textContent = format(next);
      return;
    }
    const active = this._countTweens.get(element);
    const start = Number.parseInt(element.textContent, 10) || 0;
    active?.tween.kill();
    const counter = { value: start };
    const entry = { tween: null, format, value: next };
    entry.tween = window.gsap.to(counter, {
      value: next,
      duration: 0.65,
      ease: 'power2.out',
      onUpdate: () => {
        element.textContent = format(Math.round(counter.value));
      },
      onComplete: () => {
        if (this._countTweens.get(element) === entry) this._countTweens.delete(element);
      }
    });
    this._countTweens.set(element, entry);
  },
};

const TinyResetGames = {
  root:null,
  growStage:0,
  popMessageIndex:0,
  popMessages:['Take a breath.','That was a tiny reset.','Ready for another?'],
  init() {
    const root=_$('tiny-reset-games');
    if(!root || this.root===root) return;
    this.root=root;
    root.addEventListener('click',event=>this.handle(event));
  },
  handle(event) {
    const control=event.target.closest('[data-game-action]');
    if(!control || !this.root.contains(control)) return;
    const action=control.dataset.gameAction;
    if(action==='settle-dot') this.settleDot(control);
    if(action==='reset-dots') this.resetDots();
    if(action==='gentle-pop') this.gentlePop();
    if(action==='reset-pop') this.resetPop();
    if(action==='grow') this.grow();
    if(action==='reset-grow') this.resetGrow();
  },
  settleDot(dot) {
    if(dot.getAttribute('aria-pressed')==='true') return;
    dot.setAttribute('aria-pressed','true');
    dot.classList.add('settled');
    const remaining=this.root.querySelectorAll('.calm-dot[aria-pressed="false"]').length;
    const status=this.root.querySelector('[data-game-status]');
    if(status) status.textContent=remaining?'One quiet moment.': 'All settled. Nice pause.';
    MotionSystem.pulse(dot);
  },
  resetDots() {
    this.root.querySelectorAll('.calm-dot').forEach(dot=>{dot.setAttribute('aria-pressed','false');dot.classList.remove('settled');});
    const status=this.root.querySelector('[data-game-status]'); if(status) status.textContent='Take your time.';
  },
  gentlePop() {
    const message=this.root.querySelector('[data-pop-message]');
    if(message){message.textContent=this.popMessages[this.popMessageIndex%this.popMessages.length];this.popMessageIndex++;}
    MotionSystem.pulse(this.root.querySelector('.gentle-pop-core'));
  },
  resetPop() {
    this.popMessageIndex=0;
    const message=this.root.querySelector('[data-pop-message]'); if(message) message.textContent='Ready when you are.';
    const core=this.root.querySelector('.gentle-pop-core'); if(core) core.style.removeProperty('transform');
  },
  grow() {
    const plants=['🌰','🌱','🌿','🪴','🌼'];
    this.growStage=Math.min(this.growStage+1,plants.length-1);
    const plant=this.root.querySelector('.grow-plant'), message=this.root.querySelector('[data-grow-message]');
    if(plant){plant.textContent=plants[this.growStage];plant.dataset.stage=String(this.growStage);MotionSystem.pulse(plant);}
    if(message) message.textContent=this.growStage===plants.length-1?'Lovely, at your own pace.':'A little care is enough.';
  },
  resetGrow() {
    this.growStage=0;
    const plant=this.root.querySelector('.grow-plant'), message=this.root.querySelector('[data-grow-message]');
    if(plant){plant.textContent='🌰';plant.dataset.stage='0';plant.style.removeProperty('transform');}
    if(message) message.textContent='Every beginning is enough.';
  },
  resetAll() { this.resetDots(); this.resetPop(); this.resetGrow(); },
};


/* ══════════════════════════════════════════════════════════════
   APP CONTROLLER  — Auth, routing, navigation
══════════════════════════════════════════════════════════════ */
const AppController = {

  /* ── Auth helpers ─────────────────────────────────────────── */
  getUsers()       { const users=Storage.readJSON(KEYS.USERS,{}); return users&&typeof users==='object'&&!Array.isArray(users)?users:{}; },
  saveUsers(u)     { return Storage.writeJSON(KEYS.USERS,u); },

  toggleAuth() {
    _$('login-form').classList.toggle('active');
    _$('signup-form').classList.toggle('active');
    _$('login-error').textContent = '';
    _$('signup-error').textContent = '';
  },

  startJourney() {
    const user = _$('login-username')?.value.trim();
    const pass = _$('login-password')?.value;
    if (user && pass) {
      this.login();
      return;
    }
    if (!_$('login-form').classList.contains('active')) {
      this.toggleAuth();
    }
    if (_$('login-username')) _$('login-username').value = 'demo';
    if (_$('login-password')) _$('login-password').value = 'demo1234';
    this.login();
  },

  login() {
    const user = _$('login-username').value.trim();
    const pass = _$('login-password').value;
    const err  = _$('login-error');
    if (!user||!pass) { err.textContent='Please fill in all fields.'; return; }
    const users = this.getUsers();
    const rec   = users[user.toLowerCase()];
    if (!rec || typeof rec.name!=='string' || !rec.name.trim() || rec.password !== btoa(pass)) { err.textContent='Invalid username or password.'; return; }
    _currentUser = { username: user.toLowerCase(), name: rec.name };
    Storage.writeJSON(KEYS.CURRENT,_currentUser);
    this._launch();
  },

  signup() {
    const name = _$('signup-name').value.trim();
    const user = _$('signup-username').value.trim();
    const pass = _$('signup-password').value;
    const err  = _$('signup-error');
    if (!name||!user||!pass) { err.textContent='Please fill in all fields.'; return; }
    if (user.length<3) { err.textContent='Username must be at least 3 characters.'; return; }
    if (pass.length<4) { err.textContent='Password must be at least 4 characters.'; return; }
    const users = this.getUsers();
    if (Object.prototype.hasOwnProperty.call(users,user.toLowerCase())) { err.textContent='Username already taken.'; return; }
    Object.defineProperty(users,user.toLowerCase(),{value:{name,password:btoa(pass)},writable:true,enumerable:true,configurable:true});
    if(!this.saveUsers(users)) { err.textContent='Could not save your account on this device.'; return; }
    _currentUser = { username: user.toLowerCase(), name };
    Storage.writeJSON(KEYS.CURRENT,_currentUser);
    this._launch();
  },

  logout() {
    Storage.remove(KEYS.CURRENT);
    AICompanion.cancelPending();
    BreathingSystem.stopActive();
    BoostSystem.resetMed();
    SoundSystem.stopAll();
    Analytics.destroyCharts();
    AnalyticsSystem.destroyCharts();
    MotionSystem.cleanup();
    TinyResetGames.resetAll();
    const chatContainer = _$('chat-messages');
    if (chatContainer) chatContainer.innerHTML = '';
    _currentUser = null;
    _$('app').classList.add('hidden');
    _$('auth-screen').style.display='flex';
    _$('login-username').value='';
    _$('login-password').value='';
    _$('login-error').textContent='';
    if(!_$('login-form').classList.contains('active')) this.toggleAuth();
  },

  _launch() {
    _$('auth-screen').style.display='none';
    _$('app').classList.remove('hidden');

    const first = _currentUser.name.split(' ')[0];
    _setText('sidebar-username', _currentUser.name);
    ['user-avatar','topbar-avatar'].forEach(id => _setText(id, first[0].toUpperCase()));

    /* Set topbar date */
    _setText('topbar-date', new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}));

    /* Init all modules */
    this.navigate('dashboard');
    AICompanion.init();
    AICompanion.initPersonality();
    MoodSystem.render();
    HabitSystem.renderList();
    HabitSystem.renderStreaks();
    JournalSystem.renderList();
    AnalyticsSystem.renderRecommendations();
    AnalyticsSystem.renderAffirmation();
    BoostSystem.init();
    Analytics.updateScore();
    MemoryGarden.render();
    MentalWeatherSystem.render();
    ConstellationSystem.render();
  },

  /* ── Navigation ────────────────────────────────────────────── */
  navigate(sectionId) {
    const current=_qs('.page-section.active');
    const next=_$('section-'+sectionId);
    if(current && current!==next) {
      if(_breathActive) BreathingSystem.stopActive();
      if(current.id==='section-moodboost'&&_medActive) BoostSystem._pauseMed();
    }
    if(current?.id==='section-dashboard'&&current.id!=='section-'+sectionId) Analytics.destroyCharts();
    if(current?.id==='section-report'&&current.id!=='section-'+sectionId) AnalyticsSystem.destroyCharts();
    _qsa('.page-section').forEach(s=>s.classList.remove('active'));
    _qsa('.nav-link').forEach(n=>n.classList.remove('active'));

    const sec = next;
    const nav = _qs(`[data-section="${sectionId}"]`);
    if (sec) sec.classList.add('active');
    if (nav) nav.classList.add('active');
    MotionSystem.show(current,sec);

    const titles = {
      dashboard: 'Dashboard',
      mood: 'Mood Tracker',
      chat: 'AI Companion',
      journal: 'Wellness Journal',
      habits: 'Habit Tracker',
      moodboost: 'Mood Boost',
      garden: 'Memory Garden',
      recommendations: 'Insights',
      report: 'Wellness Report',
      sounds: 'Zen Station',
    };
    const subtitles = {
      dashboard: "Take a deep breath. You're doing great.",
      mood: 'How are you feeling today? Check in gently.',
      chat: 'Your calm, listening space companion.',
      journal: "Write what's on your mind. Free of judgment.",
      habits: 'Care over streaks. Small daily rhythms.',
      moodboost: 'Science-backed exercises to reset your mind.',
      garden: 'Your living sanctuary of growth and wins.',
      recommendations: 'Gentle patterns and personalized guidance.',
      report: 'Reflecting on your wellness progress.',
      sounds: 'Ambient soundscapes to soothe your focus.',
    };
    const greetEl = _$('topbar-greeting-text');
    const subEl = _$('topbar-subtext');
    const sunEl = _qs('.topbar-sun-icon');
    if (greetEl) {
      if (sectionId === 'dashboard') {
        const hr = new Date().getHours();
        const tod = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
        const first = _currentUser ? _currentUser.name.split(' ')[0] : 'there';
        greetEl.textContent = `Good ${tod}, ${first}!`;
        if (subEl) subEl.textContent = subtitles.dashboard;
        if (sunEl) sunEl.style.display = 'inline';
      } else {
        greetEl.textContent = titles[sectionId] || 'WALL·E';
        if (subEl) subEl.textContent = subtitles[sectionId] || '';
        if (sunEl) sunEl.style.display = 'none';
      }
    } else {
      _setText('topbar-title', titles[sectionId] || 'WALL·E');
    }

    if (sectionId==='dashboard') {
      Analytics.updateStats();
      Analytics.updateScore();
      MentalWeatherSystem.render();
      ConstellationSystem.render();
      setTimeout(()=>{ if(_$('section-dashboard')?.classList.contains('active')) Analytics.buildCharts(); }, 80);
    }
    if (sectionId==='garden') {
      MemoryGarden.render();
    }
    if (sectionId==='report') {
      setTimeout(()=>{ if(_$('section-report')?.classList.contains('active')) AnalyticsSystem.buildReport(); }, 100);
    }

    /* Close sidebar on mobile */
    if (window.innerWidth <= 768) {
      _$('sidebar').classList.remove('open');
    }
  },

  toggleSidebar() { _$('sidebar').classList.toggle('open'); },
};


/* ══════════════════════════════════════════════════════════════
   MOOD SYSTEM
══════════════════════════════════════════════════════════════ */
const MoodSystem = {
  get()       { return Storage.readUser(KEYS.MOODS,_currentUser.username,[]); },
  save(moods) { return Storage.writeUser(KEYS.MOODS,_currentUser.username,moods); },

  select(btn) {
    _qsa('.mood-tile').forEach(b=>{ b.classList.remove('selected'); b.setAttribute('aria-pressed','false'); });
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed','true');
    _selectedMood = { label: btn.dataset.mood, score: parseInt(btn.dataset.score) };
    AICompanion.updateAvatar(_selectedMood.label);
    const feedback=_$('mood-selection-feedback');
    if(feedback) feedback.textContent=`WALL·E noticed: ${_selectedMood.label.toLowerCase()} feels like the right word.`;
    MotionSystem.moodReact(btn);
  },

  log() {
    const msgEl = _$('mood-saved-msg');
    if (!_selectedMood) { msgEl.textContent='⚠ Please select a mood first.'; msgEl.style.color='var(--c-rose)'; return; }
    const note  = _$('mood-note').value.trim();
    const entry = { id:Date.now(), mood:_selectedMood.label, score:_selectedMood.score, note, timestamp:new Date().toISOString() };
    const moods = this.get();
    moods.unshift(entry);
    if(!this.save(moods)) { msgEl.textContent='This mood could not be saved on this device.'; msgEl.style.color='var(--c-rose)'; return; }
    _qsa('.mood-tile').forEach(b=>{ b.classList.remove('selected'); b.setAttribute('aria-pressed','false'); });
    _$('mood-note').value = '';
    _selectedMood = null;
    _setText('mood-selection-feedback','');
    msgEl.textContent='✓ Mood logged!'; msgEl.style.color='var(--c-emerald)';
    this.render();
    Analytics.updateStats();
    Analytics.updateScore();
    AICompanion.updateAvatar();
    ConstellationSystem.addStar('mood', `Logged mood: ${entry.mood}`);
    MentalWeatherSystem.render();
  },

  delete(id) {
    this.save(this.get().filter(m=>m.id!==id));
    this.render();
    Analytics.updateStats();
    Analytics.updateScore();
    MentalWeatherSystem.render();
  },

  render() {
    const el    = _$('mood-history-list');
    const moods = this.get();
    if (!moods.length) { el.innerHTML='<p class="empty-state">No mood entries yet. Log your first mood above!</p>'; return; }
    el.innerHTML = moods.slice(0,20).map(m=>{
      const mood=MOOD_EMOJI[m.mood]?m.mood:'Neutral';
      const dt  = new Date(m.timestamp);
      const day = dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      const hr  = dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      return `
        <div class="mood-log-entry">
          <span class="mood-log-emoji">${MOOD_EMOJI[mood]}</span>
          <div class="mood-log-info">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="mood-log-label">${mood}</span>
              <span class="mood-chip ${mood}">${mood}</span>
            </div>
            ${m.note?`<p class="mood-log-note">"${_esc(m.note)}"</p>`:''}
          </div>
          <span class="mood-log-time">${day} · ${hr}</span>
          <button class="mood-log-del" onclick="MoodSystem.delete(${_safeId(m.id)})" title="Delete">✕</button>
        </div>`;
    }).join('');
  },
};


/* ══════════════════════════════════════════════════════════════
   ANALYTICS  — Stats, Charts, Wellness Score
══════════════════════════════════════════════════════════════ */
const Analytics = {

  destroyCharts() {
    [_chartMoodTrend,_chartMoodDist,_chartHabit].forEach(chart=>chart?.destroy());
    _chartMoodTrend=_chartMoodDist=_chartHabit=null;
  },

  /* ── Stats Cards ─────────────────────────────────────────── */
  updateStats() {
    const moods    = MoodSystem.get();
    const journal  = JournalSystem.get();
    const habits   = HabitSystem.get();
    const habitLog = HabitSystem.getLog();
    const today    = _todayKey();

    const todayMood = moods.find(m=>m.timestamp.startsWith(today));
    _setText('stat-today-mood', todayMood ? `${MOOD_EMOJI[todayMood.mood]} ${todayMood.mood}` : '— Not logged');
    MotionSystem.count(_$('stat-journal-count'),journal.length);

    const todayDone = habits.filter(h=>(habitLog[today]||[]).includes(h.id));
    MotionSystem.count(_$('stat-habits-today'),todayDone.length,n=>`${n}/${habits.length}`);

    let streak=0;
    for(let i=0;i<30;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      const k=_dateKey(d);
      if((habitLog[k]||[]).length>0) streak++;
      else if(i>0) break;
    }
    MotionSystem.count(_$('stat-streak'),streak,n=>`${n} day${n!==1?'s':''}`);

    /* Living Garden Count */
    const gardenCount = (typeof MemoryGarden !== 'undefined' && MemoryGarden.get) ? MemoryGarden.get().length : 0;
    MotionSystem.count(_$('stat-garden-blooms'), gardenCount, n => `${n} bloom${n !== 1 ? 's' : ''}`);

    /* Dashboard live date & sanctuary thought */
    const dateEl = _$('sanctuary-live-date');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    const thoughtEl = _$('sanctuary-thought');
    if (thoughtEl) {
      if (todayMood && (todayMood.mood === 'Sad' || todayMood.mood === 'Stressed')) {
        thoughtEl.textContent = `"I'm right here beside you. You don't have to carry everything all at once."`;
      } else if (todayMood && todayMood.mood === 'Happy') {
        thoughtEl.textContent = `"Your warmth reaches across the stars today. Hold onto this glowing moment."`;
      } else if (todayMood && todayMood.mood === 'Calm') {
        thoughtEl.textContent = `"Steady and peaceful like a quiet orbit. Keep honoring your inner stillness."`;
      } else {
        thoughtEl.textContent = `"Take a slow breath. Your thoughts have a quiet place to land here with me."`;
      }
    }

    /* Sanctuary Floating Mood Card */
    if (todayMood) {
      _setText('sanctuary-mood-emoji', MOOD_EMOJI[todayMood.mood] || '😌');
      _setText('sanctuary-mood-title', todayMood.mood);
      const energyMap = {
        Happy: 'Energy: High & Bright',
        Calm: 'Energy: Centered & Calm',
        Neutral: 'Energy: Steady',
        Stressed: 'Energy: High Tension',
        Sad: 'Energy: Quiet & Tender'
      };
      _setText('sanctuary-mood-energy', energyMap[todayMood.mood] || 'Energy: Steady');
      const aura = _$('sanctuary-aura');
      if (aura) {
        const auraColors = {
          Happy: 'radial-gradient(circle, rgba(245, 158, 11, 0.35), transparent 70%)',
          Calm: 'radial-gradient(circle, rgba(56, 189, 248, 0.3), transparent 70%)',
          Neutral: 'radial-gradient(circle, rgba(148, 163, 184, 0.25), transparent 70%)',
          Stressed: 'radial-gradient(circle, rgba(129, 140, 248, 0.3), transparent 70%)',
          Sad: 'radial-gradient(circle, rgba(99, 102, 241, 0.3), transparent 70%)'
        };
        aura.style.background = auraColors[todayMood.mood] || '';
      }
    } else {
      _setText('sanctuary-mood-emoji', '🌱');
      _setText('sanctuary-mood-title', 'Unchecked');
      _setText('sanctuary-mood-energy', 'Ready for today');
      const aura = _$('sanctuary-aura');
      if (aura) aura.style.background = 'radial-gradient(circle, rgba(16, 185, 129, 0.25), transparent 70%)';
    }

    /* Dashboard greeting & topbar */
    const hr   = new Date().getHours();
    const tod  = hr<12?'Morning':hr<17?'Afternoon':'Evening';
    const ws   = this.calcScore();
    const { emoji, label } = this.scoreLabel(ws.total);
    const el = _$('dashboard-greeting');
    if (el) el.textContent = `Good ${tod}, ${_currentUser.name.split(' ')[0]}! — ${emoji} ${label}`;
    const topGreet = _$('topbar-greeting-text');
    if (topGreet && _qs('.page-section.active')?.id === 'section-dashboard') {
      topGreet.textContent = `Good ${tod.toLowerCase()}, ${_currentUser.name.split(' ')[0]}!`;
    }
  },

  /* ── Wellness Score ──────────────────────────────────────── */
  calcScore() {
    const moods    = MoodSystem.get();
    const habits   = HabitSystem.get();
    const habitLog = HabitSystem.getLog();
    const journal  = JournalSystem.get();
    const chat     = AICompanion.getHistory();

    /* Mood: last 7 days avg (1–5 → 0–100%) */
    const rMoods  = moods.filter(m=>(Date.now()-new Date(m.timestamp).getTime())/86400000<=7);
    const moodAvg = rMoods.length ? rMoods.reduce((s,m)=>s+m.score,0)/rMoods.length : 3;
    const moodPct = Math.round(((moodAvg-1)/4)*100);

    /* Habits: avg daily completion last 7 days */
    let hSum=0;
    for(let i=0;i<7;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      hSum += habits.length ? ((habitLog[_dateKey(d)]||[]).length/habits.length)*100 : 0;
    }
    const habitPct = Math.round(hSum/7);

    /* Journal: entries in last 7 days, capped at 7 */
    const rJournal  = journal.filter(e=>(Date.now()-new Date(e.timestamp).getTime())/86400000<=7);
    const journalPct = Math.min(Math.round((rJournal.length/7)*100),100);

    /* Chat positivity: last 20 user messages */
    const uMsgs  = chat.filter(m=>m.role==='user').slice(-20);
    const negKw  = /\b(sad|cry|depress|stress|anxious|angry|lonely|hate|hopeless|worthless|suicid|harm)\b/i;
    const posCnt = uMsgs.filter(m=>!negKw.test(m.text)).length;
    const chatPct = uMsgs.length ? Math.round((posCnt/uMsgs.length)*100) : 70;

    const total = Math.round(moodPct*0.4 + habitPct*0.3 + journalPct*0.2 + chatPct*0.1);
    return { total, moodPct, habitPct, journalPct, chatPct };
  },

  scoreLabel(score) {
    if(score>=80) return { label:'Excellent',      emoji:'🌟', color:'var(--c-emerald)' };
    if(score>=60) return { label:'Balanced',        emoji:'🌤', color:'var(--c-sky)'    };
    if(score>=40) return { label:'Needs Attention', emoji:'🌥', color:'var(--c-amber)'  };
    return                { label:'Critical Care',  emoji:'⚠',  color:'var(--c-rose)'  };
  },

  updateScore() {
    const { total, moodPct, habitPct, journalPct, chatPct } = this.calcScore();
    const { label, emoji, color } = this.scoreLabel(total);

    /* SVG ring (314 = 2π×50) */
    const ring = _$('ws-ring-fill');
    if (ring) MotionSystem.animateRing(ring, total);

    MotionSystem.count(_$('ws-score-num'),total);

    const badge = _$('ws-status-badge');
    if(badge){ badge.textContent=`${emoji} ${label}`; badge.style.color=color; badge.style.borderColor=color+'55'; badge.style.background=color+'18'; }

    /* Breakdown bars */
    _setWidth('wb-mood',    moodPct);    _setText('wb-mood-val',    moodPct+'%');
    _setWidth('wb-habit',   habitPct);   _setText('wb-habit-val',   habitPct+'%');
    _setWidth('wb-journal', journalPct); _setText('wb-journal-val', journalPct+'%');
    _setWidth('wb-chat',    chatPct);    _setText('wb-chat-val',    chatPct+'%');

    /* Tip: weakest dimension */
    const tips = {
      mood:   '💡 Log your mood daily to improve your score.',
      habit:  '💡 Complete at least one habit every day.',
      journal:'💡 Write a journal entry tonight.',
      chat:   '💡 Chat with WALL·E for emotional support.',
    };
    const dims = { mood:moodPct, habit:habitPct, journal:journalPct, chat:chatPct };
    const weak = Object.entries(dims).sort((a,b)=>a[1]-b[1])[0][0];
    _setText('ws-tip', tips[weak]||'');

    /* Sidebar score block */
    _setWidth('sidebar-ws-bar', total);
    _setText('sidebar-ws-val', total+'%');
    _setText('sidebar-ws-status', `${emoji} ${label}`);

    /* Topbar pill */
    _setText('ws-topbar-val', `${total}%`);

    return { total, moodPct, habitPct, journalPct, chatPct };
  },

  /* ── Charts ─────────────────────────────────────────────── */
  buildCharts() {
    this.buildMoodTrend();
    this.buildMoodDist();
    this.buildHabitChart();
  },

  buildMoodTrend() {
    const canvas = _$('moodTrendChart'); if(!canvas||typeof Chart==='undefined') return;
    if(_chartMoodTrend) _chartMoodTrend.destroy();
    const primary=_colorToken('--accent-indigo','#6366f1');
    const chartText=_colorToken('--text-secondary','#94a3b8');
    const labels=[], data=[], moods=MoodSystem.get();
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
      const key=d.toISOString().slice(0,10);
      labels.push(d.toLocaleDateString('en-US',{weekday:'short'}));
      const dayM=moods.filter(m=>m.timestamp.startsWith(key));
      data.push(dayM.length ? +(dayM.reduce((s,m)=>s+m.score,0)/dayM.length).toFixed(1) : null);
    }
    /* Trend badge */
    const valid=data.filter(v=>v!==null);
    if(valid.length>=2){
      const diff=valid[valid.length-1]-valid[0];
      const b=_$('mood-trend-badge');
      if(b){ b.textContent=diff>0?'↑ Improving':diff<0?'↓ Declining':'→ Stable'; b.style.color=diff>0?_colorToken('--c-emerald','#10b981'):diff<0?_colorToken('--c-rose','#f43f5e'):chartText; b.style.borderColor=diff>0?_withAlpha(_colorToken('--c-emerald','#10b981'),'66'):diff<0?_withAlpha(_colorToken('--c-rose','#f43f5e'),'66'):_colorToken('--border','rgba(148,163,184,.15)'); }
    }
    _chartMoodTrend=new Chart(canvas,{
      type:'line',
      data:{ labels, datasets:[{ data, borderColor:primary, backgroundColor:_withAlpha(primary,'24'), borderWidth:2, pointBackgroundColor:primary, pointBorderColor:_colorToken('--bg-base','#070a14'), pointRadius:4, pointHoverRadius:6, tension:0.35, fill:true, spanGaps:true }] },
      options:{ responsive:true,maintainAspectRatio:false, scales:{ y:{min:1,max:5,ticks:{color:chartText,stepSize:1,callback:v=>['','😢','😰','😐','😌','😊'][v]||v},grid:{color:'rgba(148,163,184,.07)'}}, x:{ticks:{color:chartText},grid:{color:'rgba(148,163,184,.05)'}} }, plugins:{legend:{display:false}} }
    });
  },

  buildMoodDist() {
    const canvas=_$('moodDistChart'); if(!canvas||typeof Chart==='undefined') return;
    if(_chartMoodDist) _chartMoodDist.destroy();
    const colors=['--mood-happy','--mood-calm','--mood-neutral','--mood-stressed','--mood-sad'].map((token,index)=>_colorToken(token,['#f59e0b','#0ea5e9','#94a3b8','#818cf8','#6366f1'][index]));
    const counts={Happy:0,Calm:0,Neutral:0,Stressed:0,Sad:0};
    MoodSystem.get().forEach(m=>{if(counts[m.mood]!==undefined)counts[m.mood]++;});
    _chartMoodDist=new Chart(canvas,{
      type:'doughnut',
      data:{ labels:Object.keys(counts), datasets:[{ data:Object.values(counts), backgroundColor:colors.map(color=>_withAlpha(color,'b8')), borderColor:colors, borderWidth:2,hoverOffset:5 }] },
      options:{ responsive:true,maintainAspectRatio:false,cutout:'68%', plugins:{legend:{position:'right',labels:{color:_colorToken('--text-secondary','#94a3b8'),padding:12,font:{family:'Plus Jakarta Sans, system-ui, sans-serif',size:12,weight:500}}}} }
    });
  },

  buildHabitChart() {
    const canvas=_$('habitChart'); if(!canvas||typeof Chart==='undefined') return;
    if(_chartHabit) _chartHabit.destroy();
    const success=_colorToken('--c-emerald','#10b981'), warning=_colorToken('--c-amber','#f59e0b'), info=_colorToken('--c-sky','#0ea5e9');
    const chartText=_colorToken('--text-secondary','#94a3b8');
    const habits=HabitSystem.get(), habitLog=HabitSystem.getLog();
    const labels=[], data=[];
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i); const k=_dateKey(d);
      labels.push(d.toLocaleDateString('en-US',{weekday:'short'}));
      data.push(habits.length?Math.round(((habitLog[k]||[]).length/habits.length)*100):0);
    }
    _chartHabit=new Chart(canvas,{
      type:'bar',
      data:{ labels, datasets:[{ data, backgroundColor:data.map(v=>_withAlpha(v>=80?success:v>=50?info:warning,'a8')), borderColor:data.map(v=>v>=80?success:v>=50?info:warning), borderWidth:1, borderRadius:6 }] },
      options:{ responsive:true,maintainAspectRatio:false, scales:{ y:{min:0,max:100,ticks:{color:chartText,callback:v=>v+'%'},grid:{color:'rgba(148,163,184,.07)'}}, x:{ticks:{color:chartText},grid:{display:false}} }, plugins:{legend:{display:false}} }
    });
  },
};


/* ══════════════════════════════════════════════════════════════
   AI COMPANION  — Chat, personality, avatar
══════════════════════════════════════════════════════════════ */
const AICompanion = {

  /* ── Personality ─────────────────────────────────────────── */
  PERSONALITIES: {
    friend: {
      name:'Friend Mode', icon:'😊', color:'#38bdf8',
      pre:['Hey! ','Aw, ','Oh friend — ','Honestly? ','You know what? '],
      suf:[' You\'ve got this! 💙',' I\'m right here for you.',' Sending good vibes! ✨',' You\'re not alone.',''],
      face:'🤗', glow:'rgba(56,189,248,0.22)', label:'Your supportive friend',
    },
    therapist: {
      name:'Therapist Mode', icon:'🧠', color:'#8b5cf6',
      pre:['I hear you. ','That\'s meaningful. ','Let\'s sit with that — ','I appreciate you sharing. ','I notice '],
      suf:[' What comes up for you around that?',' How long have you felt this way?',' What does that mean for you?',' I wonder what that\'s like for you.',''],
      face:'🧘', glow:'rgba(139,92,246,0.22)', label:'Your reflective therapist',
    },
    motivator: {
      name:'Motivator Mode', icon:'🚀', color:'#06b6d4',
      pre:['YES! ','LISTEN — ','This is your moment! ','Champions do this: ','No limits! '],
      suf:[' Now GO! 💪',' You have everything it takes!',' The world needs your energy!',' Every setback is a comeback setup!',''],
      face:'🔥', glow:'rgba(6,182,212,0.22)', label:'Your personal motivator',
    },
  },

  getPersonality() {
    const mode=Storage.readUser(KEYS.PERSONALITY,_currentUser?.username,'friend');
    return this.PERSONALITIES[mode] ? mode : 'friend';
  },
  savePersonality(mode) {
    if(!this.PERSONALITIES[mode]) return false;
    return Storage.writeUser(KEYS.PERSONALITY,_currentUser.username,mode);
  },
  applyPersonality(text) {
    const mode=this.getPersonality();
    const cfg=this.PERSONALITIES[mode]; if(!cfg) return text;
    const pre = _rand(cfg.pre) || '';
    const suf = _rand(cfg.suf) || '';
    let result = String(text || '').trim();
    if (pre && !result.toLowerCase().startsWith(pre.trim().toLowerCase())) {
      result = pre + result;
    }
    if (suf.trim() && !result.endsWith(suf.trim())) {
      result = result + ' ' + suf.trim();
    }
    return result;
  },

  initPersonality() {
    const mode=this.getPersonality();
    this.setPersonality(mode);
  },

  setPersonality(mode) {
    if(!this.PERSONALITIES[mode]) mode='friend';
    this.savePersonality(mode);
    _qsa('.pbar-btn').forEach(b=>{
      b.classList.remove('active','mode-friend','mode-therapist','mode-motivator');
      if(b.dataset.mode===mode) b.classList.add('active','mode-'+mode);
    });
    const cfg=this.PERSONALITIES[mode];
    const chip=_$('pchip');
    if(chip){ chip.textContent=cfg.icon+' '+cfg.name; chip.style.background=cfg.color+'18'; chip.style.borderColor=cfg.color+'55'; chip.style.color=cfg.color; }
    const face=_$('avatar-face'), glow=_$('avatar-glow'), lbl=_$('avatar-mood-txt');
    const r1=_$('avatar-r1'), r2=_$('avatar-r2');
    if(face) face.textContent=cfg.face;
    if(glow) glow.style.background=`radial-gradient(circle,${cfg.glow},transparent 70%)`;
    if(lbl)  lbl.textContent=cfg.label;
    if(r1)   r1.style.borderColor=cfg.color+'30';
    if(r2)   r2.style.borderColor=cfg.color+'18';
  },

  updateAvatar(moodOverride) {
    const moods=MoodSystem.get();
    const latest=moodOverride || moods[0]?.mood;
    if(!latest) return;
    const map={ Happy:{face:'🥰',glow:'rgba(56,189,248,0.25)',lbl:'Sharing your joy!'}, Calm:{face:'😌',glow:'rgba(14,165,233,0.25)',lbl:'At peace with you'}, Neutral:{face:'🤖',glow:'rgba(148,163,184,0.20)',lbl:'Ready to listen'}, Stressed:{face:'😟',glow:'rgba(129,140,248,0.22)',lbl:'Here to help you calm down'}, Sad:{face:'🥺',glow:'rgba(99,102,241,0.22)',lbl:'Sending you a hug 💙'} };
    const r=map[latest]||map.Neutral;
    const face=_$('avatar-face'), glow=_$('avatar-glow'), lbl=_$('avatar-mood-txt');
    if(face) face.textContent=r.face;
    if(glow) glow.style.background=`radial-gradient(circle,${r.glow},transparent 70%)`;
    if(lbl)  lbl.textContent=r.lbl;
  },

  /* ── Chat responses corpus ─────────────────────────────── */
  RESPONSES: {
    greeting: ["Hey there! 😊 I'm WALL·E, your mental wellness companion. How are you feeling today?","Hello! It's wonderful to see you. What's on your mind today?","Hi! I'm really glad you stopped by. How's your day going so far?","Good to hear from you! I'm here to listen — what's up?"],
    happy:    ["That's absolutely wonderful to hear! 🌟 What's bringing you joy today?","Amazing! Your positive energy is contagious 😊. What's making you feel so great?","Love that! Savor these happy moments. What's going well for you?","Happiness looks great on you! ✨ Would you like to journal about this?"],
    calm:     ["Feeling calm is such a gift 😌. What's helping you maintain that peace?","Calmness is the foundation of wellbeing. Have you been meditating?","Peaceful moments are worth appreciating. Keep nurturing that inner stillness! 🌿"],
    sad:      ["I'm really sorry you're feeling sad.Would you like to talk about it? 💙 Sadness is valid. Want to talk about what's going on?","Sadness can feel heavy, but you don't carry it alone. What's making you feel this way?","Thank you for sharing that. It sometimes helps to write about it in your journal — would you like to try?","Your feelings matter. Take a gentle breath with me. Can you tell me more? 💙"],
    stressed: ["Stress is really tough 😔. Let's try breathing — in 4s, hold 7s, out 8s. What's weighing on you?","I can feel the weight in your words. What's the biggest thing stressing you right now?","When stressed, small steps help. What's one thing you could take off your plate today?","You've handled every difficult day so far — 100% success rate! 💪"],
    anxious:  ["Anxiety is so hard. 🫂 Try grounding: name 5 things you can see right now.","Anxiety often comes from uncertainty. Let's take this one breath at a time — you're safe right now.","Deep breath first 🌬️. You are not your anxiety. What's been triggering these feelings?"],
    tired:    ["Rest is genuinely productive 😴. How has your sleep been lately?","Tiredness is a signal. When did you last do something purely relaxing and joyful?","Try a 10-minute walk or nap. Nature + movement resets the mind. 🌿"],
    lonely:   ["Loneliness is one of the most human feelings. 💙 I'm here with you. What would help you feel more connected?","You're not alone in feeling lonely — I'm literally right here! 🤖 Who would you love to reconnect with?","A small act of connection — a text to a friend — can shift loneliness. What feels manageable today?"],
    angry:    ["It's okay to feel angry. Your feelings are valid. 🌊 What happened?","Anger often protects something we care about. What's underneath that for you?","Writing it in your journal can really help release it. 💨"],
    meditation:["Meditation is so powerful 🧘. Even 5 minutes reduces anxiety. Try the Mood Boost section!","Start with 5 minutes of focused breathing. Close your eyes and follow your breath. No perfect way!","Box breathing: 4 in, 4 hold, 4 out, 4 hold. Repeat 4 times. Very calming."],
    exercise:  ["Exercise is mental health medicine 🏃! Even a 20-minute walk improves mood significantly.","Movement releases endorphins — nature's mood boosters! 💪 What kind of movement do you enjoy?","Consistency over intensity! Three 10-minute walks beat one exhausting hour at the gym."],
    sleep:     ["Sleep is the foundation of mental wellness 😴. Aim for 7-9 hours. What's your bedtime routine?","Poor sleep makes emotions literally harder to regulate. Try 4-7-8 breathing before bed.","A consistent bedtime is one of the most impactful wellness habits you can build."],
    gratitude: ["Gratitude rewires the brain toward positivity 🌟. What are 3 things you're grateful for today?","Gratitude journaling for 5 minutes daily can measurably improve wellbeing within weeks.","Even tiny things count — warm coffee, a comfortable bed, the fact that you're here. ✨"],
    help:      ["I'm here for your mental wellness journey 💙. You can track moods, journal, build habits, or just chat.","Tell me how you're feeling, log a mood, or write in your journal. What would help most right now?"],
    default:   ["Tell me more about that. I'm fully here for you. 💙","That's really interesting. How does that make you feel?","I appreciate you sharing that. What's been the hardest part?","You're doing great by talking about this. What would feel most helpful right now?","Your feelings make complete sense. What would you like to explore together?"],
    goodbye:   ["Take good care of yourself! 🌟 Remember: you deserve kindness — especially from yourself.","It was lovely chatting! Go be gentle with yourself today. 💙","Goodbye for now! Don't forget to log your mood! 💧"],
    journal:   ["Journaling is powerful for emotional processing 📓. Head to the Journal section and write it out!","Writing about your feelings helps your brain make sense of them. The Journal section is ready!"],
    habit:     ["Small consistent actions compound into big change 🌱. Check out the Habit Tracker!","What wellness habit would you most like to build? The Habit Tracker can help you stay consistent!"],
    positive:  ["That's a beautiful perspective 🌟. Moments of clarity like this are worth holding onto.","Yes! That kind of thinking is so healthy. How can we build on that momentum?","Love that energy! ✨ What's been contributing to this positivity?"],
    affirmation:["Here's one: 'I am enough, exactly as I am, right now.' 💙","'Every day is a new beginning. Take a deep breath and start again.' 🌿","'You have survived 100% of your worst days. You are stronger than you know.' ✨"],
    crisis:    ["I'm really concerned about what you've shared. Please know you're not alone. 💙 Please reach out to a crisis helpline — in India: iCall: 9152987821. You deserve real support right now.","What you're feeling sounds very serious. Please contact a mental health professional or crisis line. You matter."],
  },

  detectIntent(msg) {
    const m=msg.toLowerCase();
    if(/suicid|kill myself|end my life|don't want to live|harm myself|self.?harm/.test(m)) return 'crisis';
    if(/^(hi|hey|hello|good morning|good evening|good afternoon|sup|howdy)\b/.test(m)) return 'greeting';
    if(/\b(bye|goodbye|see you|take care|later|goodnight)\b/.test(m)) return 'goodbye';
    if(/\b(happy|great|amazing|wonderful|excited|fantastic|joyful|awesome)\b/.test(m)) return 'happy';
    if(/\b(calm|peaceful|relaxed|serene|content|tranquil)\b/.test(m)) return 'calm';
    if(/\b(sad|depressed|down|unhappy|miserable|heartbroken|grief|crying|cry)\b/.test(m)) return 'sad';
    if(/\b(stress|stressed|overwhelm|overload|pressure|burnout|too much)\b/.test(m)) return 'stressed';
    if(/\b(anxious|anxiety|worried|worry|nervous|panic|fear|scared)\b/.test(m)) return 'anxious';
    if(/\b(tired|exhausted|fatigue|drained|worn out|sleepy)\b/.test(m)) return 'tired';
    if(/\b(lonely|alone|isolated|nobody|no one|friendless)\b/.test(m)) return 'lonely';
    if(/\b(angry|mad|furious|rage|irritated|frustrated|annoyed)\b/.test(m)) return 'angry';
    if(/\b(meditat|mindful|breath|breathing|zen)\b/.test(m)) return 'meditation';
    if(/\b(exercise|workout|run|walk|gym|sport|fitness|yoga)\b/.test(m)) return 'exercise';
    if(/\b(sleep|insomnia|rest|nap|bedtime)\b/.test(m)) return 'sleep';
    if(/\b(grateful|gratitude|thankful|appreciate|blessed)\b/.test(m)) return 'gratitude';
    if(/\b(journal|write|diary|reflect)\b/.test(m)) return 'journal';
    if(/\b(habit|routine|track|consistency|daily)\b/.test(m)) return 'habit';
    if(/\b(affirmation|affirm|mantra)\b/.test(m)) return 'affirmation';
    if(/\b(help|what can you do|how does this work|support)\b/.test(m)) return 'help';
    if(/\b(love|life is good|doing well|feeling good|positive|optimistic)\b/.test(m)) return 'positive';
    return 'default';
  },

  generateResponse(text) {
    const intent=this.detectIntent(text);
    const base=_rand(this.RESPONSES[intent]||this.RESPONSES.default);
    return intent!=='crisis' ? this.applyPersonality(base) : base;
  },

  /* ── Chat persistence ─────────────────────────────────── */
  getHistory() { return Storage.readUser(KEYS.CHAT,_currentUser?.username,[]); },
  saveHistory(h){ return Storage.writeUser(KEYS.CHAT,_currentUser?.username,h.slice(-80)); },

  _isGenerating: false,

  cancelPending() {
    _chatReplyTimers.forEach(timer=>clearTimeout(timer));
    _chatReplyTimers.clear();
    this._removeTyping();
    this._isGenerating = false;
    const sendBtn = document.querySelector('.chat-send-btn');
    if (sendBtn) sendBtn.disabled = false;
  },

  /* ── Chat render ──────────────────────────────────────── */
  init() {
    const container=_$('chat-messages');
    if (!container) return;
    this.cancelPending();
    container.innerHTML='';
    const history=this.getHistory();
    if(!history.length){
      const first = _currentUser?.name ? _currentUser.name.split(' ')[0] : 'friend';
      const welcome={ role:'bot', text:`Hello ${first}! 👋 I'm WALL·E, your personal AI mental wellness companion. I'm here to listen, support, and guide you. How are you feeling today?`, time:new Date().toISOString() };
      this.saveHistory([welcome]);
      this._renderMsg(welcome, container);
    } else {
      history.forEach(msg=>this._renderMsg(msg, container));
      container.scrollTop=container.scrollHeight;
    }
    this.updateAvatar();
    /* Attach breathing circle listener for insights page */
    const bc2=_$('breathing-circle-2');
    if(bc2) bc2.onclick=()=>BreathingSystem.toggle('breathing-circle-2','breathing-label-2','breathing-instruction-2');
  },

  _renderMsg(msg, container) {
    if (!container) return;
    const isUser=msg.role==='user';
    const time=new Date(msg.time).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    const div=document.createElement('div');
    div.className=`chat-msg ${isUser?'user':'bot'}`;
    div.innerHTML='<div class="chat-msg-avatar"></div><div class="chat-msg-content"><div class="chat-bubble"></div><div class="chat-msg-time"></div></div>';
    div.querySelector('.chat-msg-avatar').textContent=isUser?(_currentUser?.name ? _currentUser.name[0].toUpperCase() : 'U'):'🤖';
    div.querySelector('.chat-bubble').textContent=String(msg.text??'');
    div.querySelector('.chat-msg-time').textContent=time;
    container.appendChild(div);
    container.scrollTop=container.scrollHeight;
  },

  _removeTyping(container) {
    const target = container || _$('chat-messages');
    if (!target) return;
    target.querySelectorAll('.typing-pending').forEach(el => el.remove());
  },

  _showTyping(container) {
    this._removeTyping(container);
    const el=document.createElement('div');
    el.className='chat-msg bot typing-pending';
    el.innerHTML='<div class="chat-msg-avatar">🤖</div><div class="chat-msg-content"><div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>';
    container.appendChild(el);
    container.scrollTop=container.scrollHeight;
    return el;
  },

  send() {
    if (this._isGenerating) return;
    const input=_$('chat-input'), container=_$('chat-messages');
    if (!input || !container) return;
    const text=input.value.trim();
    if(!text) return;

    this._isGenerating = true;
    const sendBtn = document.querySelector('.chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    const userMsg={ role:'user', text, time:new Date().toISOString() };
    this._renderMsg(userMsg, container);
    const h=this.getHistory(); h.push(userMsg); this.saveHistory(h);

    input.value='';
    input.style.height = 'auto';

    const typing=this._showTyping(container);
    const replyTimer=setTimeout(()=>{
      _chatReplyTimers.delete(replyTimer);
      this._removeTyping(container);
      this._isGenerating = false;
      if (sendBtn) sendBtn.disabled = false;
      if(!_currentUser) return;
      const botMsg={ role:'bot', text:this.generateResponse(text), time:new Date().toISOString() };
      this._renderMsg(botMsg, container);
      const h2=this.getHistory(); h2.push(botMsg); this.saveHistory(h2);
      Analytics.updateScore();
    }, 700+Math.random()*900);
    _chatReplyTimers.add(replyTimer);
  },

  handleKey(e) {
    if(e.key==='Enter'&&!e.shiftKey){
      e.preventDefault();
      this.send();
    }
  },

  quickPrompt(text) {
    if (this._isGenerating) return;
    const input = _$('chat-input');
    if (!input) return;
    input.value = text;
    this.send();
  },

  clearChat() {
    if(!confirm('Clear all chat history?')) return;
    this.cancelPending();
    const a=Storage.readJSON(KEYS.CHAT,{});
    if(a&&typeof a==='object'&&!Array.isArray(a) && _currentUser) {
      delete a[_currentUser.username];
      Storage.writeJSON(KEYS.CHAT,a);
    }
    this.init();
  },
};


/* ══════════════════════════════════════════════════════════════
   JOURNAL SYSTEM
══════════════════════════════════════════════════════════════ */
const JournalSystem = {
  get()       { return Storage.readUser(KEYS.JOURNAL,_currentUser.username,[]); },
  save(e)     { return Storage.writeUser(KEYS.JOURNAL,_currentUser.username,e); },

  saveEntry() {
    const title=_$('journal-title').value.trim();
    const body=_$('journal-body').value.trim();
    const msgEl=_$('journal-saved-msg');
    if(!title){ msgEl.textContent='⚠ Please add a title.'; msgEl.style.color='var(--c-rose)'; return; }
    if(!body) { msgEl.textContent='⚠ Please write something.'; msgEl.style.color='var(--c-rose)'; return; }
    const entries=this.get();
    if(_editJournalId){
      const idx=entries.findIndex(e=>e.id===_editJournalId);
      if(idx!==-1){ entries[idx].title=title; entries[idx].body=body; entries[idx].edited=new Date().toISOString(); }
    } else {
      entries.unshift({ id:Date.now(), title, body, timestamp:new Date().toISOString() });
    }
    if(!this.save(entries)) { msgEl.textContent='This entry could not be saved on this device.'; msgEl.style.color='var(--c-rose)'; return; }
    this.clearForm();
    this.renderList();
    Analytics.updateStats();
    Analytics.updateScore();
    if(!_editJournalId){
      ConstellationSystem.addStar('journal', `Reflected in journal: ${title}`);
      MemoryGarden.plantFromSource('reflection', title, body);
    }
    msgEl.textContent='✓ Entry saved & planted in your Memory Garden! 🌱'; msgEl.style.color='var(--c-emerald)';
    setTimeout(()=>{ msgEl.textContent=''; }, 2500);
  },

  clearForm() {
    _$('journal-title').value=''; _$('journal-body').value='';
    _$('journal-form-title').textContent='New Entry';
    _$('journal-cancel-btn').style.display='none';
    _editJournalId=null;
  },

  insertTag(tag) {
    const bodyEl = _$('journal-body');
    if (!bodyEl) return;
    const tagText = `#${tag}`;
    if (!bodyEl.value.includes(tagText)) {
      bodyEl.value = bodyEl.value.trim() ? `${bodyEl.value.trim()}\n\n${tagText} ` : `${tagText} `;
    }
    bodyEl.focus();
  },

  edit(id) {
    const e=this.get().find(e=>e.id===id); if(!e) return;
    _$('journal-title').value=e.title; _$('journal-body').value=e.body;
    _$('journal-form-title').textContent='Edit Entry';
    _$('journal-cancel-btn').style.display='inline-flex';
    _editJournalId=id;
    _qs('.journal-write-panel').scrollIntoView({behavior:'smooth',block:'start'});
  },

  delete(id) {
    if(!confirm('Delete this entry?')) return;
    this.save(this.get().filter(e=>e.id!==id));
    this.renderList(); Analytics.updateStats(); Analytics.updateScore();
  },

  renderList() {
    const el=_$('journal-entries-list'), entries=this.get();
    if(!entries.length){ el.innerHTML='<p class="empty-state">No journal entries yet. Write your first reflection!</p>'; return; }
    el.innerHTML=entries.map(e=>{
      const dt=new Date(e.timestamp);
      const ds=dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      const preview=e.body.length>100?e.body.slice(0,100)+'…':e.body;
      return `
        <div class="journal-entry">
          <div class="journal-entry-head">
            <span class="journal-entry-title">${_esc(e.title)}</span>
            <span class="journal-entry-date">${ds}</span>
          </div>
          <p class="journal-entry-preview">${_esc(preview)}</p>
          <div class="journal-entry-actions">
            <button class="btn-tiny edit" onclick="JournalSystem.edit(${_safeId(e.id)})">✎ Edit</button>
            <button class="btn-tiny del"  onclick="JournalSystem.delete(${_safeId(e.id)})">✕ Delete</button>
          </div>
        </div>`;
    }).join('');
  },
};

/* ══════════════════════════════════════════════════════════════
   HABIT SYSTEM
══════════════════════════════════════════════════════════════ */
const HabitSystem = {
  get()       { return Storage.readUser(KEYS.HABITS,_currentUser.username,[]); },
  save(h)     { return Storage.writeUser(KEYS.HABITS,_currentUser.username,h); },
  getLog()    { return Storage.readUser(KEYS.HABIT_LOG,_currentUser.username,{}); },
  saveLog(l)  { return Storage.writeUser(KEYS.HABIT_LOG,_currentUser.username,l); },

  add() {
    const input=_$('new-habit-input'); const icon=_$('new-habit-icon').value; const name=input.value.trim();
    if(!name){ input.focus(); return; }
    const habits=this.get(); habits.push({id:Date.now(),name,icon}); this.save(habits);
    input.value=''; this.renderList(); this.renderStreaks(); Analytics.updateStats(); Analytics.updateScore();
  },

  toggle(id) {
    const log=this.getLog(); const key=_todayKey(); const today=log[key]||[];
    const isNowDone=!today.includes(id);
    log[key]=today.includes(id)?today.filter(i=>i!==id):[...today,id];
    this.saveLog(log); this.renderList(); this.renderStreaks(); Analytics.updateStats(); Analytics.updateScore();
    if(isNowDone){
      const h=this.get().find(h=>h.id===id);
      ConstellationSystem.addStar('habit', `Cared for self: ${h ? h.name : 'Completed habit'}`);
    }
  },

  delete(id) {
    this.save(this.get().filter(h=>h.id!==id)); this.renderList(); this.renderStreaks(); Analytics.updateStats(); Analytics.updateScore();
  },

  calcStreak(id) {
    const log=this.getLog(); let streak=0; const today=new Date();
    for(let i=0;i<365;i++){
      const d=new Date(today); d.setDate(today.getDate()-i); const k=_dateKey(d);
      if((log[k]||[]).includes(id)) streak++; else if(i>0) break;
    }
    return streak;
  },

  renderList() {
    const el=_$('habits-list'), habits=this.get(), log=this.getLog(), today=log[_todayKey()]||[];
    if(!habits.length){ el.innerHTML='<p class="empty-state">No habits yet. Add your first wellness habit above!</p>'; return; }
    el.innerHTML=habits.map(h=>{
      const done=today.includes(h.id);
      return `
        <div class="habit-row ${done?'done':''}">
          <button type="button" class="habit-checkbox" aria-pressed="${done}" aria-label="Mark ${_esc(h.name)} ${done?'incomplete':'complete'}" onclick="HabitSystem.toggle(${_safeId(h.id)})">${done?'✓':''}</button>
          <span class="habit-icon">${_esc(String(h.icon??''))}</span>
          <span class="habit-name">${_esc(h.name)}</span>
          <button class="habit-del" onclick="HabitSystem.delete(${_safeId(h.id)})" title="Delete">✕</button>
        </div>`;
    }).join('');
  },

  renderStreaks() {
    const el=_$('streaks-list');
    const ws=this.get().map(h=>({...h,streak:this.calcStreak(h.id)})).filter(h=>h.streak>0).sort((a,b)=>b.streak-a.streak);
    if(!ws.length){ el.innerHTML='<p class="empty-state">Complete habits to build your streak!</p>'; return; }
    el.innerHTML=ws.map(h=>`
      <div class="streak-tile">
        <span class="streak-tile-icon">${h.icon}</span>
        <div>
          <div class="streak-tile-name">${_esc(h.name)}</div>
          <div class="streak-tile-count">🔥 ${h.streak} day${h.streak!==1?'s':''}</div>
        </div>
      </div>`).join('');
  },
};


/* ══════════════════════════════════════════════════════════════
   BREATHING SYSTEM  (handles multiple circles)
══════════════════════════════════════════════════════════════ */
const BreathingSystem = {
  _activeId: null,

  stopActive() {
    if(_breathActive) this._stop(this._circleId,this._labelId,this._instrId);
  },

  toggle(circleId='breathing-circle', labelId='breathing-label', instructionId='breathing-instruction') {
    if(_breathActive && this._activeId===circleId) {
      this._stop(circleId, labelId, instructionId);
    } else {
      if(_breathActive) this._stop(this._circleId, this._labelId, this._instrId);
      this._start(circleId, labelId, instructionId);
    }
  },

  _start(cid, lid, iid) {
    _breathActive=true; _breathPhase=0; _breathCycles=0;
    this._activeId=cid; this._circleId=cid; this._labelId=lid; this._instrId=iid;
    const circle=_$(cid); if(circle) { circle.setAttribute('aria-pressed','true'); circle.setAttribute('aria-label','Stop guided breathing'); }
    this._run(cid, lid, iid);
  },

  _run(cid, lid, iid) {
    if(!_breathActive) return;
    if(_breathCycles>=BREATH_MAX){ this._stop(cid,lid,iid); return; }
    const phase=BREATH_PHASES[_breathPhase];
    const circle=_$(cid), label=_$(lid), instr=_$(iid);
    if(circle) circle.className=`breathing-circle ${phase.cls}`;
    if(label)  label.textContent=phase.label;
    if(instr)  instr.textContent=phase.hint;
    _breathTimer=setTimeout(()=>{
      _breathPhase=(_breathPhase+1)%BREATH_PHASES.length;
      if(_breathPhase===0) _breathCycles++;
      this._run(cid, lid, iid);
    }, phase.ms);
  },

  _stop(cid, lid, iid) {
    clearTimeout(_breathTimer); _breathTimer=null; _breathActive=false; this._activeId=null;
    const circle=_$(cid), label=_$(lid), instr=_$(iid);
    if(circle) { circle.className='breathing-circle'; circle.setAttribute('aria-pressed','false'); circle.setAttribute('aria-label','Start guided breathing'); }
    if(label)  label.textContent='Tap to Start';
    if(instr)  instr.textContent = _breathCycles>=BREATH_MAX
      ? '✓ Session complete! Great job.'
      : 'Click the circle to begin a guided breathing session.';
  },
};


/* ══════════════════════════════════════════════════════════════
   BOOST SYSTEM  — Gratitude, Meditation, Affirmation
══════════════════════════════════════════════════════════════ */
const BoostSystem = {

  init() {
    /* Attach breathing circle */
    const bc=_$('breathing-circle');
    if(bc) bc.onclick=()=>BreathingSystem.toggle();
    /* Init affirmation */
    this._nextBigAffImpl();
    /* Render gratitude history */
    this._renderGratHistory();
    /* Init meditation display */
    this._refreshMed();
  },

  /* ── Gratitude ─────────────────────────────────────────── */
  _getGrat()       { return Storage.readUser(KEYS.GRATITUDE,_currentUser.username,[]); },
  _saveGrat(list)  { return Storage.writeUser(KEYS.GRATITUDE,_currentUser.username,list.slice(0,30)); },

  saveGratitude() {
    const g1=_$('grat-1').value.trim(), g2=_$('grat-2').value.trim(), g3=_$('grat-3').value.trim();
    const msg=_$('grat-msg');
    if(!g1||!g2||!g3){ msg.textContent='⚠ Please fill in all 3 items.'; msg.style.color='var(--c-rose)'; return; }
    const entry={ id:Date.now(), items:[g1,g2,g3], timestamp:new Date().toISOString() };
    const list=this._getGrat(); list.unshift(entry); this._saveGrat(list);
    ['grat-1','grat-2','grat-3'].forEach(id=>_$(id).value='');
    msg.textContent='✓ Gratitude saved & blossomed in your Memory Garden! ✨'; msg.style.color='var(--c-emerald)';
    setTimeout(()=>{ if(msg) msg.textContent=''; }, 3000);
    this._renderGratHistory();
    ConstellationSystem.addStar('gratitude', `Practiced gratitude: ${g1.slice(0,30)}…`);
    MemoryGarden.plantFromSource('gratitude', 'Daily Gratitude', `1. ${g1}\n2. ${g2}\n3. ${g3}`);
  },

  _renderGratHistory() {
    const el=_$('grat-history'); if(!el) return;
    const list=this._getGrat().slice(0,3);
    if(!list.length){ el.innerHTML=''; return; }
    el.innerHTML='<p style="font-size:0.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:6px">Recent</p>' +
      list.map(e=>`
        <div class="grat-history-item">
          <div class="grat-history-date">${new Date(e.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
          ${e.items.map(i=>`<div>✦ ${_esc(i)}</div>`).join('')}
        </div>`).join('');
  },

  /* ── Meditation Timer ───────────────────────────────────── */
  pickMedDur(btn, mins) {
    _qsa('.dur-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(_medActive) this.resetMed();
    _medSecsTotal=mins*60; _medSecsLeft=_medSecsTotal;
    this._refreshMed();
  },

  _refreshMed() {
    const m=Math.floor(_medSecsLeft/60), s=_medSecsLeft%60;
    _setText('med-time', `${m}:${String(s).padStart(2,'0')}`);
    const prog=_$('med-prog');
    if(prog) prog.style.strokeDashoffset = 314*(1-_medSecsLeft/_medSecsTotal);
  },

  toggleMed() { _medActive ? this._pauseMed() : this._startMed(); },

  _startMed() {
    _medActive=true; _$('med-btn').textContent='⏸ Pause';
    _medInterval=setInterval(()=>{
      _medSecsLeft--;
      _medPhaseTick++;
      const phase=MED_PHASES[_medPhaseIdx%MED_PHASES.length];
      if(_medPhaseTick>=phase.secs){ _medPhaseTick=0; _medPhaseIdx++; }
      _setText('med-phase', MED_PHASES[_medPhaseIdx%MED_PHASES.length].label);
      this._refreshMed();
      if(_medSecsLeft<=0) this._finishMed();
    }, 1000);
  },

  _pauseMed() {
    _medActive=false; clearInterval(_medInterval); _medInterval=null;
    _$('med-btn').textContent='▶ Resume';
    _setText('med-phase', 'Paused — press Resume when ready');
  },

  _finishMed() {
    clearInterval(_medInterval); _medInterval=null; _medActive=false;
    _$('med-btn').textContent='▶ Start';
    _setText('med-phase', '🎉 Session complete! Take a moment in the stillness.');
    const prog=_$('med-prog'); if(prog) prog.style.strokeDashoffset=0;
  },

  resetMed() {
    clearInterval(_medInterval); _medInterval=null; _medActive=false; _medPhaseIdx=0; _medPhaseTick=0;
    const active=_qs('.dur-btn.active');
    _medSecsTotal=(active?parseInt(active.dataset.min):3)*60; _medSecsLeft=_medSecsTotal;
    _$('med-btn').textContent='▶ Start';
    _setText('med-phase', 'Press Start to begin your session');
    this._refreshMed();
  },

  /* ── Affirmation Generator ─────────────────────────────── */
  AFF_BANK: {
    strength:[ '"I have survived 100% of my hardest days. I am stronger than I know."', '"Challenges are invitations to grow stronger. I accept them."', '"I am resilient, resourceful, and ready."', '"Every hard moment has built the person I am today."', '"I am more powerful than any fear or doubt I carry."', '"Every experience teaches me something valuable."',
      '"I am constantly evolving into a stronger version of myself."',
      '"Mistakes are opportunities for growth and learning."',
      '"Progress, no matter how small, is meaningful."',
      '"I welcome growth even when it feels uncomfortable."'],
    peace:   [ '"I release what I cannot control and breathe into what I can."', '"In this moment I am safe, grounded, and enough."', '"Peace is not the absence of chaos — it is my response to it."', '"Each exhale releases tension. Each inhale brings calm."', '"I am allowed to rest. I am allowed to be still."','"I allow calm to flow through my mind and body."',
         '"I choose peace over worry in this moment."',
         '"My breath brings me back to a place of calm."',
         '"I let go of tension and welcome stillness."',
         '"Peace begins with the way I choose to think."' ],
    growth:  [ '"Growth is not linear, and that is perfectly okay."', '"I am a work in progress, and that is something to celebrate."', '"Every small step I take matters."', '"I am becoming who I am meant to be."', '"Learning and growing are signs of life."','"Every experience teaches me something valuable."',
        '"I am constantly evolving into a stronger version of myself."',
        '"Mistakes are opportunities for growth and learning."',
        '"Progress, no matter how small, is meaningful."',
        '"I welcome growth even when it feels uncomfortable."' ],
    all:     [ '"I am enough, exactly as I am, right now."', '"Today I choose progress over perfection."', '"I deserve rest, joy, and kindness — especially from myself."', '"My feelings are valid. My experience matters."', '"I am not my thoughts. I am the one who observes them."', '"I am worthy of love and belonging, always."', '"Each breath is a fresh start."', '"Small steps forward are still steps forward."','"I am capable, calm, and confident in my journey."',
      '"Each new day gives me a fresh chance to grow."',
      '"I honor my feelings and care for my well-being."',
      '"I trust myself to handle whatever comes my way."',
      '"I deserve kindness, patience, and understanding."',
      '"My journey is unique and meaningful."',
      '"I am learning, growing, and becoming stronger."',
      '"I choose compassion toward myself today."' ],
  },

  setAffCat(cat, btn) {
    _bigAffCat=cat; _bigAffLastIdx=-1;
    _qsa('.aff-cat-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    this._nextBigAffImpl();
  },

  nextBigAff() { this._nextBigAffImpl(); },

  _nextBigAffImpl() {
    const pool=this.AFF_BANK[_bigAffCat]||this.AFF_BANK.all;
    let idx; do{ idx=Math.floor(Math.random()*pool.length); } while(idx===_bigAffLastIdx && pool.length>1);
    _bigAffLastIdx=idx;
    const el=_$('big-aff-text'); if(!el) return;
    el.style.animation='none'; void el.offsetWidth; el.style.animation='';
    el.textContent=pool[idx];
  },
};


/* ══════════════════════════════════════════════════════════════
   ANALYTICS SYSTEM  — Insights, Recommendations, Report
══════════════════════════════════════════════════════════════ */
const AnalyticsSystem = {

  destroyCharts() {
    [_chartRptMood,_chartRptHabit].forEach(chart=>chart?.destroy());
    _chartRptMood=_chartRptHabit=null;
  },

  /* ── Recommendations ────────────────────────────────────── */
  RECS: {
    Happy:   [{ icon:'📓',title:'Capture this moment',    desc:'Write in your journal while happy — positive memories anchor you on harder days.',type:'boost'},{ icon:'🤝',title:'Spread the good vibes',   desc:'Share your happiness. Call a friend, send a kind message, or pay a compliment.',type:'boost'},{ icon:'🏆',title:'Set an ambitious goal',    desc:'Positive moods boost creative thinking. Use this energy to plan something exciting!',type:'boost'}],
    Calm:    [{ icon:'🧘',title:'Deepen your stillness',  desc:'Your calm state is perfect for meditation. Try 10 minutes of mindful breathing.',type:'calm'},{ icon:'📚',title:'Read something enriching', desc:'A calm mind absorbs learning beautifully. Pick up that book you\'ve been saving.',type:'calm'},{ icon:'🌿',title:'Connect with nature',       desc:'A gentle walk outside deepens your sense of groundedness.',type:'calm'}],
    Neutral: [{ icon:'🎯',title:'Set a small intention',  desc:'Neutral days are perfect for gentle progress. Pick one task and complete it.',type:'boost'},{ icon:'💧',title:'Hydrate & nourish',        desc:'Your body may be asking for basic care. Drink water, eat well, move a little.',type:'calm'},{ icon:'😊',title:'Do something pleasurable',  desc:'Nudge it positive with something you genuinely enjoy.',type:'boost'}],
    Stressed:[{ icon:'🌬️',title:'4-7-8 Breathing',        desc:'Inhale 4s, hold 7s, exhale 8s. Activates your parasympathetic nervous system.',type:'stress'},{ icon:'✅',title:'Brain dump your tasks',   desc:'Write down everything stressing you. Externalising reduces the mental load.',type:'stress'},{ icon:'🎵',title:'Listen to calming music',    desc:'60 BPM music synchronises brainwaves to induce calm.',type:'stress'},{ icon:'🚶',title:'Take a 10-minute walk',    desc:'Physical movement metabolises stress hormones faster than almost anything else.',type:'stress'}],
    Sad:     [{ icon:'💙',title:'Be gentle with yourself', desc:'Sadness is not weakness — it\'s the heart\'s way of processing. Just be with it.',type:'sad'},{ icon:'🤗',title:'Reach out to someone',    desc:'A trusted person can hold space for you. You don\'t carry this alone.',type:'sad'},{ icon:'📓',title:'Write out your feelings',    desc:'Start with "Today I feel…" and let it flow. Journaling releases emotional weight.',type:'sad'},{ icon:'☀️',title:'Get some sunlight',          desc:'Sunlight triggers serotonin. Even 10 minutes outside can gently lift your mood.',type:'sad'}],
  },

  renderRecommendations() {
    const el=_$('recommendations-container'), moods=MoodSystem.get();
    let dominant='Neutral';
    const validMoods=moods.filter(m=>Object.prototype.hasOwnProperty.call(MOOD_EMOJI,m.mood));
    if(validMoods.length){
      const recent=validMoods.slice(0,3), freq={};
      recent.forEach(m=>{ freq[m.mood]=(freq[m.mood]||0)+1; });
      dominant=Object.keys(freq).sort((a,b)=>freq[b]-freq[a])[0];
    }
    const recs=this.RECS[dominant]||this.RECS.Neutral;
    const label=`<div style="margin-bottom:14px;"><span style="font-size:0.72rem;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Based on your recent mood:</span><span class="mood-chip ${dominant}" style="margin-left:8px;">${MOOD_EMOJI[dominant]} ${dominant}</span></div>`;
    el.innerHTML=label+recs.map(r=>`<div class="rec-card type-${r.type}"><div class="rec-card-icon">${r.icon}</div><div class="rec-card-title">${r.title}</div><div class="rec-card-desc">${r.desc}</div></div>`).join('');
  },

  /* ── Affirmations (Insights page) ─────────────────────── */
  ALL_AFFS: ['"I am enough, exactly as I am, right now."','"Every storm runs out of rain. This too shall pass."','"I have survived 100% of my hardest days. I am stronger than I know."','"Small steps forward are still steps forward."','"I deserve rest, joy, and kindness — especially from myself."','"My feelings are valid. My experience matters."','"I am not my thoughts. I am the one who observes them."','"Today I choose progress over perfection."','"I am worthy of love and belonging, always."','"Growth is not linear, and that is perfectly okay."','"I release what I cannot control and focus on what I can."','"Each breath is a fresh start."'],

  renderAffirmation() {
    let idx; do{ idx=Math.floor(Math.random()*this.ALL_AFFS.length); } while(idx===_insAffLastIdx && this.ALL_AFFS.length>1);
    _insAffLastIdx=idx;
    _setText('affirmation-text', this.ALL_AFFS[idx]);
  },
  newAffirmation() { this.renderAffirmation(); },

  /* ── Monthly Report ─────────────────────────────────────── */
  _getReportPeriod() {
    const d=new Date(); d.setMonth(d.getMonth()+_reportOffset);
    return { year:d.getFullYear(), month:d.getMonth() };
  },
  reportPrev() { _reportOffset--; this.buildReport(); },
  reportNext() { if(_reportOffset<0){ _reportOffset++; this.buildReport(); } },

  _matchMonth(iso, year, month) { const d=new Date(iso); return d.getFullYear()===year && d.getMonth()===month; },

  buildReport() {
    const { year, month }=this._getReportPeriod();
    const mName=new Date(year,month,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    _setText('report-month-lbl', mName);

    const allMoods=MoodSystem.get().filter(m=>this._matchMonth(m.timestamp,year,month));
    const allJournal=JournalSystem.get().filter(e=>this._matchMonth(e.timestamp,year,month));
    const habits=HabitSystem.get(), habitLog=HabitSystem.getLog();
    const daysInMonth=new Date(year,month+1,0).getDate();

    /* Habit stats */
    let hDone=0, hPoss=0; const wkTotals=[0,0,0,0], wkPoss=[0,0,0,0];
    for(let d=1;d<=daysInMonth;d++){
      const key=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const done=(habitLog[key]||[]).length;
      hDone+=done; hPoss+=habits.length;
      const w=Math.min(Math.floor((d-1)/7),3);
      wkTotals[w]+=done; wkPoss[w]+=habits.length;
    }
    const habitCons=hPoss ? Math.round((hDone/hPoss)*100) : 0;

    /* Mood distribution */
    const moodCounts={Happy:0,Calm:0,Neutral:0,Stressed:0,Sad:0};
    allMoods.forEach(m=>{ if(moodCounts[m.mood]!==undefined) moodCounts[m.mood]++; });
    const avgMood=allMoods.length ? (allMoods.reduce((s,m)=>s+m.score,0)/allMoods.length).toFixed(1) : '—';
    const dominant=allMoods.length ? Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0][0] : '—';
    const ws=Analytics.updateScore();

    /* Summary */
    const sumEl=_$('report-summary');
    if(sumEl) sumEl.innerHTML=[
      {l:'Mood Entries',val:allMoods.length},{l:'Avg Mood',val:avgMood+'/5'},
      {l:'Dominant Mood',val:dominant!=='—'?MOOD_EMOJI[dominant]+' '+dominant:'—'},
      {l:'Journal Entries',val:allJournal.length},{l:'Habit Consistency',val:habitCons+'%'},
      {l:'Wellness Score',val:(ws?.total||'—')+'%'},
    ].map(r=>`<div class="report-stat-row"><span class="report-stat-lbl">${r.l}</span><span class="report-stat-val">${r.val}</span></div>`).join('');

    /* Insights */
    const moodIns=+avgMood>=4?'Your mood this month has been excellent! Keep up your positive habits.':+avgMood>=3?'A generally positive month with some highs and lows.':+avgMood>=2?'A challenging month mood-wise. Consider extra self-care.':'A very tough month emotionally. Please consider speaking with someone you trust.';
    _setText('report-mood-insight', moodIns);
    _setText('report-habit-insight', habitCons>=80?'Outstanding consistency! Habits are deeply embedded.':habitCons>=50?'Good progress — more than half completion. Keep building!':'Room to grow. Start with one non-negotiable daily habit.');

    /* Notable days */
    const notEl=_$('report-notable');
    if(notEl){
      const notable=allMoods.filter(m=>m.mood==='Stressed'||m.mood==='Sad').slice(0,5);
      notEl.innerHTML=notable.length
        ? notable.map(m=>`<div class="notable-item"><div class="notable-emoji">${MOOD_EMOJI[m.mood]}</div><div><div class="notable-date">${new Date(m.timestamp).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div><div class="notable-label">${m.mood}${m.note?` — "${_esc(m.note)}"`:''}</div></div></div>`).join('')
        : '<p class="empty-state">No stressful days this month! 🌟</p>';
    }

    /* Journal bars */
    const jEl=_$('report-journal-bars');
    if(jEl){
      const wk=['W1','W2','W3','W4'], wc=[0,0,0,0];
      allJournal.forEach(e=>{ const day=new Date(e.timestamp).getDate(); wc[Math.min(Math.floor((day-1)/7),3)]++; });
      const mx=Math.max(...wc,1);
      jEl.innerHTML='<p style="font-size:0.76rem;color:var(--text-2);margin-bottom:9px;">Entries per week</p>' +
        wk.map((w,i)=>`<div class="jbar-row"><span class="jbar-lbl">${w}</span><div class="jbar-track"><div class="jbar-fill" style="width:${(wc[i]/mx)*100}%"></div></div><span class="jbar-count">${wc[i]}</span></div>`).join('');
    }

    /* AI Insights */
    this._buildAIInsights(+avgMood, habitCons, allJournal.length, allMoods);

    /* Charts */
    this._buildRptMoodChart(moodCounts);
    this._buildRptHabitChart(wkTotals, wkPoss);
  },

  _buildAIInsights(avgMood, habitCons, journalCount, allMoods) {
    const el=_$('report-ai-list'); if(!el) return;
    const items=[];
    if(avgMood>=4)    items.push({icon:'🌟',title:'Excellent mood!',body:`Your avg of ${avgMood}/5 is outstanding. You're thriving emotionally.`});
    else if(avgMood<=2)items.push({icon:'💙',title:'Tough month',body:`Avg mood ${avgMood}/5. Be compassionate with yourself and seek support if needed.`});
    else              items.push({icon:'📊',title:'Mood overview',body:`Avg mood ${avgMood}/5 — balanced with room for growth.`});
    if(habitCons>=80)  items.push({icon:'🔥',title:'Habit champion!',body:`${habitCons}% completion! Your consistency is building powerful routines.`});
    else if(habitCons<30)items.push({icon:'🌱',title:'Habit opportunity',body:`Only ${habitCons}% completion. One daily non-negotiable habit can transform your wellbeing.`});
    if(journalCount===0) items.push({icon:'📓',title:'Start journaling',body:'No entries this month. Even 5 min/week of reflection has proven mental health benefits.'});
    else if(journalCount>=8) items.push({icon:'✍️',title:'Reflective writer',body:`${journalCount} entries! Regular journaling builds self-awareness.`});
    const stress=allMoods.filter(m=>m.mood==='Stressed').length;
    if(stress>4) items.push({icon:'⚠️',title:'Stress pattern',body:`Stress logged ${stress} times. Consider daily breathing exercises.`});
    if(!items.length) items.push({icon:'✨',title:'Keep going',body:'Every data point makes your wellness picture clearer. Consistency is key!'});
    el.innerHTML=items.map(i=>`<div class="report-ai-item"><div class="report-ai-icon">${i.icon}</div><div class="report-ai-body"><strong>${i.title}</strong>${i.body}</div></div>`).join('');
  },

  _buildRptMoodChart(moodCounts) {
    const canvas=_$('reportMoodChart'); if(!canvas||typeof Chart==='undefined') return;
    if(_chartRptMood) _chartRptMood.destroy();
    const colors=['--mood-happy','--mood-calm','--mood-neutral','--mood-stressed','--mood-sad'].map((token,index)=>_colorToken(token,['#f59e0b','#0ea5e9','#94a3b8','#818cf8','#6366f1'][index]));
    _chartRptMood=new Chart(canvas,{ type:'doughnut', data:{ labels:Object.keys(moodCounts), datasets:[{ data:Object.values(moodCounts), backgroundColor:colors.map(color=>_withAlpha(color,'b8')), borderColor:colors, borderWidth:2,hoverOffset:5 }] }, options:{ responsive:true,maintainAspectRatio:false,cutout:'65%', plugins:{legend:{position:'right',labels:{color:_colorToken('--text-secondary','#94a3b8'),padding:12,font:{family:'Plus Jakarta Sans, system-ui, sans-serif',size:12,weight:500}}}} } });
  },

  _buildRptHabitChart(wkTotals, wkPoss) {
    const canvas=_$('reportHabitChart'); if(!canvas||typeof Chart==='undefined') return;
    if(_chartRptHabit) _chartRptHabit.destroy();
    const success=_colorToken('--c-emerald','#10b981'), warning=_colorToken('--c-amber','#f59e0b'), info=_colorToken('--c-sky','#0ea5e9');
    const chartText=_colorToken('--text-secondary','#94a3b8');
    const pcts=wkTotals.map((t,i)=>wkPoss[i]?Math.round((t/wkPoss[i])*100):0);
    _chartRptHabit=new Chart(canvas,{ type:'bar', data:{ labels:['Week 1','Week 2','Week 3','Week 4'], datasets:[{ data:pcts, backgroundColor:pcts.map(v=>_withAlpha(v>=80?success:v>=50?info:warning,'a8')), borderColor:pcts.map(v=>v>=80?success:v>=50?info:warning), borderWidth:1,borderRadius:6 }] }, options:{ responsive:true,maintainAspectRatio:false, scales:{ y:{min:0,max:100,ticks:{color:chartText,callback:v=>v+'%'},grid:{color:'rgba(148,163,184,.07)'}}, x:{ticks:{color:chartText},grid:{display:false}} }, plugins:{legend:{display:false}} } });
  },

  downloadReport() {
    const { year, month }=this._getReportPeriod();
    const mName=new Date(year,month,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const allMoods=MoodSystem.get().filter(m=>this._matchMonth(m.timestamp,year,month));
    const allJournal=JournalSystem.get().filter(e=>this._matchMonth(e.timestamp,year,month));
    const habits=HabitSystem.get();
    const ws=Analytics.calcScore();
    const avgMood=allMoods.length?(allMoods.reduce((s,m)=>s+m.score,0)/allMoods.length).toFixed(1):'N/A';
    const moodDist=Object.entries(allMoods.reduce((a,m)=>{a[m.mood]=(a[m.mood]||0)+1;return a;},{})).map(([k,v])=>`  ${k}: ${v}`).join('\n')||'  No data';
    const txt=`WALL·E MONTHLY WELLNESS REPORT\n================================\nUser   : ${_currentUser.name}\nPeriod : ${mName}\nCreated: ${new Date().toLocaleDateString()}\n\nWELLNESS SCORE\n--------------\nOverall    : ${ws.total}%\nMood       : ${ws.moodPct}%\nHabits     : ${ws.habitPct}%\nJournal    : ${ws.journalPct}%\nPositivity : ${ws.chatPct}%\n\nMOOD SUMMARY\n------------\nTotal entries : ${allMoods.length}\nAverage score : ${avgMood}/5\nDistribution:\n${moodDist}\n\nHABITS\n------\n${habits.map(h=>h.icon+' '+h.name).join('\n')||'  No habits set'}\n\nJOURNAL\n-------\nEntries this month: ${allJournal.length}\n\nGenerated by WALL·E — AI Mental Wellness Companion`.trim();
    const blob=new Blob([txt],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=Object.assign(document.createElement('a'),{href:url,download:`WALLE_Report_${mName.replace(' ','_')}.txt`});
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
/* ======================================== 
   ZEN STATION: SOUND CONTROLLER
   ======================================== */
const SoundSystem = {
  activeSounds: {},
  
  // High-quality CDN assets
  library: {
    rain: "Rain.mp3",
    ocean: "Ocean.wav",
    forest: "Forest.mp3",
    fire: "Fireplace.m4a",
    binaural: "Binaural.m4a",
    delta: "Delta Waves.mp3",
    white: "White Noise.mp3"
  },

  toggle(id) {
    if(!Object.prototype.hasOwnProperty.call(this.library,id)) return;
    // Using your _qs and _$ helpers
    const card = _qs(`[onclick*="toggle('${id}')"]`);
    const btn = _$( `btn-${id}`);
    const setControlState = (playing, loading=false) => {
      if(!btn) return;
      const label=(btn.getAttribute('aria-label')||'Play sound').replace(/^(Play|Pause) /,'');
      btn.textContent=playing?'⏸':'▶';
      btn.setAttribute('aria-label',`${playing?'Pause':'Play'} ${label}`);
      btn.setAttribute('aria-pressed',String(playing));
      if(loading) btn.setAttribute('aria-busy','true'); else btn.removeAttribute('aria-busy');
    };

    if (this.activeSounds[id]) {
      // If currently playing: Stop it
      this.activeSounds[id].pause();
      delete this.activeSounds[id];
      if(card) card.classList.remove('active');
      setControlState(false);
    } else {
      // If not playing: Start it
      if(typeof Audio==='undefined') return;
      let audio;
      try { audio=new Audio(this.library[id]); }
      catch(error) { console.warn(`WALL·E could not load the ${id} sound.`,error); return; }
      audio.loop = true;
      
      // Look for the volume slider inside this card
      const slider = card ? card.querySelector('.volume-slider') : null;
      audio.volume = slider ? parseFloat(slider.value) : 0.5;
      
      this.activeSounds[id] = audio;
      setControlState(false,true);
      audio.addEventListener('error',()=>{
        audio.pause();
        delete this.activeSounds[id];
        if(card) card.classList.remove('active');
        setControlState(false);
      },{once:true});
      audio.play().then(()=>{
        if(this.activeSounds[id]!==audio) return;
        if(card) card.classList.add('active');
        setControlState(true);
      }).catch(error=>{
        delete this.activeSounds[id];
        if(card) card.classList.remove('active');
        setControlState(false);
        console.warn(`WALL·E could not play the ${id} sound.`,error);
      });
    }
  },

  setVolume(id, val) {
    if (this.activeSounds[id]) {
      this.activeSounds[id].volume = Math.min(1,Math.max(0,parseFloat(val)||0));
    }
  },

  stopAll() {
    Object.keys(this.activeSounds).forEach(id => {
      this.activeSounds[id].pause();
      const card = _qs(`[onclick*="toggle('${id}')"]`);
      const btn = _$( `btn-${id}`);
      if(card) card.classList.remove('active');
      if(btn) {
        btn.textContent="▶";
        btn.setAttribute('aria-label',(btn.getAttribute('aria-label')||'Pause sound').replace(/^Pause /,'Play '));
        btn.setAttribute('aria-pressed','false');
        btn.removeAttribute('aria-busy');
      }
    });
    this.activeSounds = {};
  }
};


/* ══════════════════════════════════════════════════════════════
   FEATURE 1 — WALL·E MEMORY GARDEN
   A living digital garden where wins, gratitude & reflections bloom.
══════════════════════════════════════════════════════════════ */
const MemoryGarden = {
  _currentFilter: 'all',
  _selectedType: 'win',

  get() {
    return Storage.readUser(KEYS.MEMORIES, _currentUser?.username || 'demo', []);
  },

  save(memories) {
    return Storage.writeUser(KEYS.MEMORIES, _currentUser?.username || 'demo', memories);
  },

  openAddModal() {
    const modal = _$('memory-modal');
    if (!modal) return;
    _$('memory-input-title').value = '';
    _$('memory-input-note').value = '';
    _$('memory-modal-msg').textContent = '';
    this.selectType('win');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  },

  closeAddModal() {
    const modal = _$('memory-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  },

  selectType(type, btn) {
    this._selectedType = type;
    const buttons = _qsa('.mem-type-btn');
    buttons.forEach(b => {
      b.classList.toggle('active', b.dataset.type === type);
    });
  },

  saveNewMemory() {
    const titleInput = _$('memory-input-title');
    const noteInput = _$('memory-input-note');
    const msg = _$('memory-modal-msg');
    const title = titleInput.value.trim();
    const note = noteInput.value.trim();

    if (!title) {
      if (msg) msg.textContent = 'Please give your memory a small title or note.';
      titleInput.focus();
      return;
    }

    const typeIcons = { win: '🌸', gratitude: '✨', memory: '🌱', reflection: '🌙' };
    const memory = {
      id: Date.now(),
      type: this._selectedType,
      title,
      note,
      icon: typeIcons[this._selectedType] || '🌱',
      x: 10 + Math.random() * 80, // % left position in viewport
      y: 12 + Math.random() * 45, // % bottom offset from ground
      createdAt: new Date().toISOString()
    };

    const list = this.get();
    list.unshift(memory);
    this.save(list);
    this.closeAddModal();
    this.render();

    // Cross-pollinate with Tiny Wins Constellation
    ConstellationSystem.addStar('garden', `Planted memory: ${title}`);
  },

  /* Programmatic entry from other systems (Journal, Gratitude, WALL-E Moment) */
  plantFromSource(type, title, note) {
    if (!title) return;
    const typeIcons = { win: '🌸', gratitude: '✨', memory: '🌱', reflection: '🌙' };
    const memory = {
      id: Date.now(),
      type: type || 'win',
      title,
      note: note || '',
      icon: typeIcons[type] || '🌱',
      x: 10 + Math.random() * 80,
      y: 12 + Math.random() * 45,
      createdAt: new Date().toISOString()
    };
    const list = this.get();
    list.unshift(memory);
    this.save(list);
    this.render();
    if (typeof Analytics !== 'undefined' && Analytics.updateStats) Analytics.updateStats();
  },

  delete(id) {
    const list = this.get().filter(m => m.id !== id);
    this.save(list);
    this.render();
    if (typeof Analytics !== 'undefined' && Analytics.updateStats) Analytics.updateStats();
  },

  filter(category, btn) {
    this._currentFilter = category;
    _qsa('.garden-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    this.renderArchive();
  },

  render() {
    this.renderFlora();
    this.renderArchive();
  },

  renderFlora() {
    const container = _$('garden-flora');
    const emptyNotice = _$('garden-empty-notice');
    const countEl = _$('garden-bloom-count');
    const statusEl = _$('garden-sky-status');
    if (!container) return;

    const list = this.get();
    if (countEl) countEl.textContent = `🌱 ${list.length} living bloom${list.length === 1 ? '' : 's'}`;
    if (emptyNotice) emptyNotice.classList.toggle('hidden', list.length > 0);

    if (statusEl) {
      if (list.length >= 10) statusEl.textContent = 'A flourishing world illuminated by your reflections';
      else if (list.length >= 4) statusEl.textContent = 'Gentle growth taking root under quiet stars';
      else statusEl.textContent = 'Quiet sanctuary under starlight';
    }

    // Render flora nodes
    container.innerHTML = list.slice(0, 24).map(mem => `
      <div class="garden-plant" style="left: ${mem.x}%; bottom: ${mem.y}%;" title="${_esc(mem.title)}" onclick="MemoryGarden.inspect(${mem.id})">
        <span class="garden-plant-icon">${mem.icon}</span>
        <span class="garden-plant-label">${_esc(mem.title.slice(0, 26))}</span>
      </div>
    `).join('');

    // Organic Fireflies
    const fireflyContainer = _$('garden-fireflies');
    if (fireflyContainer && !fireflyContainer.children.length) {
      fireflyContainer.innerHTML = Array.from({ length: 9 }).map((_, i) => {
        const left = 5 + Math.random() * 90;
        const top = 10 + Math.random() * 80;
        const dur = 3 + Math.random() * 4;
        return `<span class="garden-firefly" style="left:${left}%; top:${top}%; animation: orbDrift ${dur}s ease-in-out infinite alternate;"></span>`;
      }).join('');
    }
  },

  renderArchive() {
    const listEl = _$('garden-entries-list');
    if (!listEl) return;
    const all = this.get();
    const filtered = this._currentFilter === 'all'
      ? all
      : all.filter(m => m.type === this._currentFilter);

    if (!filtered.length) {
      listEl.innerHTML = '<p class="empty-state">No memories in this view. Plant one above or reflect in your journal!</p>';
      return;
    }

    const typeNames = { win: 'Small Win', gratitude: 'Gratitude', memory: 'Warm Memory', reflection: 'Reflection' };
    const typeColors = {
      win: 'var(--mood-happy)',
      gratitude: 'var(--accent-amber)',
      memory: 'var(--accent-green)',
      reflection: 'var(--accent-violet)'
    };

    listEl.innerHTML = filtered.map(m => {
      const dateStr = new Date(m.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `
        <article class="garden-entry-card">
          <div class="garden-entry-top">
            <span class="garden-entry-type" style="color: ${typeColors[m.type] || 'var(--text-secondary)'}">
              ${m.icon} ${typeNames[m.type] || 'Memory'}
            </span>
            <span class="garden-entry-date">${dateStr}</span>
          </div>
          <h4 class="garden-entry-title">${_esc(m.title)}</h4>
          ${m.note ? `<p class="garden-entry-note">${_esc(m.note)}</p>` : ''}
          <button type="button" class="garden-entry-del" onclick="MemoryGarden.delete(${m.id})" title="Remove memory">Remove</button>
        </article>
      `;
    }).join('');
  },

  inspect(id) {
    const mem = this.get().find(m => m.id === id);
    if (!mem) return;
    const detail = _$('constellation-star-detail');
    if (detail) {
      _$('star-detail-icon').textContent = mem.icon;
      _$('star-detail-text').textContent = `${mem.title}${mem.note ? ' — ' + mem.note : ''}`;
    }
  }
};


/* ══════════════════════════════════════════════════════════════
   FEATURE 2 — A MOMENT WITH WALL·E
   A guided, slow micro-experience system (1–3 min).
══════════════════════════════════════════════════════════════ */
const WallEMomentSystem = {
  _currentMoment: null,
  _currentStep: 0,
  _timer: null,

  EXPERIENCES: {
    breaths: {
      title: 'Three Slow Breaths',
      steps: [
        {
          title: 'First slow breath',
          desc: 'Close your eyes or soften your gaze. Breathe in slowly through your nose with WALL·E… and gently let it go.',
          duration: 6
        },
        {
          title: 'Second deep breath',
          desc: 'Feel your chest expand. Hold for a heartbeat. Release any tension in your forehead and hands.',
          duration: 6
        },
        {
          title: 'Third resting breath',
          desc: 'One full, nourishing breath. Exhale completely, letting your whole body arrive here right now.',
          duration: 6
        }
      ],
      completion: 'Your breath is your anchor. WALL·E felt the quiet shift with you.'
    },
    grounding: {
      title: 'Notice Your Surroundings',
      steps: [
        {
          title: '3 Things You See',
          desc: 'Look gently around your room. Notice three simple objects or shadows without judging them.',
          duration: 8
        },
        {
          title: '2 Things You Feel',
          desc: 'Notice the contact between your feet and the floor, or your hands resting in your lap.',
          duration: 8
        },
        {
          title: '1 Thing You Hear',
          desc: 'Listen for the quietest sound around you. Let it simply be part of this peaceful moment.',
          duration: 8
        }
      ],
      completion: 'You are right here, safe in this present moment.'
    },
    shoulders: {
      title: 'Drop Your Shoulders',
      steps: [
        {
          title: 'Notice the tension',
          desc: 'Without moving yet, notice where your shoulders are sitting. Are they creeping up toward your ears?',
          duration: 6
        },
        {
          title: 'Inhale & shrug upward',
          desc: 'Bring your shoulders gently up toward your ears on an inhale…',
          duration: 5
        },
        {
          title: 'Exhale & drop',
          desc: 'Drop them down completely with an open-mouthed exhale. Feel the sudden space around your neck.',
          duration: 7
        }
      ],
      completion: 'You do not have to carry the whole day on your shoulders.'
    },
    smallwin: {
      title: 'Reflect on One Small Win',
      steps: [
        {
          title: 'Think of one small effort',
          desc: 'What is one tiny thing you did today? Woke up, drank water, showed kindness, or survived a hard hour?',
          duration: 8
        },
        {
          title: 'Acknowledge it quietly',
          desc: 'Small victories count just as much. Give yourself credit for showing up today.',
          duration: 8
        }
      ],
      completion: 'Every gentle step forward matters. WALL·E is proud of you.'
    },
    sleep: {
      title: 'Wind Down for Sleep',
      steps: [
        {
          title: 'Set down the day',
          desc: 'Everything you did today was enough. Everything left undone can wait for tomorrow.',
          duration: 8
        },
        {
          title: 'Unclench and relax',
          desc: 'Unclench your jaw, soften your tongue, and let your eyes become heavy.',
          duration: 8
        },
        {
          title: 'Resting beside you',
          desc: 'WALL·E will keep the quiet watch. You are allowed to rest completely tonight.',
          duration: 8
        }
      ],
      completion: 'Wishing you deep, restorative sleep under starry quiet.'
    }
  },

  openPicker() {
    const modal = _$('moment-modal');
    if (!modal) return;
    this._showView('picker');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  },

  close() {
    const modal = _$('moment-modal');
    if (!modal) return;
    if (this._timer) clearTimeout(this._timer);
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    this._currentMoment = null;
  },

  _showView(viewName) {
    _qsa('.moment-view').forEach(v => v.classList.remove('active'));
    const target = _$(`moment-${viewName}-view`);
    if (target) target.classList.add('active');
  },

  start(expKey) {
    const exp = this.EXPERIENCES[expKey];
    if (!exp) return;
    this._currentMoment = exp;
    this._currentStep = 0;
    this._showView('active');
    this._renderStep();
  },

  _renderStep() {
    const exp = this._currentMoment;
    if (!exp) return;
    const step = exp.steps[this._currentStep];
    const total = exp.steps.length;

    _setText('moment-step-pill', `Step ${this._currentStep + 1} of ${total}`);
    _setText('moment-prompt-title', step.title);
    _setText('moment-prompt-desc', step.desc);

    const nextBtn = _$('moment-next-btn');
    if (nextBtn) {
      nextBtn.textContent = this._currentStep === total - 1 ? 'Finish Moment ✓' : 'Continue →';
    }

    // Micro-motion for companion avatar
    const face = _$('moment-avatar-char');
    const glow = _$('moment-avatar-glow');
    if (window.gsap && !MotionSystem.reduced()) {
      if (face) window.gsap.fromTo(face, { scale: 0.94 }, { scale: 1, duration: 0.45, ease: 'back.out(1.6)' });
      if (glow) window.gsap.fromTo(glow, { scale: 1.3, opacity: 0.9 }, { scale: 1, opacity: 0.4, duration: 0.6 });
    }
  },

  nextStep() {
    const exp = this._currentMoment;
    if (!exp) return;
    if (this._currentStep < exp.steps.length - 1) {
      this._currentStep++;
      this._renderStep();
    } else {
      this._finish();
    }
  },

  _finish() {
    const exp = this._currentMoment;
    if (!exp) return;
    this._showView('done');
    _setText('moment-done-title', `${exp.title} Complete`);
    _setText('moment-done-desc', exp.completion);

    // Save moment completion locally
    const completions = Storage.readUser(KEYS.MOMENTS, _currentUser?.username || 'demo', []);
    completions.unshift({
      id: Date.now(),
      title: exp.title,
      timestamp: new Date().toISOString()
    });
    Storage.writeUser(KEYS.MOMENTS, _currentUser?.username || 'demo', completions.slice(0, 50));

    // Create star in Tiny Wins Constellation
    ConstellationSystem.addStar('moment', `Shared moment with WALL·E: ${exp.title}`);
  },

  plantToGarden() {
    if (!this._currentMoment) return;
    MemoryGarden.plantFromSource('win', `A Moment with WALL·E: ${this._currentMoment.title}`, this._currentMoment.completion);
    this.close();
  }
};


/* ══════════════════════════════════════════════════════════════
   FEATURE 3 — MENTAL WEATHER
   A visual, non-diagnostic representation of recent self-reported states.
══════════════════════════════════════════════════════════════ */
const MentalWeatherSystem = {
  calculate() {
    const moods = MoodSystem.get();
    if (!moods || !moods.length) {
      return {
        type: 'clear',
        title: 'Calm Clear Sky',
        badge: '✦ Emotional Climate',
        icon: '☀️',
        summary: 'Your sky is calm and open. Log a check-in to reflect your state.',
        mood: 'Calm',
        energy: 'Steady',
        tension: 'Low',
        glow: 'radial-gradient(circle, rgba(56, 189, 248, 0.22), transparent 70%)'
      };
    }

    // Look at last 5 mood entries
    const recent = moods.slice(0, 5);
    const avgScore = recent.reduce((sum, m) => sum + (m.score || 3), 0) / recent.length;
    const latest = recent[0]?.mood;

    if (avgScore >= 4.4) {
      return {
        type: 'clear',
        title: 'Clear Golden Sunlight',
        badge: '✦ Upbeat & Grounded',
        icon: '☀️',
        summary: 'Your recent check-ins feel buoyant and peaceful. Savor this light.',
        mood: 'Happy',
        energy: 'Vibrant',
        tension: 'Low',
        glow: 'radial-gradient(circle, rgba(245, 158, 11, 0.26), transparent 70%)'
      };
    } else if (avgScore >= 3.6) {
      return {
        type: 'sunset',
        title: 'Calm Evening Horizon',
        badge: '✦ Reflective & Centered',
        icon: '🌅',
        summary: 'Your recent check-ins feel reflective and serene, like twilight settling in.',
        mood: 'Calm',
        energy: 'Balanced',
        tension: 'Moderate',
        glow: 'radial-gradient(circle, rgba(167, 139, 250, 0.22), transparent 70%)'
      };
    } else if (avgScore >= 2.8) {
      return {
        type: 'clouds',
        title: 'Soft Drifting Clouds',
        badge: '✦ Steady & Neutral',
        icon: '⛅',
        summary: 'A neutral, steady climate. A good time to take small breaths and check in gently.',
        mood: 'Neutral',
        energy: 'Mild',
        tension: 'Moderate',
        glow: 'radial-gradient(circle, rgba(148, 163, 184, 0.2), transparent 70%)'
      };
    } else if (latest === 'Stressed' || avgScore >= 2.0) {
      return {
        type: 'wind',
        title: 'Restless Starlight Wind',
        badge: '✦ Carrying Extra Tension',
        icon: '🌬️',
        summary: 'You may be carrying a bit more tension than usual. Give yourself permission to pause.',
        mood: 'Stressed',
        energy: 'Restless',
        tension: 'Elevated',
        glow: 'radial-gradient(circle, rgba(129, 140, 248, 0.25), transparent 70%)'
      };
    } else {
      return {
        type: 'rain',
        title: 'Gentle Cleansing Rain',
        badge: '✦ Low Energy & Tender',
        icon: '🌧️',
        summary: 'Your check-ins show lower emotional energy. Heavy days pass; be extraordinarily gentle with yourself.',
        mood: 'Sad',
        energy: 'Low',
        tension: 'Gentle Care Needed',
        glow: 'radial-gradient(circle, rgba(99, 102, 241, 0.25), transparent 70%)'
      };
    }
  },

  render() {
    const data = this.calculate();
    _setText('weather-badge', data.badge);
    _setText('weather-title', data.title);
    _setText('weather-summary', data.summary);
    _setText('weather-art-icon', data.icon);

    const glowEl = _$('weather-glow');
    if (glowEl) glowEl.style.background = data.glow;

    const moodFactor = _$('wf-mood');
    const energyFactor = _$('wf-energy');
    const stressFactor = _$('wf-stress');

    if (moodFactor) moodFactor.innerHTML = `Mood: <strong>${data.mood}</strong>`;
    if (energyFactor) energyFactor.innerHTML = `Energy: <strong>${data.energy}</strong>`;
    if (stressFactor) stressFactor.innerHTML = `Tension: <strong>${data.tension}</strong>`;

    /* Sanctuary Floating Weather Card */
    _setText('sanctuary-weather-art', data.icon);
    _setText('sanctuary-weather-title', data.title);
    _setText('sanctuary-weather-sub', data.summary);
  }
};


/* ══════════════════════════════════════════════════════════════
   FEATURE 4 — TINY WINS CONSTELLATION
   A soft alternative to streaks: positive actions light stars in your sky.
══════════════════════════════════════════════════════════════ */
const ConstellationSystem = {
  get() {
    return Storage.readUser(KEYS.STARS, _currentUser?.username || 'demo', []);
  },

  save(stars) {
    return Storage.writeUser(KEYS.STARS, _currentUser?.username || 'demo', stars.slice(0, 60));
  },

  addStar(source, title) {
    const list = this.get();
    // Maximum 25 visual stars in the canvas constellation
    const star = {
      id: Date.now(),
      source: source || 'care',
      title: title || 'Cared for yourself',
      // Normalized SVG coordinates in 460x200 box
      cx: 30 + Math.random() * 400,
      cy: 25 + Math.random() * 150,
      r: 3 + Math.random() * 2.5,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
    list.unshift(star);
    this.save(list);
    this.render();
  },

  render() {
    const stars = this.get();
    const countPill = _$('constellation-count-pill');
    if (countPill) {
      countPill.textContent = `${stars.length} Star${stars.length === 1 ? '' : 's'} Formed`;
    }

    const svgStars = _$('constellation-stars');
    const svgLines = _$('constellation-lines');
    if (!svgStars || !svgLines) return;

    if (!stars.length) {
      // Seed default quiet constellation if user is brand new
      svgStars.innerHTML = `
        <circle cx="120" cy="80" r="3.5" fill="#f59e0b" filter="url(#starGlow)" opacity="0.6"/>
        <circle cx="230" cy="60" r="4.5" fill="#fbbf24" filter="url(#starGlow)" opacity="0.8"/>
        <circle cx="340" cy="110" r="3.5" fill="#60a5fa" filter="url(#starGlow)" opacity="0.6"/>
      `;
      svgLines.innerHTML = `
        <line x1="120" y1="80" x2="230" y2="60" stroke="url(#starLineGrad)" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
        <line x1="230" y1="60" x2="340" y2="110" stroke="url(#starLineGrad)" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
      `;
      return;
    }

    // Render up to 20 connected constellation stars
    const displayStars = stars.slice(0, 20);

    // Connect stars chronologically with soft atmospheric lines
    let linesMarkup = '';
    for (let i = 0; i < displayStars.length - 1; i++) {
      const s1 = displayStars[i];
      const s2 = displayStars[i + 1];
      linesMarkup += `<line x1="${s1.cx}" y1="${s1.cy}" x2="${s2.cx}" y2="${s2.cy}" stroke="url(#starLineGrad)" stroke-width="1.2" opacity="0.45"/>`;
    }
    svgLines.innerHTML = linesMarkup;

    // Render stars
    svgStars.innerHTML = displayStars.map(s => `
      <circle class="constellation-star" cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="#fbbf24" filter="url(#starGlow)" onclick="ConstellationSystem.inspectStar(${s.id})"/>
    `).join('');
  },

  inspectStar(id) {
    const star = this.get().find(s => s.id === id);
    if (!star) return;
    const detail = _$('constellation-star-detail');
    if (detail) {
      _$('star-detail-icon').textContent = '🌟';
      _$('star-detail-text').textContent = `${star.title} · ${star.date}`;
      if (window.gsap && !MotionSystem.reduced()) {
        window.gsap.fromTo(detail, { scale: 0.98 }, { scale: 1, duration: 0.25, ease: 'power2.out' });
      }
    }
  }
};

/* ══════════════════════════════════════════════════════════════
   INITIALIZATION
══════════════════════════════════════════════════════════════ */
function init() {
  MotionSystem.init();
  TinyResetGames.init();
  if(typeof Chart!=='undefined') {
    Chart.defaults.font.family="'Plus Jakarta Sans', system-ui, sans-serif";
    Chart.defaults.font.size=12;
    Chart.defaults.font.weight=500;
    Chart.defaults.color='#94a3b8';
  }

  /* Seed demo account */
  const users=AppController.getUsers();
  if(!Object.keys(users).length){
    Object.defineProperty(users,'demo',{value:{name:'Demo User',password:btoa('demo1234')},writable:true,enumerable:true,configurable:true});
    AppController.saveUsers(users);
  }

  /* Restore session */
  const saved=Storage.readJSON(KEYS.CURRENT,null);
  if(saved){
    if(typeof saved.username==='string'&&typeof saved.name==='string'&&saved.name.trim()) { _currentUser=saved; AppController._launch(); }
    else Storage.remove(KEYS.CURRENT);
  }
}

document.addEventListener('DOMContentLoaded', init, {once:true});
