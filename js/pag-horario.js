// Importar horário (planilha) com conciliação: nada é sobrescrito sem conferência.
//  * disciplina já conhecida (mesmo nome ou apelido) → continua, com o mesmo diário e a mesma contagem;
//  * nome parecido com uma disciplina da turma → o sistema PERGUNTA se é a mesma; a resposta vira apelido;
//  * professor diferente numa disciplina que continua → troca de professor com histórico;
//  * disciplina que sumiu do horário → sugere arquivar (semestrais) ou manter (anuais em andamento).
import { $, $$, esc, ico, aviso, confirmar, modal, carregarScript, chave, simNome, simProf, DIAS, DIAS_CURTO, ordTurma, hojeISO, ehSemestral } from './util.js';
import { api } from './api.js';
import { D, profsAtuais, nomeProf, aulasDadas, discPorNome, discsDaTurma, carregarCadastro, profsOrdenados, horariosDe } from './dados.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let plano = null;

export async function render(el, { cabecalho }) {
  plano = null;
  el.innerHTML = cabecalho('Importar horário', 'Envie a planilha do horário. O sistema compara com o que já existe e só grava depois da sua conferência.') + `
    <div class="duas-col">
      <div class="cartao"><h2>${ico('calendario')} Horário das turmas (.xlsx)</h2>
        <p class="pequeno mudo" style="margin-top:0">Aceita o formato por turma ("Turma 311-I", disciplina e professor em linhas alternadas) e o formato por professor (nome do professor e células "TURMA/Disciplina").</p>
        <input type="file" id="h-arq" accept=".xlsx,.xls">
        <div id="h-status" class="pequeno" style="margin-top:8px"></div></div>
      <div class="cartao"><h2>${ico('lista')} Diários do SUAP (.xls/.xlsx)</h2>
        <p class="pequeno mudo" style="margin-top:0">Opcional: relatório de diários exportado do SUAP (colunas ID, Componente curricular, Turma e Professor) para preencher o ID do diário e a carga horária.</p>
        <input type="file" id="h-diarios" accept=".xlsx,.xls">
        <div id="h-status-d" class="pequeno" style="margin-top:8px"></div></div>
    </div>
    <div id="h-plano"></div>`;
  $('#h-arq').onchange = (e) => e.target.files[0] && lerHorario(e.target.files[0]);
  $('#h-diarios').onchange = (e) => e.target.files[0] && lerDiarios(e.target.files[0]);
}

async function planilha(file) {
  await carregarScript(XLSX_URL);
  const buf = await file.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: 'array' });
  const linhas = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  // O Google Planilhas exporta espaços não separáveis; viram espaço comum para os nomes quebrarem linha e casarem na busca.
  return linhas.map((l) => l.map((c) => (typeof c === 'string' ? c.replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/ {2,}/g, ' ') : c)));
}

// ------------------------------------------------------------------ leitura do horário
const HORAS = { '0.2986': '07:10', '0.3333': '08:00', '0.3819': '09:10', '0.4167': '10:00', '0.4583': '11:00', '0.4931': '11:50', '0.5486': '13:10', '0.5833': '14:00',
  '0.6319': '15:10', '0.6667': '16:00', '0.7083': '17:00', '0.7431': '17:50', '0.7917': '19:00', '0.8264': '19:50', '0.8681': '20:50', '0.9028': '21:40' };
export function hora(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number' || /^0?\.\d+$/.test(String(v))) {
    const n = Number(v); if (!(n > 0 && n < 1)) return null;
    if (HORAS[n.toFixed(4)]) return HORAS[n.toFixed(4)];
    const t = Math.round(n * 1440); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  const m = String(v).trim().match(/^(\d{1,2})[:h](\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}
/** Converte as linhas da planilha em aulas [{turma, dia, hora, disc, prof}]. */
export function lerLinhas(rows) {
  const aulas = [];
  const temTurma = rows.slice(0, 80).some((r) => /^Turma\s+/i.test(String(r[0] || '').trim()));
  if (temTurma) {
    let turma = null;
    for (let i = 0; i < rows.length; i++) {
      const c0 = String(rows[i][0] ?? '').trim();
      const mt = c0.match(/^Turma\s+(.+)$/i);
      if (mt) { turma = mt[1].trim(); continue; }
      const h = turma && hora(rows[i][0]);
      if (!h) continue;
      const prof = rows[i + 1] || [];
      for (let d = 1; d <= 6; d++) {
        const disc = String(rows[i][d] ?? '').trim(); if (!disc || disc === '---') continue;
        aulas.push({ turma, dia: d, hora: h, disc, prof: String(prof[d] ?? '').trim() });
      }
      i++;
    }
    return aulas;
  }
  // formato por professor
  let prof = null;
  for (const r of rows) {
    const c0 = String(r[0] ?? '').trim(); const resto = r.slice(1);
    const h = hora(r[0]);
    if (c0 && !h && c0 !== 'Horário' && resto.every((c) => !String(c ?? '').trim() || String(c).trim() === '---')) { prof = c0.toUpperCase(); if (/HOR[ÁA]RIO GERADO/i.test(prof)) prof = null; continue; }
    if (!prof || !h) continue;
    for (let d = 1; d <= 6; d++) {
      const s = String(r[d] ?? '').trim(); if (!s || s === '---') continue;
      const k = s.indexOf('/');
      aulas.push({ turma: k >= 0 ? s.slice(0, k).trim() : '', disc: k >= 0 ? s.slice(k + 1).trim() : s, dia: d, hora: h, prof });
    }
  }
  return aulas;
}

async function lerHorario(file) {
  const st = $('#h-status'); st.textContent = 'Lendo planilha…';
  try {
    const aulas = lerLinhas(await planilha(file)).filter((a) => a.turma);
    if (!aulas.length) { st.innerHTML = '<span style="color:var(--vermelho)">Não encontrei aulas nesta planilha. Confira se é o horário no formato por turma ou por professor.</span>'; return; }
    await carregarCadastro();
    plano = montarPlano(aulas);
    st.innerHTML = `<span style="color:var(--verde-escuro)">${aulas.length} aulas de ${new Set(aulas.map((a) => a.turma)).size} turmas lidas de <b>${esc(file.name)}</b>.</span>`;
    desenharPlano();
  } catch (e) { console.error(e); st.innerHTML = `<span style="color:var(--vermelho)">${esc(e.message)}</span>`; }
}

// ------------------------------------------------------------------ conciliação
export function montarPlano(aulas) {
  // agrupa por turma + disciplina
  const grupos = new Map();
  for (const a of aulas) {
    const k = a.turma + '|' + chave(a.disc);
    if (!grupos.has(k)) grupos.set(k, { k, turma: a.turma, disc: a.disc, profs: [], slots: [] });
    const g = grupos.get(k);
    const pnome = a.prof || '(sem professor)';
    let idx = g.profs.indexOf(pnome); if (idx < 0) { g.profs.push(pnome); idx = g.profs.length - 1; }
    if (!g.slots.some((s) => s.prof === idx && s.dia === a.dia && s.hora === a.hora)) g.slots.push({ prof: idx, dia: a.dia, hora: a.hora });
  }
  // professores da planilha → cadastro
  const nomesProf = [...new Set([...grupos.values()].flatMap((g) => g.profs))].filter((n) => n !== '(sem professor)');
  const profMapa = {};
  for (const n of nomesProf) {
    let melhor = null, ms = 0;
    for (const p of D.profs.values()) {
      const s = Math.max(simProf(p.nome, n), p.nome_completo ? simProf(p.nome_completo, n) : 0);
      if (s > ms || (s === ms && p.ativo && melhor && !melhor.ativo)) { ms = s; melhor = p; }
    }
    profMapa[n] = { nome: n, id: ms >= 0.8 ? melhor.id : null, sugestao: melhor && ms >= 0.55 ? melhor.id : null, nota: ms };
  }
  const usadas = new Set();
  const itens = [];
  // 1º passo: casamentos exatos (nome ou apelido)
  for (const g of grupos.values()) {
    const d = discPorNome(g.turma, g.disc);
    if (d) { usadas.add(d.id); itens.push({ ...g, tipo: 'continuar', escolha: d.id, conferido: true, candidatos: [{ d, s: 1 }] }); }
    else itens.push({ ...g, tipo: null });
  }
  // 2º passo: nomes parecidos na mesma turma → perguntar
  for (const it of itens.filter((x) => !x.tipo)) {
    const profIds = it.profs.map((n) => profMapa[n]?.id || profMapa[n]?.sugestao).filter(Boolean);
    const cands = discsDaTurma(it.turma, { incluirArquivadas: true }).filter((d) => !usadas.has(d.id)).map((d) => {
      let s = simNome(d.nome, it.disc);
      for (const a of d.apelidos || []) s = Math.max(s, simNome(a.nome, it.disc));
      if (profsAtuais(d).some((p) => profIds.includes(p))) s += 0.12;
      if (d.arquivada_em) s -= 0.05;
      return { d, s: Math.min(1, Math.round(s * 100) / 100) };
    }).filter((c) => c.s >= 0.42).sort((a, b) => b.s - a.s);
    if (cands.length) { it.tipo = 'verificar'; it.candidatos = cands; it.escolha = cands[0].s >= 0.7 ? cands[0].d.id : 'nova'; it.conferido = false; }
    else { it.tipo = 'nova'; it.escolha = 'nova'; it.conferido = true; it.candidatos = []; }
  }
  // disciplinas ativas que não aparecem na planilha
  const sumidas = [...D.discs.values()].filter((d) => !d.arquivada_em && !usadas.has(d.id))
    .map((d) => {
      const feito = aulasDadas(d.id), completa = d.ch_total && feito >= d.ch_total;
      const sem = ehSemestral(d.turma, d.ch_total);
      return { d, acao: sem || completa ? 'arquivar' : 'manter', motivo: completa ? 'CH completa' : sem ? 'disciplina semestral' : 'anual em andamento' };
    });
  const turmasPlanilha = new Set(itens.map((i) => i.turma));
  return { itens: itens.sort((a, b) => ordTurma(a.turma, b.turma) || a.disc.localeCompare(b.disc, 'pt')), profMapa, todasSumidas: sumidas, sumidas, turmasPlanilha, data: hojeISO(), filtro: 'conferir' };
}

// Disciplinas ativas que não foram escolhidas por nenhuma linha da planilha (recalculado a cada resposta)
function sumidasAtuais() {
  const ja = new Set(plano.itens.map((i) => i.escolha).filter((x) => typeof x === 'number'));
  return plano.todasSumidas.filter((s) => !ja.has(s.d.id));
}
function desenharPlano() {
  const box = $('#h-plano'); if (!box || !plano) return;
  plano.sumidas = sumidasAtuais();
  const it = plano.itens;
  const n = { continuar: 0, verificar: 0, nova: 0 };
  it.forEach((i) => n[i.tipo]++);
  const pend = it.filter((i) => i.tipo === 'verificar' && !i.conferido).length;
  const trocas = it.filter((i) => typeof i.escolha === 'number' && houveTroca(i)).length;
  const arq = plano.sumidas.filter((s) => s.acao === 'arquivar').length;
  const novosProfs = Object.values(plano.profMapa).filter((p) => !p.id).length;
  const filtro = plano.filtro;
  const visiveis = it.filter((i) => filtro === 'todos' || (filtro === 'conferir' ? i.tipo === 'verificar' : filtro === 'trocas' ? (typeof i.escolha === 'number' && houveTroca(i)) : i.tipo === filtro));
  box.innerHTML = `
    <div class="cartao" style="margin-top:14px">
      <div class="linha-flex"><h2 style="margin:0">Conferência</h2><span class="espaco"></span>
        <label class="campo" style="flex-direction:row;align-items:center;gap:6px"><span>Novo horário vale a partir de</span><input type="date" id="h-data" value="${plano.data}" style="width:auto"></label></div>
      <div class="kpis" style="margin-top:12px">
        <div class="kpi verde"><span>Continuam (reconhecidas)</span><b>${n.continuar}</b><small>mesmo diário e contagem</small></div>
        <div class="kpi ambar"><span>Para conferir</span><b>${n.verificar}</b><small>${pend ? pend + ' sem resposta' : 'todas respondidas'}</small></div>
        <div class="kpi"><span>Disciplinas novas</span><b>${n.nova + it.filter((i) => i.tipo === 'verificar' && i.escolha === 'nova').length}</b><small>entram sem diário</small></div>
        <div class="kpi laranja"><span>Trocas de professor</span><b>${trocas}</b><small>histórico preservado</small></div>
        <div class="kpi"><span>Fora do novo horário</span><b>${plano.sumidas.length}</b><small>${arq} para arquivar</small></div>
      </div>
      ${pend ? `<div class="caixa aviso-caixa">${ico('alerta')} <b>${pend} disciplina(s) com nome diferente</b> precisam da sua confirmação: diga se é a mesma disciplina que já existe (a contagem de aulas continua) ou se é uma disciplina nova. A resposta fica guardada e da próxima vez o reconhecimento é automático.
        <button class="btn pequeno" id="h-aceitar" style="margin-left:6px">Aceitar as sugestões restantes</button></div>` : ''}
      ${novosProfs ? `<details style="margin-top:10px" ${novosProfs ? 'open' : ''}><summary class="pequeno" style="cursor:pointer"><b>${novosProfs} professor(es) da planilha não encontrados no cadastro</b> · escolha o correspondente ou deixe que seja cadastrado</summary>
        <div class="grade" style="margin-top:8px">${Object.values(plano.profMapa).filter((p) => !p.id).map((p) => `<label class="campo"><span>${esc(p.nome)}</span>
          <select data-pm="${esc(p.nome)}"><option value="">Cadastrar como novo</option>${profsOrdenados().map((x) => `<option value="${x.id}" ${x.id === p.sugestao ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>`).join('')}</div></details>` : ''}
    </div>
    <div class="linha-flex" style="margin:14px 0 8px"><div class="chips" id="h-filtros">
      ${[['conferir', `Para conferir (${n.verificar})`], ['trocas', `Trocas de professor (${trocas})`], ['nova', `Novas (${n.nova})`], ['continuar', `Reconhecidas (${n.continuar})`], ['todos', 'Todas'], ['sumidas', `Fora do horário (${plano.sumidas.length})`]].map(([k, t]) => `<button class="chip ${filtro === k ? 'ativo' : ''}" data-f="${k}">${t}</button>`).join('')}
    </div></div>
    <div id="h-itens" style="display:grid;gap:8px">${filtro === 'sumidas' ? desenharSumidas() : (visiveis.map(desenharItem).join('') || '<div class="vazio">Nada neste filtro.</div>')}</div>
    <div class="resumo-turno"><span>${pend ? `<b>${pend}</b> pendente(s) de conferência` : 'Tudo conferido.'}</span><span class="espaco"></span>
      <button class="btn fantasma" style="color:#cfe0db" id="h-cancelar">Descartar</button>
      <button class="btn primario grande" id="h-aplicar" ${pend ? 'disabled' : ''}>${ico('check')} Aplicar novo horário</button></div>`;

  $('#h-data').onchange = (e) => { plano.data = e.target.value || hojeISO(); };
  $$('#h-filtros [data-f]').forEach((b) => (b.onclick = () => { plano.filtro = b.dataset.f; desenharPlano(); }));
  const ac = $('#h-aceitar'); if (ac) ac.onclick = () => { plano.itens.forEach((i) => { if (i.tipo === 'verificar') i.conferido = true; }); desenharPlano(); };
  $$('[data-pm]', box).forEach((s) => (s.onchange = () => { plano.profMapa[s.dataset.pm].escolhido = Number(s.value) || null; }));
  $$('[data-esc]', box).forEach((s) => (s.onchange = () => { const i = plano.itens[Number(s.dataset.esc)]; i.escolha = s.value === 'nova' ? 'nova' : Number(s.value); i.conferido = true; desenharPlano(); }));
  $$('[data-ok]', box).forEach((b) => (b.onclick = () => { plano.itens[Number(b.dataset.ok)].conferido = true; desenharPlano(); }));
  $$('[data-nome]', box).forEach((c) => (c.onchange = () => { plano.itens[Number(c.dataset.nome)].atualizarNome = c.checked; }));
  $$('[data-sum]', box).forEach((s) => (s.onchange = () => { plano.sumidas[Number(s.dataset.sum)].acao = s.value; desenharPlano(); }));
  $('#h-cancelar').onclick = () => { plano = null; box.innerHTML = ''; $('#h-arq').value = ''; $('#h-status').textContent = ''; };
  $('#h-aplicar').onclick = aplicar;
}

const idProfPlanilha = (nome) => { const p = plano.profMapa[nome]; return p ? (p.escolhido ?? p.id) : null; };
function houveTroca(i) {
  const d = D.discs.get(i.escolha); if (!d) return false;
  const atuais = profsAtuais(d); const novos = i.profs.map(idProfPlanilha);
  return novos.some((p) => !p || !atuais.includes(p)) || atuais.some((p) => !novos.includes(p));
}
function desenharItem(i) {
  const idx = plano.itens.indexOf(i);
  const hs = (lista, profs) => [...new Set(lista.map((s) => `${DIAS_CURTO[s.dia]} ${s.hora}${profs && profs.length > 1 ? ' (' + esc(profs[s.prof]) + ')' : ''}`))].join(', ');
  const d = typeof i.escolha === 'number' ? D.discs.get(i.escolha) : null;
  const troca = d && houveTroca(i);
  const cls = i.tipo === 'verificar' ? 'verificar' : i.tipo === 'nova' ? 'nova' : '';
  const planilha = `<div class="lado planilha"><small>Planilha nova</small><b>${esc(i.disc)}</b><br>${i.profs.map((n) => `${esc(n)}${idProfPlanilha(n) ? '' : ' <span class="selo azul">novo</span>'}`).join(', ')}<br><span class="mudo pequeno">${hs(i.slots, i.profs)}</span></div>`;
  const sistema = d ? `<div class="lado sistema"><small>No sistema</small><b>${esc(d.nome)}</b>${d.arquivada_em ? ' <span class="selo">arquivada</span>' : ''}<br>${profsAtuais(d).map(nomeProf).join(', ') || 'sem professor'} · ${aulasDadas(d.id)} aulas dadas${d.ch_total ? ' de ' + d.ch_total : ''}${d.diario_id ? ' · diário ' + d.diario_id : ''}<br><span class="mudo pequeno">${[...new Set(horariosDe(d.id).map((h) => `${DIAS_CURTO[h.dia]} ${h.hora}`))].join(', ')}</span></div>`
    : `<div class="lado"><small>No sistema</small><span class="mudo">Será criada como disciplina nova (sem diário; preencha depois ou importe os diários do SUAP).</span></div>`;
  let pergunta = '';
  if (i.tipo === 'verificar') {
    pergunta = `<div class="linha-flex"><b class="pequeno">É a mesma disciplina?</b>
      <select data-esc="${idx}" style="width:auto;max-width:100%">${i.candidatos.map((c) => `<option value="${c.d.id}" ${i.escolha === c.d.id ? 'selected' : ''}>Sim, é "${esc(c.d.nome)}" (${Math.round(c.s * 100)}% parecido${c.d.arquivada_em ? ', arquivada' : ''})</option>`).join('')}
        <option value="nova" ${i.escolha === 'nova' ? 'selected' : ''}>Não, é uma disciplina nova</option></select>
      ${i.conferido ? '<span class="selo verde">conferido</span>' : `<button class="btn pequeno" data-ok="${idx}">Confirmar sugestão</button>`}
      ${d ? `<label class="check pequeno"><input type="checkbox" data-nome="${idx}" ${i.atualizarNome ? 'checked' : ''}> passar a usar o nome da planilha</label>` : ''}</div>`;
  }
  return `<div class="conc-item ${cls}"><div class="linha-flex"><span class="mono" style="font-weight:700">${esc(i.turma)}</span>
      <span class="selo ${i.tipo === 'continuar' ? 'verde' : i.tipo === 'verificar' ? 'ambar' : 'azul'}">${i.tipo === 'continuar' ? 'reconhecida' : i.tipo === 'verificar' ? 'nome diferente' : 'nova'}</span>
      ${troca ? `<span class="selo laranja">troca de professor: ${esc(profsAtuais(d).map(nomeProf).join(', ') || '—')} → ${esc(i.profs.join(', '))}</span>` : ''}</div>
    <div class="lados">${planilha}${sistema}</div>${pergunta}</div>`;
}
function desenharSumidas() {
  if (!plano.sumidas.length) return '<div class="vazio">Todas as disciplinas ativas aparecem no novo horário.</div>';
  return `<div class="caixa info">Estas disciplinas estão ativas no sistema mas não aparecem na planilha. Semestrais e as que já completaram a carga horária vêm marcadas para arquivar; anuais em andamento vêm marcadas para manter (confira se não é a mesma disciplina com outro nome, na aba "Para conferir").</div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Turma</th><th>Disciplina</th><th>Professor</th><th>Andamento</th><th>Motivo</th><th>Ação</th></tr></thead><tbody>
    ${plano.sumidas.map((s, i) => `<tr><td class="mono">${esc(s.d.turma)}</td><td>${esc(s.d.nome)}</td><td>${profsAtuais(s.d).map(nomeProf).join(', ') || '—'}</td>
      <td>${aulasDadas(s.d.id)}${s.d.ch_total ? ' / ' + s.d.ch_total : ''}</td><td class="mudo">${s.motivo}${plano.turmasPlanilha.has(s.d.turma) ? '' : ' · turma fora da planilha'}</td>
      <td><select data-sum="${i}" style="width:auto"><option value="arquivar" ${s.acao === 'arquivar' ? 'selected' : ''}>Arquivar</option><option value="manter" ${s.acao === 'manter' ? 'selected' : ''}>Manter (sem horário)</option></select></td></tr>`).join('')}
    </tbody></table></div>`;
}

async function aplicar() {
  const profRef = (nome) => { const id = idProfPlanilha(nome); return id ? { professor_id: id } : { nome: nome === '(sem professor)' ? '' : nome }; };
  const continuar = [], novas = [];
  for (const i of plano.itens) {
    const profs = i.profs.map(profRef);
    const horarios = i.slots.map((s) => ({ prof: s.prof, dia: s.dia, hora: s.hora }));
    if (typeof i.escolha === 'number') continuar.push({ disciplina_id: i.escolha, nome_planilha: i.disc, atualizar_nome: !!i.atualizarNome, professores: profs, horarios });
    else novas.push({ turma: i.turma, nome: i.disc, professores: profs, horarios });
  }
  plano.sumidas = sumidasAtuais();
  const arquivar = plano.sumidas.filter((s) => s.acao === 'arquivar').map((s) => s.d.id);
  const trocas = plano.itens.filter((i) => typeof i.escolha === 'number' && houveTroca(i)).length;
  if (!await confirmar(`Aplicar o novo horário a partir de ${plano.data.split('-').reverse().join('/')}?\n\n• ${continuar.length} disciplinas continuam (${trocas} com troca de professor)\n• ${novas.length} disciplinas novas\n• ${arquivar.length} disciplinas arquivadas\n\nNenhum registro de aula é apagado.`, { titulo: 'Aplicar horário', ok: 'Aplicar' })) return;
  const b = $('#h-aplicar'); b.disabled = true; b.textContent = 'Gravando…';
  try {
    const r = await api('importar_horario', { p_plano: { continuar, novas, arquivar, data_troca: plano.data } }, { timeout: 120000 });
    await carregarCadastro();
    aviso(`Horário aplicado: ${r.continuadas} continuadas, ${r.trocas} trocas de professor, ${r.novas} novas, ${r.arquivadas} arquivadas.`, 'ok');
    plano = null; $('#h-plano').innerHTML = `<div class="caixa ok-caixa" style="margin-top:14px">Horário aplicado. ${r.professores_novos ? r.professores_novos + ' professor(es) novo(s) cadastrado(s) — complete nome completo e matrícula em Configurações › Professores. ' : ''}${r.novas ? 'Disciplinas novas ficaram sem diário: importe os diários do SUAP ao lado ou preencha em Turmas.' : ''}</div>`;
  } catch (e) { aviso(e.message, 'erro'); b.disabled = false; b.textContent = 'Aplicar novo horário'; }
}

// ------------------------------------------------------------------ diários do SUAP
const CURSO = { '1': { I: 'EDI', S: 'EDS' }, '2': { I: 'EMI', S: 'EMS' }, '3': { I: 'ELI', S: 'ELS' }, '4': { I: 'AUT', S: 'ATS' }, '5': { I: 'MAV', S: 'MAS' },
  '6': { I: 'QMI' }, '7': { I: 'INI' }, '8': { I: 'STI', C: 'STC', S: 'TSS' }, '9': { I: 'ADP', P: 'ADP' }, '0': { I: 'ALI' } };
const TURNO = { '1': 'M', '2': 'V', '3': 'N' };
function decodificar(t) {
  const m = String(t || '').trim().match(/^(\d)(\d)(\d)-([A-Z]+)$/);
  if (!m) return null;
  const c = CURSO[m[2]] || {}; const curso = c[m[4][0]] || c.I;
  return curso ? { ano: m[1], curso, turno: TURNO[m[3]] || null } : null;
}
async function lerDiarios(file) {
  const st = $('#h-status-d'); st.textContent = 'Lendo…';
  try {
    const rows = await planilha(file);
    const hi = rows.findIndex((r) => r.some((c) => String(c).trim() === 'ID'));
    if (hi < 0) throw new Error('Não achei a coluna "ID" no relatório do SUAP.');
    const cab = rows[hi].map((c) => String(c).trim().toUpperCase());
    const iId = cab.indexOf('ID'), iC = cab.findIndex((c) => c.includes('COMPONENTE')), iT = cab.findIndex((c) => c.includes('TURMA')), iP = cab.findIndex((c) => c.includes('PROFESSOR'));
    const diarios = rows.slice(hi + 1).filter((r) => r[iId]).map((r) => {
      const comp = String(r[iC] || ''); const aulas = Number((comp.match(/(\d+)\s*Aulas/i) || [])[1] || 0);
      const nome = comp.replace(/\s*\[.*?\]/g, '').replace(/^[A-Z]+\.\d+\s*-\s*/, '').replace(/\s*-\s*(Superior|Técnico|Bacharelado|Licenciatura).*/i, '').trim();
      const tr = String(r[iT] || ''); const partes = tr.split('.');
      return { id: Math.round(Number(r[iId])), nome, aulas, turmaRaw: tr, ano: partes[1], curso: partes[2], turno: (partes[partes.length - 1] || '').slice(-1), prof: String(r[iP] || '') };
    });
    await carregarCadastro();
    const sugestoes = [];
    for (const d of D.discs.values()) {
      if (d.arquivada_em) continue;
      const dec = decodificar(d.turma);
      const nomes = profsAtuais(d).flatMap((p) => [D.profs.get(p)?.nome, D.profs.get(p)?.nome_completo]).filter(Boolean);
      let melhor = null, ms = 0;
      for (const x of diarios) {
        if (dec && (x.curso !== dec.curso || x.ano !== dec.ano || (dec.turno && x.turno && x.turno !== dec.turno))) continue;
        let s = Math.max(simNome(d.nome, x.nome), ...(d.apelidos || []).map((a) => simNome(a.nome, x.nome)));
        if (nomes.some((n) => simProf(n, x.prof) >= 0.8)) s += 0.2;
        if (s > ms) { ms = s; melhor = x; }
      }
      if (melhor && ms >= 0.65 && (melhor.id !== d.diario_id || (melhor.aulas && melhor.aulas !== d.ch_total))) sugestoes.push({ d, x: melhor, s: ms, marcar: !d.diario_id || ms >= 0.9 });
    }
    st.innerHTML = `${diarios.length} diários lidos · <b>${sugestoes.length}</b> vínculo(s) sugerido(s).`;
    if (!sugestoes.length) return;
    const m = modal({
      titulo: 'Vincular diários do SUAP', largo: true,
      corpo: `<div class="tabela-wrap" style="max-height:60vh"><table class="tabela"><thead><tr><th></th><th>Turma</th><th>Disciplina no SUPERT</th><th>Diário do SUAP</th><th>Hoje</th></tr></thead><tbody>
        ${sugestoes.map((g, i) => `<tr><td><input type="checkbox" data-v="${i}" ${g.marcar ? 'checked' : ''}></td><td class="mono">${esc(g.d.turma)}</td><td>${esc(g.d.nome)}<br><small class="mudo">${profsAtuais(g.d).map(nomeProf).join(', ')}</small></td>
          <td><b>${g.x.id}</b> · ${esc(g.x.nome)} · ${g.x.aulas || '?'} aulas<br><small class="mudo">${esc(g.x.prof)} · ${esc(g.x.turmaRaw)} · ${Math.round(Math.min(g.s, 1) * 100)}%</small></td>
          <td class="mudo">${g.d.diario_id || '—'} · ${g.d.ch_total || '—'} aulas</td></tr>`).join('')}</tbody></table></div>`,
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Vincular marcados', classe: 'primario', acao: async (fechar, el) => {
        const itens = $$('[data-v]', el).filter((c) => c.checked).map((c) => { const g = sugestoes[Number(c.dataset.v)]; return { id: g.d.id, diario_id: g.x.id, ch_total: g.x.aulas || null }; });
        const n = await api('diarios_vincular', { p_itens: itens }); await carregarCadastro();
        aviso(`${n} disciplina(s) atualizada(s) com o diário do SUAP.`, 'ok'); fechar(true); return false;
      } }]
    });
    void m;
  } catch (e) { console.error(e); st.innerHTML = `<span style="color:var(--vermelho)">${esc(e.message)}</span>`; }
}
export { DIAS };
