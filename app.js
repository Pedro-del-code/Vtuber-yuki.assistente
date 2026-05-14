// ══════════════════════════════════════════════════════════
//  Yuki VTuber AI — app.js  (v2)
//  Stack: Live2D (pixi-live2d-display) + Groq + Web Speech TTS
//  Fix: modelo centralizado + voz mobile + visual melhorado
// ══════════════════════════════════════════════════════════

const MODEL_URL      = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json';
const GROQ_ENDPOINT  = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL     = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Você é a Yuki (ゆき), uma VTuber virtual fofa e animada que fala português brasileiro.
Personalidade: alegre, carinhosa, um pouco kawaii, usa expressões como "ne~", "sugoi!", "nani?!", "ara ara", "yosh!", usa emojis com moderação.
Seja útil, inteligente e divertida. Respostas curtas a médias — você está num stream de chat com voz ao vivo.
Não use markdown, listas ou formatação — fale em texto corrido natural pois será lido em voz alta.
Às vezes reaja ao que o usuário fala de forma expressiva e animada!`;

// ── State ─────────────────────────────────────────────────
let apiKey     = localStorage.getItem('yuki_groq_key') || '';
let voiceOn    = true;
let isSpeaking = false;
let live2dModel = null;
let pixiApp    = null;
let mouthTimer = null;
let voiceReady = false;         // flag: usuário interagiu (necessário no mobile)
const history  = [];

// ── Init ──────────────────────────────────────────────────
if (apiKey) {
  document.getElementById('overlay').style.display = 'none';
  initApp();
}

function start() {
  const k = document.getElementById('key-inp').value.trim();
  if (!k) return alert('Cole sua chave do Groq!');
  apiKey = k;
  localStorage.setItem('yuki_groq_key', k);
  document.getElementById('overlay').style.display = 'none';
  initApp();
}

function initApp() {
  initParticles();
  initLive2D();
  initVoice();
}

// ══ PARTICLES (canvas nativo, sem libs) ═════════════════
function initParticles() {
  const canvas = document.getElementById('particles-bg');
  const ctx    = canvas.getContext('2d');
  let   W, H;

  const particles = Array.from({ length: 60 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.5 + .3,
    dx: (Math.random() - .5) * .0002,
    dy: -Math.random() * .0003 - .0001,
    a: Math.random(),
    da: (Math.random() - .5) * .005,
    hue: Math.random() > .5 ? 320 : 270,  // pink or purple
  }));

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.x  += p.dx; p.y += p.dy; p.a += p.da;
      if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
      if (p.y < -.01) p.y = 1.01;
      p.a  = Math.max(.05, Math.min(1, p.a));

      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${p.a * .6})`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `hsla(${p.hue}, 90%, 75%, .4)`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ══ LIVE2D ══════════════════════════════════════════════
async function initLive2D() {
  const canvas   = document.getElementById('live2d-canvas');
  const stageEl  = document.getElementById('stage-wrap');

  function getStageSize() {
    const r = stageEl.getBoundingClientRect();
    // Reserva espaço para controls (48px) + name-tag + status bar
    const reserved = 90;
    return { w: r.width, h: r.height - reserved };
  }

  const { w, h } = getStageSize();

  // Tamanho do canvas = tamanho disponível no stage
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';

  try {
    pixiApp = new PIXI.Application({
      view: canvas,
      width:  w,
      height: h,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker);

    const model = await PIXI.live2d.Live2DModel.from(MODEL_URL, { autoInteract: false });
    live2dModel = model;
    pixiApp.stage.addChild(model);

    // ── Centralizar modelo ───────────────────────────────
    fitModel(w, h);

    document.getElementById('model-loading').style.display = 'none';

    // Input tracking
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    startIdleBreath();

    // Resize: refit no redimensionamento (ex: rotate mobile)
    window.addEventListener('resize', () => {
      const { w: nw, h: nh } = getStageSize();
      pixiApp.renderer.resize(nw, nh);
      canvas.style.width  = nw + 'px';
      canvas.style.height = nh + 'px';
      fitModel(nw, nh);
    });

  } catch (e) {
    console.error('Live2D error:', e);
    document.getElementById('model-loading').style.display = 'none';
  }
}

function fitModel(w, h) {
  if (!live2dModel) return;

  // Pega dimensão "natural" antes de aplicar scale
  const naturalW = live2dModel.internalModel.originalWidth  || live2dModel.width;
  const naturalH = live2dModel.internalModel.originalHeight || live2dModel.height;

  // Escala para cobrir ~90% da altura disponível
  const scaleX = (w  / naturalW) * 0.95;
  const scaleY = (h  / naturalH) * 0.95;
  const scale  = Math.min(scaleX, scaleY);

  live2dModel.scale.set(scale);

  // Centraliza no canvas
  live2dModel.x = (w - naturalW * scale) / 2;
  live2dModel.y = (h - naturalH * scale) / 2;
}

function onPointerMove(e) {
  applyLook(e.clientX, e.clientY);
}

function onTouchMove(e) {
  if (e.touches.length > 0) applyLook(e.touches[0].clientX, e.touches[0].clientY);
}

function applyLook(cx, cy) {
  if (!live2dModel) return;
  const rect = document.getElementById('stage-wrap').getBoundingClientRect();
  const dx = (cx - (rect.left + rect.width  / 2)) / (rect.width  / 2);
  const dy = (cy - (rect.top  + rect.height / 2)) / (rect.height / 2);
  try {
    const core = live2dModel.internalModel.coreModel;
    core.setParameterValueById('ParamAngleX',    dx * 20);
    core.setParameterValueById('ParamAngleY',   -dy * 15);
    core.setParameterValueById('ParamBodyAngleX', dx * 8);
    core.setParameterValueById('ParamEyeBallX',  dx * .8);
    core.setParameterValueById('ParamEyeBallY', -dy * .8);
  } catch (_) {}
}

function startIdleBreath() {
  let t = 0;
  (function tick() {
    if (live2dModel) {
      t += 0.018;
      try {
        live2dModel.internalModel.coreModel
          .setParameterValueById('ParamBreath', (Math.sin(t) + 1) / 2);
      } catch (_) {}
    }
    requestAnimationFrame(tick);
  })();
}

// ── Boca sync ─────────────────────────────────────────
function startMouth() {
  if (!live2dModel) return;
  clearTimeout(mouthTimer);
  let t = 0;
  function animMouth() {
    if (!isSpeaking) {
      try { live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0); } catch (_) {}
      return;
    }
    t += 0.28;
    const v = Math.abs(Math.sin(t)) * 0.75 + Math.random() * 0.25;
    try { live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', v); } catch (_) {}
    mouthTimer = setTimeout(animMouth, 80);
  }
  animMouth();
}

function setSpeaking(on) {
  isSpeaking = on;
  const statusBar = document.getElementById('status-bar');
  statusBar.classList.toggle('active', on);
  if (on) startMouth();
  if (live2dModel) {
    try { live2dModel.expression(on ? 1 : 0); } catch (_) {}
  }
}

// ══ VOZ / TTS ══════════════════════════════════════════
//
//  PROBLEMA MOBILE: Chrome/Android bloqueia speechSynthesis
//  até o usuário interagir com a página. Por isso:
//  1. Chamamos speechSynthesis.getVoices() + cancel() no
//     primeiro clique/toque para "desbloquear".
//  2. Fallback: se speechSynthesis não falar em 300ms, tenta
//     de novo via setTimeout (bug de Android Chrome).
//

function initVoice() {
  if (!('speechSynthesis' in window)) return;

  // Pré-carrega vozes
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener('voiceschanged', () => {
    speechSynthesis.getVoices(); // popula lista
  });

  // Desbloqueia no primeiro toque (mobile)
  function unlock() {
    if (voiceReady) return;
    speechSynthesis.cancel(); // limpa fila bloqueada
    const utt = new SpeechSynthesisUtterance('');
    utt.volume = 0;
    speechSynthesis.speak(utt);
    voiceReady = true;
    document.removeEventListener('touchstart', unlock);
    document.removeEventListener('click', unlock);
  }
  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('click',      unlock, { once: true });
}

function getBestVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Prioridade: voz feminina pt-BR → qualquer pt-BR → qualquer pt → fallback
  return voices.find(v => v.lang === 'pt-BR' && /francisca|leila|maria|ana/i.test(v.name))
      || voices.find(v => v.lang === 'pt-BR')
      || voices.find(v => v.lang.startsWith('pt'))
      || voices[0];
}

function speak(text) {
  if (!voiceOn || !('speechSynthesis' in window)) return;

  speechSynthesis.cancel();

  const clean = text
    .replace(/[*_~`>#\[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  function doSpeak() {
    const utt = new SpeechSynthesisUtterance(clean);
    const voice = getBestVoice();
    if (voice) utt.voice = voice;
    utt.lang   = 'pt-BR';
    utt.rate   = 1.05;
    utt.pitch  = 1.3;
    utt.volume = 1;

    utt.onstart = () => setSpeaking(true);
    utt.onend   = () => setSpeaking(false);
    utt.onerror = (e) => {
      console.warn('TTS error:', e.error);
      setSpeaking(false);
    };

    speechSynthesis.speak(utt);

    // Workaround Android Chrome: fala pode ficar travada
    // se as vozes não carregaram ainda — tenta de novo em 400ms
    setTimeout(() => {
      if (!isSpeaking && voiceOn) {
        speechSynthesis.cancel();
        const utt2 = new SpeechSynthesisUtterance(clean);
        const v2 = getBestVoice();
        if (v2) utt2.voice = v2;
        utt2.lang = 'pt-BR'; utt2.rate = 1.05; utt2.pitch = 1.3;
        utt2.onstart = () => setSpeaking(true);
        utt2.onend   = () => setSpeaking(false);
        utt2.onerror = () => setSpeaking(false);
        speechSynthesis.speak(utt2);
      }
    }, 400);
  }

  // Se vozes ainda não carregaram, espera
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) {
    speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
  } else {
    doSpeak();
  }
}

function stopSpeech() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  setSpeaking(false);
}

function toggleVoice() {
  voiceOn = !voiceOn;
  const btn = document.getElementById('btn-voice');
  const svg = btn.querySelector('svg');
  btn.querySelector('span').textContent = voiceOn ? 'Voz' : 'Mudo';
  btn.classList.toggle('on', voiceOn);
  if (!voiceOn) stopSpeech();
}

// ══ CHAT UI ════════════════════════════════════════════
const msgsEl = document.getElementById('msgs');

function timeNow() {
  const t = new Date();
  return t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0');
}

function addMsg(role, text) {
  const isAI = role === 'assistant';
  const d = document.createElement('div');
  d.className = `msg ${isAI ? 'ai' : 'user'}`;
  d.innerHTML = `
    <div class="msg-av">${isAI ? 'Y' : 'U'}</div>
    <div class="msg-body">
      <div class="msg-who">${isAI ? 'YUKI' : 'VOCÊ'} <span class="msg-time">${timeNow()}</span></div>
      <div class="msg-bub">${text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')}</div>
    </div>`;
  msgsEl.appendChild(d);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function addTyping() {
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.id = 'typing';
  d.innerHTML = `
    <div class="msg-av">Y</div>
    <div class="msg-body">
      <div class="msg-who">YUKI</div>
      <div class="msg-bub">
        <div class="typing">
          <div class="tdot"></div>
          <div class="tdot"></div>
          <div class="tdot"></div>
        </div>
      </div>
    </div>`;
  msgsEl.appendChild(d);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function removeTyping() {
  document.getElementById('typing')?.remove();
}

function clearChat() {
  stopSpeech();
  history.length = 0;
  msgsEl.innerHTML = `
    <div class="msg ai">
      <div class="msg-av">Y</div>
      <div class="msg-body">
        <div class="msg-who">YUKI <span class="msg-time">${timeNow()}</span></div>
        <div class="msg-bub">Conversa limpa! Vamos começar de novo~ ✨</div>
      </div>
    </div>`;
}

// ══ ENVIAR MENSAGEM ════════════════════════════════════
async function send() {
  const inp  = document.getElementById('inp');
  const text = inp.value.trim();
  if (!text || !apiKey) {
    if (!apiKey) alert('Configure sua chave Groq primeiro!');
    return;
  }

  inp.value = '';
  inp.style.height = '';

  addMsg('user', text);
  history.push({ role: 'user', content: text });
  addTyping();

  // Anima modelo
  if (live2dModel) {
    try { live2dModel.motion('TapBody'); } catch (_) {}
  }

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        max_tokens:  350,
        temperature: 0.88,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
        ],
      }),
    });

    const data = await res.json();
    removeTyping();

    if (data.error) {
      addMsg('assistant', `Eita, deu erro: ${data.error.message} 😢`);
      return;
    }

    const reply = data.choices[0].message.content;
    history.push({ role: 'assistant', content: reply });
    addMsg('assistant', reply);

    if (voiceOn) speak(reply);

  } catch (e) {
    removeTyping();
    addMsg('assistant', 'Ai, problema de conexão... tenta de novo? 🙏');
    console.error(e);
  }
}

// ══ INPUT helpers ══════════════════════════════════════
function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function resize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 90) + 'px';
}
