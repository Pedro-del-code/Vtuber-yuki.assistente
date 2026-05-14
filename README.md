# 🌸 Yuki VTuber AI

VTuber virtual com Live2D, chat via Groq (LLaMA 3.3) e voz natural em português.

## Estrutura

```
yuki-vtuber/
├── index.html   ← estrutura
├── style.css    ← visual
├── app.js       ← lógica (Live2D + Groq + TTS)
└── README.md
```

## Deploy no Render (gratuito)

1. Crie um repositório no GitHub e suba os 3 arquivos
2. Acesse [render.com](https://render.com) e crie conta gratuita
3. Clique em **New → Static Site**
4. Conecte seu repositório GitHub
5. Configure:
   - **Name:** yuki-vtuber (ou o nome que quiser)
   - **Branch:** main
   - **Publish directory:** `.` (ponto — raiz do repo)
   - Build command: *(deixar vazio)*
6. Clique em **Create Static Site**
7. Aguarde o deploy — seu site estará em `https://seu-nome.onrender.com`

## Como usar

- Abra o site no **Microsoft Edge** para melhor qualidade de voz (voz Francisca Neural)
- Cole sua chave do Groq na tela inicial (gratuito em [console.groq.com](https://console.groq.com))
- A chave fica salva no seu navegador — não vai a lugar nenhum

## Funcionalidades

- 🎭 Modelo Live2D (Haru) com física de cabelo e roupa
- 👀 Olhos seguem o mouse
- 👄 Boca sincronizada com a fala
- 💨 Respiração idle animada
- 🎙️ Voz em PT-BR (Microsoft Francisca Neural no Edge)
- 🤖 IA Yuki com personalidade VTuber kawaii
- 🔴 Visual estilo stream ao vivo

## Tecnologias (todas gratuitas)

| Tecnologia | Uso |
|---|---|
| Live2D Cubism SDK | Modelo animado |
| pixi-live2d-display | Renderização WebGL |
| Groq API | LLM gratuito (LLaMA 3.3 70B) |
| Web Speech API | Voz TTS nativa do browser |
| Render Static Site | Hospedagem gratuita |
