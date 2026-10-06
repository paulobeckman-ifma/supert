// Chaves, equipamentos e materiais: retirada (uma ou várias de uma vez), devolução, permuta de chave e histórico
import { $, $$, esc, ico, aviso, confirmar, modal, semAcento, fmtDataHora, imprimirDoc, periodo, baixarCsv, hojeISO, addDias } from './util.js';
import { api, pode } from './api.js';
import { D } from './dados.js';

const TIPOS = {
  chaves: { rot: 'Chaves', um: 'chave', c1: 'Número', c2: 'Ambiente', devolve: true },
  equip: { rot: 'Equipamentos', um: 'equipamento', c1: 'ID', c2: 'Descrição', devolve: true },
  mat: { rot: 'Materiais', um: 'material', c1: 'Nome', c2: 'Descrição', devolve: false }
};
const BLOCOS = { lab: '🔬 Laboratórios', b1: '🟦 Bloco 1', b2: '🟩 Bloco 2', b3: '🟨 Bloco 3', b4: '🟫 Bloco 4', outros: '❔ Outras' };
const EQ = { notebook: 'Notebook', projetor: 'Projetor', caixa_som: 'Caixa de som', microfone: 'Microfone', camera: 'Câmera', controle_tv: 'Controle de TV', controle_ar: 'Controle de ar-condicionado', outros: 'Outros' };
const EQ_ICO = { notebook: '💻', projetor: '📽️', caixa_som: '🔊', microfone: '🎤', camera: '📷', controle_tv: '📺', controle_ar: '❄️', outros: '📦' };
// Controle remoto desenhado (não existe emoji de controle remoto); usado nos cartões de "Controle de TV".
const ICO_CONTROLE = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-.12em"><rect x="7.5" y="2" width="9" height="20" rx="2.5"/><circle cx="12" cy="6.2" r="1.3" fill="currentColor" stroke="none"/><path d="M10 10.5h.01M14 10.5h.01M10 13.5h.01M14 13.5h.01M10 16.5h.01M14 16.5h.01"/><path d="M11 19.2h2"/></svg>';
const ehAr = (it) => /\bar\b|ar[- ]?cond|condicionad|split|climatiz/i.test(semAcento(`${it.c1 || ''} ${it.c2 || ''}`));
const LEGADO = { '💻': 'notebook', '📽️': 'projetor', '🔊': 'caixa_som', '🎤': 'microfone', '📷': 'camera', '📹': 'outros', '🖨️': 'outros', '🕹️': 'controle_tv', '🎮': 'controle_tv', '📺': 'controle_tv', '🖥️': 'notebook', '🔌': 'outros', filmadora: 'outros', impressora: 'outros' };
const BLOCO_ICO = { '🔬': 'lab', '🟦': 'b1', '🟩': 'b2', '🟨': 'b3', '🟫': 'b4' };

let est = { aba: 'chaves', filtro: new Set(), busca: '' };
let R = { itens: [], movs: [], servidores: [] };

export async function render(el, { cabecalho }) {
  el.innerHTML = cabecalho('Chaves e recursos', 'Clique num item disponível (verde/colorido) para entregar; num item em uso (vermelho) para devolver ou permutar.') + `
    <div class="abas">${Object.entries(TIPOS).map(([k, t]) => `<button data-a="${k}">${t.rot}</button>`).join('')}<button data-a="serv">Cadastro de Pessoal</button></div>
    <div id="rc-corpo"><div class="vazio">Carregando…</div></div>`;
  $$('.abas button', el).forEach((b) => (b.onclick = () => { est.aba = b.dataset.a; est.filtro = new Set(); desenhar(); }));
  await carregar();
}
export function aoMudar() { carregar(); }

async function carregar() {
  try { R = await api('recursos', { p_hist_dias: 45 }); } catch (e) { const c = $('#rc-corpo'); if (c) c.innerHTML = `<div class="caixa erro-caixa">${esc(e.message)}</div>`; return; }
  desenhar();
}
const grupo = (it) => it.tipo === 'chaves' ? (it.bloco || BLOCO_ICO[it.icone] || 'outros') : it.tipo === 'equip' ? grupoEquip(it) : 'mat';
// Controles de ar-condicionado cadastrados antes como "Controle de TV" passam sozinhos para a categoria própria.
function grupoEquip(it) { const g = EQ[it.icone] ? it.icone : (LEGADO[it.icone] || 'outros'); return g === 'controle_tv' && ehAr(it) ? 'controle_ar' : g; }
const emUso = (id) => R.movs.find((m) => m.item_id === id && !m.devolvido_em);
const ordNum = (a, b) => { const na = parseInt(a.c1), nb = parseInt(b.c1); return !isNaN(na) && !isNaN(nb) ? na - nb : String(a.c1).localeCompare(String(b.c1), 'pt', { numeric: true }); };

function desenhar() {
  $$('.abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.a === est.aba));
  const box = $('#rc-corpo'); if (!box) return;
  if (est.aba === 'serv') return desenharServidores(box);
  const t = TIPOS[est.aba];
  const itens = R.itens.filter((i) => i.tipo === est.aba).sort(ordNum);
  const q = semAcento(est.busca);
  const gerir = pode('recursos_gerir');
  const grupos = est.aba === 'chaves' ? BLOCOS : est.aba === 'equip' ? EQ : { mat: 'Materiais' };
  const cont = {}; itens.forEach((i) => { const g = grupo(i); cont[g] = (cont[g] || 0) + 1; });
  const vis = itens.filter((i) => (!est.filtro.size || est.filtro.has(grupo(i))) && (!q || semAcento(`${i.c1} ${i.c2} ${emUso(i.id)?.servidor_nome || ''}`).includes(q)));
  const nUso = itens.filter((i) => emUso(i.id)).length;
  const card = (i) => {
    const m = t.devolve ? emUso(i.id) : null; const g = grupo(i);
    const icone = est.aba === 'chaves' ? '🔑' : est.aba === 'equip' ? (g === 'controle_tv' ? ICO_CONTROLE : (EQ_ICO[g] || '📦')) : '📦';
    const dica = m ? `${m.servidor_nome}\nMatrícula: ${m.matricula || '—'}\nRetirada: ${fmtDataHora(m.entregue_em)} (por ${m.entregue_por})` : i.c2;
    if (est.aba === 'mat') {
      const q = i.qtd; const baixo = q != null && q <= 0; const noCar = carrinho.has(i.id);
      return `<button class="rec-card mat ${baixo ? 'zerado' : ''} ${noCar ? 'no-carrinho' : ''}" data-it="${i.id}" data-dica="${esc(baixo ? 'Sem estoque' : 'Clique para pôr no carrinho de retirada')}">
      ${gerir || pode('admin') ? `<span class="acao-mini">${pode('admin') ? `<span data-ent="${i.id}" title="Entrada ou ajuste de estoque">＋</span>` : ''}${gerir ? `<span data-edit="${i.id}">✎</span><span data-del="${i.id}">✕</span>` : ''}</span>` : ''}
      <span class="foto">${i.foto ? `<img src="${esc(i.foto)}" alt="" loading="lazy">` : '📦'}</span><span class="n">${esc(i.c1) || '—'}</span><span class="d">${esc(i.c2)}</span>
      <span class="q">${q == null ? 'sem estoque informado' : fmtQtd(i, q)}</span>${noCar ? '<span class="car">no carrinho</span>' : ''}</button>`;
    }
    return `<button class="rec-card ${m ? 'uso' : ''} ${est.aba === 'chaves' ? 'b-' + g : ''}" data-it="${i.id}" data-dica="${esc(dica)}">
      ${gerir ? `<span class="acao-mini"><span data-edit="${i.id}">✎</span><span data-del="${i.id}">✕</span></span>` : ''}
      <span class="ic">${icone}</span><span class="n">${esc(i.c1) || '—'}</span><span class="d">${esc(i.c2)}</span>${m ? `<span class="w">${esc((m.servidor_nome || m.matricula).split(' ')[0])}</span>` : ''}</button>`;
  };
  const secoes = est.aba === 'mat' ? `<div class="rec-grid mat">${vis.map(card).join('')}</div>`
    : Object.keys(grupos).filter((g) => vis.some((i) => grupo(i) === g)).map((g) => `<div class="rec-secao"><h3>${esc(grupos[g])} <span class="selo">${vis.filter((i) => grupo(i) === g).length}</span></h3>
        <div class="rec-grid">${vis.filter((i) => grupo(i) === g).map(card).join('')}</div></div>`).join('');
  box.innerHTML = `<div class="rec-layout"><div class="cartao">
      <div class="linha-flex"><input type="search" id="rc-busca" placeholder="Buscar ${t.um}, ambiente ou servidor…" value="${esc(est.busca)}" style="max-width:280px">
        ${t.devolve ? `<span class="selo verde">${itens.length - nUso} disponíveis</span><span class="selo vermelho">${nUso} em uso</span>` : ''}<span class="espaco"></span>
        ${gerir ? `<button class="btn pequeno" id="rc-novo">${ico('mais')} Cadastrar ${t.um}</button>` : ''}</div>
      ${est.aba !== 'mat' ? `<div class="chips" style="margin-top:10px"><button class="chip ${!est.filtro.size ? 'ativo' : ''}" data-g="">Todos</button>${Object.keys(grupos).filter((g) => cont[g]).map((g) => `<button class="chip ${est.filtro.has(g) ? 'ativo' : ''}" data-g="${g}">${esc(grupos[g])} <small>${cont[g]}</small></button>`).join('')}</div>` : ''}
      ${secoes || '<div class="vazio">Nenhum item.</div>'}</div>
    <div class="rec-direita">${est.aba === 'mat' ? '<div class="cartao" id="rc-carrinho"></div>' : ''}
    <div class="cartao"><h2>${ico('historico')} Últimos movimentos</h2>
      <div class="linha-flex hist-filtro"><label>De <input type="date" id="rc-h-ini" value="${hist.ini}" max="${hojeISO()}"></label><label>até <input type="date" id="rc-h-fim" value="${hist.fim}" max="${hojeISO()}"></label>
        <button class="btn pequeno fantasma" id="rc-h-sem">Última semana</button><span class="mudo pequeno" id="rc-h-n"></span></div>
      <div id="rc-hist"></div>
      <div class="linha-flex" style="margin-top:8px"><button class="btn pequeno" id="rc-rel">${ico('imprimir')} Relatório por período</button></div></div></div></div>`;
  $('#rc-busca').oninput = (e) => { est.busca = e.target.value; const pos = e.target.selectionStart; desenhar(); const i = $('#rc-busca'); i.focus(); i.setSelectionRange(pos, pos); };
  $$('[data-g]', box).forEach((b) => (b.onclick = () => { const g = b.dataset.g; if (!g) est.filtro.clear(); else est.filtro.has(g) ? est.filtro.delete(g) : est.filtro.add(g); desenhar(); }));
  $$('[data-it]', box).forEach((b) => (b.onclick = (e) => {
    if (e.target.dataset.edit) return editarItem(R.itens.find((i) => i.id === e.target.dataset.edit));
    if (e.target.dataset.del) return excluirItem(R.itens.find((i) => i.id === e.target.dataset.del));
    if (e.target.dataset.ent) return entradaEstoque(R.itens.find((i) => i.id === e.target.dataset.ent));
    const it = R.itens.find((i) => i.id === b.dataset.it); const m = t.devolve && emUso(it.id);
    if (it.tipo === 'mat') return porNoCarrinho(it);
    if (m) devolver(it, m); else retirar(it);
  }));
  const nv = $('#rc-novo'); if (nv) nv.onclick = () => editarItem(null);
  $('#rc-rel').onclick = relatorio;
  desenharCarrinho();
  const hi = $('#rc-h-ini'), hf = $('#rc-h-fim');
  const mudou = () => { if (!hi.value || !hf.value) return; if (hi.value > hf.value) hf.value = hi.value; hist.ini = hi.value; hist.fim = hf.value; hist.chave = ''; historico(); };
  hi.onchange = mudou; hf.onchange = mudou;
  $('#rc-h-sem').onclick = () => { hi.value = addDias(hojeISO(), -6); hf.value = hojeISO(); mudou(); };
  historico();
}

// Últimos movimentos: intervalo de datas escolhido na tela (padrão: última semana), sem precisar imprimir o relatório.
const hist = { ini: addDias(hojeISO(), -6), fim: hojeISO(), chave: '', movs: [] };
async function historico() {
  const box = $('#rc-hist'); if (!box) return;
  const aba = est.aba; const chave = `${aba}|${hist.ini}|${hist.fim}|${R.movs.length}|${R.movs[0]?.id || ''}|${R.movs.filter((m) => !m.devolvido_em).length}`;
  if (hist.chave !== chave) {
    if (!hist.movs.length) box.innerHTML = '<div class="vazio">Carregando…</div>';
    try { hist.movs = await api('rec_historico', { p_tipo: aba, p_ini: hist.ini, p_fim: hist.fim }); hist.chave = chave; }
    catch (e) { box.innerHTML = `<div class="caixa erro-caixa">${esc(e.message)}</div>`; return; }
    if (est.aba !== aba || !$('#rc-hist')) return;
  }
  const l = hist.movs; const cont = $('#rc-h-n'); if (cont) cont.textContent = `${l.length} movimento${l.length === 1 ? '' : 's'}`;
  if (!l.length) { box.innerHTML = '<div class="vazio">Sem movimentos nesse período.</div>'; return; }
  const nome = (id) => { const i = R.itens.find((x) => x.id === id); return i ? `${i.c1}${i.c2 ? ' · ' + i.c2 : ''}` : '(item removido)'; };
  box.innerHTML = `<div class="tabela-wrap" style="max-height:60vh"><table class="tabela"><thead><tr><th>Item</th>${aba === 'mat' ? '<th>Qtd.</th>' : ''}<th>${aba === 'mat' ? 'Servidor / responsável' : 'Servidor'}</th><th>${aba === 'mat' ? 'Data' : 'Saída'}</th>${TIPOS[aba].devolve ? '<th>Devolução</th>' : ''}</tr></thead><tbody>
    ${l.map((m) => `<tr data-dica="${esc(`Entregue por ${m.entregue_por}${m.recebido_por ? '\nRecebido por ' + m.recebido_por : ''}${m.obs ? '\n' + m.obs : ''}`)}"><td>${esc(aba === 'mat' ? (R.itens.find((x) => x.id === m.item_id)?.c1 || '(item removido)') : nome(m.item_id))}</td>${aba === 'mat' ? `<td>${qtdMov(m)}</td>` : ''}<td>${esc(m.servidor_nome || m.matricula || m.entregue_por)}</td><td class="mono">${fmtDataHora(m.entregue_em)}</td>
      ${TIPOS[aba].devolve ? `<td class="mono">${m.devolvido_em ? fmtDataHora(m.devolvido_em) : '<span class="selo vermelho">em uso</span>'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

// ------------------------------------------------------------------ materiais: estoque e carrinho de retirada
// O estoque fica na unidade de consumo (folha, unidade…). Quando o material tem embalagem (resma de 500 folhas),
// a tela mostra "9 resmas + 300 folhas": a resma aberta continua no saldo até acabar.
const carrinho = new Map(); // id do item → { q: quantidade digitada, emb: true se a quantidade está em embalagens }
const plural = (n, s) => (!s ? '' : Math.abs(n) === 1 ? s : /[sx]$/i.test(s) ? s : /m$/i.test(s) ? s.slice(0, -1) + 'ns' : /[rz]$/i.test(s) ? s + 'es' : s + 's');
const temEmb = (i) => Number(i?.emb_qtd) > 1 && !!i.emb_nome;
function fmtQtd(i, q) {
  const u = i?.unidade || 'un'; q = Number(q) || 0;
  if (!temEmb(i)) return `${q} ${u === 'un' ? 'un.' : plural(q, u)}`;
  const e = Math.trunc(q / i.emb_qtd), r = q % i.emb_qtd;
  return [e ? `${e} ${plural(e, i.emb_nome)}` : '', r || !e ? `${r} ${plural(r, u)}` : ''].filter(Boolean).join(' + ');
}
const emBase = (i, c) => Math.max(0, Math.round(Number(c.q) || 0)) * (c.emb && temEmb(i) ? i.emb_qtd : 1);
function qtdMov(m) {
  const i = R.itens.find((x) => x.id === m.item_id); if (m.qtd == null) return '<span class="mudo">—</span>';
  const ent = m.natureza && m.natureza !== 'saida';
  return `<span class="selo ${ent ? (m.qtd >= 0 ? 'verde' : 'ambar') : ''}">${ent ? (m.qtd >= 0 ? '+' : '−') : ''}${esc(fmtQtd(i, Math.abs(m.qtd)))}${ent ? (m.natureza === 'entrada' ? ' entrada' : ' ajuste') : ''}</span>`;
}
function porNoCarrinho(it) {
  if (!pode('recursos')) return aviso('Seu perfil não pode registrar retiradas.', 'erro');
  if (it.qtd == null) return aviso('Este material ainda não tem estoque informado. Peça ao administrador para dar entrada.', 'erro');
  if (it.qtd <= 0) return aviso(`${it.c1} está sem estoque.`, 'erro');
  if (!carrinho.has(it.id)) carrinho.set(it.id, { q: 1, emb: false });
  else { const c = carrinho.get(it.id); if (emBase(it, { ...c, q: c.q + 1 }) <= it.qtd) c.q += 1; }
  desenhar();
}
function desenharCarrinho() {
  const box = $('#rc-carrinho'); if (!box) return;
  for (const id of [...carrinho.keys()]) if (!R.itens.some((i) => i.id === id && i.tipo === 'mat')) carrinho.delete(id);
  const linhas = [...carrinho.entries()].map(([id, c]) => ({ i: R.itens.find((x) => x.id === id), c }));
  if (!linhas.length) { box.innerHTML = `<h2>🛒 Carrinho de retirada</h2><div class="vazio pequeno">Clique nos materiais ao lado para montar a retirada.</div>`; return; }
  const erro = (i, c) => { const b = emBase(i, c); return b <= 0 ? 'informe a quantidade' : b > (i.qtd || 0) ? `só há ${fmtQtd(i, i.qtd || 0)}` : ''; };
  box.innerHTML = `<h2>🛒 Carrinho de retirada <span class="selo">${linhas.length} ${linhas.length > 1 ? 'itens' : 'item'}</span></h2>
    <div class="car-lista">${linhas.map(({ i, c }) => { const er = erro(i, c); return `<div class="car-linha ${er ? 'erro' : ''}" data-c="${i.id}">
      <span class="foto-prev pequena">${i.foto ? `<img src="${esc(i.foto)}" alt="">` : '📦'}</span>
      <div class="car-nome"><b>${esc(i.c1)}</b><small class="${er ? '' : 'mudo'}">${er ? esc(er) : 'disponível: ' + esc(fmtQtd(i, i.qtd || 0))}</small></div>
      <input type="number" min="1" step="1" value="${c.q}" data-q title="Quantidade">
      ${temEmb(i) ? `<select data-u><option value="0" ${c.emb ? '' : 'selected'}>${esc(plural(2, i.unidade || 'un'))}</option><option value="1" ${c.emb ? 'selected' : ''}>${esc(plural(2, i.emb_nome))}</option></select>` : `<span class="mudo pequeno car-un">${esc(i.unidade && i.unidade !== 'un' ? plural(2, i.unidade) : 'un.')}</span>`}
      <button class="btn icone fantasma" data-rm title="Tirar do carrinho">✕</button></div>`; }).join('')}</div>
    <div class="linha-flex" style="margin-top:10px"><button class="btn pequeno fantasma" id="car-limpar">Esvaziar</button><span class="espaco"></span>
      <button class="btn primario" id="car-ok" ${linhas.some(({ i, c }) => erro(i, c)) ? 'disabled' : ''}>${ico('check')} Registrar retirada</button></div>`;
  $$('[data-c]', box).forEach((row) => {
    const id = row.dataset.c, c = carrinho.get(id);
    $('[data-q]', row).onchange = (e) => { c.q = Math.max(1, Math.round(Number(e.target.value) || 1)); desenharCarrinho(); };
    const u = $('[data-u]', row); if (u) u.onchange = () => { c.emb = u.value === '1'; desenharCarrinho(); };
    $('[data-rm]', row).onclick = () => { carrinho.delete(id); desenhar(); };
  });
  $('#car-limpar').onclick = () => { carrinho.clear(); desenhar(); };
  $('#car-ok').onclick = finalizarCarrinho;
}
function finalizarCarrinho() {
  const linhas = [...carrinho.entries()].map(([id, c]) => { const i = R.itens.find((x) => x.id === id); return { i, qtd: emBase(i, c) }; });
  if (!linhas.length) return;
  modal({
    titulo: 'Registrar retirada de materiais',
    corpo: `<div class="tabela-wrap" style="max-height:220px"><table class="tabela"><thead><tr><th>Material</th><th>Quantidade</th><th>Fica no estoque</th></tr></thead><tbody>
        ${linhas.map(({ i, qtd }) => `<tr><td>${esc(i.c1)}</td><td><b>${esc(fmtQtd(i, qtd))}</b></td><td class="mudo">${esc(fmtQtd(i, (i.qtd || 0) - qtd))}</td></tr>`).join('')}</tbody></table></div>
      <label class="campo" style="margin-top:10px"><span>Matrícula SUAP de quem está retirando</span><input id="rt-mat" inputmode="numeric" placeholder="Ex.: 1264288" autofocus></label>
      <div id="rt-nome" class="pequeno" style="min-height:1.2em;color:var(--verde-escuro)"></div>
      <label class="campo oculto" id="rt-manual"><span>Servidor não encontrado: informe o nome completo</span><input id="rt-nome-in"></label>`,
    aoAbrir: (el) => {
      const mat = $('#rt-mat', el);
      mat.oninput = () => { const n = buscaServidor(mat.value); $('#rt-nome', el).textContent = n ? '✓ ' + n : ''; $('#rt-manual', el).classList.toggle('oculto', !!n || mat.value.trim().length < 4); };
      mat.onkeydown = (e) => { if (e.key === 'Enter') $('footer .primario', el)?.click(); };
    },
    botoes: [{ texto: 'Voltar', valor: null }, { texto: `${ico('check')} Confirmar retirada`, classe: 'primario', acao: async (fechar, el) => {
      const mat = $('#rt-mat', el).value.trim(); if (!mat) { aviso('Informe a matrícula.', 'erro'); return false; }
      const nome = buscaServidor(mat) || $('#rt-nome-in', el).value.trim();
      if (!nome) { $('#rt-manual', el).classList.remove('oculto'); aviso('Servidor não encontrado: informe o nome.', 'erro'); return false; }
      const r = await api('mat_retirar', { p_itens: linhas.map(({ i, qtd }) => ({ id: i.id, qtd })), p_matricula: mat, p_nome: nome });
      aviso(`Retirada registrada para ${nome}: ${r.itens} ${r.itens > 1 ? 'itens' : 'item'}.`, 'ok'); carrinho.clear(); hist.chave = ''; fechar(true); carregar(); return false;
    } }]
  });
}
// Entrada de mercadoria ou correção de contagem: só o administrador mexe no estoque.
function entradaEstoque(it) {
  const u = plural(2, it.unidade && it.unidade !== 'un' ? it.unidade : 'unidade');
  modal({
    titulo: `Estoque de ${it.c1}`,
    corpo: `<div class="caixa info">Estoque atual: <b>${esc(it.qtd == null ? 'não informado' : fmtQtd(it, it.qtd))}</b></div>
      <div class="grade" style="grid-template-columns:1.3fr 1fr 1fr"><label class="campo"><span>Operação</span><select name="op"><option value="entrada">Entrada (chegou material)</option><option value="menos">Baixa manual (perda, erro)</option><option value="fixar">Corrigir contagem (definir total)</option></select></label>
        <label class="campo"><span>Quantidade</span><input name="q" type="number" min="0" step="1" autofocus></label>
        <label class="campo"><span>Em</span><select name="u"><option value="0">${esc(u)}</option>${temEmb(it) ? `<option value="1" selected>${esc(plural(2, it.emb_nome))} de ${it.emb_qtd}</option>` : ''}</select></label></div>
      <label class="campo"><span>Observação (opcional)</span><input name="obs" maxlength="200" placeholder="ex.: pedido 9201457 do almoxarifado virtual"></label>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
      const v = $('[name=q]', el).value; if (v === '') { aviso('Informe a quantidade.', 'erro'); return false; }
      const base = Math.round(Number(v)) * ($('[name=u]', el).value === '1' ? it.emb_qtd : 1); const op = $('[name=op]', el).value;
      const delta = op === 'entrada' ? base : op === 'menos' ? -base : base - (it.qtd || 0);
      if (!delta) { fechar(true); return false; }
      if ((it.qtd || 0) + delta < 0) { aviso('A baixa é maior que o estoque.', 'erro'); return false; }
      await api('mat_estoque', { p_id: it.id, p_delta: delta, p_natureza: op === 'entrada' ? 'entrada' : 'ajuste', p_obs: $('[name=obs]', el).value.trim() });
      aviso('Estoque atualizado.', 'ok'); hist.chave = ''; fechar(true); carregar(); return false;
    } }]
  });
}

// ------------------------------------------------------------------ retirada (uma ou várias)
function buscaServidor(mat) {
  mat = String(mat || '').trim(); if (!mat) return null;
  const s = R.servidores.find((x) => String(x.matricula) === mat); if (s) return s.nome;
  const p = [...D.profs.values()].find((x) => String(x.matricula) === mat); return p ? (p.nome_completo || p.nome) : null;
}
function retirar(item) {
  const t = TIPOS[item.tipo];
  let escolhidos = [item];
  const m = modal({
    titulo: t.devolve ? `Entregar ${t.um}` : 'Entregar material',
    corpo: `${item.tipo !== 'mat' ? `<div><b class="pequeno">Selecionados</b><div class="escolhidos" id="rt-sel"></div>
        <div class="rel" style="margin-top:6px"><input type="search" id="rt-mais" placeholder="Adicionar mais ${t.um}s (número ou ambiente)…" autocomplete="off"><div class="lista-busca oculto" id="rt-lista"></div></div></div>` : `<div class="caixa info">${esc(item.c1)} · ${esc(item.c2)}</div>`}
      <label class="campo"><span>Matrícula SUAP do servidor</span><input id="rt-mat" inputmode="numeric" placeholder="Ex.: 1264288" autofocus></label>
      <div id="rt-nome" class="pequeno" style="min-height:1.2em;color:var(--verde-escuro)"></div>
      <label class="campo oculto" id="rt-manual"><span>Servidor não encontrado: informe o nome completo</span><input id="rt-nome-in"></label>`,
    aoAbrir: (el) => {
      const sel = $('#rt-sel', el);
      const desenharSel = () => { if (!sel) return; sel.innerHTML = escolhidos.map((i, k) => `<span>${esc(i.c1)}${i.c2 ? ' · ' + esc(i.c2.slice(0, 24)) : ''}${escolhidos.length > 1 ? ` <button data-rm="${k}">✕</button>` : ''}</span>`).join(''); $$('[data-rm]', sel).forEach((b) => (b.onclick = () => { escolhidos.splice(Number(b.dataset.rm), 1); desenharSel(); })); };
      desenharSel();
      const mais = $('#rt-mais', el), lista = $('#rt-lista', el);
      if (mais) {
        mais.oninput = () => {
          const q = semAcento(mais.value.trim());
          const disp = R.itens.filter((i) => i.tipo === item.tipo && !emUso(i.id) && !escolhidos.includes(i) && (!q || semAcento(i.c1 + ' ' + i.c2).includes(q))).sort(ordNum).slice(0, 12);
          lista.innerHTML = disp.map((i) => `<button class="item-busca" data-add="${i.id}"><span><b>${esc(i.c1)}</b> ${esc(i.c2)}</span><span>+</span></button>`).join('') || '<div class="vazio pequeno" style="padding:8px">Nada disponível.</div>';
          lista.classList.remove('oculto');
          $$('[data-add]', lista).forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); escolhidos.push(R.itens.find((i) => i.id === b.dataset.add)); mais.value = ''; lista.classList.add('oculto'); desenharSel(); }));
        };
        mais.onfocus = mais.oninput; mais.onblur = () => setTimeout(() => lista.classList.add('oculto'), 150);
      }
      const mat = $('#rt-mat', el);
      mat.oninput = () => { const n = buscaServidor(mat.value); $('#rt-nome', el).textContent = n ? '✓ ' + n : ''; $('#rt-manual', el).classList.toggle('oculto', !!n || mat.value.trim().length < 4); };
      mat.onkeydown = (e) => { if (e.key === 'Enter') $('footer .primario', el)?.click(); };
    },
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: `${ico('check')} Entregar`, classe: 'primario', acao: async (fechar, el) => {
      const mat = $('#rt-mat', el).value.trim(); if (!mat) { aviso('Informe a matrícula.', 'erro'); return false; }
      const nome = buscaServidor(mat) || $('#rt-nome-in', el).value.trim();
      if (!nome) { $('#rt-manual', el).classList.remove('oculto'); aviso('Servidor não encontrado: informe o nome.', 'erro'); return false; }
      if (!escolhidos.length) return false;
      const n = await api('rec_retirar', { p_tipo: item.tipo, p_itens: escolhidos.map((i) => i.id), p_matricula: mat, p_nome: nome });
      aviso(`${n} ${n > 1 ? t.um + 's entregues' : t.um + ' entregue'} a ${nome}.`, 'ok'); fechar(true); carregar(); return false;
    } }]
  });
  void m;
}

function devolver(item, mov) {
  const chave = item.tipo === 'chaves';
  let acao = 'devolver', para = null;
  modal({
    titulo: `${item.c1} · em uso`,
    corpo: `<dl class="dl"><dt>Item</dt><dd>${esc(item.c1)} · ${esc(item.c2)}</dd><dt>Com</dt><dd><b>${esc(mov.servidor_nome)}</b> (${esc(mov.matricula || '—')})</dd>
        <dt>Retirado</dt><dd>${fmtDataHora(mov.entregue_em)} por ${esc(mov.entregue_por)}</dd></dl>
      ${chave ? `<div class="seletor-turno"><button data-ac="devolver" class="ativo">Devolver</button><button data-ac="permutar">Permutar (passou para outro servidor)</button></div>
        <div class="rel oculto" id="dv-perm"><input type="search" id="dv-busca" placeholder="Nome ou matrícula de quem ficou com a chave…" autocomplete="off"><div class="lista-busca oculto" id="dv-lista"></div><div id="dv-sel" class="pequeno" style="margin-top:6px;color:var(--verde-escuro)"></div></div>` : ''}
      <label class="campo" id="dv-obs-box"><span>Observação (opcional)</span><input id="dv-obs" placeholder="Ex.: cabo com mau contato"></label>`,
    aoAbrir: (el) => {
      $$('[data-ac]', el).forEach((b) => (b.onclick = () => { acao = b.dataset.ac; $$('[data-ac]', el).forEach((x) => x.classList.toggle('ativo', x === b)); $('#dv-perm', el).classList.toggle('oculto', acao !== 'permutar'); $('#dv-obs-box', el).classList.toggle('oculto', acao === 'permutar'); }));
      const busca = $('#dv-busca', el); if (!busca) return;
      busca.oninput = () => {
        const q = semAcento(busca.value.trim()); const lista = $('#dv-lista', el);
        if (q.length < 2) { lista.classList.add('oculto'); return; }
        const todos = [...R.servidores.map((s) => ({ nome: s.nome, matricula: s.matricula })), ...[...D.profs.values()].map((p) => ({ nome: p.nome_completo || p.nome, matricula: p.matricula }))];
        const vistos = new Set(); const res = todos.filter((s) => { const k = semAcento(s.nome); if (vistos.has(k)) return false; vistos.add(k); return semAcento(s.nome + ' ' + s.matricula).includes(q); }).slice(0, 8);
        lista.innerHTML = res.map((s, i) => `<button class="item-busca" data-i="${i}"><span>${esc(s.nome)}</span><small class="mudo">${esc(s.matricula || '')}</small></button>`).join('') || '<div class="vazio pequeno" style="padding:8px">Ninguém encontrado.</div>';
        lista.classList.remove('oculto');
        $$('[data-i]', lista).forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); para = res[Number(b.dataset.i)]; busca.value = para.nome; lista.classList.add('oculto'); $('#dv-sel', el).textContent = '✓ A chave passa para ' + para.nome; }));
      };
    },
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: `${ico('check')} Confirmar`, classe: 'primario', acao: async (fechar, el) => {
      if (acao === 'permutar') {
        if (!para) { aviso('Escolha para quem a chave foi passada.', 'erro'); return false; }
        await api('rec_permutar', { p_mov: mov.id, p_matricula: para.matricula || '', p_nome: para.nome });
        aviso(`Chave permutada para ${para.nome}.`, 'ok');
      } else {
        await api('rec_devolver', { p_mov: mov.id, p_obs: $('#dv-obs', el).value.trim() });
        aviso('Devolução registrada.', 'ok');
      }
      fechar(true); carregar(); return false;
    } }]
  });
}

function editarItem(it) {
  const tipo = it?.tipo || est.aba; const t = TIPOS[tipo];
  const grp = it ? grupo(it) : (tipo === 'chaves' ? 'b1' : 'notebook');
  let fotoAtual = it?.foto || '';
  modal({
    titulo: it ? `Editar ${t.um}` : `Cadastrar ${t.um}`,
    corpo: `<div class="grade" style="grid-template-columns:1fr 2fr"><label class="campo"><span>${t.c1}</span><input name="c1" value="${esc(it?.c1 || '')}"></label><label class="campo"><span>${t.c2}</span><input name="c2" value="${esc(it?.c2 || '')}"></label></div>
      ${tipo === 'chaves' ? `<label class="campo"><span>Bloco</span><select name="g">${Object.entries(BLOCOS).map(([k, v]) => `<option value="${k}" ${k === grp ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      ${tipo === 'equip' ? `<label class="campo"><span>Tipo</span><select name="g">${Object.entries(EQ).map(([k, v]) => `<option value="${k}" ${k === grp ? 'selected' : ''}>${EQ_ICO[k]} ${v}</option>`).join('')}</select></label>` : ''}
      ${tipo === 'mat' ? `<div class="grade" style="grid-template-columns:1fr 2fr;align-items:start">
        <div><label class="campo"><span>Unidade de consumo</span><input name="unidade" value="${esc(it?.unidade && it.unidade !== 'un' ? it.unidade : '')}" placeholder="un (padrão), folha, caixa…"></label>
          <label class="campo"><span>Embalagem (opcional)</span><input name="emb_nome" value="${esc(it?.emb_nome || '')}" placeholder="ex.: resma"></label>
          <label class="campo"><span>Unidades por embalagem</span><input name="emb_qtd" type="number" min="2" step="1" value="${esc(it?.emb_qtd ?? '')}" placeholder="ex.: 500"></label>
          ${it ? `<small class="mudo">Estoque: ${esc(it.qtd == null ? 'não informado' : fmtQtd(it, it.qtd))}. ${pode('admin') ? 'Use o ＋ no cartão para entrada ou ajuste.' : 'Só o administrador altera.'}</small>`
            : (pode('admin') ? `<label class="campo"><span>Estoque inicial (na unidade de consumo)</span><input name="qtd" type="number" min="0" step="1" placeholder="ex.: 10"></label>` : '')}</div>
        <div class="campo"><span>Foto</span><div class="linha-flex" style="gap:10px;align-items:center">
          <span class="foto-prev" id="ri-prev">${it?.foto ? `<img src="${esc(it.foto)}" alt="">` : '📦'}</span>
          <label class="btn">Escolher foto<input type="file" id="ri-foto" accept="image/*" style="display:none"></label>
          <button type="button" class="btn fantasma" id="ri-sem-foto">Remover</button></div></div></div>` : ''}`,
    aoAbrir: (el) => {
      if (tipo !== 'mat') return;
      const prev = $('#ri-prev', el);
      $('#ri-foto', el).onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { fotoAtual = await reduzirFoto(f); prev.innerHTML = `<img src="${fotoAtual}" alt="">`; } catch { aviso('Não consegui ler essa imagem.', 'erro'); }
      };
      $('#ri-sem-foto', el).onclick = () => { fotoAtual = ''; prev.textContent = '📦'; };
    },
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
      const g = $('[name=g]', el)?.value;
      await api('rec_item_salvar', { p_dados: { id: it?.id || null, tipo, c1: $('[name=c1]', el).value, c2: $('[name=c2]', el).value, icone: tipo === 'equip' ? g : tipo === 'chaves' ? 'chave' : '📦', bloco: tipo === 'chaves' ? (g === 'outros' ? '' : g) : '',
        ...(tipo === 'mat' ? { foto: fotoAtual || '', unidade: ($('[name=unidade]', el).value.trim().toLowerCase() || 'un'), emb_nome: $('[name=emb_nome]', el).value.trim().toLowerCase(),
          emb_qtd: Number($('[name=emb_qtd]', el).value) > 1 ? Math.round(Number($('[name=emb_qtd]', el).value)) : null,
          ...($('[name=qtd]', el) && $('[name=qtd]', el).value !== '' ? { qtd: Math.round(Number($('[name=qtd]', el).value)) } : {}) } : {}) } });
      aviso('Salvo.', 'ok'); fechar(true); carregar(); return false;
    } }]
  });
}
/** Reduz a foto para caber no banco (lado maior de 320 px, JPEG). */
function reduzirFoto(file) {
  return new Promise((ok, erro) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 320 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('imagem')); };
    img.src = url;
  });
}
async function excluirItem(it) {
  if (!await confirmar(`Excluir ${TIPOS[it.tipo].um} "${it.c1} ${it.c2}"?\n\nO histórico de movimentos não é apagado.`, { ok: 'Excluir', perigo: true })) return;
  try { await api('rec_item_excluir', { p_id: it.id }); aviso('Excluído.', 'ok'); carregar(); } catch (e) { aviso(e.message, 'erro'); }
}

async function relatorio() {
  const [ini, fim] = periodo('mes');
  const r = await modal({
    titulo: 'Relatório de movimentos', corpo: `<div class="grade"><label class="campo"><span>De</span><input type="date" name="ini" value="${ini}"></label><label class="campo"><span>Até</span><input type="date" name="fim" value="${fim}"></label></div>
      <label class="campo"><span>Servidor (opcional)</span><input name="q" placeholder="parte do nome ou matrícula"></label>`,
    botoes: [
      { texto: 'Planilha', acao: (fechar, el) => { fechar({ modo: 'csv', ini: $('[name=ini]', el).value, fim: $('[name=fim]', el).value, q: $('[name=q]', el).value }); return false; } },
      { texto: `${ico('imprimir')} Imprimir`, classe: 'primario', acao: (fechar, el) => { fechar({ modo: 'pdf', ini: $('[name=ini]', el).value, fim: $('[name=fim]', el).value, q: $('[name=q]', el).value }); return false; } }]
  }).promessa;
  if (r) gerarRel(r);
}
async function gerarRel({ modo, ini, fim, q }) {
  let movs = await api('rec_historico', { p_tipo: est.aba, p_ini: ini, p_fim: fim });
  if (q) { const k = semAcento(q); movs = movs.filter((m) => semAcento(m.servidor_nome + ' ' + m.matricula).includes(k)); }
  const t = TIPOS[est.aba];
  const nome = (id) => R.itens.find((x) => x.id === id) || { c1: '?', c2: '(removido)' };
  if (modo === 'csv') return baixarCsv(`supert_${est.aba}_${ini}_${fim}`, [t.c1, t.c2, 'Quantidade', 'Movimento', 'Matrícula', 'Servidor', 'Saída', 'Entregue por', 'Devolução', 'Recebido por', 'Obs.'], movs.map((m) => [nome(m.item_id).c1, nome(m.item_id).c2, m.qtd == null ? '' : fmtQtd(nome(m.item_id), Math.abs(m.qtd)), m.qtd == null ? '' : (m.natureza || 'saida'), m.matricula, m.servidor_nome, fmtDataHora(m.entregue_em), m.entregue_por, fmtDataHora(m.devolvido_em), m.recebido_por, m.obs]));
  imprimirDoc(`<!doctype html><html><head><meta charset="utf-8"><title>${t.rot}</title><style>body{font-family:Arial;font-size:9pt;margin:0}h2{color:#1b5e20;font-size:12pt}table{width:100%;border-collapse:collapse;font-size:8pt}th{background:#1b5e20;color:#fff;text-align:left;padding:4px}td{padding:3px 4px;border-bottom:1px solid #ddd}@page{size:A4 landscape;margin:10mm}</style></head><body>
    <h2>${t.rot} · ${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}${q ? ' · ' + esc(q) : ''}</h2><table><thead><tr><th>${t.c1}</th><th>${t.c2}</th>${est.aba === 'mat' ? '<th>Quantidade</th>' : ''}<th>Matrícula</th><th>Servidor</th><th>Saída</th><th>Entregue por</th>${t.devolve ? '<th>Devolução</th><th>Recebido por</th>' : ''}<th>Obs.</th></tr></thead><tbody>
    ${movs.map((m) => `<tr><td><b>${esc(nome(m.item_id).c1)}</b></td><td>${esc(nome(m.item_id).c2)}</td>${est.aba === 'mat' ? `<td>${m.qtd == null ? '—' : esc((m.natureza && m.natureza !== 'saida' ? (m.qtd >= 0 ? '+' : '−') : '') + fmtQtd(nome(m.item_id), Math.abs(m.qtd)) + (m.natureza && m.natureza !== 'saida' ? ' (' + m.natureza + ')' : ''))}</td>` : ''}<td>${esc(m.matricula)}</td><td>${esc(m.servidor_nome)}</td><td>${fmtDataHora(m.entregue_em)}</td><td>${esc(m.entregue_por)}</td>${t.devolve ? `<td>${fmtDataHora(m.devolvido_em) || '—'}</td><td>${esc(m.recebido_por)}</td>` : ''}<td>${esc(m.obs)}</td></tr>`).join('') || '<tr><td colspan="9">Nenhum movimento.</td></tr>'}</tbody></table></body></html>`);
}

function desenharServidores(box) {
  const gerir = pode('recursos_gerir'); const q = semAcento(est.busca);
  const l = R.servidores.filter((s) => !q || semAcento(s.nome + ' ' + s.matricula + ' ' + s.setor).includes(q));
  box.innerHTML = `<div class="cartao"><div class="linha-flex"><input type="search" id="sv-busca" placeholder="Buscar servidor…" value="${esc(est.busca)}" style="max-width:300px"><span class="mudo pequeno">${R.servidores.length} servidores</span><span class="espaco"></span>
      ${gerir ? `<button class="btn pequeno" id="sv-novo">${ico('mais')} Cadastrar servidor</button>` : ''}</div>
    <div class="tabela-wrap" style="margin-top:10px;max-height:65vh"><table class="tabela"><thead><tr><th>Nome</th><th>Matrícula</th><th>Setor</th><th></th></tr></thead><tbody>
    ${l.slice(0, 400).map((s) => `<tr><td>${esc(s.nome)}</td><td class="mono">${esc(s.matricula)}</td><td>${esc(s.setor)}</td><td class="acoes">${gerir ? `<button class="btn icone fantasma" data-e="${s.id}">${ico('editar')}</button><button class="btn icone fantasma" data-x="${s.id}">${ico('lixo')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#sv-busca').oninput = (e) => { est.busca = e.target.value; const p = e.target.selectionStart; desenharServidores(box); const i = $('#sv-busca'); i.focus(); i.setSelectionRange(p, p); };
  const form = (s) => modal({
    titulo: s ? 'Editar servidor' : 'Cadastrar servidor',
    corpo: `<label class="campo"><span>Nome completo</span><input name="nome" value="${esc(s?.nome || '')}"></label><div class="grade"><label class="campo"><span>Matrícula SUAP</span><input name="mat" value="${esc(s?.matricula || '')}"></label><label class="campo"><span>Setor</span><input name="setor" value="${esc(s?.setor || '')}"></label></div>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => { await api('servidor_salvar', { p_dados: { id: s?.id || null, nome: $('[name=nome]', el).value, matricula: $('[name=mat]', el).value, setor: $('[name=setor]', el).value } }); fechar(true); carregar(); return false; } }]
  });
  const nv = $('#sv-novo'); if (nv) nv.onclick = () => form(null);
  $$('[data-e]', box).forEach((b) => (b.onclick = () => form(R.servidores.find((s) => String(s.id) === b.dataset.e))));
  $$('[data-x]', box).forEach((b) => (b.onclick = async () => { if (await confirmar('Remover este servidor da lista?', { ok: 'Remover', perigo: true })) { await api('servidor_excluir', { p_id: Number(b.dataset.x) }); carregar(); } }));
}
