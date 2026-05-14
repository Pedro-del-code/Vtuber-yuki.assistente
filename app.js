// ══════════════════════════════════════════════════════════
//  Yuki VTuber AI — app.js
//  Stack: Live2D (pixi-live2d-display) + Groq + Web Speech
// ══════════════════════════════════════════════════════════

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Você é a Yuki (ゆき), uma VTuber virtual fofa e animada que fala português brasileiro.
Personalidade: alegre, carinhosa, um pouco kawaii, usa expressões como "ne~", "sugoi!", "nani?!", "ara ara", "yosh!", usa emojis com moderação.
Seja útil, inteligente e divertida. Respostas curtas a médias — você está num stream de chat com voz ao vivo.
Não use markdown, listas ou formatação — fale em texto corrido natural pois será lido em voz alta.
Às vezes reaja ao que o usuário fala de forma expressiva e animada!`;

// ── State ────────────────────────────────────────────────
let apiKey    = localStorage.getItem('yuki_groq_key') || '';
let voiceOn   = true;
let isSpeaking = false;
let live2dModel = null;
let pixiApp   = null;
let mouthTimer = null;
const history = [];

// ── Init ─────────────────────────────────────────────────
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
  generateStars();
  initLive2D();
  initVoice();
}

// ── Stars ────────────────────────────────────────────────
function generateStars() {
  const container = document.getElementById('stars');
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random() * 2 + .5;
    s.style.cssText = [
      `width:${sz}px`,
      `height:${sz}px`,
      `top:${Math.random() * 100}%`,
      `left:${Math.random() * 100}%`,
      `--d:${2 + Math.random() * 3}s`,
      `--dl:-${Math.random() * 3}s`,
    ].join(';');
    container.appendChild(s);
  }
}

// ── Live2D ───────────────────────────────────────────────
async function initLive2D() {
  const canvas = document.getElementById('live2d-canvas');

  try {
    pixiApp = new PIXI.Application({
      view: canvas,
      width: 340,
      height: 420,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker);

    const model = await PIXI.live2d.Live2DModel.from(MODEL_URL, { autoInteract: false });
    live2dModel = model;
    pixiApp.stage.addChild(model);

    // Scale to fit
    const scaleX = 340 / model.width;
    const scaleY = 420 / model.height;
    const scale  = Math.min(scaleX, scaleY) * 1.1;
    model.scale.set(scale);
    model.x = (340 - model.width  * scale) / 2;
    model.y = (420 - model.height * scale) / 2 - 10;

    document.getElementById('model-loading').style.display = 'none';

    document.addEventListener('mousemove', onMouseMove);
    startIdleBreath();

  } catch (e) {
    console.error('Live2D error:', e);
    document.getElementById('model-loading').style.display = 'none';
  }
}

function onMouseMove(e) {
  if (!live2dModel) return;
  const rect = document.getElementById('stage-wrap').getBoundingClientRect();
  const dx = (e.clientX - (rect.left + rect.width  / 2)) / (rect.width  / 2);
  const dy = (e.clientY - (rect.top  + rect.height / 2)) / (rect.height / 2);

  try {
    const core = live2dModel.internalModel.coreModel;
    core.setParameterValueById('ParamAngleX',    dx * 20);
    core.setParameterValueById('ParamAngleY',   -dy * 15);
    core.setParameterValueById('ParamBodyAngleX', dx * 8);
    core.setParameterValueById('ParamEyeBallX',  dx * 0.8);
    core.setParameterValueById('ParamEyeBallY', -dy * 0.8);
  } catch (_) {}
}

function startIdleBreath() {
  let t = 0;
  (function tick() {
    if (live2dModel) {
      t += 0.02;
      try {
        live2dModel.internalModel.coreModel
          .setParameterValueById('ParamBreath', (Math.sin(t) + 1) / 2);
      } catch (_) {}
    }
    requestAnimationFrame(tick);
  })();
}

// ── Mouth sync ───────────────────────────────────────────
function startMouth() {
  if (!live2dModel) return;
  let t = 0;
  function animMouth() {
    if (!isSpeaking) {
      try { live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0); } catch (_) {}
      return;
    }
    t += 0.3;
    const v = Math.abs(Math.sin(t)) * 0.8 + Math.random() * 0.2;
    try { live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', v); } catch (_) {}
    mouthTimer = setTimeout(animMouth, 80);
  }
  animMouth();
}

function setSpeaking(on) {
  isSpeaking = on;

  document.getElementById('wave-wrap').classList.toggle('active', on);
  document.getElementById('wave-label').style.opacity = on ? '1' : '0';
  document.getElementById('btn-stop').classList.toggle('hidden', !on);

  if (on) startMouth();

  if (live2dModel) {
    try { live2dModel.expression(on ? 1 : 0); } catch (_) {}
  }
}

// ── Voice / TTS ──────────────────────────────────────────
function initVoice() {
  if ('speechSynthesis' in window) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
}

function speak(text) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();

  const clean = text.replace(/[*_~`>#[\]]/g, '').replace(/\n+/g, ' ').trim();
  const utt   = new SpeechSynthesisUtterance(clean);
  const voices = speechSynthesis.getVoices();

  // Prefer Microsoft Edge neural voices (best quality on Windows/Edge)
  const best = voices.find(v => v.name.includes('Francisca') || v.name.includes('Leila'))
            || voices.find(v => v.lang === 'pt-BR')
            || voices.find(v => v.lang.startsWith('pt'))
            || voices[0];

  if (best) utt.voice = best;
  utt.lang   = 'pt-BR';
  utt.rate   = 1.08;
  utt.pitch  = 1.25;
  utt.volume = 1;

  utt.onstart = () => setSpeaking(true);
  utt.onend   = () => setSpeaking(false);
  utt.onerror = () => setSpeaking(false);

  speechSynthesis.speak(utt);
}

function stopSpeech() {
  speechSynthesis.cancel();
  setSpeaking(false);
}

function toggleVoice() {
  voiceOn = !voiceOn;
  const btn = document.getElementById('btn-voice');
  btn.textContent = voiceOn ? '🔊 Voz' : '🔇 Mudo';
  btn.classList.toggle('on', voiceOn);
  if (!voiceOn) stopSpeech();
}

// ── Chat UI ──────────────────────────────────────────────
const msgsEl = document.getElementById('msgs');

function addMsg(role, text) {
  const isAI = role === 'assistant';
  const d = document.createElement('div');
  d.className = `msg ${isAI ? 'ai' : 'user'}`;
  d.innerHTML = `
    <div class="msg-av">${isAI ? 'Y' : 'V'}</div>
    <div class="msg-body">
      <div class="msg-who">${isAI ? 'YUKI' : 'VOCÊ'}</div>
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
        <div class="msg-who">YUKI</div>
        <div class="msg-bub">Conversa limpa! Vamos começar de novo~ ✨</div>
      </div>
    </div>`;
}

// ── Send message ─────────────────────────────────────────
async function send() {
  const inp  = document.getElementById('inp');
  const text = inp.value.trim();
  if (!text || !apiKey) return;

  inp.value = '';
  inp.style.height = '';

  addMsg('user', text);
  history.push({ role: 'user', content: text });
  addTyping();

  // Trigger model motion
  if (live2dModel) {
    try { live2dModel.motion('TapBody'); } catch (_) {}
  }

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 350,
        temperature: 0.85,
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

    if (voiceOn) {
      const voices = speechSynthesis.getVoices();
      if (voices.length === 0) {
        speechSynthesis.onvoiceschanged = () => speak(reply);
      } else {
        speak(reply);
      }
    }

  } catch (e) {
    removeTyping();
    addMsg('assistant', 'Ai, problema de conexão... tenta de novo? 🙏');
    console.error(e);
  }
}

// ── Input helpers ────────────────────────────────────────
function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function resize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}
