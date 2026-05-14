// ══════════════════════════════════════════════════════════
//  Yuki VTuber AI — app.js  (v3)
//  Stack: Live2D (pixi-live2d-display) + Groq + Web Speech TTS
//  Fix: novo modelo, maior, voz mobile, personalidade assistente
// ══════════════════════════════════════════════════════════

// Modelo Shizuku (diferente, cabelo azul/turquesa, mais expressivo)
const MODEL_URL      = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model.json';
const GROQ_ENDPOINT  = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL     = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Você é a Yuki, uma assistente virtual inteligente e prestativa que fala português brasileiro.
Seja direta, clara e útil. Responda de forma natural e conversacional, sem exageros ou expressões forçadas.
Pode ser levemente simpática e amigável, mas foque em ser eficiente e resolver o que o usuário precisa.
Não use markdown, listas com asteriscos ou formatação especial — fale em texto corrido pois será lido em voz alta.
Respostas curtas a médias. Se não souber algo, diga honestamente.`;

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

  // Escala para preencher bem a tela (1.35 = modelo grande)
  const scaleX = (w  / naturalW) * 1.35;
  const scaleY = (h  / naturalH) * 1.35;
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
//  Solução mobile-first: usa <audio> tag com Google TTS
//  (translate.google.com/translate_tts) — funciona em
//  qualquer navegador incluindo Chrome Android, sem precisar
//  de API key. Fallback para Web Speech se o áudio falhar.
//
//  Limitação: textos > 200 chars são divididos em chunks.
//

let ttsAudio = null;

function initVoice() {
  // Pré-cria elemento audio para que o mobile confie nele
  ttsAudio = new Audio();
  ttsAudio.onended  = () => setSpeaking(false);
  ttsAudio.onerror  = () => {
    console.warn('TTS audio error, tentando Web Speech...');
    setSpeaking(false);
    speakWebSpeech(_lastClean);
  };
}

let _lastClean = '';
let _ttsQueue  = [];
let _ttsPlaying = false;

function speak(text) {
  if (!voiceOn) return;
  stopSpeech();

  _lastClean = text
    .replace(/[*_~`>#\[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  // Divide em chunks de até 180 chars no espaço mais próximo
  _ttsQueue = chunkText(_lastClean, 180);
  _ttsPlaying = true;
  setSpeaking(true);
  playNextChunk();
}

function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf(' ', maxLen);
    if (cut < 60) cut = maxLen; // sem espaço, corta forçado
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function playNextChunk() {
  if (!_ttsPlaying || _ttsQueue.length === 0) {
    setSpeaking(false);
    return;
  }
  const chunk = _ttsQueue.shift();
  const url   = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodeURIComponent(chunk)}`;

  ttsAudio.src = url;
  ttsAudio.onended = () => {
    if (_ttsPlaying) playNextChunk();
  };
  ttsAudio.onerror = () => {
    console.warn('Google TTS falhou, usando Web Speech...');
    _ttsQueue = [];
    _ttsPlaying = false;
    setSpeaking(false);
    speakWebSpeech(_lastClean);
  };
  ttsAudio.play().catch(() => {
    // Autoplay bloqueado — tenta Web Speech
    speakWebSpeech(_lastClean);
  });
}

// Fallback: Web Speech API
function speakWebSpeech(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const best = voices.find(v => v.lang === 'pt-BR')
            || voices.find(v => v.lang.startsWith('pt'))
            || voices[0];
  if (best) utt.voice = best;
  utt.lang   = 'pt-BR';
  utt.rate   = 1.0;
  utt.pitch  = 1.1;
  utt.volume = 1;
  utt.onstart = () => setSpeaking(true);
  utt.onend   = () => setSpeaking(false);
  utt.onerror = () => setSpeaking(false);
  speechSynthesis.speak(utt);
}

function stopSpeech() {
  _ttsPlaying = false;
  _ttsQueue   = [];
  if (ttsAudio) { ttsAudio.pause(); ttsAudio.src = ''; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  setSpeaking(false);
}

function toggleVoice() {
  voiceOn = !voiceOn;
  const btn = document.getElementById('btn-voice');
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
        <div class="msg-bub">Conversa reiniciada. Como posso te ajudar?</div>
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
