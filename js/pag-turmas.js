// Turmas e diários: disciplinas de cada turma, progresso da CH, troca de professor,
// apelidos (nomes diferentes da mesma disciplina) e unificação de duplicadas.
import { $, $$, esc, ico, aviso, confirmar, modal, semAcento, barraProg, simNome, fmtData, DIAS, DIAS_CURTO, ordTurma, hojeISO, tipoTurma } from './util.js';
import { api, pode } from './api.js';
import { D, disc, prof, nomeProf, turmas, discsDaTurma, profsAtuais, aulasDadas, horariosDe, profsOrdenados, carregarCadastro } from './dados.js';

let est = { busca: '', arquivadas: false, aberta: null };

export async function render(el, { cabecalho, params }) {
  if (params.get('turma')) est.aberta = params.get('turma');
  const editar = pode('editar_turmas');
  el.innerHTML = cabecalho('Turmas e diários', 'Disciplinas por turma, professores, diário do SUAP e andamento da carga horária.',
    editar ? `<button class="btn" id="tm-dup">${ico('unir')} Possíveis duplicadas</button><button class="btn primario" id="tm-nova">${ico('mais')} Nova disciplina</button>` : '') + `
    <div class="barra-filtros">
      <label class="campo" style="flex:1;max-width:360px"><span>Buscar turma, disciplina ou professor</span><input type="search" id="tm-busca" value="${esc(est.busca)}" placeholder="Ex.: 311-I, Matemática, ANTONIO…"></label>
      <label class="check"><input type="checkbox" id="tm-arq" ${est.arquivadas ? 'checked' : ''}> Mostrar arquivadas</label>
    </div>
    <div id="tm-grade"></div>`;
  $('#tm-busca').oninput = (e) => { est.busca = e.target.value; desenhar(); };
  $('#tm-arq').onchange = (e) => { est.arquivadas = e.target.checked; desenhar(); };
  if (editar) { $('#tm-nova').onclick = () => editarDisciplina(null, est.aberta); $('#tm-dup').onclick = duplicadas; }
  desenhar();
  if (est.aberta) abrirTurma(est.aberta);
}
export function aoMudar() { desenhar(); }

function desenhar() {
  const box = $('#tm-grade'); if (!box) return;
  const q = semAcento(est.busca.trim());
  const lista = turmas({ incluirArquivadas: est.arquivadas }).filter((t) => {
    if (!q) return true;
    if (semAcento(t).includes(q)) return true;
    return discsDaTurma(t, { incluirArquivadas: est.arquivadas }).some((d) => semAcento(d.nome + ' ' + profsAtuais(d).map(nomeProf).join(' ')).includes(q));
  });
  if (!lista.length) { box.innerHTML = '<div class="vazio">Nenhuma turma encontrada.</div>'; return; }
  box.innerHTML = `<div class="grade-turmas">${lista.map((t) => {
    const ds = discsDaTurma(t, { incluirArquivadas: est.arquivadas });
    let feito = 0, total = 0; ds.forEach((d) => { if (d.ch_total) { total += d.ch_total; feito += Math.min(aulasDadas(d.id), d.ch_total); } });
    const semProf = ds.filter((d) => !d.arquivada_em && !profsAtuais(d).length).length;
    return `<button class="cartao-turma" data-t="${esc(t)}"><div class="linha-flex"><span class="cod">${esc(t)}</span><span class="espaco"></span><span class="selo">${nomeTipo(t)}</span></div>
      <div class="info">${ds.length} disciplina${ds.length !== 1 ? 's' : ''}${semProf ? ` · <b style="color:var(--vermelho)">${semProf} sem professor</b>` : ''}</div>${barraProg(feito, total)}</button>`;
  }).join('')}</div>`;
  $$('[data-t]', box).forEach((b) => (b.onclick = () => abrirTurma(b.dataset.t)));
}
const nomeTipo = (t) => ({ I: 'Integrado', S: 'Subsequente', C: 'Concomitante', P: 'Proeja', SUP: 'Superior' }[tipoTurma(t)] || 'Turma');

function abrirTurma(turma) {
  est.aberta = turma;
  const m = modal({ titulo: `Turma ${turma}`, largo: true, corpo: '<div id="tm-det"></div>', botoes: [] });
  m.promessa.then(() => { est.aberta = null; });
  const desenharDet = () => {
    const box = $('#tm-det', m.el); if (!box) return;
    const editar = pode('editar_turmas');
    const ds = discsDaTurma(turma, { incluirArquivadas: true });
    const ativas = ds.filter((d) => !d.arquivada_em), arq = ds.filter((d) => d.arquivada_em);
    const linha = (d) => {
      const atuais = profsAtuais(d);
      const antigos = (d.professores || []).filter((v) => v.ate);
      const hs = [...new Set(horariosDe(d.id).map((h) => `${DIAS_CURTO[h.dia]} ${h.hora}`))];
      return `<div class="disc-linha ${d.arquivada_em ? 'arquivada' : ''}">
        <div class="nome"><b>${esc(d.nome)}</b>
          ${(d.apelidos || []).length ? `<small data-dica="Outros nomes reconhecidos como esta disciplina">também: ${d.apelidos.map((a) => esc(a.nome)).join(' · ')}</small>` : ''}
          <small>${hs.join(', ') || 'sem horário'}${d.arquivada_em ? ' · arquivada em ' + fmtData(d.arquivada_em.slice(0, 10)) : ''}</small></div>
        <div class="profs">${atuais.map((p) => `<b>${esc(nomeProf(p))}</b>`).join(', ') || '<span class="selo vermelho">sem professor</span>'}
          ${antigos.length ? `<small class="hist-prof">antes: ${antigos.map((v) => `<s>${esc(nomeProf(v.professor_id))}</s> até ${fmtData(v.ate)}`).join('; ')}</small>` : ''}</div>
        <div class="pequeno">${d.diario_id ? `<a href="https://suap.ifma.edu.br/edu/diario/${d.diario_id}/" target="_blank" rel="noopener">${d.diario_id}</a>` : '<span class="mudo">sem diário</span>'}<br><span class="mudo">${d.ch_total || '—'} aulas</span></div>
        <div>${barraProg(aulasDadas(d.id), d.ch_total)}</div>
        <div class="linha-flex" style="gap:2px;justify-content:flex-end">
          <a class="btn icone fantasma" href="#/painel?turma=${encodeURIComponent(turma)}" title="Ver registros" data-fechar-modal>${ico('lista')}</a>
          ${editar ? `<button class="btn icone fantasma" data-ed="${d.id}" title="Editar">${ico('editar')}</button>
          <button class="btn icone fantasma" data-tr="${d.id}" title="Trocar professor">${ico('trocar')}</button>
          <button class="btn icone fantasma" data-un="${d.id}" title="Unificar com outra disciplina (mesma disciplina com outro nome)">${ico('unir')}</button>
          <button class="btn icone fantasma" data-ar="${d.id}" title="${d.arquivada_em ? 'Desarquivar' : 'Arquivar'}">${ico('arquivo')}</button>` : ''}
        </div></div>`;
    };
    box.innerHTML = `
      ${editar ? `<div class="linha-flex"><button class="btn primario pequeno" data-nova>${ico('mais')} Disciplina nesta turma</button><span class="mudo pequeno">A contagem de aulas é da disciplina (diário), não do professor: trocar o professor não zera nada.</span></div>` : ''}
      <div class="lista-disc">${ativas.map(linha).join('') || '<div class="vazio">Nenhuma disciplina ativa.</div>'}</div>
      ${arq.length ? `<details><summary class="pequeno mudo" style="cursor:pointer">Arquivadas (${arq.length})</summary><div class="lista-disc" style="margin-top:6px">${arq.map(linha).join('')}</div></details>` : ''}`;
    $$('[data-fechar-modal]', box).forEach((a) => (a.onclick = () => m.fechar()));
    const nova = $('[data-nova]', box); if (nova) nova.onclick = () => editarDisciplina(null, turma, desenharDet);
    $$('[data-ed]', box).forEach((b) => (b.onclick = () => editarDisciplina(disc(b.dataset.ed), turma, desenharDet)));
    $$('[data-tr]', box).forEach((b) => (b.onclick = () => trocarProfessor(disc(b.dataset.tr), desenharDet)));
    $$('[data-un]', box).forEach((b) => (b.onclick = () => unificar(disc(b.dataset.un), desenharDet)));
    $$('[data-ar]', box).forEach((b) => (b.onclick = async () => {
      const d = disc(b.dataset.ar); const arquivar = !d.arquivada_em;
      if (arquivar && !await confirmar(`Arquivar "${d.nome}" (${d.turma})?\n\nEla sai do horário e do lançamento do turno, mas os registros e a % de CH continuam guardados.`, { ok: 'Arquivar' })) return;
      try { await api('disciplinas_arquivar', { p_ids: [d.id], p_arquivar: arquivar, p_motivo: arquivar ? 'Arquivada manualmente' : null }); await carregarCadastro(); desenharDet(); desenhar(); }
      catch (e) { aviso(e.message, 'erro'); }
    }));
  };
  desenharDet();
}

// ------------------------------------------------------------------ editar disciplina
function editarDisciplina(d, turmaPadrao, depois) {
  const atuais = d ? profsAtuais(d) : [];
  let hs = d ? horariosDe(d.id).map((h) => ({ professor_id: h.p, dia: h.dia, hora: h.hora })) : [];
  const opProfs = (sel) => '<option value="">Selecione…</option>' + profsOrdenados().map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  const corpo = `
    <div class="grade" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <label class="campo"><span>Turma</span><input type="text" name="turma" list="lista-turmas" value="${esc(d?.turma || turmaPadrao || '')}" placeholder="Ex.: 311-I"></label>
      <label class="campo"><span>Nome da disciplina</span><input type="text" name="nome" value="${esc(d?.nome || '')}"></label>
      <label class="campo"><span>ID do diário no SUAP</span><input type="number" name="diario" value="${esc(d?.diario_id || '')}"></label>
      <label class="campo"><span>Carga horária total (aulas)</span><input type="number" name="ch" value="${esc(d?.ch_total || '')}"></label>
    </div>
    <datalist id="lista-turmas">${turmas({ incluirArquivadas: true }).map((t) => `<option>${esc(t)}</option>`).join('')}</datalist>
    <div><b class="pequeno">Professores atuais</b><div id="ed-profs" class="grade" style="grid-template-columns:1fr;gap:6px;margin-top:4px"></div>
      <button class="btn pequeno" id="ed-mais-prof" style="margin-top:6px">${ico('mais')} Professor (co-docência)</button></div>
    <div><b class="pequeno">Horários</b><div id="ed-hs" class="chips" style="margin:6px 0"></div>
      <div class="linha-flex" style="gap:6px"><select id="ed-dia" style="width:auto">${[1, 2, 3, 4, 5, 6].map((i) => `<option value="${i}">${DIAS[i]}</option>`).join('')}</select>
      <input type="time" id="ed-hora" style="width:auto"><select id="ed-hp" style="width:auto"></select><button class="btn pequeno" id="ed-add-h">Adicionar</button></div></div>
    ${d ? '<small class="mudo">Se mudar o nome, o nome antigo continua valendo como apelido (reconhecido nas próximas importações).</small>' : ''}`;
  modal({
    titulo: d ? `Editar · ${d.nome}` : 'Nova disciplina', corpo, largo: true,
    aoAbrir: (el) => {
      const boxP = $('#ed-profs', el);
      const addP = (sel) => { boxP.insertAdjacentHTML('beforeend', `<div class="linha-flex" style="gap:6px"><select data-p style="flex:1">${opProfs(sel)}</select><button class="btn icone fantasma" data-rm>${ico('x')}</button></div>`); ligarP(); };
      const ligarP = () => { $$('[data-rm]', boxP).forEach((b) => (b.onclick = () => { b.parentElement.remove(); encherHP(); desenharH(); })); $$('[data-p]', boxP).forEach((s) => (s.onchange = () => { encherHP(); desenharH(); })); };
      const profsSel = () => $$('[data-p]', boxP).map((s) => Number(s.value)).filter(Boolean);
      const encherHP = () => { const ps = profsSel(); $('#ed-hp', el).innerHTML = ps.map((p) => `<option value="${p}">${esc(nomeProf(p))}</option>`).join(''); $('#ed-hp', el).classList.toggle('oculto', ps.length < 2); };
      const desenharH = () => {
        const ps = profsSel();
        hs = hs.filter((h) => ps.includes(h.professor_id) || !ps.length);
        $('#ed-hs', el).innerHTML = hs.sort((a, b) => a.dia - b.dia || a.hora.localeCompare(b.hora)).map((h, i) => `<span class="chip">${DIAS_CURTO[h.dia]} ${h.hora}${ps.length > 1 ? ' · ' + esc(nomeProf(h.professor_id)) : ''} <b data-rh="${i}" style="color:var(--vermelho);cursor:pointer">✕</b></span>`).join('') || '<span class="mudo pequeno">Sem horários (a disciplina não aparece no lançamento do turno).</span>';
        $$('[data-rh]', el).forEach((b) => (b.onclick = () => { hs.splice(Number(b.dataset.rh), 1); desenharH(); }));
      };
      (atuais.length ? atuais : [null]).forEach(addP);
      $('#ed-mais-prof', el).onclick = () => addP(null);
      $('#ed-add-h', el).onclick = () => {
        const hora = $('#ed-hora', el).value, dia = Number($('#ed-dia', el).value), p = Number($('#ed-hp', el).value) || profsSel()[0];
        if (!hora || !p) return aviso('Escolha o professor e o horário.', 'erro');
        if (!hs.some((h) => h.dia === dia && h.hora === hora && h.professor_id === p)) hs.push({ professor_id: p, dia, hora });
        desenharH();
      };
      encherHP(); desenharH();
    },
    botoes: [
      ...(d ? [{ texto: 'Remover', classe: 'perigo', acao: async (fechar) => {
        if (!await confirmar(`Remover "${d.nome}" da turma ${d.turma}?${aulasDadas(d.id) ? '\n\nEla tem registros: será arquivada, não apagada.' : ''}`, { ok: 'Remover', perigo: true })) return false;
        await api('disciplina_excluir', { p_id: d.id }); await carregarCadastro(); fechar(true); depois?.(); desenhar(); return false;
      } }] : []),
      { texto: 'Cancelar', valor: null },
      { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
        const v = (n) => $(`[name=${n}]`, el).value.trim();
        const ps = $$('[data-p]', el).map((s) => Number(s.value)).filter(Boolean);
        if (!v('turma') || !v('nome')) { aviso('Preencha turma e nome.', 'erro'); return false; }
        await api('disciplina_salvar', { p_dados: { id: d?.id || null, turma: v('turma'), nome: v('nome'), diario_id: v('diario'), ch_total: v('ch'), professores: [...new Set(ps)], horarios: hs.filter((h) => ps.includes(h.professor_id)) } });
        await carregarCadastro(); aviso('Disciplina salva.', 'ok'); fechar(true); depois?.(); desenhar(); return false;
      } }
    ]
  });
}

// ------------------------------------------------------------------ troca de professor (disciplina anual)
function trocarProfessor(d, depois) {
  const atuais = profsAtuais(d);
  modal({
    titulo: `Trocar professor · ${d.nome} (${d.turma})`,
    corpo: `<div class="caixa info">A disciplina continua a mesma: as ${aulasDadas(d.id)} aulas já registradas${d.ch_total ? ` de ${d.ch_total}` : ''} continuam contando. O professor anterior fica no histórico.</div>
      <div class="grade" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <label class="campo"><span>Sai</span><select name="de">${atuais.map((p) => `<option value="${p}">${esc(nomeProf(p))}</option>`).join('')}<option value="">(nenhum: só acrescentar)</option></select></label>
        <label class="campo"><span>Entra</span><select name="para"><option value="">Selecione…</option>${profsOrdenados().filter((p) => !atuais.includes(p.id)).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
        <label class="campo"><span>A partir de</span><input type="date" name="desde" value="${hojeISO()}"></label>
        <label class="check" style="align-self:end"><input type="checkbox" name="mover" checked> Passar os horários para o novo professor</label>
      </div>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Confirmar troca', classe: 'primario', acao: async (fechar, el) => {
      const para = Number($('[name=para]', el).value); if (!para) { aviso('Escolha quem entra.', 'erro'); return false; }
      await api('disciplina_trocar_professor', { p_disciplina: d.id, p_de: Number($('[name=de]', el).value) || null, p_para: para, p_desde: $('[name=desde]', el).value, p_mover_horarios: $('[name=mover]', el).checked });
      await carregarCadastro(); aviso('Professor trocado. Histórico e contagem mantidos.', 'ok'); fechar(true); depois?.(); desenhar(); return false;
    } }]
  });
}

// ------------------------------------------------------------------ unificar
function unificar(d, depois) {
  const outras = discsDaTurma(d.turma, { incluirArquivadas: true }).filter((x) => x.id !== d.id)
    .map((x) => ({ x, s: simNome(x.nome, d.nome) })).sort((a, b) => b.s - a.s);
  modal({
    titulo: `Unificar · ${d.nome} (${d.turma})`,
    corpo: `<p style="margin:0">Use quando a mesma disciplina aparece duas vezes com nomes diferentes (ex.: um horário novo com outra grafia). Os registros e horários passam para a disciplina escolhida e o outro nome vira apelido.</p>
      <label class="campo"><span>Juntar com</span><select name="alvo">${outras.map(({ x, s }) => `<option value="${x.id}">${esc(x.nome)} · ${Math.round(s * 100)}% parecido · ${aulasDadas(x.id)} aulas${x.arquivada_em ? ' · arquivada' : ''}</option>`).join('')}</select></label>
      <label class="campo"><span>Qual nome fica?</span><select name="fica"><option value="alvo">O da disciplina escolhida acima</option><option value="esta">"${esc(d.nome)}"</option></select></label>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Unificar', classe: 'primario', acao: async (fechar, el) => {
      const alvo = Number($('[name=alvo]', el).value); if (!alvo) return false;
      const [manter, remover] = $('[name=fica]', el).value === 'alvo' ? [alvo, d.id] : [d.id, alvo];
      const r = await api('disciplinas_unificar', { p_manter: manter, p_remover: remover });
      await carregarCadastro(); aviso(`Disciplinas unificadas (${r.registros} registro(s) movidos).`, 'ok'); fechar(true); depois?.(); desenhar(); return false;
    } }]
  });
}

// ------------------------------------------------------------------ detector de duplicadas
function duplicadas() {
  const pares = [];
  for (const t of turmas({ incluirArquivadas: true })) {
    const ds = discsDaTurma(t, { incluirArquivadas: true });
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i], b = ds[j];
      let s = simNome(a.nome, b.nome);
      if (a.diario_id && a.diario_id === b.diario_id) s = Math.max(s, 0.99);
      if (s >= 0.6) pares.push({ a, b, s });
    }
  }
  pares.sort((x, y) => y.s - x.s);
  const m = modal({
    titulo: 'Possíveis disciplinas duplicadas', largo: true,
    corpo: pares.length ? `<p style="margin:0" class="pequeno mudo">Pares da mesma turma com nomes parecidos ou o mesmo diário do SUAP. Confira e unifique os que forem a mesma disciplina.</p>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Turma</th><th>Disciplina A</th><th>Disciplina B</th><th>Semelhança</th><th></th></tr></thead><tbody>
      ${pares.map((p, i) => `<tr><td class="mono">${esc(p.a.turma)}</td>
        <td>${esc(p.a.nome)}<br><small class="mudo">${aulasDadas(p.a.id)} aulas · ${profsAtuais(p.a).map(nomeProf).join(', ') || '—'}${p.a.arquivada_em ? ' · arquivada' : ''}</small></td>
        <td>${esc(p.b.nome)}<br><small class="mudo">${aulasDadas(p.b.id)} aulas · ${profsAtuais(p.b).map(nomeProf).join(', ') || '—'}${p.b.arquivada_em ? ' · arquivada' : ''}</small></td>
        <td class="num">${p.a.diario_id && p.a.diario_id === p.b.diario_id ? 'mesmo diário' : Math.round(p.s * 100) + '%'}</td>
        <td class="acoes"><button class="btn pequeno" data-u="${i}" data-m="a">Manter A</button> <button class="btn pequeno" data-u="${i}" data-m="b">Manter B</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma duplicada provável encontrada.</div>',
    botoes: []
  });
  $$('[data-u]', m.el).forEach((b) => (b.onclick = async () => {
    const p = pares[Number(b.dataset.u)];
    const [manter, remover] = b.dataset.m === 'a' ? [p.a, p.b] : [p.b, p.a];
    if (!await confirmar(`Unificar "${remover.nome}" em "${manter.nome}" (${manter.turma})?`, { ok: 'Unificar' })) return;
    try { const r = await api('disciplinas_unificar', { p_manter: manter.id, p_remover: remover.id }); await carregarCadastro(); aviso(`Unificadas (${r.registros} registros movidos).`, 'ok'); b.closest('tr').remove(); desenhar(); }
    catch (e) { aviso(e.message, 'erro'); }
  }));
}
export { ordTurma, prof };
