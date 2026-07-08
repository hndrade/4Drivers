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
- **Sincronização entre aparelhos (opcional)** — conecte um projeto Supabase gratuito e use a mesma conta no computador e no celular; sem configurar, os dados ficam **somente no seu dispositivo** (localStorage)

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

## ☁️ Sincronização entre aparelhos (Supabase)

Com o Supabase configurado, o app vira uma **área logada**: a primeira tela é o login (e-mail/senha) e todos os dados ficam vinculados à conta, sincronizados entre web e celular. O app se conecta ao projeto **Supabase** (gratuito) direto do navegador — a hospedagem continua sendo estática (GitHub Pages etc.), sem servidor próprio.

Sem configurar o Supabase, não há login e os dados ficam só no dispositivo (modo local).

### Passo a passo (~5 minutos)

1. **Crie o projeto**: acesse [supabase.com](https://supabase.com) → *New project* (plano Free)
2. **Crie a tabela e as regras de segurança**: no painel do projeto, abra *SQL Editor* → *New query*, cole e execute:

```sql
create table public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "usuario acessa apenas os proprios dados"
  on public.user_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

3. **(Recomendado)** Em *Authentication → Sign In / Up → Email*, desative **Confirm email** para poder criar a conta e entrar direto, sem esperar e-mail de confirmação
4. **Copie as credenciais**: em *Settings → API*, copie a **Project URL** e a **anon public key**, e preencha o arquivo `supabase-config.js`:

```js
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";
```

5. **Publique novamente** (commit + push). Ao abrir o app, a tela de login aparece: crie sua conta com e-mail/senha e entre com ela em todos os aparelhos

> 🔐 A *anon key* é pública por design — pode ficar no repositório. A segurança vem do **RLS** (Row Level Security) criado no passo 2: cada usuário só lê e escreve os próprios dados.

### Como o sync funciona

- Ao **abrir o app** (e ao voltar para ele), baixa os dados da nuvem
- Ao **salvar qualquer registro**, envia para a nuvem ~1,5 s depois (com aviso de pendência se estiver offline; reenvia na próxima oportunidade)
- No **primeiro login** de um aparelho que já tinha dados locais, os registros locais e os da nuvem são **mesclados** (nada se perde)
- **Trocar de conta** no mesmo aparelho não mistura dados: cada conta vê apenas os próprios registros
- Depois de logado, o app continua funcionando **offline**; a sincronização acontece quando houver conexão. A sessão fica salva — não é preciso entrar toda vez

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
app.js                # lógica: dados, telas, formulários, gráficos, alertas, sync
cloud.js              # autenticação e API do Supabase (REST, sem SDK)
supabase-config.js    # credenciais do seu projeto Supabase (opcional)
sw.js                 # service worker (offline)
manifest.webmanifest  # manifest PWA
icons/                # ícones do app
```
