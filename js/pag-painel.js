// Painel de aulas: todos os registros com filtros, indicadores, exclusões pendentes, PDF e planilha
import { $, $$, esc, ico, aviso, periodo, fmtData, semAcento, STATUS, TIPOS, barraProg, baixarCsv, imprimirDoc, debounce, ordTurma, hojeISO } from './util.js';
import { api, pode } from './api.js';
import { D, disc, aulasDadas, profsOrdenados, turmas } from './dados.js';
import { editarRegistro } from './regmodal.js';
import { atualizarContadorExclusoes } from './app.js';

const ALTURA = 38;
let est = null, regs = [], filtrados = [], pendentes = [];

export async function render(el, { cabecalho, params }) {
  const [ini, fim] = periodo('semestre');
  est = est || { ini, fim, prof: '', turma: '', status: new Set(), tipo: '', busca: '', ord: 'data-desc' };
  if (params.get('prof')) est.prof = params.get('prof');
  if (params.get('turma')) est.turma = params.get('turma');
  el.innerHTML = cabecalho('Painel de aulas', 'Registros de presença, faltas, atrasos e saídas antecipadas.',
      `<button class="btn" id="p-csv">${ico('baixar')} Planilha</button><button class="btn primario" id="p-pdf">${ico('imprimir')} Relatório PDF</button>`) + `
    <div id="p-pend"></div>
    <div class="cartao">
      <div class="barra-filtros" style="margin-bottom:8px">
        <div class="chips" id="p-rapidos">${[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['semestre', 'Semestre'], ['ano', 'Ano']].map(([k, t]) => `<button class="chip" data-p="${k}">${t}</button>`).join('')}</div>
      </div>
      <div class="barra-filtros">
        <label class="campo"><span>De</span><input type="date" id="p-ini" value="${est.ini}"></label>
        <label class="campo"><span>Até</span><input type="date" id="p-fim" value="${est.fim}"></label>
        <label class="campo"><span>Professor</span><select id="p-prof"><option value="">Todos</option>${profsOrdenados({ soAtivos: false }).map((p) => `<option value="${p.id}" ${String(p.id) === String(est.prof) ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
        <label class="campo"><span>Turma</span><select id="p-turma"><option value="">Todas</option>${turmas({ incluirArquivadas: true }).map((t) => `<option ${t === est.turma ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="campo"><span>Tipo</span><select id="p-tipo"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === est.tipo ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1;min-width:180px"><span>Buscar</span><input type="search" id="p-busca" placeholder="disciplina, observação, quem registrou…" value="${esc(est.busca)}"></label>
      </div>
    </div>
    <div class="kpis" id="p-kpis" style="margin-top:14px"></div>
    <div class="tabela-wrap" id="p-tab" style="height:calc(100vh - 360px);min-height:360px"></div>
    <div class="pequeno mudo" id="p-rod" style="margin-top:6px"></div>`;

  $$('#p-rapidos [data-p]').forEach((b) => (b.onclick = () => { [est.ini, est.fim] = periodo(b.dataset.p); $('#p-ini').value = est.ini; $('#p-fim').value = est.fim; carregar(); }));
  $('#p-ini').onchange = (e) => { est.ini = e.target.value; carregar(); };
  $('#p-fim').onchange = (e) => { est.fim = e.target.value; carregar(); };
  $('#p-prof').onchange = (e) => { est.prof = e.target.value; filtrar(); };
  $('#p-turma').onchange = (e) => { est.turma = e.target.value; filtrar(); };
  $('#p-tipo').onchange = (e) => { est.tipo = e.target.value; filtrar(); };
  $('#p-busca').oninput = debounce((e) => { est.busca = e.target.value; filtrar(); }, 200);
  $('#p-csv').onclick = csv;
  $('#p-pdf').onclick = relatorioPdf;
  await carregar();
}
export function aoMudar() { carregar(false); }

async function carregar(avisar = true) {
  const tab = $('#p-tab'); if (!tab) return;
  if (avisar) tab.innerHTML = '<div class="vazio">Carregando registros…</div>';
  try {
    [regs, pendentes] = await Promise.all([
      api('registros_listar', { p_f: { ini: est.ini, fim: est.fim } }, { timeout: 60000 }),
      api('exclusoes_listar')
    ]);
  } catch (e) { tab.innerHTML = `<div class="caixa erro-caixa">${esc(e.message)}</div>`; return; }
  desenharPendentes();
  filtrar();
}

function desenharPendentes() {
  const box = $('#p-pend'); if (!box) return;
  if (!pendentes.length) { box.innerHTML = ''; return; }
  const admin = pode('admin');
  box.innerHTML = `<div class="cartao" style="border-color:#f0b35a;background:#fffaf0;margin-bottom:14px">
    <h2>${ico('alerta')} Pedidos de exclusão (${pendentes.length})</h2>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Registro</th><th>Pedido por</th><th>Motivo</th><th></th></tr></thead><tbody>
    ${pendentes.map((p) => `<tr><td>${esc(p.registro.prof)} · ${esc(p.registro.disc)} · <span class="mono">${esc(p.registro.turma)}</span> · ${fmtData(p.registro.data)} · <span class="selo ${p.registro.status}">${STATUS[p.registro.status]}</span></td>
      <td>${esc(p.por)}<br><small class="mudo">${new Date(p.em).toLocaleString('pt-BR')}</small></td><td>${esc(p.motivo)}</td>
      <td class="acoes">${admin ? `<button class="btn pequeno perigo" data-apr="${p.registro_id}">Aprovar exclusão</button> <button class="btn pequeno" data-rej="${p.registro_id}">Manter registro</button>` : '<span class="selo ambar">aguardando admin</span>'}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  $$('[data-apr]', box).forEach((b) => (b.onclick = () => decidir(b.dataset.apr, true)));
  $$('[data-rej]', box).forEach((b) => (b.onclick = () => decidir(b.dataset.rej, false)));
}
async function decidir(id, aprovar) {
  try { await api('exclusao_decidir', { p_id: id, p_aprovar: aprovar }); aviso(aprovar ? 'Registro excluído.' : 'Pedido recusado; registro mantido.', 'ok'); atualizarContadorExclusoes(); carregar(false); }
  catch (e) { aviso(e.message, 'erro'); }
}

function filtrar() {
  const q = semAcento(est.busca.trim());
  const base = regs.filter((r) =>
    (!est.prof || String(r.professor_id) === String(est.prof)) &&
    (!est.turma || r.turma === est.turma) &&
    (!est.tipo || r.tipo === est.tipo) &&
    (!q || semAcento(`${r.prof} ${r.disc} ${r.turma} ${r.obs} ${r.por}`).includes(q)));
  const cont = { presente: 0, ausente: 0, atraso: 0, saida: 0, nao: 0 }; let aulasDadasT = 0, aulasFalta = 0;
  for (const r of base) { cont[r.status]++; if (r.status === 'ausente') aulasFalta += r.aulas; else aulasDadasT += r.aulas; }
  filtrados = base.filter((r) => !est.status.size || est.status.has(r.status));
  ordenar();
  const k = $('#p-kpis');
  const card = (s, rot, cls, sub) => `<button class="kpi ${cls} ${est.status.has(s) ? 'ativo' : ''}" data-s="${s}"><span>${rot}</span><b>${cont[s] ?? base.length}</b><small>${sub}</small></button>`;
  k.innerHTML = `<button class="kpi ${!est.status.size ? 'ativo' : ''}" data-s=""><span>Registros</span><b>${base.length}</b><small>${aulasDadasT} aulas dadas</small></button>
    ${card('presente', 'Presenças', 'verde', 'clique para filtrar')}${card('ausente', 'Faltas', 'vermelho', `${aulasFalta} aulas não dadas`)}
    ${card('atraso', 'Atrasos', 'ambar', 'clique para filtrar')}${card('saida', 'Saídas antecipadas', 'laranja', 'clique para filtrar')}${card('nao', 'Não houve', 'cinza', 'com justificativa')}`;
  $$('[data-s]', k).forEach((b) => (b.onclick = () => { const s = b.dataset.s; if (!s) est.status.clear(); else est.status.has(s) ? est.status.delete(s) : est.status.add(s); filtrar(); }));
  desenharTabela();
}

function ordenar() {
  const [campo, dir] = est.ord.split('-'); const m = dir === 'asc' ? 1 : -1;
  const v = { data: (r) => r.data + (r.horario || ''), prof: (r) => r.prof, disc: (r) => r.disc, turma: (r) => r.turma, status: (r) => r.status, aulas: (r) => String(r.aulas).padStart(3, '0') }[campo] || ((r) => r.data);
  filtrados.sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * m || (a.criado_em < b.criado_em ? 1 : -1));
}

function desenharTabela() {
  const tab = $('#p-tab'); if (!tab) return;
  if (!filtrados.length) { tab.innerHTML = '<div class="vazio">Nenhum registro com estes filtros.</div>'; $('#p-rod').textContent = ''; return; }
  const pendIds = new Set(pendentes.map((p) => p.registro_id));
  const th = (c, t) => `<th data-ord="${c}">${t}${est.ord.startsWith(c + '-') ? (est.ord.endsWith('asc') ? ' ▲' : ' ▼') : ''}</th>`;
  tab.innerHTML = `<table class="tabela compacta"><thead><tr>${th('data', 'Data')}<th>Hora</th>${th('prof', 'Professor')}${th('disc', 'Disciplina')}${th('turma', 'Turma')}<th>Tipo</th>${th('aulas', 'Aulas')}${th('status', 'Status')}<th>CH da disciplina</th><th>Obs.</th><th>Por</th><th></th></tr></thead><tbody id="p-corpo"></tbody></table>`;
  $$('th[data-ord]', tab).forEach((t) => (t.onclick = () => { const c = t.dataset.ord; est.ord = est.ord === c + '-desc' ? c + '-asc' : c + '-desc'; ordenar(); desenharTabela(); }));
  const corpo = $('#p-corpo');
  const linha = (r) => {
    const d = disc(r.disciplina_id); const ch = d?.ch_total || r.ch_total;
    return `<tr class="${pendIds.has(r.id) ? 'pendente' : ''}" style="height:${ALTURA}px">
      <td class="mono">${fmtData(r.data)}</td><td class="mono">${esc(r.horario || '')}</td>
      <td>${esc(r.prof)}</td><td class="cortar" title="${esc(r.disc)}">${esc(r.disc)}${!r.disciplina_id ? ' <span class="selo ambar" data-dica="Registro sem disciplina vinculada">?</span>' : ''}</td>
      <td class="mono">${esc(r.turma)}</td><td><span class="selo ${r.tipo}">${TIPOS[r.tipo]}</span></td><td class="num">${r.aulas}</td>
      <td><span class="selo ${r.status}">${STATUS[r.status]}${r.minutos ? ' ' + r.minutos + 'min' : ''}</span>${r.status === 'nao' && r.justificativa ? `<br><small class="mudo">${esc(r.justificativa)}</small>` : ''}</td>
      <td>${r.disciplina_id ? barraProg(aulasDadas(r.disciplina_id), ch) : '<span class="mudo">—</span>'}</td>
      <td class="cortar mudo" title="${esc(r.obs)}">${esc(r.obs)}</td>
      <td class="mudo pequeno" data-dica="${r.criado_em ? 'Registrado em ' + new Date(r.criado_em).toLocaleString('pt-BR') : ''}">${esc(r.por)}</td>
      <td class="acoes">${pendIds.has(r.id) ? '<span class="selo ambar">exclusão pedida</span>' : ''}${pode('turno') || pode('registrar') ? `<button class="btn icone fantasma" data-ed="${r.id}" title="Editar">${ico('editar')}</button>` : ''}</td></tr>`;
  };
  // tabela virtual: só as linhas visíveis vão para a tela
  const desenharJanela = () => {
    const topo = tab.scrollTop, alt = tab.clientHeight || 500;
    const ini = Math.max(0, Math.floor(topo / ALTURA) - 15), fim = Math.min(filtrados.length, Math.ceil((topo + alt) / ALTURA) + 15);
    corpo.innerHTML = `<tr style="height:${ini * ALTURA}px"></tr>` + filtrados.slice(ini, fim).map(linha).join('') + `<tr style="height:${(filtrados.length - fim) * ALTURA}px"></tr>`;
    $$('[data-ed]', corpo).forEach((b) => (b.onclick = () => { const r = filtrados.find((x) => x.id === b.dataset.ed); editarRegistro(r, () => carregar(false)); }));
  };
  let agendado = false;
  tab.onscroll = () => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; desenharJanela(); }); };
  desenharJanela();
  const semVinculo = filtrados.filter((r) => !r.disciplina_id).length;
  $('#p-rod').textContent = `${filtrados.length} registro(s) no filtro${semVinculo ? ` · ${semVinculo} sem disciplina vinculada (registros antigos)` : ''}.`;
}

function csv() {
  baixarCsv(`supert_registros_${est.ini}_${est.fim}`, ['Data', 'Horário', 'Professor', 'Disciplina', 'Turma', 'Diário', 'Tipo', 'Aulas', 'Status', 'Justificativa', 'Minutos', 'Observação', 'Registrado por', 'Registrado em'],
    filtrados.map((r) => [fmtData(r.data), r.horario || '', r.prof, r.disc, r.turma, r.diario_id || '', TIPOS[r.tipo], r.aulas, STATUS[r.status], r.justificativa || '', r.minutos || '', r.obs, r.por, r.criado_em ? new Date(r.criado_em).toLocaleString('pt-BR') : '']));
}

function relatorioPdf() {
  if (!filtrados.length) return aviso('Nenhum registro no filtro para gerar o relatório.', 'erro');
  const recs = [...filtrados].sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || ''));
  const profNome = est.prof ? (D.profs.get(Number(est.prof))?.nome_completo || D.profs.get(Number(est.prof))?.nome) : 'Todos os professores';
  const c = { presente: 0, ausente: 0, atraso: 0, saida: 0, nao: 0 }; let dadas = 0;
  recs.forEach((r) => { c[r.status]++; if (r.status !== 'ausente') dadas += r.aulas; });
  const porDisc = new Map();
  for (const r of recs) {
    const k = r.disciplina_id || ('x' + r.disc + r.turma);
    if (!porDisc.has(k)) porDisc.set(k, { r, reg: 0, falta: 0 });
    const g = porDisc.get(k); if (r.status === 'ausente') g.falta += r.aulas; else g.reg += r.aulas;
  }
  const linhasDisc = [...porDisc.values()].sort((a, b) => ordTurma(a.r.turma, b.r.turma)).map(({ r, reg, falta }) => {
    const d = disc(r.disciplina_id); const ch = d?.ch_total || r.ch_total; const total = r.disciplina_id ? aulasDadas(r.disciplina_id) : reg;
    return `<tr><td>${esc(d?.nome || r.disc)}</td><td>${esc(r.turma)}</td><td class="c">${d?.diario_id || r.diario_id || '—'}</td><td class="c">${ch || '—'}</td><td class="c">${reg}</td><td class="c">${falta}</td><td class="c"><b>${total}</b></td><td class="c">${ch ? Math.round(total / ch * 100) + '%' : '—'}</td></tr>`;
  }).join('');
  const cor = { presente: '#1b5e20', ausente: '#c62828', atraso: '#8a5a00', saida: '#bf360c', nao: '#5f6b67' };
  const linhas = recs.map((r) => `<tr><td>${fmtData(r.data)}</td><td>${esc(r.horario || '')}</td><td>${esc(r.prof)}</td><td>${TIPOS[r.tipo]}</td><td>${esc(r.disc)}</td><td>${esc(r.turma)}</td><td class="c">${r.aulas}</td><td style="color:${cor[r.status]};font-weight:700">${STATUS[r.status]}${r.minutos ? ' ' + r.minutos + 'min' : ''}${r.status === 'nao' && r.justificativa ? ' · ' + esc(r.justificativa) : ''}</td><td>${esc(r.obs)}</td></tr>`).join('');
  imprimirDoc(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório SUPERT</title><style>
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#1a1a1a;margin:0}
    .top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1b5e20;padding-bottom:8px;margin-bottom:8px}.top img{height:56px}
    h1{font-size:15pt;margin:0;color:#1b5e20}h2{font-size:10.5pt;color:#1b5e20;border-bottom:1.5px solid #1b5e20;margin:12px 0 4px;padding-bottom:2px}
    .meta{color:#555;font-size:8.5pt}.kp{display:flex;gap:8px;margin:6px 0}.kp div{border:1px solid #a8d5b5;background:#f0f7f2;border-radius:5px;padding:5px 10px;text-align:center}
    .kp b{display:block;font-size:13pt}table{width:100%;border-collapse:collapse;font-size:8pt}th{background:#1b5e20;color:#fff;text-align:left;padding:4px 5px}
    td{padding:3px 5px;border-bottom:1px solid #e3e3e3;vertical-align:top}tr:nth-child(even) td{background:#f8faf8}.c{text-align:center}
    .rod{margin-top:14px;border-top:1px solid #ccc;padding-top:6px;color:#888;font-size:7.5pt;text-align:center}@page{size:A4 landscape;margin:10mm}</style></head><body>
    <div class="top"><img src="${location.origin + location.pathname.replace(/[^/]*$/, '')}assets/logo-ifma.png"><div><h1>Relatório de aulas · SUPERT</h1>
    <div class="meta">IFMA Campus Imperatriz · ${esc(profNome)}${est.turma ? ' · turma ' + esc(est.turma) : ''} · período ${fmtData(est.ini)} a ${fmtData(est.fim)} · gerado em ${new Date().toLocaleString('pt-BR')}</div></div></div>
    <div class="kp"><div><b>${recs.length}</b>registros</div><div><b style="color:#1b5e20">${c.presente}</b>presenças</div><div><b style="color:#c62828">${c.ausente}</b>faltas</div>
    <div><b style="color:#8a5a00">${c.atraso}</b>atrasos</div><div><b style="color:#bf360c">${c.saida}</b>saídas antecipadas</div><div><b>${dadas}</b>aulas dadas</div></div>
    <h2>Resumo por disciplina</h2><table><thead><tr><th>Disciplina</th><th>Turma</th><th>Diário</th><th>CH</th><th>Aulas no período</th><th>Faltas no período</th><th>Total dado</th><th>% CH</th></tr></thead><tbody>${linhasDisc}</tbody></table>
    <h2>Registros</h2><table><thead><tr><th>Data</th><th>Hora</th><th>Professor</th><th>Tipo</th><th>Disciplina</th><th>Turma</th><th>Aulas</th><th>Status</th><th>Obs.</th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="rod">SUPERT · Supervisão de aulas · IFMA Campus Imperatriz · ${hojeISO().split('-').reverse().join('/')}</div></body></html>`);
}
