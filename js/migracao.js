// Conversão dos dados do SUPERT antigo (pasta ifma_dados do HostGator) para o banco novo.
// Roda inteiramente no navegador do administrador: os arquivos vão direto para o Supabase.
import { chave, simNome, simProf } from './util.js';

const DIAS = { Segunda: 1, 'Terça': 2, Terca: 2, Quarta: 3, Quinta: 4, Sexta: 5, 'Sábado': 6, Sabado: 6 };
const STATUS_OK = new Set(['presente', 'ausente', 'atraso', 'saida']);
const TIPO_OK = new Set(['regular', 'extra', 'permuta']);

const js = (txt, padrao) => { try { const v = JSON.parse(txt); return v ?? padrao; } catch { return padrao; } };
const iso = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
const idTempo = (id) => { const n = Number(id); if (n > 1e12 && n < 4e12) return new Date(n).toISOString(); const m = String(id).match(/^([0-9a-z]{8,9})_/); if (m) { const t = parseInt(m[1], 36); if (t > 1e12 && t < 4e12) return new Date(t).toISOString(); } return null; };

/** Diretório de servidores embutido no index.html antigo (const _PROFS_IFMA_XLS = {...}). */
export function lerDiretorio(html) {
  const m = String(html || '').match(/const\s+_PROFS_IFMA_XLS\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return [];
  const o = js(m[1], {});
  return Object.entries(o).map(([nome, i]) => ({ nome, matricula: String(i.matricula || ''), setor: i.setor || '' }));
}

/**
 * arquivos: { 'professores.json': texto, 'registros_x.json': texto, ..., 'index.html': texto }
 * Retorna as partes prontas para migracao_carregar e um resumo.
 */
export function transformar(arquivos) {
  const avisos = [];
  const arq = (n) => arquivos[n] ?? null;
  const profsAnt = js(arq('professores.json'), []);
  const deletados = new Set(js(arq('deleted_ids.json'), []).map(String));
  const regsAnt = [];
  for (const [n, t] of Object.entries(arquivos)) if (/^registros(_.+)?\.json$/.test(n)) for (const r of js(t, [])) regsAnt.push(r);
  const diretorio = lerDiretorio(arq('index.html'));

  // ---------------------------------------------------------------- professores
  const professores = []; const porNome = new Map();
  const acharDir = (nome) => {
    const w = String(nome).toUpperCase().split(/\s+/).filter((x) => x.length > 2);
    let best = null, bs = 0, empate = false;
    for (const d of diretorio) { const up = d.nome.toUpperCase(); const s = w.filter((x) => up.includes(x)).length; if (s > bs) { bs = s; best = d; empate = false; } else if (s === bs && s > 0) empate = true; }
    return bs >= Math.min(2, w.length) && !empate ? best : null;
  };
  const addProf = (nome, extra = {}) => {
    const n = String(nome || '').trim().toUpperCase(); if (!n) return null;
    if (porNome.has(n)) { const p = porNome.get(n); if (extra.ativo) p.ativo = true; return p; }
    const dir = extra.nome_completo ? null : acharDir(n);
    const p = { id: professores.length + 1, nome: n, nome_completo: extra.nome_completo || dir?.nome || '', matricula: String(extra.matricula || dir?.matricula || ''), setor: extra.setor || dir?.setor || '', ativo: !!extra.ativo };
    professores.push(p); porNome.set(n, p); return p;
  };
  const profPorNome = (nome) => {
    const n = String(nome || '').trim().toUpperCase(); if (!n) return null;
    if (porNome.has(n)) return porNome.get(n);
    let best = null, bs = 0; for (const p of professores) { const s = simProf(p.nome, n); if (s > bs) { bs = s; best = p; } }
    return bs >= 0.95 ? best : addProf(n, { ativo: false });
  };
  for (const p of profsAnt) addProf(p.nome, { nome_completo: p.nomeCompleto, matricula: p.matricula, ativo: true });

  // ---------------------------------------------------------------- disciplinas (turma × nome), co-docência junta
  const disciplinas = [], discProfs = [], horarios = [], apelidos = [];
  const porChave = new Map(); const porDiario = new Map();
  const novaDisc = (turma, nome, x = {}) => {
    const d = { id: disciplinas.length + 1, turma, nome, diario_id: x.diario_id || null, ch_total: x.ch_total || null, arquivada_em: x.arquivada_em || null, arquivada_motivo: x.arquivada_motivo || null, _chaves: new Set([chave(nome)]) };
    disciplinas.push(d); porChave.set(turma + '|' + chave(nome), d);
    if (d.diario_id) porDiario.set(turma + '|' + d.diario_id, d);
    return d;
  };
  const apelido = (d, nome) => { const k = chave(nome); if (!k || d._chaves.has(k)) return; d._chaves.add(k); apelidos.push({ disciplina_id: d.id, turma: d.turma, nome }); porChave.set(d.turma + '|' + k, d); };
  const vinc = new Set();
  const vincular = (d, p, desde = null, ate = null) => { const k = `${d.id}|${p.id}|${ate || ''}`; if (vinc.has(k)) return; vinc.add(k); discProfs.push({ disciplina_id: d.id, professor_id: p.id, desde, ate }); };
  const hvist = new Set();

  for (const pa of profsAnt) {
    const p = porNome.get(String(pa.nome || '').trim().toUpperCase()); if (!p) continue;
    for (const da of pa.disciplinas || []) {
      const turmas = (da.turmas && da.turmas.length) ? da.turmas : ['(sem turma)'];
      for (const t0 of turmas) {
        const turma = String(t0).trim();
        const did = da.diario_id ? Number(da.diario_id) : null;
        let d = porChave.get(turma + '|' + chave(da.nome)) || (did && porDiario.get(turma + '|' + did));
        if (d) {
          if (chave(d.nome) !== chave(da.nome)) apelido(d, da.nome);
          if (!d.diario_id && did) { d.diario_id = did; porDiario.set(turma + '|' + did, d); }
          if (!d.ch_total && da.total_aulas) d.ch_total = Number(da.total_aulas) || null;
          if (d.arquivada_em && !da.arquivadaEm) { d.arquivada_em = null; d.arquivada_motivo = null; }
        } else {
          d = novaDisc(turma, da.nome, { diario_id: did, ch_total: Number(da.total_aulas) || null, arquivada_em: iso(da.arquivadaEm), arquivada_motivo: da.arquivadaMotivo || null });
        }
        if (da.nomeAnterior) apelido(d, da.nomeAnterior);
        // histórico de professores (conciliação antiga) + professor atual
        const hist = Array.isArray(da.professorHistorico) ? da.professorHistorico : [];
        for (const h of hist) if (h.ate && h.prof && String(h.prof).toUpperCase() !== p.nome) { const po = profPorNome(h.prof); if (po) vincular(d, po, null, String(h.ate).slice(0, 10)); }
        const desde = hist.filter((h) => h.desde && String(h.prof).toUpperCase() === p.nome).map((h) => String(h.desde).slice(0, 10)).pop() || null;
        vincular(d, p, desde, null);
        for (const h of da.horarios || []) {
          const [dh, tSlot] = String(h).split('|');
          if (tSlot && tSlot.trim() !== turma) continue;
          const m = dh.trim().match(/^(\S+)\s+(\d{1,2}:\d{2})/); if (!m || !DIAS[m[1]]) continue;
          const hora = m[2].padStart(5, '0'); const k = `${d.id}|${p.id}|${DIAS[m[1]]}|${hora}`;
          if (hvist.has(k)) continue; hvist.add(k);
          horarios.push({ disciplina_id: d.id, professor_id: p.id, dia: DIAS[m[1]], hora });
        }
      }
    }
  }

  // ---------------------------------------------------------------- registros
  const discsDaTurma = (t) => disciplinas.filter((d) => d.turma === t);
  const resolverDisc = (r, criar = true) => {
    const turma = String(r.turma || '').trim() || '(sem turma)';
    const did = r.diario_id ? Number(r.diario_id) : null;
    let d = (did && porDiario.get(turma + '|' + did)) || porChave.get(turma + '|' + chave(r.disc));
    if (d) return d;
    if (did) { const l = disciplinas.filter((x) => x.diario_id === did); if (l.length === 1) return l[0]; }
    const cands = discsDaTurma(turma).map((x) => ({ x, s: Math.max(...[...x._chaves].map((k) => simNome(k, r.disc))) })).filter((c) => c.s >= 0.85).sort((a, b) => b.s - a.s);
    if (cands.length === 1 || (cands.length > 1 && cands[0].s - cands[1].s >= 0.1)) { apelido(cands[0].x, r.disc); return cands[0].x; }
    // mesmo professor na mesma turma e nome parecido (ex.: "Lingua Portuguesa" x "Língua Portuguesa e Literatura")
    const pr = porNome.get(String(r.prof || '').trim().toUpperCase());
    if (pr) {
      const dosProf = discsDaTurma(turma).filter((x) => discProfs.some((v) => v.disciplina_id === x.id && v.professor_id === pr.id))
        .map((x) => ({ x, s: Math.max(...[...x._chaves].map((k) => simNome(k, r.disc))) })).filter((c) => c.s >= 0.6).sort((a, b) => b.s - a.s);
      if (dosProf.length === 1 || (dosProf.length > 1 && dosProf[0].s - dosProf[1].s >= 0.15)) { apelido(dosProf[0].x, r.disc); return dosProf[0].x; }
    }
    if (!criar) return null;
    // só existia nos registros: cria arquivada para a contagem continuar agrupada
    d = novaDisc(turma, String(r.disc || '(sem disciplina)').trim(), { diario_id: did, ch_total: Number(r.total_aulas) || null, arquivada_em: new Date().toISOString(), arquivada_motivo: 'Criada na migração (existia só nos registros antigos)' });
    return d;
  };
  const registros = []; const idsVistos = new Set(); const mapaReg = new Map(); let ignorados = 0;
  const converter = (r, criar = true) => {
    const status = String(r.status || '').toLowerCase();
    if (!STATUS_OK.has(status) || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.data || ''))) return null;
    const d = resolverDisc(r, criar); const p = criar ? profPorNome(r.prof) : porNome.get(String(r.prof || '').trim().toUpperCase()) || null;
    const aulas = Math.max(0, Math.min(20, parseInt(r.aulas, 10) || 0));
    return {
      id: String(r.id), data: r.data, tipo: TIPO_OK.has(r.tipo) ? r.tipo : 'regular', status, aulas,
      minutos: (status === 'atraso' || status === 'saida') && r.extra ? Number(r.extra) : null,
      horario: r.horarioExtra || null, obs: r.obs || '', disciplina_id: d?.id || null, professor_id: p?.id || null,
      prof: String(r.prof || ''), disc: String(r.disc || ''), turma: String(r.turma || ''), diario_id: r.diario_id ? Number(r.diario_id) : (d?.diario_id || null),
      ch_total: r.total_aulas ? Number(r.total_aulas) : null, por: r.registradoPor || '', criado_em: iso(r.ts) || idTempo(r.id) || (r.data + 'T12:00:00Z')
    };
  };
  for (const r of regsAnt) {
    const id = String(r.id ?? ''); if (!id || idsVistos.has(id) || deletados.has(id)) { if (id && !idsVistos.has(id) && deletados.has(id)) ignorados++; continue; }
    idsVistos.add(id);
    const n = converter(r); if (!n) { ignorados++; continue; }
    registros.push(n); mapaReg.set(id, n);
  }

  // ---------------------------------------------------------------- pedidos de exclusão, log
  const exclusoes = js(arq('pendel.json'), []).filter((p) => mapaReg.has(String(p.recId))).map((p) => ({ registro_id: String(p.recId), por: p.by || '', motivo: p.desc || '', em: iso(p.ts) }));
  const log = js(arq('log.json'), []).map((l) => {
    let payload = null;
    if (l.action === 'delete' && l.payload && !Array.isArray(l.payload) && l.payload.id) {
      const n = converter(l.payload, false);
      if (n) payload = { id: n.id, data: n.data, tipo: n.tipo, status: n.status, aulas: n.aulas, minutos: n.minutos, horario: n.horario, obs: n.obs, disciplina_id: n.disciplina_id, professor_id: n.professor_id, prof_nome: n.prof, disc_nome: n.disc, turma: n.turma, diario_id: n.diario_id, ch_total: n.ch_total, registrado_por: n.por, origem: 'legado', notif_arquivada: false, criado_em: n.criado_em };
    }
    return { em: iso(l.ts), usuario: l.by || '', acao: l.action || 'legado', detalhe: l.detail || '', payload };
  });

  // ---------------------------------------------------------------- usuários (sem senha: provisória = login)
  const PERFIL = { admin: 'admin', editor: 'editor', viewer: 'consulta', user: 'usuario' };
  const usuarios = js(arq('usuarios.json'), []).filter((u) => u.username).map((u) => {
    const tabs = Array.isArray(u.tabs) ? u.tabs : ['registrar', 'relatorio', 'turmas', 'recursos', 'notificacoes'];
    const perms = new Set();
    if (tabs.includes('registrar')) { perms.add('turno'); perms.add('registrar'); }
    if (tabs.includes('relatorio') || !tabs.length) perms.add('painel');
    if (tabs.includes('turmas')) perms.add('turmas');
    if (tabs.includes('recursos')) perms.add('recursos');
    if (tabs.includes('notificacoes') && u.notificador) perms.add('notificacoes');
    if (u.adicionarRecursos) perms.add('recursos_gerir');
    return { login: String(u.username).toLowerCase().trim(), nome: u.nome || '', perfil: PERFIL[u.role] || 'usuario', permissoes: [...perms] };
  });

  // ---------------------------------------------------------------- recursos
  const servidores = []; const matVistas = new Set();
  const addServ = (s) => { const mat = String(s.matricula || '').trim(); if (!s.nome) return; if (mat && matVistas.has(mat)) return; if (mat) matVistas.add(mat); servidores.push({ nome: s.nome, matricula: mat, setor: s.setor || '' }); };
  js(arq('rec_serv.json'), []).forEach(addServ);
  diretorio.forEach(addServ);
  const recItens = [], recMovs = []; const itensVistos = new Set();
  for (const tipo of ['chaves', 'equip', 'mat']) {
    for (const i of js(arq(`rec_items_${tipo}.json`), [])) {
      if (!i.id || itensVistos.has(String(i.id))) continue; itensVistos.add(String(i.id));
      recItens.push({ id: String(i.id), tipo, c1: String(i.c1 ?? ''), c2: String(i.c2 ?? ''), icone: String(i.icon ?? ''), bloco: i.bloco || null, ativo: true });
    }
    for (const g of js(arq(`rec_regs_${tipo}.json`), [])) {
      if (!g.id || !g.itemId) continue;
      if (!itensVistos.has(String(g.itemId))) { itensVistos.add(String(g.itemId)); recItens.push({ id: String(g.itemId), tipo, c1: '?', c2: '(item removido)', icone: '', bloco: null, ativo: false }); }
      const entregue = iso(g.entregueEm) || idTempo(g.id) || new Date().toISOString();
      recMovs.push({ id: String(g.id), tipo, item_id: String(g.itemId), matricula: String(g.matricula || ''), servidor_nome: g.profNome || '', entregue_em: entregue, entregue_por: g.entregueBy || '',
        devolvido_em: iso(g.recevidoEm) || (tipo === 'mat' ? entregue : null), recebido_por: g.recebidoBy || '', obs: g.obsDevol || '', permutado_para: g.permutadoPara || null, permutado_mat: g.permutadoMat || null, permuta_origem: g.permutaOrigem || null });
    }
  }

  const limpar = (l) => l.map(({ _chaves, ...x }) => x);
  const semVinc = registros.filter((r) => !r.disciplina_id).length;
  const criadas = disciplinas.filter((d) => /Criada na migração/.test(d.arquivada_motivo || '')).length;
  if (!profsAnt.length) avisos.push('professores.json não foi encontrado: o horário atual não será carregado.');
  if (!regsAnt.length) avisos.push('Nenhum arquivo registros_*.json encontrado.');
  if (!diretorio.length) avisos.push('index.html antigo não enviado: nome completo e matrícula dos professores não serão preenchidos automaticamente.');
  return {
    partes: { professores, disciplinas: limpar(disciplinas), disc_profs: discProfs, horarios, apelidos, registros, exclusoes, log, servidores, rec_itens: recItens, rec_movs: recMovs, usuarios },
    resumo: { professores: professores.length, disciplinas: disciplinas.length, ativas: disciplinas.filter((d) => !d.arquivada_em).length, horarios: horarios.length, apelidos: apelidos.length,
      registros: registros.length, ignorados, sem_vinculo: semVinc, criadas_so_registros: criadas, exclusoes: exclusoes.length, log: log.length, usuarios: usuarios.length,
      servidores: servidores.length, rec_itens: recItens.length, rec_movs: recMovs.length, trocas_historico: discProfs.filter((v) => v.ate).length },
    avisos
  };
}
