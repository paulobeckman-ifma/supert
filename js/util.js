// Utilitários gerais do SUPERT 2
export const CFG = window.SUPERT_CONFIG || {};
export const FUSO = CFG.FUSO || 'America/Fortaleza';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ ícones (traço, 24x24)
const P = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alerta: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  usuarios: '<circle cx="9" cy="8" r="4"/><path d="M1 21a8 8 0 0 1 16 0M17 4a4 4 0 0 1 0 8m6 9a8 8 0 0 0-4-7"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grafico: '<path d="M3 3v18h18"/><path d="M7 16v-5m5 5V8m5 8v-9"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  casa: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  imprimir: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  atualizar: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  lixo: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  chave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2m-4 4 3 3m-6 0 2 2"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2"/>',
  raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  escola: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  sino: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  caixa: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  trocar: '<path d="M7 16H3v4M17 8h4V4M3 16a9 9 0 0 0 15.5 2.5M21 8A9 9 0 0 0 5.5 5.5"/>',
  unir: '<path d="M8 6v6a4 4 0 0 0 4 4h8M16 12l4 4-4 4M8 6 4 10M8 6l4 4"/>',
  arquivo: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'
};
export const ico = (n, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ------------------------------------------------------------------ datas (sempre no fuso do campus)
const fmtISO = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });
export const isoDe = (d = new Date()) => fmtISO.format(d);
export const hojeISO = () => isoDe(new Date());
export const horaAgora = () => fmtHora.format(new Date());
export function addDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const diaSemanaNum = (iso) => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w === 0 ? 7 : w; }; // 1=seg … 7=dom
export const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const DIAS_CURTO = ['', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
export const fmtData = (iso) => iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : '';
export const fmtDataCurta = (iso) => iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}` : '';
export function fmtDataHora(ts) { if (!ts) return ''; const d = new Date(ts); return `${fmtData(isoDe(d))} ${fmtHora.format(d)}`; }
export function dataExtenso(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' });
}
/** Período rápido: hoje | semana | mes | semestre (1º sem = jan-jul; 2º = ago-dez) */
export function periodo(tipo, base = hojeISO()) {
  const [a, m] = [Number(base.slice(0, 4)), Number(base.slice(5, 7))];
  if (tipo === 'hoje') return [base, base];
  if (tipo === 'semana') { const ini = addDias(base, 1 - diaSemanaNum(base)); return [ini, addDias(ini, 6)]; }
  if (tipo === 'mes') { const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); return [`${a}-${String(m).padStart(2, '0')}-01`, fim]; }
  if (tipo === 'ano') return [`${a}-01-01`, `${a}-12-31`];
  return m <= 7 ? [`${a}-01-01`, `${a}-07-31`] : [`${a}-08-01`, `${a}-12-31`];
}

// ------------------------------------------------------------------ nomes
export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Mesma regra da função _chave do banco. */
export const chave = (s) => semAcento(s).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const ROMANOS = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'para', 'ao', 'na', 'no', 'com']);
const ABREV = { mat: 'matematica', port: 'portugues', lp: 'lingua portuguesa', ed: 'educacao', fis: 'fisica', qui: 'quimica', quim: 'quimica',
  bio: 'biologia', hist: 'historia', geo: 'geografia', geog: 'geografia', ing: 'ingles', esp: 'espanhol', filo: 'filosofia', socio: 'sociologia',
  soc: 'sociologia', int: 'introducao', intro: 'introducao', tec: 'tecnologia', lab: 'laboratorio', proj: 'projeto', des: 'desenho',
  info: 'informatica', adm: 'administracao', eng: 'engenharia', lit: 'literatura', ef: 'educacao fisica', lem: 'lingua estrangeira moderna' };
export function tokens(s) {
  const out = [];
  for (let t of chave(s).split(' ')) {
    if (!t || PARADAS.has(t)) continue;
    if (ROMANOS[t]) t = ROMANOS[t];
    if (ABREV[t]) out.push(...ABREV[t].split(' ')); else out.push(t);
  }
  return out;
}
function lev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  const dp = Array(b.length + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1; dp[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j - 1], dp[j]) + 1; prev = t; }
  }
  return dp[b.length];
}
/**
 * Semelhança entre dois nomes de disciplina (0 a 1). Tolera acento, pontuação, algarismo
 * romano x arábico, abreviação comum ("Mat." = Matemática) e palavra cortada ("Téc." = Técnico).
 * Números diferentes (Matemática I x Matemática II) derrubam a nota: são disciplinas diferentes.
 */
export function simNome(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  if (A.join(' ') === B.join(' ')) return 1;
  const numA = A.filter((t) => /^\d+$/.test(t)).join(','), numB = B.filter((t) => /^\d+$/.test(t)).join(',');
  const casa = (x, lista) => lista.some((y) => x === y || (x.length >= 3 && y.startsWith(x)) || (y.length >= 3 && x.startsWith(y)) || (x.length > 4 && y.length > 4 && lev(x, y) <= 1));
  const pa = A.filter((x) => casa(x, B)).length, pb = B.filter((y) => casa(y, A)).length;
  let s = (pa + pb) / (A.length + B.length);
  const sa = A.join(' '), sb = B.join(' ');
  s = Math.max(s * 0.85 + 0.15 * (1 - lev(sa, sb) / Math.max(sa.length, sb.length)), 0);
  if (numA !== numB) s *= numA && numB ? 0.35 : 0.8;
  return Math.round(s * 100) / 100;
}
/** Semelhança entre nomes de professor (abreviado x completo, primeiro nome). */
export function simProf(a, b) {
  const na = chave(a), nb = chave(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(' '), tb = nb.split(' ');
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const ok = menor.filter((t) => t.length > 1 && maior.includes(t)).length;
  if (ok === menor.length) return menor.length >= 2 ? 0.95 : (menor[0].length >= 4 && maior[0] === menor[0] ? 0.8 : 0.6);
  if (ta[0] === tb[0] && ta[0].length >= 3) return 0.6 + 0.3 * ok / menor.length;
  return 0.4 * ok / Math.max(menor.length, 1);
}

// ------------------------------------------------------------------ turmas e turnos
export function turnoDaHora(hora, turnos) {
  for (const [k, t] of Object.entries(turnos || {})) if (hora >= t.ini && hora <= t.fim) return k;
  return 'N';
}
/** Tipo da turma pelo código: I (integrado), S (subsequente), C (concomitante), P (proeja), SUP (superior). */
export function tipoTurma(t) {
  const s = String(t || '').trim().toUpperCase();
  const m = s.match(/-([A-Z])[A-Z]*$/); if (m) return m[1];
  if (/^(FISICA|F[IÍ]SICA|C\.?\s?C\.?|E\.?\s?E\.?|E\.?\s?C\.?|BEC|BCC|EEI)/.test(s)) return 'SUP';
  return 'OUTRO';
}
/** Disciplinas semestrais: superior, subsequente, concomitante; integrado/proeja só com CH ≤ 40. */
export function ehSemestral(turma, ch) {
  const t = tipoTurma(turma);
  if (t === 'SUP' || t === 'S' || t === 'C') return true;
  if (t === 'I' || t === 'P') return ch > 0 && ch <= 40;
  return false;
}
export const ordTurma = (a, b) => String(a).localeCompare(String(b), 'pt', { numeric: true });

// ------------------------------------------------------------------ avisos e modais
export function aviso(msg, tipo = '') {
  const box = document.getElementById('avisos'); if (!box) return;
  const el = document.createElement('div'); el.className = `aviso ${tipo}`; el.textContent = msg;
  box.appendChild(el); setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 3800);
}
export function modal({ titulo, corpo = '', botoes = [], largo = false, aoAbrir, fecharFora = true }) {
  const fundo = document.createElement('div'); fundo.className = 'fundo-modal';
  fundo.innerHTML = `<div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true">
      <header><h2>${esc(titulo)}</h2><button class="btn fantasma pequeno" data-fechar aria-label="Fechar">${ico('x')}</button></header>
      <div class="corpo"></div><footer class="${botoes.length ? '' : 'oculto'}"></footer></div>`;
  const c = fundo.querySelector('.corpo');
  if (typeof corpo === 'string') c.innerHTML = corpo; else c.appendChild(corpo);
  let resolver; const promessa = new Promise((r) => (resolver = r));
  const fechar = (v = null) => { fundo.remove(); document.removeEventListener('keydown', tecla); resolver(v); };
  const tecla = (e) => { if (e.key === 'Escape') fechar(null); };
  document.addEventListener('keydown', tecla);
  const rodape = fundo.querySelector('footer');
  botoes.forEach((b) => {
    const el = document.createElement('button'); el.className = `btn ${b.classe || ''}`; el.innerHTML = b.texto;
    el.onclick = async () => {
      if (!b.acao) return fechar(b.valor ?? null);
      el.disabled = true;
      try { const r = await b.acao(fechar, fundo); if (r !== false && document.body.contains(fundo) && b.fechar !== false) fechar(r ?? b.valor ?? true); }
      catch (e) { aviso(e.message || String(e), 'erro'); }
      finally { el.disabled = false; }
    };
    rodape.appendChild(el);
  });
  fundo.querySelector('[data-fechar]').onclick = () => fechar(null);
  if (fecharFora) fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(null); });
  document.body.appendChild(fundo);
  if (aoAbrir) aoAbrir(fundo, fechar);
  const primeiro = fundo.querySelector('[autofocus]') || fundo.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea'); if (primeiro) setTimeout(() => primeiro.focus(), 30);
  return { el: fundo, fechar, promessa };
}
export function confirmar(texto, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
  return modal({
    titulo, corpo: `<div style="margin:0;white-space:pre-line">${texto}</div>`,
    botoes: [{ texto: 'Cancelar', valor: false }, { texto: ok, classe: perigo ? 'perigo-cheio' : 'primario', valor: true }]
  }).promessa.then((v) => v === true);
}
export function pedirTexto(titulo, rotulo, { minimo = 0, valor = '', dica = '' } = {}) {
  return modal({
    titulo, corpo: `<label class="campo"><span>${esc(rotulo)}</span><textarea data-t>${esc(valor)}</textarea></label>${dica ? `<small class="mudo">${esc(dica)}</small>` : ''}
      <div class="caixa erro-caixa oculto" data-e>Escreva pelo menos ${minimo} caracteres.</div>`,
    botoes: [{ texto: 'Cancelar', valor: null }, {
      texto: 'Confirmar', classe: 'primario', acao: (fechar, el) => {
        const v = $('[data-t]', el).value.trim();
        if (v.length < minimo) { $('[data-e]', el).classList.remove('oculto'); return false; }
        fechar(v); return false;
      }
    }]
  }).promessa;
}

// ------------------------------------------------------------------ arquivos
export function baixarArquivo(nome, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function baixarCsv(nome, cabecalho, linhas) {
  const cel = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const txt = '﻿' + [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n');
  baixarArquivo(nome.endsWith('.csv') ? nome : nome + '.csv', new Blob([txt], { type: 'text/csv;charset=utf-8' }));
}
export function carregarScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}
/** Abre um documento numa janela nova e chama a impressão (texto vetorial, o usuário escolhe "Salvar como PDF"). */
export function imprimirDoc(html) {
  const w = window.open('', '_blank', 'width=1000,height=1100');
  if (!w) { aviso('O navegador bloqueou a janela. Permita pop-ups deste site.', 'erro'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  const ir = () => setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 300);
  if (w.document.readyState === 'complete') ir(); else w.addEventListener('load', ir, { once: true });
}

// ------------------------------------------------------------------ diversos
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');
export function barraProg(feito, total) {
  if (!total) return `<span class="mudo pequeno">${feito ? feito + ' aulas' : '—'}</span>`;
  const p = Math.round((feito / total) * 100);
  const cls = p >= 100 ? 'completa' : p >= 70 ? '' : p >= 40 ? 'media' : 'baixa';
  return `<div class="barra-prog ${cls}" data-dica="${feito} de ${total} aulas"><i><b style="width:${Math.min(100, p)}%"></b></i><span>${p}%</span></div>`;
}
export const STATUS = { presente: 'Presente', ausente: 'Falta', atraso: 'Atraso', saida: 'Saída antecipada', nao: 'Não houve' };
/** Justificativas de "não houve aula" (o registro fica guardado com 0 aulas e não gera notificação). */
export const JUSTIFICATIVAS = ['Sem professor', 'Falta justificada', 'Permuta', 'Reposição ou antecipação', 'Turma liberada', 'Evento institucional', 'Visita técnica ou aula externa', 'Feriado ou ponto facultativo', 'Avaliação ou conselho de classe', 'Outro'];
export const opcoesJustificativa = (atual = '') => `<option value="">Justificativa…</option>` + [...new Set([...JUSTIFICATIVAS, ...(atual ? [atual] : [])])].map((j) => `<option ${j === atual ? 'selected' : ''}>${j}</option>`).join('');
export const TIPOS = { regular: 'Regular', extra: 'Extra', permuta: 'Permuta' };

// Dica flutuante: qualquer elemento com data-dica
let dicaEl = null;
document.addEventListener('mouseover', (e) => {
  const alvo = e.target.closest?.('[data-dica]');
  if (!alvo) { dicaEl?.remove(); dicaEl = null; return; }
  if (!dicaEl) { dicaEl = document.createElement('div'); dicaEl.className = 'dica'; document.body.appendChild(dicaEl); }
  dicaEl.textContent = alvo.dataset.dica;
  const r = alvo.getBoundingClientRect(); dicaEl.style.left = `${r.left + r.width / 2}px`; dicaEl.style.top = `${r.top}px`;
});
