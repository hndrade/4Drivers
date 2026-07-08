/* ============================================================
   4Drivers — configuração do Supabase (sincronização na nuvem)

   Para ativar a sincronização entre aparelhos:
   1. Crie um projeto gratuito em https://supabase.com
   2. Rode o SQL de setup (veja o README, seção "Sincronização")
   3. Copie os valores em Settings → API do seu projeto e preencha abaixo
   4. Publique novamente o app

   A "anon key" é pública por design — a segurança vem das políticas
   RLS no banco (cada usuário só acessa os próprios dados).
   Deixe os dois valores vazios para usar o app apenas local.
   ============================================================ */

const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";
