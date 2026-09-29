// Registro avulso: uma aula de cada vez (regular fora do lançamento do turno, extra ou permuta)
import { $, $$, esc, ico, aviso, confirmar, hojeISO, semAcento, DIAS, DIAS_CURTO, barraProg } from './util.js';
import { api } from './api.js';
import { D, prof, disc, profsOrdenados, discsDoProf, horariosDe, profsAtuais, aulasDadas, discsDaTurma } from './dados.js';

let f = null;
const novo = () => ({ profId: null, tipo: 'regular', data: hojeISO(), discId: null, aulas: '', status: null, min: 10, horario: '', obs: '', perm: { profId: null, discId: null, horario: '' } });

export async function render(el, { cabecalho, params }) {
  f = novo();
  if (params.get('prof')) f.profId = Number(params.get('prof'));
  el.innerHTML = cabecalho('Registro avulso', 'Para aulas fora do horário, aulas extras, permutas ou correções. O dia a dia é mais rápido em <a href="#/turno">Lançar turno</a>.') + `
    <div class="duas-col">
      <div>
        <div class="cartao">
          <h2>${ico('usuario')} Professor</h2>
          <div class="rel"><input type="search" id="r-prof" placeholder="Digite o nome do professor…" autocomplete="off"><div class="lista-busca oculto" id="r-prof-lista"></div></div>
        </div>
        <div class="cartao"><h2>${ico('calendario')} Horário da semana</h2><div id="r-semana"><div class="vazio">Escolha um professor para ver o horário. Clique numa aula para preencher.</div></div></div>
      </div>
      <div>
        <div class="cartao">
          <div class="grade" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <label class="campo"><span>Tipo de aula</span><select id="r-tipo"><option value="regular">Regular</option><option value="extra">Extra</option><option value="permuta">Permuta (substituindo outro professor)</option></select></label>
            <label class="campo"><span>Data</span><input type="date" id="r-data" max="${hojeISO()}"></label>
            <label class="campo" style="grid-column:1/-1"><span>Disciplina e turma</span><select id="r-disc" disabled><option value="">— escolha o professor —</option></select></label>
            <label class="campo"><span>Aulas dadas</span><input type="number" id="r-aulas" min="1" max="20" placeholder="nº"></label>
            <label class="campo"><span>Horário (opcional)</span><input type="time" id="r-horario"></label>
          </div>
          <div id="r-diario" class="pequeno mudo" style="margin-top:8px"></div>
        </div>
        <div class="cartao">
          <h2>Status</h2>
          <div class="status-grande" id="r-status">${['presente', 'ausente', 'atraso', 'saida'].map((s) => `<button data-s="${s}">${{ presente: 'Presente', ausente: 'Falta', atraso: 'Atraso', saida: 'Saída antecipada' }[s]}</button>`).join('')}</div>
          <label class="campo oculto" id="r-min-box" style="margin-top:10px;max-width:200px"><span id="r-min-rot">Minutos</span><input type="number" id="r-min" min="5" max="600" step="5" value="10"></label>
          <div id="r-perm" class="oculto caixa aviso-caixa" style="margin-top:12px">
            <b>Professor substituído</b>
            <div class="grade" style="margin-top:8px;grid-template-columns:repeat(2,minmax(0,1fr))">
              <label class="campo"><span>Professor</span><select id="r-perm-prof"><option value="">Selecione…</option></select></label>
              <label class="campo"><span>Disciplina</span><select id="r-perm-disc"><option value="">—</option></select></label>
            </div>
            <small>Ao salvar: presença para quem deu a aula e <b>falta</b> para o professor substituído.</small>
          </div>
          <label class="campo" style="margin-top:12px"><span>Observação</span><textarea id="r-obs" maxlength="300" placeholder="Ex.: liberou a turma mais cedo por falta de energia"></textarea></label>
          <div class="linha-flex fim" style="margin-top:12px"><button class="btn" id="r-limpar">Limpar</button><button class="btn primario grande" id="r-salvar">${ico('check')} Salvar registro</button></div>
        </div>
      </div>
    </div>`;
  $('#r-data').value = f.data;
  ligar();
  if (f.profId) escolherProf(f.profId);
}
export function aoMudar() { if (f?.profId) desenharSemana(); }

function ligar() {
  const inp = $('#r-prof'), box = $('#r-prof-lista');
  let itens = [], foco = -1;
  inp.oninput = () => {
    const q = semAcento(inp.value.trim());
    if (!q) { box.classList.add('oculto'); return; }
    itens = profsOrdenados().filter((p) => semAcento(p.nome + ' ' + p.nome_completo).includes(q)).slice(0, 12);
    box.innerHTML = itens.map((p, i) => `<button class="item-busca" data-i="${i}"><span>${esc(p.nome)} <small class="mudo">${esc(p.nome_completo)}</small></span><small class="selo">${discsDoProf(p.id).length} disc.</small></button>`).join('') || '<div class="vazio pequeno" style="padding:10px">Nenhum professor encontrado.</div>';
    box.classList.remove('oculto'); foco = -1;
    $$('[data-i]', box).forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); escolherProf(itens[Number(b.dataset.i)].id); }));
  };
  inp.onkeydown = (e) => {
    const bs = $$('[data-i]', box);
    if (e.key === 'ArrowDown') { foco = Math.min(foco + 1, bs.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { foco = Math.max(foco - 1, 0); e.preventDefault(); }
    else if (e.key === 'Enter' && itens.length) { escolherProf(itens[Math.max(foco, 0)].id); e.preventDefault(); return; }
    bs.forEach((b, i) => b.classList.toggle('foco', i === foco));
  };
  inp.onblur = () => setTimeout(() => box.classList.add('oculto'), 150);
  $('#r-tipo').onchange = (e) => { f.tipo = e.target.value; $('#r-perm').classList.toggle('oculto', f.tipo !== 'permuta'); if (f.tipo === 'permuta') { marcarStatus('presente'); encherPermProfs(); } };
  $('#r-data').onchange = (e) => { f.data = e.target.value; };
  $('#r-disc').onchange = (e) => { f.discId = Number(e.target.value) || null; infoDiario(); if (f.tipo === 'permuta') encherPermProfs(); };
  $('#r-aulas').oninput = (e) => { f.aulas = e.target.value; };
  $('#r-horario').oninput = (e) => { f.horario = e.target.value; };
  $('#r-min').oninput = (e) => { f.min = Number(e.target.value || 10); };
  $('#r-obs').oninput = (e) => { f.obs = e.target.value; };
  $$('#r-status [data-s]').forEach((b) => (b.onclick = () => marcarStatus(b.dataset.s)));
  $('#r-perm-prof').onchange = (e) => { f.perm.profId = Number(e.target.value) || null; encherPermDiscs(); };
  $('#r-perm-disc').onchange = (e) => { f.perm.discId = Number(e.target.value) || null; };
  $('#r-limpar').onclick = () => { const p = f.profId; f = novo(); f.profId = p; $('#r-data').value = f.data; $('#r-aulas').value = ''; $('#r-obs').value = ''; $('#r-horario').value = ''; $('#r-tipo').value = 'regular'; $('#r-perm').classList.add('oculto'); marcarStatus(null); if (p) escolherProf(p); };
  $('#r-salvar').onclick = salvar;
}

function escolherProf(id) {
  f.profId = id; f.discId = null;
  const p = prof(id); $('#r-prof').value = p?.nome || '';
  $('#r-prof-lista').classList.add('oculto');
  const discs = discsDoProf(id);
  const sel = $('#r-disc');
  sel.innerHTML = '<option value="">Selecione…</option>' + discs.map((d) => `<option value="${d.id}">${esc(d.turma)} · ${esc(d.nome)}</option>`).join('')
    + '<option value="outra">Outra disciplina (não está no horário deste professor)…</option>';
  sel.disabled = false;
  sel.onchange = (e) => {
    if (e.target.value === 'outra') return escolherOutraDisc();
    f.discId = Number(e.target.value) || null; infoDiario(); if (f.tipo === 'permuta') encherPermProfs();
  };
  desenharSemana(); infoDiario();
}

async function escolherOutraDisc() {
  const { modal } = await import('./util.js');
  const turmas = [...new Set([...D.discs.values()].filter((d) => !d.arquivada_em).map((d) => d.turma))].sort();
  const escolha = await modal({
    titulo: 'Escolher disciplina', corpo: `<label class="campo"><span>Turma</span><select id="o-turma">${turmas.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="campo"><span>Disciplina</span><select id="o-disc"></select></label>`,
    aoAbrir: (el) => { const st = $('#o-turma', el), sd = $('#o-disc', el); const enc = () => { sd.innerHTML = discsDaTurma(st.value).map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join(''); }; st.onchange = enc; enc(); },
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Usar', classe: 'primario', acao: (fechar, el) => { fechar(Number($('#o-disc', el).value)); return false; } }]
  }).promessa;
  const sel = $('#r-disc');
  if (!escolha) { sel.value = f.discId || ''; return; }
  const d = disc(escolha);
  if (![...sel.options].some((o) => o.value === String(d.id))) sel.insertAdjacentHTML('afterbegin', `<option value="${d.id}">${esc(d.turma)} · ${esc(d.nome)}</option>`);
  sel.value = String(d.id); f.discId = d.id; infoDiario();
}

function desenharSemana() {
  const box = $('#r-semana'); if (!box || !f.profId) return;
  const hojeDia = (new Date().getDay() || 7);
  const slots = [];
  for (const d of discsDoProf(f.profId)) for (const h of horariosDe(d.id, f.profId)) slots.push({ ...h, disc: d });
  if (!slots.length) { box.innerHTML = '<div class="vazio">Este professor não tem aulas no horário atual.</div>'; return; }
  box.innerHTML = `<div class="semana">${[1, 2, 3, 4, 5, 6].map((dia) => {
    const l = slots.filter((s) => s.dia === dia).sort((a, b) => a.hora.localeCompare(b.hora));
    return `<div class="dia ${dia === hojeDia ? 'hoje' : ''}"><b>${DIAS_CURTO[dia]}</b>${l.map((s) => `<button class="slot ${s.disc.id === f.discId ? 'escolhido' : ''}" data-d="${s.disc.id}" data-dia="${dia}" data-h="${s.hora}"><b>${s.hora}</b>${esc(s.disc.nome)}<small>${esc(s.disc.turma)}</small></button>`).join('') || '<div class="vazio pequeno" style="padding:6px">—</div>'}</div>`;
  }).join('')}</div>`;
  $$('.slot', box).forEach((b) => (b.onclick = () => {
    const dId = Number(b.dataset.d), dia = Number(b.dataset.dia);
    f.discId = dId; $('#r-disc').value = String(dId);
    const n = horariosDe(dId, f.profId).filter((h) => h.dia === dia).length;
    f.aulas = String(n); $('#r-aulas').value = n;
    const hs = horariosDe(dId, f.profId).filter((h) => h.dia === dia).map((h) => h.hora).sort();
    f.horario = hs[0] || ''; $('#r-horario').value = f.horario;
    if (f.tipo === 'permuta') { f.tipo = 'regular'; $('#r-tipo').value = 'regular'; $('#r-perm').classList.add('oculto'); }
    infoDiario(); desenharSemana();
  }));
}

function infoDiario() {
  const box = $('#r-diario'); const d = disc(f.discId);
  if (!d) { box.innerHTML = ''; return; }
  const feito = aulasDadas(d.id);
  box.innerHTML = `<div class="linha-flex">${d.diario_id ? `<span>Diário <a href="https://suap.ifma.edu.br/edu/diario/${d.diario_id}/" target="_blank" rel="noopener">${d.diario_id}</a></span>` : '<span>Sem diário do SUAP vinculado</span>'}
    <span>CH: ${d.ch_total || '—'} aulas</span><span style="flex:1;max-width:220px">${barraProg(feito, d.ch_total)}</span></div>`;
}

function marcarStatus(s) {
  f.status = s;
  $$('#r-status [data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === s));
  $('#r-min-box').classList.toggle('oculto', !(s === 'atraso' || s === 'saida'));
  $('#r-min-rot').textContent = s === 'atraso' ? 'Minutos de atraso' : 'Minutos de saída antecipada';
}

function encherPermProfs() {
  const d = disc(f.discId); const sel = $('#r-perm-prof');
  const turma = d?.turma;
  const ids = new Set();
  for (const x of D.discs.values()) if (!x.arquivada_em && (!turma || x.turma === turma)) profsAtuais(x).forEach((p) => p !== f.profId && ids.add(p));
  sel.innerHTML = '<option value="">Selecione…</option>' + [...ids].map((i) => prof(i)).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  f.perm = { profId: null, discId: null };
  $('#r-perm-disc').innerHTML = '<option value="">—</option>';
}
function encherPermDiscs() {
  const d = disc(f.discId);
  const l = discsDoProf(f.perm.profId).filter((x) => !d || x.turma === d.turma);
  $('#r-perm-disc').innerHTML = '<option value="">Selecione…</option>' + l.map((x) => `<option value="${x.id}">${esc(x.turma)} · ${esc(x.nome)}</option>`).join('');
  if (l.length === 1) { $('#r-perm-disc').value = String(l[0].id); f.perm.discId = l[0].id; }
}

async function salvar() {
  const falta = [];
  if (!f.profId) falta.push('professor'); if (!f.data) falta.push('data'); if (!f.discId) falta.push('disciplina');
  if (!Number(f.aulas)) falta.push('nº de aulas'); if (!f.status) falta.push('status');
  if (f.tipo === 'permuta' && (!f.perm.profId || !f.perm.discId)) falta.push('professor substituído');
  if (falta.length) return aviso('Preencha: ' + falta.join(', ') + '.', 'erro');
  const d = disc(f.discId), p = prof(f.profId);
  const reg = {
    data: f.data, tipo: f.tipo, status: f.status, aulas: Number(f.aulas), minutos: (f.status === 'atraso' || f.status === 'saida') ? f.min : null,
    horario: f.horario, obs: f.obs.trim(), disciplina_id: d.id, professor_id: p.id, prof: p.nome, disc: d.nome, turma: d.turma,
    diario_id: d.diario_id, ch_total: d.ch_total, origem: f.tipo === 'permuta' ? 'permuta' : 'manual'
  };
  if (f.tipo === 'permuta') reg.permuta = { professor_id: f.perm.profId, disciplina_id: f.perm.discId, horario: f.horario };
  const b = $('#r-salvar'); b.disabled = true;
  try {
    await api('registro_salvar', { p_reg: reg });
    aviso('Registro salvo.' + (f.tipo === 'permuta' ? ` Falta lançada para ${prof(f.perm.profId)?.nome}.` : ''), 'ok');
    $('#r-limpar').click();
  } catch (e) {
    if (e.codigo === 'JA_EXISTE_REGULAR' && await confirmar(`${e.message}\n\nDuas aulas regulares da mesma disciplina no mesmo dia não são permitidas. Esta é uma aula EXTRA?`, { titulo: 'Aula regular já registrada', ok: 'Sim, registrar como extra' })) {
      try { await api('registro_salvar', { p_reg: { ...reg, tipo: 'extra' } }); aviso('Registrada como aula extra.', 'ok'); $('#r-limpar').click(); }
      catch (e2) { aviso(e2.message, 'erro'); }
    } else if (e.codigo !== 'JA_EXISTE_REGULAR') aviso(e.message, 'erro');
  } finally { b.disabled = false; }
}
export { DIAS };
