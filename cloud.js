/* ============================================================
   4Drivers — autenticação e sincronização com Supabase.
   Usa a API REST diretamente (GoTrue + PostgREST), sem SDK,
   para manter o app sem build e sem dependências.
   ============================================================ */

"use strict";

const Cloud = (() => {
  const SESSION_KEY = "4drivers_session_v1";

  let session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { /* sessão corrompida: ignora */ }

  const cfg = () =>
    typeof SUPABASE_URL !== "undefined" && /^https?:\/\//.test(SUPABASE_URL) &&
    typeof SUPABASE_ANON_KEY !== "undefined" && SUPABASE_ANON_KEY
      ? { url: SUPABASE_URL.replace(/\/+$/, ""), key: SUPABASE_ANON_KEY }
      : null;

  function saveSession(s) {
    session = s;
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }

  function friendlyAuthError(json, status) {
    const msg = json.error_description || json.msg || json.message || (json.error && json.error.message) || "";
    if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos";
    if (/already registered|already been registered/i.test(msg)) return "Este e-mail já tem cadastro — use Entrar";
    if (/password.*(short|least|characters)|at least 6/i.test(msg)) return "Senha muito curta (mínimo 6 caracteres)";
    if (/valid email|invalid format/i.test(msg)) return "E-mail inválido";
    if (/not confirmed/i.test(msg)) return "E-mail ainda não confirmado — verifique sua caixa de entrada";
    if (/rate limit|too many/i.test(msg) || status === 429) return "Muitas tentativas — aguarde um minuto";
    return msg || "Erro de conexão com o servidor";
  }

  async function authRequest(path, body) {
    const c = cfg();
    const res = await fetch(c.url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.key },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(friendlyAuthError(json, res.status));
    return json;
  }

  function adoptTokens(json) {
    saveSession({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600),
      user: { id: json.user.id, email: json.user.email },
    });
  }

  async function ensureFreshToken(force) {
    if (!session) throw new Error("Sessão expirada — entre novamente");
    if (!force && session.expires_at - 60 > Date.now() / 1000) return;
    try {
      const json = await authRequest("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      adoptTokens(json);
    } catch (e) {
      saveSession(null);
      throw new Error("Sessão expirada — entre novamente");
    }
  }

  async function rest(path, opts = {}) {
    const c = cfg();
    await ensureFreshToken(false);
    const doFetch = () =>
      fetch(c.url + path, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          apikey: c.key,
          Authorization: "Bearer " + session.access_token,
          ...(opts.headers || {}),
        },
      });
    let res = await doFetch();
    if (res.status === 401) { // token revogado no servidor: força refresh e tenta 1x
      await ensureFreshToken(true);
      res = await doFetch();
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || `Erro ${res.status} ao sincronizar`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    enabled: () => !!cfg(),
    user: () => (cfg() && session ? session.user : null),

    /** Cria conta. Retorna {session:false} se o projeto exigir confirmação por e-mail. */
    async signUp(email, password) {
      const json = await authRequest("/auth/v1/signup", { email, password });
      if (json.access_token) { adoptTokens(json); return { session: true }; }
      return { session: false };
    },

    async signIn(email, password) {
      const json = await authRequest("/auth/v1/token?grant_type=password", { email, password });
      adoptTokens(json);
    },

    signOut() { saveSession(null); },

    /** Busca os dados do usuário na nuvem. Retorna {data, updated_at} ou null. */
    async pull() {
      const rows = await rest("/rest/v1/user_data?select=data,updated_at&limit=1");
      return (rows && rows[0]) || null;
    },

    /** Envia (upsert) os dados do usuário para a nuvem. */
    async push(data) {
      await rest("/rest/v1/user_data?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([{ user_id: session.user.id, data, updated_at: new Date().toISOString() }]),
      });
    },
  };
})();
