# 🚗 4Drivers

App web para **controle de manutenções e gastos com veículos** — visual limpo estilo iOS, funciona no navegador (desktop e celular), instalável como app (PWA) e 100% offline.

## ✨ Funcionalidades

- **Veículos** — cadastre carros, motos, caminhões etc., com ícone e cor personalizados
- **Abastecimentos** — litros, preço/litro e total (o app calcula o terceiro campo automaticamente), com cálculo de **consumo médio (km/l)**
- **Gastos** — IPVA, seguro, multas, pedágio, estacionamento, lavagem, financiamento e mais
- **Serviços** — troca de óleo, pneus, freios, revisões… com custo, odômetro e oficina
- **Manutenção programada** — agende por **data marcada**, por **quilometragem**, ou ambos:
  - Registre o odômetro com frequência e o app calcula sua **média de km/dia**
  - Com a média, ele **projeta a data prevista** para manutenções definidas por km
  - **Repetição automática**: ao concluir, a próxima ocorrência é criada (ex.: a cada 6 meses ou 10.000 km)
- **Alertas e notificações** — aviso de manutenção vencida ou próxima (antecedência configurável em dias e km), com notificações do navegador/dispositivo
- **Painel** — gasto do mês, consumo médio, custo por km, gráfico dos últimos 6 meses e atividade recente
- **Backup** — exporte/importe seus dados em JSON e exporte gastos em CSV para planilhas
- **Privacidade** — os dados ficam **somente no seu dispositivo** (localStorage); nada é enviado a servidores

## 📱 Instalar no celular

1. Abra a URL publicada no navegador do celular
2. **iPhone (Safari):** Compartilhar → *Adicionar à Tela de Início*
3. **Android (Chrome):** menu ⋮ → *Instalar app* (ou o banner de instalação)

O app abre em tela cheia, com ícone próprio, e funciona sem internet.

## 🌐 Onde publicar (grátis)

O app é 100% estático — qualquer hospedagem de arquivos serve. Opções recomendadas:

### GitHub Pages (recomendado — já está no GitHub)
1. No repositório: **Settings → Pages**
2. Em *Source*, escolha **Deploy from a branch**, branch `main` (ou a branch desejada), pasta `/ (root)`
3. Pronto: o app fica em `https://SEU-USUARIO.github.io/4Drivers/`

### Vercel
```bash
npm i -g vercel
vercel deploy --prod
```
Ou conecte o repositório em [vercel.com/new](https://vercel.com/new) (framework: *Other*, sem build).

### Netlify
Arraste a pasta do projeto em [app.netlify.com/drop](https://app.netlify.com/drop), ou conecte o repositório (sem comando de build, publish directory: `/`).

### Cloudflare Pages
Conecte o repositório em [pages.cloudflare.com](https://pages.cloudflare.com) — sem build, output `/`.

> ⚠️ PWA e notificações exigem **HTTPS** — todas as opções acima já fornecem.

## 🛠️ Rodar localmente

Sem build, sem dependências:

```bash
python3 -m http.server 8080
# ou: npx serve
```

Abra `http://localhost:8080`.

## 🧭 Como funciona a projeção por km

1. Registre o odômetro periodicamente (abastecimentos e serviços com odômetro também contam)
2. O app calcula a média de km/dia da janela recente (~120 dias)
3. Para uma manutenção marcada "aos 50.000 km", ele estima: `dias restantes = (50.000 − odômetro atual) ÷ km/dia` e mostra a **data prevista**
4. Quando faltar menos que o limite configurado (padrão: 500 km ou 15 dias), o item entra em alerta 🔔

## 🔔 Sobre as notificações

O app usa a API de notificações do navegador via service worker: os avisos são verificados ao abrir o app e a cada 30 minutos com ele aberto/instalado (máx. 1 aviso por item por dia). Por ser um app sem servidor, não há push remoto — o sino no topo e os banners do painel mostram sempre os alertas pendentes.

- **Permissão bloqueada?** Toque no cadeado 🔒 na barra de endereço (ou ⋮ → Configurações do site) → Notificações → Permitir, e reative em Ajustes. Há um botão de notificação de teste em Ajustes para conferir.
- **iPhone/iPad:** as notificações web só funcionam com o app **instalado na Tela de Início** (iOS 16.4+) — instale primeiro e ative por lá.

## 📂 Estrutura

```
index.html            # estrutura da interface
styles.css            # design system estilo iOS (claro/escuro automático)
app.js                # lógica: dados, telas, formulários, gráficos, alertas
sw.js                 # service worker (offline)
manifest.webmanifest  # manifest PWA
icons/                # ícones do app
```
