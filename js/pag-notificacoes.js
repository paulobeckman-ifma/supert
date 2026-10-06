// Notificações: ausência docente e atraso de diários (documento para imprimir ou salvar em PDF)
import { $, $$, esc, ico, aviso, modal, periodo, fmtData, imprimirDoc, semAcento } from './util.js';
import { api } from './api.js';
import { D, prof, profsOrdenados, discsDoProf, disc } from './dados.js';

let est = { aba: 'ausencia', prof: '', ini: '', fim: '', arquivadas: false };

export async function render(el, { cabecalho }) {
  el.innerHTML = cabecalho('Notificações', 'Documentos de notificação ao docente, no modelo do DEP/DESTEC.') + `
    <div class="abas"><button data-a="ausencia">Ausências</button><button data-a="diario">Atraso de diários</button></div>
    <div id="n-corpo"></div>`;
  $$('.abas button', el).forEach((b) => (b.onclick = () => { est.aba = b.dataset.a; desenhar(); }));
  desenhar();
}
export function aoMudar() { if (est.aba === 'ausencia') carregarAusencias(); }

function desenhar() {
  $$('.abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.a === est.aba));
  const box = $('#n-corpo');
  const opProf = '<option value="">Todos</option>' + profsOrdenados({ soAtivos: false }).map((p) => `<option value="${p.id}" ${String(p.id) === String(est.prof) ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  if (est.aba === 'ausencia') {
    box.innerHTML = `<div class="barra-filtros">
        <label class="campo"><span>Professor</span><select id="n-prof">${opProf}</select></label>
        <label class="campo"><span>De</span><input type="date" id="n-ini" value="${est.ini}"></label>
        <label class="campo"><span>Até</span><input type="date" id="n-fim" value="${est.fim}"></label>
        <div class="chips">${[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['semestre', 'Semestre']].map(([k, t]) => `<button class="chip" data-p="${k}">${t}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" id="n-arq" ${est.arquivadas ? 'checked' : ''}> Ver arquivadas</label></div>
      <div id="n-lista"><div class="vazio">Carregando…</div></div>`;
    $('#n-prof').onchange = (e) => { est.prof = e.target.value; carregarAusencias(); };
    $('#n-ini').onchange = (e) => { est.ini = e.target.value; carregarAusencias(); };
    $('#n-fim').onchange = (e) => { est.fim = e.target.value; carregarAusencias(); };
    $('#n-arq').onchange = (e) => { est.arquivadas = e.target.checked; carregarAusencias(); };
    $$('[data-p]', box).forEach((b) => (b.onclick = () => { [est.ini, est.fim] = periodo(b.dataset.p); desenhar(); }));
    carregarAusencias();
  } else {
    box.innerHTML = `<div class="cartao"><div class="barra-filtros"><label class="campo" style="min-width:280px"><span>Docente</span><select id="n-dprof"><option value="">Selecione…</option>${profsOrdenados().map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label></div>
      <div id="n-dlista" class="mudo">Escolha o docente e marque os diários em atraso.</div></div>`;
    $('#n-dprof').onchange = (e) => desenharDiarios(Number(e.target.value));
  }
}

async function carregarAusencias() {
  const box = $('#n-lista'); if (!box) return;
  try {
    const regs = await api('registros_listar', { p_f: { ini: est.ini, fim: est.fim, professor_id: est.prof, status: 'ausente', limite: 3000 } });
    const l = regs.filter((r) => !!r.notif_arquivada === est.arquivadas);
    if (!l.length) { box.innerHTML = `<div class="vazio">Nenhuma ausência ${est.arquivadas ? 'arquivada ' : ''}no período.</div>`; return; }
    box.innerHTML = `<div class="linha-flex lote-barra"><span id="n-sel-n" class="mudo pequeno">Marque as linhas para ${est.arquivadas ? 'desarquivar' : 'arquivar'} várias de uma vez.</span><span class="espaco"></span>
        <button class="btn pequeno primario" id="n-lote" disabled>${ico('arquivo')} ${est.arquivadas ? 'Desarquivar' : 'Arquivar'} selecionadas</button></div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th style="width:30px"><input type="checkbox" id="n-todas" title="Selecionar todas"></th><th>Data</th><th>Professor</th><th>Disciplina</th><th>Turma</th><th>Aulas</th><th>Obs.</th><th></th></tr></thead><tbody>
      ${l.map((r) => `<tr><td><input type="checkbox" data-sel="${r.id}"></td><td class="mono">${fmtData(r.data)}</td><td>${esc(r.prof)}</td><td>${esc(r.disc)}</td><td class="mono">${esc(r.turma)}</td><td class="num">${r.aulas}</td><td class="mudo cortar">${esc(r.obs)}</td>
        <td class="acoes"><button class="btn pequeno primario" data-pdf="${r.id}">${ico('imprimir')} Notificação</button>
        <button class="btn pequeno" data-arq="${r.id}" title="${est.arquivadas ? 'Desarquivar' : 'Arquivar (já notificada ou justificada)'}">${ico('arquivo')}</button></td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-pdf]', box).forEach((b) => (b.onclick = () => notifAusencia(l.find((r) => r.id === b.dataset.pdf))));
    const marcados = () => $$('[data-sel]', box).filter((c) => c.checked);
    const atualizar = () => {
      const n = marcados().length; const tot = $$('[data-sel]', box).length;
      $('#n-lote').disabled = !n; $('#n-sel-n').textContent = n ? `${n} de ${tot} selecionada${n > 1 ? 's' : ''}` : `Marque as linhas para ${est.arquivadas ? 'desarquivar' : 'arquivar'} várias de uma vez.`;
      const t = $('#n-todas'); t.checked = n > 0 && n === tot; t.indeterminate = n > 0 && n < tot;
    };
    let ultimo = null;
    $$('[data-sel]', box).forEach((c, i, todos) => (c.onclick = (e) => {
      if (e.shiftKey && ultimo != null) { const [a, b] = [Math.min(ultimo, i), Math.max(ultimo, i)]; for (let k = a; k <= b; k++) todos[k].checked = c.checked; }
      ultimo = i; atualizar();
    }));
    $('#n-todas').onchange = (e) => { $$('[data-sel]', box).forEach((c) => (c.checked = e.target.checked)); atualizar(); };
    $('#n-lote').onclick = async () => {
      const ids = marcados().map((c) => c.dataset.sel); if (!ids.length) return;
      const b = $('#n-lote'); b.disabled = true; let ok = 0;
      try { for (const id of ids) { b.textContent = `${ok + 1} de ${ids.length}…`; await api('registro_arquivar_notif', { p_id: id, p_arquivar: !est.arquivadas }); ok++; } }
      catch (e) { aviso(`${ok} de ${ids.length} concluída(s). ${e.message}`, 'erro'); }
      if (ok === ids.length) aviso(`${ok} notificaç${ok > 1 ? 'ões' : 'ão'} ${est.arquivadas ? 'desarquivada' : 'arquivada'}${ok > 1 ? 's' : ''}.`, 'ok');
      carregarAusencias();
    };
    $$('[data-arq]', box).forEach((b) => (b.onclick = async () => { try { await api('registro_arquivar_notif', { p_id: b.dataset.arq, p_arquivar: !est.arquivadas }); carregarAusencias(); } catch (e) { aviso(e.message, 'erro'); } }));
  } catch (e) { box.innerHTML = `<div class="caixa erro-caixa">${esc(e.message)}</div>`; }
}

const DEPTOS = { DEP: 'Departamento de Educação Profissional', DESTEC: 'Departamento de Ensino Superior e Tecnologia (DESTEC)' };
function dadosDocente(profId, titulo, extra = '') {
  const p = prof(profId);
  return modal({
    titulo, corpo: `${extra}<label class="campo"><span>Nome completo do docente</span><input name="nome" value="${esc(p?.nome_completo || p?.nome || '')}"></label>
      <label class="campo"><span>Matrícula SIAPE</span><input name="mat" value="${esc(p?.matricula || '')}"></label>
      <label class="campo"><span>Departamento que assina</span><select name="dep">${Object.entries(DEPTOS).map(([k, v]) => `<option value="${k}" ${/DESTEC/i.test(p?.setor || '') === (k === 'DESTEC') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: `${ico('imprimir')} Gerar documento`, classe: 'primario', acao: (fechar, el) => { fechar({ nome: $('[name=nome]', el).value.trim(), mat: $('[name=mat]', el).value.trim(), dep: DEPTOS[$('[name=dep]', el).value] }); return false; } }]
  }).promessa;
}

async function notifAusencia(r) {
  const dd = await dadosDocente(r.professor_id, 'Notificação de ausência', `<div class="caixa info">${esc(r.prof)} · ${esc(r.disc)} · ${esc(r.turma)} · ${fmtData(r.data)} · ${r.aulas} aula(s)</div>`);
  if (!dd) return;
  const corpo = `
    <p class="no-indent">Prezado docente <strong>${esc(dd.nome || r.prof)}</strong>,</p>
    <p>Compreende-se por "falta" a ausência do servidor à instituição, com ou sem justificativa, de acordo com a Lei 8.112/1990.</p>
    <blockquote>"Art. 44. O servidor perderá:<br>I – A remuneração do dia em que faltar ao serviço, sem motivo justificado;<br>
    II – A parcela de remuneração diária, proporcional aos atrasos, ausências justificadas, ressalvadas as concessões de que trata o art. 97, e saídas antecipadas, salvo na hipótese de compensação de horário, até o mês subsequente ao da ocorrência, a ser estabelecida pela chefia imediata.<br>
    <strong>Parágrafo único. As faltas justificadas decorrentes de caso fortuito ou de força maior poderão ser compensadas a critério da chefia imediata, sendo assim consideradas como efetivo exercício.</strong>"</blockquote>
    <p>Conforme o OFÍCIO CIRCULAR N° 1/2024 - DDE-ITZ/DRG-ITZ/CAMPITZ/IFMA:</p>
    <blockquote>"4. As faltas docentes decorrentes de caso fortuito ou força maior <strong>devem ser justificadas com a maior antecedência possível</strong>, devendo o docente comunicar por e-mail diretamente à chefia do setor. No ato da justificativa, o docente deverá informar quando irá repor as aulas, o que deverá ocorrer até o mês subsequente à ausência;<br><br>
    5. A chefia imediata deverá notificar o docente por e-mail para que se manifeste sobre a falta não justificada, atraso ou saída antecipada, e <strong>apresente sua justificativa e plano de reposição de aulas no prazo de 02 dias úteis</strong>;<br>(...)<br>
    7. Caso o docente, após notificado, não apresente a justificativa e plano de reposição de aulas no prazo determinado, o registro das faltas injustificadas será encaminhado ao DGP para as providências cabíveis."</blockquote>
    <p><strong>Considerando que foi verificado pela chefia imediata a ausência do docente nos horários em destaque abaixo:</strong></p>
    <table><tr><th>Turma</th><th>Disciplina</th><th>ID Diário</th><th>Data</th><th>Aulas</th></tr>
    <tr><td><b>${esc(r.turma)}</b></td><td>${esc(r.disc)}</td><td style="text-align:center">${r.diario_id || '—'}</td><td style="text-align:center">${fmtData(r.data)}</td><td style="text-align:center">${r.aulas}</td></tr></table>
    ${r.obs ? `<p class="no-indent" style="font-size:.9em">Observação: ${esc(r.obs)}</p>` : ''}
    <p><strong>Viemos por meio desta notificação informar as ausências acima e solicitar regularização, com justificativa e plano de reposição de aulas em até 02 dias corridos a partir da data da notificação.</strong></p>`;
  imprimirDoc(documento(corpo, dd.dep));
}

function desenharDiarios(profId) {
  const box = $('#n-dlista');
  if (!profId) { box.innerHTML = 'Escolha o docente e marque os diários em atraso.'; return; }
  const ds = discsDoProf(profId).filter((d) => d.diario_id);
  if (!ds.length) { box.innerHTML = '<div class="vazio">Este docente não tem diários do SUAP vinculados.</div>'; return; }
  box.innerHTML = `<div style="display:grid;gap:6px">${ds.map((d) => `<label class="check" style="border:1px solid var(--linha);border-radius:8px;padding:8px 10px;background:#fff"><input type="checkbox" value="${d.id}">
      <span><b>${esc(d.nome)}</b> · <span class="mono">${esc(d.turma)}</span> <span class="mudo">· diário ${d.diario_id} · ${d.ch_total || '—'} aulas</span></span></label>`).join('')}</div>
    <div class="linha-flex fim" style="margin-top:10px"><button class="btn primario" id="n-gerar">${ico('imprimir')} Gerar notificação</button></div>`;
  $('#n-gerar').onclick = async () => {
    const sel = $$('input[type=checkbox]:checked', box).map((c) => disc(c.value));
    if (!sel.length) return aviso('Marque ao menos um diário.', 'erro');
    const dd = await dadosDocente(profId, 'Notificação de atraso de diários'); if (!dd) return;
    const corpo = `
      <p class="no-indent">Prezado (a) <strong>${esc(dd.nome)}</strong></p>
      <p>Em conformidade com a RESOLUÇÃO N° 159/2022 que dispõe sobre a Normatização dos procedimentos operacionais para o preenchimento, acompanhamento e prazos para registro e entrega dos Diários de Classe nos Cursos Técnicos e de Graduação no âmbito do IFMA, e;</p>
      <p>Considerando que o diário de classe é um documento institucional que é inerente às atribuições do docente.</p>
      <p>Vimos por meio desta notificação informar o atraso dos registros no referido diário e solicitamos a regularização em até <strong>3 dias corridos</strong> a contar da data desta notificação.</p>
      <p>Os diários que são de sua responsabilidade e que se encontram em atraso são:</p>
      <p><strong>Docente: ${esc(dd.nome)} - Matrícula ${esc(dd.mat || 'XXXXXXX')}</strong></p>
      <table><tr><th>Turma</th><th>Disciplina</th><th>ID do Diário</th></tr>${sel.map((d) => `<tr><td><b>${esc(d.turma)}</b></td><td>${esc(d.nome)}</td><td style="text-align:center">${d.diario_id}</td></tr>`).join('')}</table>`;
    imprimirDoc(documento(corpo, dd.dep));
  };
}

function documento(corpo, depto) {
  const logo = location.origin + location.pathname.replace(/[^/]*$/, '') + 'assets/logo-ifma.png';
  const hoje = new Date().toLocaleDateString('pt-BR');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Notificação</title><style>
    @page{margin:2.5cm 3cm;size:A4}*{color:#111;box-sizing:border-box}
    body{font-family:'Times New Roman',serif;font-size:11pt;line-height:1.5;max-width:680px;margin:0 auto}
    p{margin:.6em 0;text-align:justify;text-indent:1.5em}p.no-indent{text-indent:0}
    .cab{text-align:center;margin-bottom:1.4em}.cab img{height:90px;display:block;margin:0 auto .4em}.cab b{display:block}
    h2{text-align:center;font-size:1em;text-decoration:underline;letter-spacing:.12em;margin:1.4em 0 1.1em}
    blockquote{margin:.6em 2.5em;font-size:.95em;line-height:1.45}table{width:100%;border-collapse:collapse;margin:.8em 0;font-size:.9em}
    td,th{border:1px solid #888;padding:.35em .6em}th{background:#f2f2f2;text-align:left}
    .data{margin-top:2.6em;text-align:right}.ass{margin-top:2.4em;text-align:center;line-height:1.9}
    .rod{margin-top:3em;font-size:.78em;border-top:1px solid #555;padding-top:.5em}</style></head><body>
    <div class="cab"><img src="${logo}" alt="IFMA"><b>CAMPUS IMPERATRIZ</b><span>Dpto. de Educação Profissional - Campus Imperatriz - DEP-ITZ</span></div>
    <h2>NOTIFICAÇÃO</h2>${corpo}
    <p>Certos de contar com o seu empenho no atendimento desta notificação, colocamo-nos à disposição para sanar dúvidas sobre o tema em questão.</p>
    <div class="data">Imperatriz/MA, ${hoje}</div>
    <div class="ass">${depto}<br><br>Instituto Federal do Maranhão - IFMA</div>
    <div class="rod">Endereço: Av. Newton Bello, S/N, Vila Maria, IMPERATRIZ / MA, CEP 65919-050 · Fone: (99) 3525-4745 · Site: www.ifma.edu.br</div></body></html>`;
}
export { semAcento, D };
