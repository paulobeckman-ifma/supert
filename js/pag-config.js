// Configurações (admin): usuários, professores, fechar semestre, histórico, backup, migração e ajustes
import { $, $$, esc, ico, aviso, confirmar, modal, semAcento, fmtDataHora, baixarArquivo, carregarScript, barraProg, ehSemestral, tipoTurma, ordTurma, hojeISO, CFG } from './util.js';
import { api, sessao } from './api.js';
import { D, carregarCadastro, profsOrdenados, profsAtuais, nomeProf, aulasDadas, discsDoProf, turnosOrdenados } from './dados.js';
import { transformar } from './migracao.js';

const ABAS = { usuarios: 'Usuários', professores: 'Professores', semestre: 'Fechar semestre', log: 'Histórico (log)', backup: 'Backup', migracao: 'Migrar do sistema antigo', ajustes: 'Ajustes' };
const PERMS = { turno: 'Lançar turno', registrar: 'Registro avulso', painel: 'Painel', turmas: 'Turmas', recursos: 'Recursos', recursos_gerir: 'Cadastrar recursos', notificacoes: 'Notificações' };
let aba = 'usuarios';

export async function render(el, { cabecalho, params }) {
  if (params.get('aba')) aba = params.get('aba');
  el.innerHTML = cabecalho('Configurações') + `<div class="abas">${Object.entries(ABAS).map(([k, v]) => `<button data-a="${k}">${v}</button>`).join('')}</div><div id="cf-corpo"></div>`;
  $$('.abas button', el).forEach((b) => (b.onclick = () => { aba = b.dataset.a; desenhar(); }));
  desenhar();
}
export function aoMudar() { if (aba === 'professores' || aba === 'semestre') desenhar(); }

function desenhar() {
  $$('.abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.a === aba));
  const box = $('#cf-corpo'); box.innerHTML = '<div class="vazio">Carregando…</div>';
  ({ usuarios, professores, semestre, log, backup, migracao, ajustes })[aba](box);
}

// ------------------------------------------------------------------ usuários
async function usuarios(box) {
  let l;
  try { l = await api('usuarios_listar'); } catch (e) { box.innerHTML = `<div class="caixa erro-caixa">${esc(e.message)}</div>`; return; }
  box.innerHTML = `<div class="linha-flex" style="margin-bottom:10px"><span class="mudo pequeno">Usuário novo entra com senha provisória igual ao login e troca no primeiro acesso.</span><span class="espaco"></span><button class="btn primario" id="u-novo">${ico('mais')} Novo usuário</button></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Login</th><th>Nome</th><th>Perfil</th><th>Acesso</th><th>Situação</th><th></th></tr></thead><tbody>
    ${l.map((u) => `<tr><td class="mono">${esc(u.login)}</td><td>${esc(u.nome)}</td><td><span class="selo ${u.perfil === 'admin' ? 'escuro' : ''}">${esc(u.perfil)}</span></td>
      <td class="pequeno">${u.perfil === 'admin' ? 'tudo' : u.perfil === 'consulta' ? 'somente leitura' : (u.permissoes || []).map((p) => PERMS[p] || p).join(', ')}</td>
      <td>${u.ativo ? (u.deve_trocar_senha ? '<span class="selo ambar">senha provisória</span>' : '<span class="selo verde">ativo</span>') : '<span class="selo">desativado</span>'}</td>
      <td class="acoes"><button class="btn pequeno" data-e="${u.id}">${ico('editar')} Editar</button> <button class="btn pequeno" data-r="${u.id}">Nova senha</button></td></tr>`).join('')}</tbody></table></div>
    <div class="caixa info" style="margin-top:12px"><b>Perfis:</b> <b>admin</b> faz tudo · <b>editor</b> também edita turmas, disciplinas e professores · <b>usuário</b> acessa o que estiver marcado · <b>consulta</b> só vê painel e turmas (nutricionista de dados: direção, coordenações).</div>`;
  const form = (u) => modal({
    titulo: u ? `Usuário ${u.login}` : 'Novo usuário',
    corpo: `<div class="grade"><label class="campo"><span>Login</span><input name="login" value="${esc(u?.login || '')}" autocapitalize="off"></label><label class="campo"><span>Nome</span><input name="nome" value="${esc(u?.nome || '')}"></label>
      <label class="campo"><span>Perfil</span><select name="perfil">${['usuario', 'editor', 'consulta', 'admin'].map((p) => `<option ${u?.perfil === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      ${u ? `<label class="check" style="align-self:end"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Ativo</label>` : ''}</div>
      <div><b class="pequeno">Acesso (perfis usuário e editor)</b><div class="grade" style="margin-top:6px">${Object.entries(PERMS).map(([k, v]) => `<label class="check"><input type="checkbox" name="perm" value="${k}" ${(u ? u.permissoes : ['turno', 'registrar', 'painel', 'turmas']).includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div></div>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
      const d = { id: u?.id || null, login: $('[name=login]', el).value, nome: $('[name=nome]', el).value, perfil: $('[name=perfil]', el).value, ativo: u ? $('[name=ativo]', el).checked : true, permissoes: $$('[name=perm]:checked', el).map((c) => c.value) };
      await api('usuario_salvar', { p_dados: d }); aviso(u ? 'Usuário salvo.' : `Usuário criado. Senha provisória: ${d.login.toLowerCase()}`, 'ok'); fechar(true); usuarios(box); return false;
    } }]
  });
  $('#u-novo').onclick = () => form(null);
  $$('[data-e]', box).forEach((b) => (b.onclick = () => form(l.find((u) => String(u.id) === b.dataset.e))));
  $$('[data-r]', box).forEach((b) => (b.onclick = async () => {
    const u = l.find((x) => String(x.id) === b.dataset.r);
    if (!await confirmar(`Gerar uma senha provisória para ${u.login}? A senha atual deixa de funcionar.`, { ok: 'Gerar' })) return;
    try { const r = await api('usuario_resetar_senha', { p_id: u.id }); modal({ titulo: 'Senha provisória', corpo: `<p>Entregue ao usuário <b>${esc(r.login)}</b>:</p><div class="caixa ok-caixa mono" style="font-size:22px;text-align:center">${esc(r.senha)}</div><p class="mudo pequeno">Ele será obrigado a trocar no primeiro acesso.</p>`, botoes: [{ texto: 'Fechar', classe: 'primario' }] }); usuarios(box); }
    catch (e) { aviso(e.message, 'erro'); }
  }));
}

// ------------------------------------------------------------------ professores
function professores(box) {
  let q = '';
  const desenharP = () => {
    const l = profsOrdenados({ soAtivos: false }).filter((p) => !q || semAcento(`${p.nome} ${p.nome_completo} ${p.matricula}`).includes(semAcento(q)));
    $('#pf-lista', box).innerHTML = `<table class="tabela"><thead><tr><th>Nome no horário</th><th>Nome completo</th><th>Matrícula</th><th>Setor</th><th>Disciplinas</th><th></th></tr></thead><tbody>
      ${l.map((p) => `<tr class="${p.ativo ? '' : 'mudo'}"><td><b>${esc(p.nome)}</b>${p.ativo ? '' : ' <span class="selo">inativo</span>'}</td><td>${esc(p.nome_completo) || '<span class="selo ambar">preencher</span>'}</td><td class="mono">${esc(p.matricula)}</td><td>${esc(p.setor)}</td>
        <td class="num">${discsDoProf(p.id).length}</td><td class="acoes"><button class="btn icone fantasma" data-e="${p.id}">${ico('editar')}</button><button class="btn icone fantasma" data-x="${p.id}">${ico('lixo')}</button></td></tr>`).join('')}</tbody></table>`;
    $$('[data-e]', box).forEach((b) => (b.onclick = () => form(D.profs.get(Number(b.dataset.e)))));
    $$('[data-x]', box).forEach((b) => (b.onclick = async () => {
      const p = D.profs.get(Number(b.dataset.x));
      if (!await confirmar(`Remover ${p.nome}? Se tiver registros, ele só é desativado (o histórico fica).`, { ok: 'Remover', perigo: true })) return;
      try { await api('professor_excluir', { p_id: p.id }); await carregarCadastro(); desenharP(); } catch (e) { aviso(e.message, 'erro'); }
    }));
  };
  const form = (p) => modal({
    titulo: p ? `Professor ${p.nome}` : 'Novo professor',
    corpo: `<label class="campo"><span>Nome abreviado (como aparece no horário)</span><input name="nome" value="${esc(p?.nome || '')}" style="text-transform:uppercase"></label>
      <label class="campo"><span>Nome completo</span><input name="nc" value="${esc(p?.nome_completo || '')}"></label>
      <div class="grade"><label class="campo"><span>Matrícula SIAPE</span><input name="mat" value="${esc(p?.matricula || '')}"></label><label class="campo"><span>Setor</span><input name="setor" value="${esc(p?.setor || '')}" placeholder="DEP-ITZ / DESTEC-ITZ"></label></div>
      ${p ? `<label class="check"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Ativo</label>` : ''}`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
      await api('professor_salvar', { p_dados: { id: p?.id || null, nome: $('[name=nome]', el).value, nome_completo: $('[name=nc]', el).value, matricula: $('[name=mat]', el).value, setor: $('[name=setor]', el).value, ativo: p ? $('[name=ativo]', el).checked : true } });
      await carregarCadastro(); fechar(true); desenharP(); return false;
    } }]
  });
  box.innerHTML = `<div class="linha-flex" style="margin-bottom:10px"><input type="search" id="pf-q" placeholder="Buscar professor…" style="max-width:300px"><span class="espaco"></span><button class="btn primario" id="pf-novo">${ico('mais')} Novo professor</button></div><div class="tabela-wrap" id="pf-lista" style="max-height:70vh"></div>`;
  $('#pf-q').oninput = (e) => { q = e.target.value; desenharP(); };
  $('#pf-novo').onclick = () => form(null);
  desenharP();
}

// ------------------------------------------------------------------ fechar semestre
function semestre(box) {
  let filtro = null, q = '';
  const lista = () => [...D.discs.values()].filter((d) => !d.arquivada_em).map((d) => {
    const feito = aulasDadas(d.id); const pct = d.ch_total ? Math.round(feito / d.ch_total * 100) : null;
    return { d, feito, pct, faixa: pct == null ? 'sem' : pct >= 100 ? 'completa' : pct >= 70 ? 'alta' : pct >= 40 ? 'media' : 'baixa', sem: ehSemestral(d.turma, d.ch_total) };
  });
  const desenharS = () => {
    const todas = lista(); const cont = {}; todas.forEach((x) => (cont[x.faixa] = (cont[x.faixa] || 0) + 1));
    const l = todas.filter((x) => (!filtro || (filtro === 'semestrais' ? x.sem : x.faixa === filtro)) && (!q || semAcento(`${x.d.nome} ${x.d.turma} ${profsAtuais(x.d).map(nomeProf).join(' ')}`).includes(semAcento(q))))
      .sort((a, b) => ordTurma(a.d.turma, b.d.turma) || a.d.nome.localeCompare(b.d.nome));
    box.innerHTML = `<div class="caixa info">Arquivar tira a disciplina do horário e do lançamento do turno, <b>sem apagar registros</b> (a % de CH continua nos relatórios). Disciplinas anuais que trocam de professor <b>não precisam</b> ser arquivadas: use "Trocar professor" em Turmas ou importe o novo horário.</div>
      <div class="linha-flex" style="margin:12px 0"><div class="chips">${[[null, 'Todas', todas.length], ['semestrais', 'Semestrais', todas.filter((x) => x.sem).length], ['completa', '100% ou mais', cont.completa || 0], ['alta', '70 a 99%', cont.alta || 0], ['media', '40 a 69%', cont.media || 0], ['baixa', 'Menos de 40%', cont.baixa || 0], ['sem', 'Sem CH', cont.sem || 0]].map(([k, t, n]) => `<button class="chip ${filtro === k ? 'ativo' : ''}" data-f="${k ?? ''}">${t} <small>${n}</small></button>`).join('')}</div>
        <input type="search" id="sm-q" placeholder="Buscar…" value="${esc(q)}" style="max-width:220px"><span class="espaco"></span><button class="btn primario" id="sm-arq">${ico('arquivo')} Arquivar as ${l.length} listadas</button></div>
      <div class="tabela-wrap" style="max-height:62vh"><table class="tabela"><thead><tr><th><input type="checkbox" id="sm-todas" checked></th><th>Turma</th><th>Disciplina</th><th>Professor</th><th>Tipo</th><th>Andamento</th></tr></thead><tbody>
      ${l.map((x) => `<tr><td><input type="checkbox" data-id="${x.d.id}" checked></td><td class="mono">${esc(x.d.turma)}</td><td>${esc(x.d.nome)}</td><td>${profsAtuais(x.d).map(nomeProf).join(', ')}</td><td class="pequeno">${x.sem ? 'semestral' : 'anual'}</td><td>${barraProg(x.feito, x.d.ch_total)}</td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-f]', box).forEach((b) => (b.onclick = () => { filtro = b.dataset.f || null; desenharS(); }));
    $('#sm-q').oninput = (e) => { q = e.target.value; const p = e.target.selectionStart; desenharS(); const i = $('#sm-q'); i.focus(); i.setSelectionRange(p, p); };
    $('#sm-todas').onchange = (e) => $$('[data-id]', box).forEach((c) => (c.checked = e.target.checked));
    const atual = () => $$('[data-id]:checked', box).map((c) => Number(c.dataset.id));
    const bt = $('#sm-arq'); const upd = () => { bt.textContent = `Arquivar ${atual().length} selecionada(s)`; }; $$('[data-id]', box).forEach((c) => (c.onchange = upd)); upd();
    bt.onclick = async () => {
      const ids = atual(); if (!ids.length) return;
      if (!await confirmar(`Arquivar ${ids.length} disciplina(s)? Os registros continuam guardados e cada uma pode ser desarquivada em Turmas.`, { ok: 'Arquivar' })) return;
      try { const n = await api('disciplinas_arquivar', { p_ids: ids, p_arquivar: true, p_motivo: `Fechamento de semestre em ${hojeISO().split('-').reverse().join('/')}` }); await carregarCadastro(); aviso(`${n} disciplina(s) arquivada(s).`, 'ok'); desenharS(); }
      catch (e) { aviso(e.message, 'erro'); }
    };
  };
  desenharS();
}

// ------------------------------------------------------------------ log
async function log(box) {
  let l, q = '';
  try { l = await api('log_listar', { p_limite: 2000 }); } catch (e) { box.innerHTML = `<div class="caixa erro-caixa">${esc(e.message)}</div>`; return; }
  const ROT = { insert: 'Inserção', delete: 'Exclusão', edit: 'Edição', turno: 'Lançamento do turno', importacao: 'Importação', disciplina: 'Disciplina', professor: 'Professor', usuario: 'Usuário', restore: 'Restauração', migracao: 'Migração', senha: 'Senha', config: 'Configuração' };
  const d = () => {
    const f = l.filter((x) => !q || semAcento(`${x.usuario} ${x.acao} ${x.detalhe}`).includes(semAcento(q)));
    $('#lg-lista', box).innerHTML = f.slice(0, 800).map((x) => `<div class="log-linha"><span class="quando">${fmtDataHora(x.em)}</span><span class="selo ${x.acao === 'delete' ? 'vermelho' : x.acao === 'insert' || x.acao === 'turno' ? 'verde' : ''}">${esc(ROT[x.acao] || x.acao)}</span>
      <span style="flex:1">${esc(x.detalhe)} <span class="mudo">· ${esc(x.usuario)}</span></span>${x.restauravel ? `<button class="btn pequeno" data-r="${x.id}">Restaurar</button>` : ''}</div>`).join('') || '<div class="vazio">Nada encontrado.</div>';
    $$('[data-r]', box).forEach((b) => (b.onclick = async () => { try { await api('log_restaurar', { p_id: Number(b.dataset.r) }); aviso('Registro restaurado.', 'ok'); log(box); } catch (e) { aviso(e.message, 'erro'); } }));
  };
  box.innerHTML = `<div class="cartao"><input type="search" id="lg-q" placeholder="Filtrar por usuário, ação ou texto…" style="max-width:360px"><div id="lg-lista" style="margin-top:8px;max-height:68vh;overflow:auto"></div></div>`;
  $('#lg-q').oninput = (e) => { q = e.target.value; d(); };
  d();
}

// ------------------------------------------------------------------ backup
async function backup(box) {
  let info = null; try { info = await api('backup_info'); } catch { /* */ }
  box.innerHTML = `<div class="duas-col"><div class="cartao"><h2>${ico('baixar')} Cópia completa agora</h2><p class="mudo pequeno">Baixa um arquivo .json com todos os dados (sem senhas).</p><button class="btn primario" id="bk-baixar">Baixar backup</button></div>
    <div class="cartao"><h2>${ico('historico')} Backup automático no Google Drive</h2>
      ${CFG.APPS_SCRIPT_URL ? `<p class="pequeno">${info?.conectado ? '<span class="selo verde">conectado</span>' : '<span class="selo ambar">não conectado</span>'}</p><button class="btn" id="bk-conectar">Conectar ao Drive</button> <button class="btn" id="bk-agora">Fazer backup no Drive agora</button>`
        : '<p class="mudo pequeno">O script do Google Drive ainda não foi implantado (infra/apps-script-backup.gs). Enquanto isso, use o backup manual.</p>'}
      ${(info?.ultimos || []).length ? `<div class="tabela-wrap" style="margin-top:10px"><table class="tabela"><tbody>${info.ultimos.map((b) => `<tr><td class="mono">${fmtDataHora(b.em)}</td><td>${esc(b.tipo)}</td><td class="pequeno">${esc(b.detalhe || '')}</td><td>${b.arquivo_url ? `<a href="${esc(b.arquivo_url)}" target="_blank" rel="noopener">abrir</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}</div></div>`;
  $('#bk-baixar').onclick = async () => {
    try { const d = await api('backup_baixar', {}, { timeout: 120000 }); baixarArquivo(`supert2_backup_${hojeISO()}.json`, new Blob([JSON.stringify(d)], { type: 'application/json' })); aviso('Backup baixado.', 'ok'); }
    catch (e) { aviso(e.message, 'erro'); }
  };
  const gas = async (acao, extra = {}) => {
    const r = await fetch(CFG.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao, token: sessao.token, ...extra }) }).then((x) => x.json());
    if (!r.ok) throw new Error(r.erro || 'Falha no Apps Script'); return r;
  };
  const bc = $('#bk-conectar'); if (bc) bc.onclick = async () => { try { await gas('conectar', { backup: { automatico: true, dia_semana: 5, hora: 22, manter: 26 } }); aviso('Drive conectado: backup toda sexta às 22h.', 'ok'); backup(box); } catch (e) { aviso(e.message, 'erro'); } };
  const ba = $('#bk-agora'); if (ba) ba.onclick = async () => { try { const r = await gas('backup'); aviso('Backup salvo no Drive: ' + r.detalhe, 'ok'); backup(box); } catch (e) { aviso(e.message, 'erro'); } };
}

// ------------------------------------------------------------------ migração
function migracao(box) {
  box.innerHTML = `<div class="cartao"><h2>${ico('enviar')} Trazer os dados do SUPERT antigo</h2>
    <ol class="pequeno" style="margin:0 0 10px 18px;line-height:1.7">
      <li>No cPanel do HostGator › Gerenciador de arquivos › pasta <b>supert.concretta.org</b>, selecione a pasta <b>ifma_dados</b> e o arquivo <b>index.html</b>.</li>
      <li>Clique em <b>Compactar</b> (formato Zip) e baixe o arquivo .zip gerado.</li>
      <li>Escolha esse .zip abaixo (ou selecione os arquivos .json soltos). Nada é enviado antes da sua confirmação.</li></ol>
    <input type="file" id="mg-arq" accept=".zip,.json,.html" multiple>
    <div id="mg-res" style="margin-top:12px"></div></div>`;
  $('#mg-arq').onchange = async (e) => {
    const res = $('#mg-res'); res.innerHTML = '<div class="vazio">Lendo arquivos…</div>';
    try {
      const arquivos = {};
      for (const f of e.target.files) {
        if (/\.zip$/i.test(f.name)) {
          await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
          const zip = await window.JSZip.loadAsync(await f.arrayBuffer());
          for (const [caminho, ent] of Object.entries(zip.files)) {
            if (ent.dir || /_backups\//.test(caminho)) continue;
            const nome = caminho.split('/').pop();
            if (/\.(json|html)$/i.test(nome)) arquivos[nome] = await ent.async('string');
          }
        } else arquivos[f.name] = await f.text();
      }
      const t = transformar(arquivos);
      const r = t.resumo;
      res.innerHTML = `${t.avisos.map((a) => `<div class="caixa aviso-caixa" style="margin-bottom:6px">${esc(a)}</div>`).join('')}
        <div class="kpis"><div class="kpi"><span>Registros de aula</span><b>${r.registros}</b><small>${r.ignorados} ignorados (excluídos/inválidos)</small></div>
          <div class="kpi"><span>Disciplinas</span><b>${r.disciplinas}</b><small>${r.ativas} ativas · ${r.apelidos} apelidos</small></div>
          <div class="kpi"><span>Professores</span><b>${r.professores}</b><small>${r.trocas_historico} trocas no histórico</small></div>
          <div class="kpi"><span>Recursos</span><b>${r.rec_itens}</b><small>${r.rec_movs} movimentos · ${r.servidores} servidores</small></div>
          <div class="kpi"><span>Usuários</span><b>${r.usuarios}</b><small>senha provisória = login</small></div></div>
        <p class="pequeno mudo">${r.sem_vinculo} registro(s) sem disciplina; ${r.criadas_so_registros} disciplina(s) antigas que só existiam nos registros foram criadas como arquivadas, para a contagem ficar agrupada. Arquivos lidos: ${Object.keys(arquivos).length}.</p>
        <label class="check"><input type="checkbox" id="mg-limpar"> Apagar os dados que já estão no SUPERT 2 antes (use se for repetir a migração)</label>
        <div class="linha-flex" style="margin-top:10px"><button class="btn primario grande" id="mg-ir">${ico('enviar')} Migrar agora</button><span id="mg-prog" class="pequeno"></span></div>`;
      $('#mg-ir').onclick = () => enviar(t);
    } catch (err) { console.error(err); res.innerHTML = `<div class="caixa erro-caixa">${esc(err.message)}</div>`; }
  };
}
async function enviar(t) {
  const prog = $('#mg-prog'), b = $('#mg-ir');
  if (!await confirmar('Enviar os dados do sistema antigo para o SUPERT 2 agora?', { ok: 'Migrar' })) return;
  b.disabled = true;
  const P = t.partes;
  const lotes = (parte, lista, tam) => { const out = []; for (let i = 0; i < lista.length; i += tam) out.push([parte, lista.slice(i, i + tam)]); return out; };
  const passos = [
    ...($('#mg-limpar').checked ? [['limpar', { confirmar: 'APAGAR_TUDO' }]] : []),
    ...lotes('professores', P.professores, 1000), ...lotes('disciplinas', P.disciplinas, 1000), ...lotes('disc_profs', P.disc_profs, 2000),
    ...lotes('horarios', P.horarios, 3000), ...lotes('apelidos', P.apelidos, 2000), ...lotes('registros', P.registros, 1500),
    ...lotes('exclusoes', P.exclusoes, 1000), ...lotes('log', P.log, 800), ...lotes('servidores', P.servidores, 2000),
    ...lotes('rec_itens', P.rec_itens, 2000), ...lotes('rec_movs', P.rec_movs, 2000), ...lotes('usuarios', P.usuarios, 500),
    ['sequencias', { resumo: `${t.resumo.registros} registros, ${t.resumo.disciplinas} disciplinas, ${t.resumo.professores} professores, ${t.resumo.rec_movs} movimentos de recursos` }]
  ];
  const cont = {}; let atual = '';
  try {
    for (let i = 0; i < passos.length; i++) {
      const [parte, dados] = passos[i]; atual = parte;
      prog.textContent = `Enviando ${parte} (${i + 1}/${passos.length})…`;
      const n = await api('migracao_carregar', { p_parte: parte, p_dados: dados }, { timeout: 120000 });
      cont[parte] = (cont[parte] || 0) + (n || 0);
    }
    await carregarCadastro();
    prog.innerHTML = `<span style="color:var(--verde-escuro)">Migração concluída: ${Object.entries(cont).filter(([k]) => !['limpar', 'sequencias'].includes(k)).map(([k, v]) => `${v} ${k}`).join(' · ')}.</span>`;
    aviso('Migração concluída.', 'ok');
  } catch (e) { prog.innerHTML = `<span style="color:var(--vermelho)">Parou em "${esc(atual)}": ${esc(e.message)}. Marque "Apagar os dados…" e tente de novo.</span>`; b.disabled = false; }
}

// ------------------------------------------------------------------ ajustes
function ajustes(box) {
  const tur = D.turnos; const inat = Number(sessao.config?.inatividade_min || 20);
  box.innerHTML = `<div class="cartao" style="max-width:640px"><h2>Turnos</h2><p class="pequeno mudo" style="margin-top:0">Usados para separar as aulas no "Lançar turno" (pelo horário de início de cada aula).</p>
    ${turnosOrdenados().map(([k, t]) => `<div class="grade" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:8px"><label class="campo"><span>Nome</span><input data-t="${k}" data-c="nome" value="${esc(t.nome)}"></label><label class="campo"><span>Início</span><input type="time" data-t="${k}" data-c="ini" value="${t.ini}"></label><label class="campo"><span>Fim</span><input type="time" data-t="${k}" data-c="fim" value="${t.fim}"></label></div>`).join('')}
    <h2 style="margin-top:14px">Sessão</h2><label class="campo" style="max-width:260px"><span>Sair sozinho após quantos minutos sem uso</span><input type="number" id="aj-inat" min="5" max="240" value="${inat}"></label>
    <div class="linha-flex fim" style="margin-top:12px"><button class="btn primario" id="aj-salvar">Salvar ajustes</button></div></div>`;
  $('#aj-salvar').onclick = async () => {
    const novo = JSON.parse(JSON.stringify(tur));
    $$('[data-t]', box).forEach((i) => { novo[i.dataset.t][i.dataset.c] = i.value; });
    try {
      await api('config_salvar', { p_chave: 'turnos', p_valor: novo });
      await api('config_salvar', { p_chave: 'inatividade_min', p_valor: Number($('#aj-inat').value || 20) });
      sessao.config = { ...sessao.config, turnos: novo, inatividade_min: Number($('#aj-inat').value || 20) }; D.turnos = novo;
      aviso('Ajustes salvos.', 'ok');
    } catch (e) { aviso(e.message, 'erro'); }
  };
}
export { tipoTurma };
