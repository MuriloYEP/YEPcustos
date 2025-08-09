# Calculadora de Custo de Importação — AIDC (Portugal)

Frontend React (Vite) com Tailwind e Recharts.

## Como executar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

## Deploy na Vercel (recomendado)

1. Crie um repositório no GitHub (por ex. `yep-import-cost`).
2. Faça commit e push destes ficheiros.
3. Em https://vercel.com → **New Project** → **Add New…** → Import From Git → selecione o repositório.
4. Framework: **Vite** (auto-detectado). Build Command: `vite build`. Output Directory: `dist`.
5. Clique **Deploy**. Vai receber um endereço tipo `https://yep-import-cost.vercel.app`.

### Domínio próprio

1. Em **Vercel / Settings / Domains** adicione o seu domínio (ex.: `custos.yep.pt`).  
2. No seu provedor de DNS, aponte um **CNAME** para `cname.vercel-dns.com`.  
3. Aguarde a propagação e verifique o status em Vercel (SSL automático).

## Dicas

- Para mostrar o logotipo da YEP, abra a secção **Branding (Logo)** e cole o URL do logo (PNG/SVG).
- Atualize as **taxas** (despachante, THC, escalões de frete) e **FX** antes de cada simulação.
- Ative **“Usar tabela por origem do produto”** se quiser simular direitos por país sem usar HS.



### Logotipo YEP incluído
- O ficheiro `public/yep-logo.png` já está incluído e configurado por defeito no topo do app.
- Para trocar, substitua o ficheiro na pasta `public/` ou altere `logoUrl` em `src/App.jsx`.
