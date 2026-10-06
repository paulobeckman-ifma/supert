// Lançar aulas do turno: todas as aulas previstas no horário já vêm como "presente".
// O colaborador só marca o que NÃO aconteceu normalmente (falta, atraso, saída ou "não houve aula", esta com justificativa)
// e lança tudo com um clique.
import { $, $$, esc, ico, aviso, confirmar, modal, hojeISO, horaAgora, turnoDaHora, dataExtenso, fmtData, semAcento, STATUS, addDias, opcoesJustificativa } from './util.js';
import { api, pode } from './api.js';
import { D, aulasPrevistas, prof, turnosOrdenados } from './dados.js';
import { editarRegistro } from './regmodal.js';

const ST = { p: 'presente', f: 'ausente', a: 'atraso', s: 'saida', n: 'nao' };
let est = null;

export async function render(el, { cabecalho, params }) {
  const hoje = hojeISO();
  est = est && est.data ? est : { data: hoje, turno: turnoDaHora(horaAgora(), D.turnos), marcas: {}, busca: '' };
  if (params.get('data')) est.data = params.get('data');
  el.innerHTML = cabecalho('Lançar aulas do turno', 'Todas as aulas do horário já entram como <b>presente</b>. Marque só o que fugiu do normal e lance tudo de uma vez.',
      `<a class="btn" href="#/registrar">${ico('mais')} Aula fora do horário</a>`) + `
    <div class="cartao">
      <div class="turno-topo">
        <label class="campo"><span>Data</span><div class="linha-flex" style="gap:4px">
          <button class="btn icone" data-dia="-1" title="Dia anterior">‹</button>
          <input type="date" id="t-data" value="${est.data}" max="${hoje}" style="width:auto">
          <button class="btn icone" data-dia="1" title="Próximo dia">›</button></div></label>
        <div class="campo"><span>Turno</span><div class="seletor-turno" id="t-turnos"></div></div>
        <label class="campo" style="flex:1;min-width:220px"><span>Filtrar por professor, turma ou disciplina</span>
          <input type="search" id="t-busca" placeholder="Digite para filtrar…" value="${esc(est.busca)}"></label>
        <div class="campo rel" style="min-width:250px"><span>Falta rápida (professor que não veio)</span>
          <input type="search" id="t-falta" placeholder="Nome do professor…" autocomplete="off"><div class="lista-busca oculto" id="t-falta-lista"></div></div>
      </div>
      <div class="pequeno mudo" id="t-dia" style="margin-top:8px"></div>
    </div>
    <div id="t-lista"></div>
    <div class="resumo-turno" id="t-resumo"></div>`;

  $('#t-data').onchange = (e) => { est.data = e.target.value || hoje; est.marcas = {}; carregar(); };
  $$('[data-dia]', el).forEach((b) => (b.onclick = () => { const n = addDias(est.data, Number(b.dataset.dia)); if (n > hoje) return; est.data = n; $('#t-data').value = n; est.marcas = {}; carregar(); }));
  $('#t-busca').oninput = (e) => { est.busca = e.target.value; desenhar(); };
  configurarFaltaRapida();
  await carregar();
}

export function aoMudar() { carregar(false); }

let previstas = [], lancados = [];
async function carregar(mostrarCarregando = true) {
  const lista = $('#t-lista'); if (!lista) return;
  if (mostrarCarregando) lista.innerHTML = '<div class="vazio">Carregando…</div>';
  $('#t-dia').textContent = `${dataExtenso(est.data)}`;
  try { lancados = await api('registros_listar', { p_f: { ini: est.data, fim: est.data } }); }
  catch (e) { lista.innerHTML = `<div class="caixa erro-caixa">${esc(e.message)}</div>`; return; }
  desenharTurnos(); desenhar();
}

function desenharTurnos() {
  const box = $('#t-turnos'); if (!box) return;
  box.innerHTML = turnosOrdenados().map(([k, t]) => {
    const n = aulasPrevistas(est.data, k).length;
    return `<button data-t="${k}" class="${k === est.turno ? 'ativo' : ''}">${esc(t.nome)} <small class="mudo" style="color:inherit;opacity:.7">${n}</small></button>`;
  }).join('');
  $$('button', box).forEach((b) => (b.onclick = () => { est.turno = b.dataset.t; est.marcas = {}; desenharTurnos(); desenhar(); }));
}

const chaveAula = (a) => a.disciplina_id + '|' + a.professor_id;
function jaLancado(a) {
  return lancados.find((r) => r.tipo === 'regular' && r.disciplina_id === a.disciplina_id && r.professor_id === a.professor_id);
}

function desenhar() {
  const lista = $('#t-lista'); if (!lista) return;
  previstas = aulasPrevistas(est.data, est.turno);
  const q = semAcento(est.busca.trim());
  const visiveis = previstas.filter((a) => !q || semAcento(`${a.prof} ${a.turma} ${a.disc} ${prof(a.professor_id)?.nome_completo || ''}`).includes(q));
  if (!previstas.length) {
    const dia = new Date(est.data + 'T12:00:00Z').getUTCDay();
    lista.innerHTML = `<div class="cartao vazio" style="margin-top:14px">${dia === 0 ? 'Domingo: não há aulas no horário.' : 'Nenhuma aula prevista no horário para este turno.'}<br><br>
      <a class="btn" href="#/registrar">${ico('mais')} Registrar aula fora do horário</a></div>`;
    resumo(); return;
  }
  const porHora = new Map();
  for (const a of visiveis) { if (!porHora.has(a.inicio)) porHora.set(a.inicio, []); porHora.get(a.inicio).push(a); }
  lista.innerHTML = [...porHora.entries()].map(([h, l]) => `
    <div class="bloco-hora"><h3>${ico('relogio')} ${h} <span class="selo">${l.length} aula${l.length > 1 ? 's' : ''}</span>${botoesHora(h)}</h3>
      <div class="linhas-aula">${l.map(linha).join('')}</div></div>`).join('') || '<div class="vazio">Nenhuma aula com esse filtro.</div>';

  $$('[data-hora-ok]', lista).forEach((b) => (b.onclick = () => lancarTurno(b.dataset.horaOk)));
  $$('[data-hora-nao]', lista).forEach((b) => (b.onclick = () => semAulaNoTurno(b.dataset.horaNao)));
  $$('.aula', lista).forEach((row) => {
    const k = row.dataset.k;
    $$('[data-s]', row).forEach((b) => (b.onclick = () => {
      const m = est.marcas[k] || (est.marcas[k] = {});
      m.s = b.dataset.s;
      if (m.s === 'n' && !m.jus && /^SUBS\b/i.test(row.dataset.prof || '')) m.jus = 'Sem professor';
      if ((m.s === 'a' || m.s === 's') && !m.min) m.min = 10;
      desenhar();
      if (m.s !== 'p') setTimeout(() => $(`.aula[data-k="${k}"] ${m.s === 'n' && !m.jus ? 'select[data-jus]' : 'input[data-obs]'}`)?.focus(), 20);
    }));
    const min = $('input[data-min]', row); if (min) min.oninput = () => { est.marcas[k].min = Number(min.value || 0); };
    const obs = $('input[data-obs]', row); if (obs) obs.oninput = () => { est.marcas[k].obs = obs.value; };
    const jus = $('select[data-jus]', row); if (jus) jus.onchange = () => { est.marcas[k].jus = jus.value; jus.classList.toggle('falta-jus', !jus.value); };
    const au = $('input[data-aulas]', row); if (au) au.oninput = () => { (est.marcas[k] || (est.marcas[k] = { s: 'p' })).aulas = Number(au.value || 0); resumo(); };
    const ed = $('[data-editar]', row); if (ed) ed.onclick = () => { const r = lancados.find((x) => x.id === ed.dataset.editar); if (r) editarRegistro(r, () => carregar(false)); };
  });
  resumo();
}

function linha(a) {
  const k = chaveAula(a);
  const reg = jaLancado(a);
  const p = prof(a.professor_id);
  const cabeca = `<div class="turma">${esc(a.turma)}</div>
    <div class="quem"><b>${esc(a.prof)}</b><small>${esc(p?.nome_completo || '')}</small></div>
    <div class="disc"><span>${esc(a.disc)}</span><small>${esc(a.horario)} · ${a.aulas} aula${a.aulas > 1 ? 's' : ''}</small></div>`;
  if (reg) {
    return `<div class="aula lancado" data-k="${k}">${cabeca}
      <div class="status-bot"><span class="selo ${reg.status}">${STATUS[reg.status]}${reg.minutos ? ' ' + reg.minutos + ' min' : ''}${reg.status === 'nao' && reg.justificativa ? ' · ' + esc(reg.justificativa) : ''}</span>
        <span class="selo">lançado por ${esc(reg.por)}</span>
        ${pode('turno') ? `<button data-editar="${reg.id}" title="Corrigir">${ico('editar', 'ico-s')}</button>` : ''}</div></div>`;
  }
  const m = est.marcas[k] || { s: 'p' };
  const cls = { p: '', f: 'ausente', a: 'atraso', s: 'saida', n: 'nao-houve' }[m.s];
  const bot = (s, t) => `<button data-s="${s}" class="${s} ${m.s === s ? 'on' : ''}">${t}</button>`;
  const extra = m.s !== 'p' ? `<div class="aula-extra">
      ${m.s === 'a' || m.s === 's' ? `<label class="linha-flex" style="gap:4px">${m.s === 'a' ? 'Atraso de' : 'Saiu'} <input type="number" data-min min="5" max="300" step="5" value="${m.min || 10}" style="width:70px"> min${m.s === 's' ? ' antes' : ''}</label>` : ''}
      ${m.s !== 'n' ? `<label class="linha-flex" style="gap:4px">Aulas <input type="number" data-aulas min="0" max="10" value="${m.aulas ?? a.aulas}" style="width:60px"></label>` : ''}
      ${m.s === 'n' ? `<select data-jus class="${m.jus ? '' : 'falta-jus'}" title="Justificativa de não ter havido aula">${opcoesJustificativa(m.jus || '')}</select>` : ''}
<input type="text" data-obs maxlength="300" placeholder="${m.s === 'n' ? 'Detalhe (opcional)' : 'Observação (opcional)'}" value="${esc(m.obs || '')}">
    </div>` : '';
  return `<div class="aula ${cls}" data-k="${k}" data-prof="${esc(a.prof)}">${cabeca}
    <div class="status-bot">${bot('p', 'Presente')}${bot('f', 'Falta')}${bot('a', 'Atraso')}${bot('s', 'Saída')}${bot('n', 'Não houve')}</div>${extra}</div>`;
}

// Sem horário: todas as pendentes do turno. Com horário (ex.: '07:10'): só as que começam nele.
function pendentes(hora) {
  return previstas.filter((a) => !jaLancado(a) && (!hora || a.inicio === hora)).map((a) => ({ a, m: est.marcas[chaveAula(a)] || { s: 'p' } }));
}
const soHora = (h) => (typeof h === 'string' && /^\d{2}:\d{2}$/.test(h) ? h : null);
// Botões ao lado de cada horário, para lançar aos poucos ao longo do turno (o botão do rodapé continua lançando tudo).
function botoesHora(h) {
  const tot = previstas.filter((a) => a.inicio === h).length; const n = pendentes(h).length;
  if (!n) return `<span class="selo verde">${ico('check', 'ico-s')} horário lançado</span>`;
  if (!pode('turno')) return '';
  return `<span class="acoes-hora">
    <button class="btn pequeno" data-hora-nao="${h}" title="Lança as aulas pendentes das ${h} como 'não houve', com a mesma justificativa">Não houve aula às ${h}</button>
    <button class="btn pequeno primario" data-hora-ok="${h}" title="Lança só as aulas que começam às ${h}, com as marcações feitas abaixo">${ico('check', 'ico-s')} Lançar ${n === tot ? '' : n + ' de '}${tot} aula${tot > 1 ? 's' : ''} das ${h}</button></span>`;
}
function limparMarcas(hora) {
  if (!hora) { est.marcas = {}; return; }
  for (const a of previstas) if (a.inicio === hora) delete est.marcas[chaveAula(a)];
}

function resumo() {
  const box = $('#t-resumo'); if (!box) return;
  const pend = pendentes();
  const cont = { p: 0, f: 0, a: 0, s: 0, n: 0 };
  pend.forEach(({ m }) => cont[m.s]++);
  const lancar = pend;
  const jaFeitos = previstas.length - pend.length;
  if (!previstas.length) { box.classList.add('oculto'); return; }
  box.classList.remove('oculto');
  box.innerHTML = `
    <div class="item"><span class="n">${previstas.length}</span>previstas</div>
    <div class="item"><span class="n">${jaFeitos}</span>já lançadas</div>
    <div class="item"><span class="n">${cont.p}</span>presentes</div>
    <div class="item falta"><span class="n">${cont.f}</span>faltas</div>
    <div class="item atraso"><span class="n">${cont.a + cont.s}</span>atraso/saída</div>
    <div class="item"><span class="n">${cont.n}</span>não houve</div>
    <span class="espaco"></span>
    ${pend.length ? `<button class="btn fantasma" style="color:#cfe0db" id="t-limpar">Desfazer marcações</button>` : ''}
    ${pend.length && pode('turno') ? `<button class="btn grande" id="t-sem-aula" title="Lança todas as aulas pendentes deste turno como 'não houve', com a mesma justificativa">Não houve aula no turno</button>` : ''}
    <button class="btn primario grande" id="t-lancar" ${lancar.length ? '' : 'disabled'}>${ico('check')} ${lancar.length ? `Lançar ${lancar.length} aula${lancar.length > 1 ? 's' : ''} do turno` : 'Turno todo lançado'}</button>`;
  const lim = $('#t-limpar'); if (lim) lim.onclick = () => { est.marcas = {}; desenhar(); };
  const b = $('#t-lancar'); if (b) b.onclick = lancarTurno;
  const sa = $('#t-sem-aula'); if (sa) sa.onclick = semAulaNoTurno;
}

// Turno inteiro sem aula (feriado, evento, paralisação…): todas as pendentes viram "não houve" com a mesma justificativa.
async function semAulaNoTurno(h) {
  if (!pode('turno')) return aviso('Seu perfil não pode lançar o turno.', 'erro');
  const hora = soHora(h); const pend = pendentes(hora); if (!pend.length) return;
  const nomeTurno = (D.turnos[est.turno]?.nome || '').toLowerCase();
  const r = await modal({
    titulo: hora ? `Não houve aula às ${hora} de ${fmtData(est.data)}` : `Não houve aula no ${nomeTurno} de ${fmtData(est.data)}`,
    corpo: `<p style="margin:0 0 10px">As <b>${pend.length}</b> aulas ainda não lançadas ${hora ? 'das ' + hora : 'deste turno'} serão registradas como <b>não houve</b>, com 0 aulas e sem gerar notificação de falta.</p>
      <label class="campo"><span>Justificativa (vale para todas)</span><select name="jus">${opcoesJustificativa('')}</select></label>
      <label class="campo"><span>Detalhe (opcional)</span><input type="text" name="obs" maxlength="300" placeholder="ex.: ponto facultativo, jogos internos, falta de energia"></label>`,
    botoes: [{ texto: 'Voltar', valor: null }, { texto: `${ico('check')} Lançar ${pend.length} como não houve`, classe: 'primario', acao: (fechar, el) => {
      const jus = $('[name=jus]', el).value; if (!jus) { aviso('Escolha a justificativa.', 'erro'); return false; }
      fechar({ jus, obs: $('[name=obs]', el).value.trim() }); return false;
    } }]
  }).promessa;
  if (!r) return;
  const regs = pend.map(({ a }) => ({
    data: est.data, status: 'nao', aulas: 0, justificativa: r.jus, minutos: null, horario: a.inicio, obs: r.obs,
    disciplina_id: a.disciplina_id, professor_id: a.professor_id, prof: a.prof, disc: a.disc, turma: a.turma, diario_id: a.diario_id, ch_total: a.ch_total
  }));
  const b = hora ? $(`[data-hora-nao="${hora}"]`) : $('#t-sem-aula'); if (b) { b.disabled = true; b.textContent = 'Lançando…'; }
  try {
    const res = await api('registros_lancar', { p_regs: regs }, { timeout: 60000 });
    aviso(`${res.lancados} aula(s) registrada(s) como não houve.${res.pulados ? ` ${res.pulados} já estavam registradas e foram mantidas.` : ''}`, 'ok');
    limparMarcas(hora);
    await carregar(false);
  } catch (e) { aviso(e.message, 'erro'); resumo(); }
}

async function lancarTurno(h) {
  if (!pode('turno')) return aviso('Seu perfil não pode lançar o turno.', 'erro');
  const hora = soHora(h); const pend = pendentes(hora); if (!pend.length) return;
  const semJus = pend.filter(({ m }) => m.s === 'n' && !m.jus);
  if (semJus.length) { aviso(`Escolha a justificativa de ${semJus.length} aula(s) marcada(s) como "não houve".`, 'erro'); $('select[data-jus].falta-jus')?.focus(); return; }
  const excecoes = pend.filter(({ m }) => m.s !== 'p');
  const nomeTurno = D.turnos[est.turno]?.nome || '';
  const lista = excecoes.length
    ? `<div class="tabela-wrap" style="max-height:260px"><table class="tabela"><thead><tr><th>Turma</th><th>Professor</th><th>Disciplina</th><th>Status</th></tr></thead><tbody>
        ${excecoes.map(({ a, m }) => `<tr><td class="mono">${esc(a.turma)}</td><td>${esc(a.prof)}</td><td>${esc(a.disc)}</td><td><span class="selo ${ST[m.s]}">${STATUS[ST[m.s]]}${m.min && (m.s === 'a' || m.s === 's') ? ' ' + m.min + ' min' : ''}${m.s === 'n' ? ' · ' + esc(m.jus) : ''}</span></td></tr>`).join('')}
      </tbody></table></div>`
    : '<div class="caixa ok-caixa">Nenhuma falta, atraso, saída ou aula não realizada marcada: todas as aulas entram como presença.</div>';
  const ok = await modal({
    titulo: hora ? `Lançar aulas das ${hora} de ${fmtData(est.data)}` : `Lançar ${nomeTurno.toLowerCase()} de ${fmtData(est.data)}`,
    corpo: `<p style="margin:0">Serão lançados <b>${pend.length}</b> registros: <b>${pend.length - excecoes.length}</b> presenças e <b>${excecoes.length}</b> ocorrências.</p>${lista}`,
    botoes: [{ texto: 'Voltar', valor: false }, { texto: `${ico('check')} Confirmar lançamento`, classe: 'primario', valor: true }]
  }).promessa;
  if (!ok) return;
  const regs = pend.map(({ a, m }) => ({
    data: est.data, status: ST[m.s], aulas: m.s === 'n' ? 0 : (m.aulas ?? a.aulas), justificativa: m.s === 'n' ? m.jus : '', minutos: (m.s === 'a' || m.s === 's') ? (m.min || 10) : null,
    horario: a.inicio, obs: m.obs || '', disciplina_id: a.disciplina_id, professor_id: a.professor_id,
    prof: a.prof, disc: a.disc, turma: a.turma, diario_id: a.diario_id, ch_total: a.ch_total
  }));
  const b = hora ? $(`[data-hora-ok="${hora}"]`) : $('#t-lancar'); if (b) { b.disabled = true; b.textContent = 'Lançando…'; }
  try {
    const r = await api('registros_lancar', { p_regs: regs }, { timeout: 60000 });
    aviso(`${r.lancados} aula(s) lançada(s).${r.pulados ? ` ${r.pulados} já estavam registradas por outra pessoa e foram mantidas.` : ''}`, 'ok');
    limparMarcas(hora);
    await carregar(false);
  } catch (e) { aviso(e.message, 'erro'); if (b) { b.disabled = false; } resumo(); }
}

function configurarFaltaRapida() {
  const inp = $('#t-falta'), box = $('#t-falta-lista');
  let itens = [], foco = -1;
  const fechar = () => { box.classList.add('oculto'); foco = -1; };
  const aplicar = (pid) => {
    const alvo = previstas.filter((a) => a.professor_id === pid && !jaLancado(a));
    if (!alvo.length) { aviso('Esse professor não tem aula pendente neste turno.', 'erro'); return; }
    alvo.forEach((a) => { est.marcas[chaveAula(a)] = { ...(est.marcas[chaveAula(a)] || {}), s: 'f' }; });
    inp.value = ''; fechar(); desenhar();
    aviso(`${alvo.length} aula(s) de ${prof(pid)?.nome} marcada(s) como falta.`);
  };
  inp.oninput = () => {
    const q = semAcento(inp.value.trim());
    if (q.length < 2) return fechar();
    const ids = [...new Set(previstas.map((a) => a.professor_id))];
    itens = ids.map((id) => prof(id)).filter((p) => p && semAcento(p.nome + ' ' + p.nome_completo).includes(q)).slice(0, 8);
    box.innerHTML = itens.length ? itens.map((p, i) => `<button class="item-busca" data-i="${i}"><span>${esc(p.nome)}</span><small class="mudo">${previstas.filter((a) => a.professor_id === p.id).length} aula(s)</small></button>`).join('')
      : '<div class="vazio pequeno" style="padding:10px">Nenhum professor com aula neste turno.</div>';
    box.classList.remove('oculto');
    $$('[data-i]', box).forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); aplicar(itens[Number(b.dataset.i)].id); }));
  };
  inp.onkeydown = (e) => {
    const bs = $$('[data-i]', box);
    if (e.key === 'ArrowDown') { foco = Math.min(foco + 1, bs.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { foco = Math.max(foco - 1, 0); e.preventDefault(); }
    else if (e.key === 'Enter' && itens.length) { aplicar(itens[Math.max(foco, 0)].id); e.preventDefault(); return; }
    else if (e.key === 'Escape') return fechar();
    bs.forEach((b, i) => b.classList.toggle('foco', i === foco));
  };
  inp.onblur = () => setTimeout(fechar, 150);
}
