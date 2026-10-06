// SUPERT 2 · roteador, login, estrutura do painel e sessão
import { $, $$, esc, ico, aviso, CFG, confirmar } from './util.js';
import { rpc, api, sessao, traduzir, pode } from './api.js';
import { D, carregarCadastro, iniciarSincronia, pararSincronia } from './dados.js';

export const VERSAO = '2.3.1';
const raiz = $('#app');
let desmontar = null;
let paginaAtual = null;

const ROTAS = {
  turno:        { titulo: 'Lançar turno', icone: 'raio', perm: 'turno', destaque: true, carregar: () => import('./pag-turno.js') },
  registrar:    { titulo: 'Registro avulso', icone: 'editar', perm: 'registrar', carregar: () => import('./pag-registrar.js') },
  painel:       { titulo: 'Painel de aulas', icone: 'grafico', perm: 'painel', carregar: () => import('./pag-painel.js') },
  turmas:       { titulo: 'Turmas e diários', icone: 'escola', perm: 'turmas', carregar: () => import('./pag-turmas.js') },
  recursos:     { titulo: 'Chaves e recursos', icone: 'chave', perm: 'recursos', carregar: () => import('./pag-recursos.js') },
  notificacoes: { titulo: 'Notificações', icone: 'sino', perm: 'notificacoes', carregar: () => import('./pag-notificacoes.js') },
  horario:      { titulo: 'Importar horário', icone: 'enviar', perm: 'admin', grupo: 'Administração', carregar: () => import('./pag-horario.js') },
  config:       { titulo: 'Configurações', icone: 'config', perm: 'admin', carregar: () => import('./pag-config.js') },
  conta:        { titulo: 'Minha conta', icone: 'usuario', perm: null, semMenu: true, carregar: null }
};
const permitida = (r) => !r.perm || pode(r.perm);
function inicial() {
  for (const id of ['turno', 'painel', 'registrar', 'turmas', 'recursos', 'notificacoes']) if (permitida(ROTAS[id])) return id;
  return 'conta';
}

// ------------------------------------------------------------------ login
function telaLogin(msg = '') {
  pararSincronia(); pararInatividade();
  raiz.innerHTML = `<div class="tela-login"><form class="login-cartao" autocomplete="on">
      <img src="assets/logo-ifma.png" alt="IFMA Campus Imperatriz">
      <h1>SUPERT</h1><p>Supervisão de aulas e recursos</p>
      <label class="campo"><span>Usuário</span><input type="text" name="login" autocomplete="username" required autocapitalize="off"></label>
      <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
      <div class="caixa erro-caixa ${msg ? '' : 'oculto'}" data-erro>${esc(msg)}</div>
      <button class="btn primario grande">Entrar</button>
      <small class="mudo" style="text-align:center">${esc(CFG.INSTITUICAO || 'IFMA · Campus Imperatriz')} · versão ${VERSAO}</small>
    </form></div>`;
  const f = $('form', raiz);
  $('input[name=login]', f).focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = $('button', f); b.disabled = true; b.textContent = 'Entrando…';
    try {
      const r = await rpc('login', { p_login: f.login.value.trim(), p_senha: f.senha.value, p_dispositivo: navigator.userAgent.slice(0, 180) });
      if (r.erro) throw new Error(traduzir(r.erro));
      sessao.salvar(r.token, r.usuario);
      await iniciarSessao();
      const destino = r.usuario.deve_trocar_senha ? '#/conta' : '#/' + inicial();
      if (location.hash === destino) navegar(); else location.hash = destino;
    } catch (err) {
      const box = $('[data-erro]', f); box.textContent = err.message; box.classList.remove('oculto');
      b.disabled = false; b.textContent = 'Entrar';
    }
  };
}

async function iniciarSessao() {
  const s = await rpc('sessao_info', { p_token: sessao.token }, { timeout: 15000 });
  sessao.atualizarUsuario(s.usuario); sessao.config = s.config || {};
  if (!s.usuario.deve_trocar_senha) { await carregarCadastro(); iniciarSincronia(); }
  iniciarInatividade();
}

// ------------------------------------------------------------------ estrutura
function shell(rota) {
  const u = sessao.usuario;
  let grupoAtual = null;
  const itens = Object.entries(ROTAS).filter(([, r]) => !r.semMenu && permitida(r)).map(([id, r]) => {
    let g = '';
    if (r.grupo && r.grupo !== grupoAtual) { grupoAtual = r.grupo; g = `<div class="grupo">${esc(r.grupo)}</div>`; }
    return g + `<a href="#/${id}" class="${id === rota ? 'ativo' : ''} ${r.destaque ? 'destaque' : ''}" data-rota="${id}">${ico(r.icone)}<span>${r.titulo}</span></a>`;
  }).join('');
  raiz.innerHTML = `<div class="shell">
    <aside class="lateral" id="lateral">
      <div class="marca"><img src="assets/simbolo-ifma.png" alt=""><div><b>SUPERT</b><small>Supervisão · IFMA Imperatriz</small></div></div>
      <nav class="nav">${itens}</nav>
      <div class="usuario-box"><b>${esc(u.nome || u.login)}</b><span class="mudo">${esc(u.login)} · ${esc(u.perfil)}</span>
        <div class="sessao-tempo" id="sessao-tempo"></div>
        <div class="linha-flex" style="gap:2px;margin-top:6px">
          <a href="#/conta" class="btn fantasma pequeno" style="padding-left:0">${ico('usuario')} Conta</a>
          <a href="#" id="sair" class="btn fantasma pequeno">${ico('sair')} Sair</a></div></div>
    </aside>
    <main class="conteudo" id="conteudo"></main></div>`;
  $('#sair').onclick = (e) => { e.preventDefault(); sair(); };
  $$('.nav a').forEach((a) => (a.onclick = () => $('#lateral').classList.remove('aberta')));
  if (pode('admin')) atualizarContadorExclusoes();
  return $('#conteudo');
}
export async function atualizarContadorExclusoes() {
  try {
    const l = await api('exclusoes_listar');
    const a = $('[data-rota=painel]'); if (!a) return;
    a.querySelectorAll('.contagem').forEach((x) => x.remove());
    if (l.length) a.insertAdjacentHTML('beforeend', `<span class="contagem" data-dica="Pedidos de exclusão aguardando você">${l.length}</span>`);
  } catch { /* */ }
}

export function cabecalho(titulo, sub = '', acoes = '') {
  return `<div class="cabecalho"><button class="btn menu-movel" onclick="document.getElementById('lateral').classList.add('aberta')">${ico('menu')}</button>
    <div><h1>${esc(titulo)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><span class="espaco"></span><div class="linha-flex nao-imprimir">${acoes}</div></div>`;
}

async function sair() {
  try { await rpc('logout', { p_token: sessao.token }); } catch { /* offline */ }
  sessao.limpar(); location.hash = ''; telaLogin();
}

// ------------------------------------------------------------------ inatividade
// Sai sozinho depois de N minutos sem uso (padrão 20), com aviso 1 minuto antes.
let fimSessao = 0, tInat = null, avisoAberto = false;
const tocou = () => { if (!avisoAberto) fimSessao = Date.now() + minutosInat() * 60000; };
const minutosInat = () => Number(sessao.config?.inatividade_min || 20);
function iniciarInatividade() {
  pararInatividade(); tocou();
  ['click', 'keydown', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, tocou, { passive: true, capture: true }));
  tInat = setInterval(async () => {
    const resta = fimSessao - Date.now();
    const el = $('#sessao-tempo');
    if (el) { const m = Math.max(0, Math.floor(resta / 60000)), s = Math.max(0, Math.floor(resta / 1000) % 60); el.textContent = `sessão: ${m}:${String(s).padStart(2, '0')}`; el.classList.toggle('alerta', resta < 120000); }
    if (resta <= 0) { avisoAberto = false; $$('.fundo-modal').forEach((x) => x.remove()); await sair(); aviso('Sessão encerrada por inatividade.'); return; }
    if (resta < 60000 && !avisoAberto) {
      avisoAberto = true;
      const ok = await confirmar('Você ficará sem acesso em 1 minuto por inatividade. Deseja continuar?', { titulo: 'Sessão quase expirando', ok: 'Continuar conectado' });
      avisoAberto = false;
      if (ok) tocou(); else sair();
    }
  }, 1000);
}
function pararInatividade() {
  if (tInat) clearInterval(tInat); tInat = null;
  ['click', 'keydown', 'touchstart', 'scroll'].forEach((ev) => document.removeEventListener(ev, tocou, { capture: true }));
}

// ------------------------------------------------------------------ minha conta
function paginaConta(el) {
  const u = sessao.usuario;
  el.innerHTML = cabecalho('Minha conta', `${esc(u.nome || u.login)} · ${esc(u.login)} · perfil ${esc(u.perfil)}`) + `
    <div class="cartao" style="max-width:520px">
      ${u.deve_trocar_senha ? '<div class="caixa aviso-caixa" style="margin-bottom:12px">Primeiro acesso: defina uma senha pessoal para continuar. A senha provisória é igual ao seu usuário (ou a que o administrador informou).</div>' : ''}
      <h2>Trocar senha</h2><form class="grade" style="grid-template-columns:1fr;margin-top:12px" id="f-senha">
        <label class="campo"><span>Senha atual</span><input type="password" name="atual" required autocomplete="current-password"></label>
        <label class="campo"><span>Nova senha (mínimo 6 caracteres)</span><input type="password" name="nova" required minlength="6" autocomplete="new-password"></label>
        <label class="campo"><span>Repita a nova senha</span><input type="password" name="rep" required autocomplete="new-password"></label>
        <div><button class="btn primario">Salvar nova senha</button></div></form></div>`;
  $('#f-senha').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.nova.value !== f.rep.value) return aviso('As senhas não conferem.', 'erro');
    try {
      await api('trocar_senha', { p_atual: f.atual.value, p_nova: f.nova.value });
      const eraPrimeiro = u.deve_trocar_senha;
      sessao.atualizarUsuario({ ...u, deve_trocar_senha: false });
      aviso('Senha alterada.', 'ok');
      if (eraPrimeiro) { await carregarCadastro(); iniciarSincronia(); }
      location.hash = '#/' + inicial();
    } catch (err) { aviso(err.message, 'erro'); }
  };
}

// ------------------------------------------------------------------ roteador
let navSeq = 0;
async function navegar() {
  const minha = ++navSeq;
  if (desmontar) { try { desmontar(); } catch { /* ignore */ } desmontar = null; }
  paginaAtual = null;
  if (!sessao.token) return telaLogin();
  let [id, qs] = location.hash.replace(/^#\/?/, '').split('?');
  id = id || inicial();
  if (sessao.usuario?.deve_trocar_senha) id = 'conta';
  const rota = ROTAS[id];
  if (!rota || !permitida(rota)) { location.hash = '#/' + inicial(); return; }
  const el = shell(id);
  if (id === 'conta') return paginaConta(el);
  el.innerHTML = '<div class="vazio">Carregando…</div>';
  try {
    if (!D.carregado) await carregarCadastro();
    const mod = await rota.carregar();
    if (minha !== navSeq) return;   // o usuário já foi para outra tela
    paginaAtual = mod;
    const r = await mod.render(el, { cabecalho, params: new URLSearchParams(qs || '') });
    if (typeof r === 'function') desmontar = r;
  } catch (e) {
    if (minha !== navSeq || !document.body.contains(el)) return;
    console.error(e);
    el.innerHTML = cabecalho(rota.titulo) + `<div class="caixa erro-caixa">${esc(e.message || e)}</div>`;
  }
}

window.addEventListener('hashchange', navegar);
window.addEventListener('supert:sessao-expirada', () => { sessao.limpar(); telaLogin('Sua sessão expirou. Entre novamente.'); });
window.addEventListener('supert:trocar-senha', () => {
  if (sessao.usuario) sessao.atualizarUsuario({ ...sessao.usuario, deve_trocar_senha: true });
  if (!location.hash.startsWith('#/conta')) location.hash = '#/conta';
});
// Algo mudou no banco (outro computador lançou, importou etc.): recarrega o cadastro e avisa a página aberta.
window.addEventListener('supert:mudou', async () => {
  try { await carregarCadastro(); } catch { return; }
  if (paginaAtual?.aoMudar) { try { paginaAtual.aoMudar(); } catch (e) { console.warn(e); } }
  if (pode('admin')) atualizarContadorExclusoes();
});

// Ao abrir: confere a sessão guardada
(async () => {
  if (!CFG.SUPABASE_URL) { raiz.innerHTML = '<div class="vazio">Configuração ausente (config.js).</div>'; return; }
  if (sessao.token) {
    try { await iniciarSessao(); }
    catch (e) { if (!e.rede) sessao.limpar(); else { raiz.innerHTML = `<div class="vazio">${esc(e.message)}<br><br><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`; return; } }
  }
  navegar();
})();
