// Cadastro em memória (professores, disciplinas, horários) + atualização automática
import { api, sessao } from './api.js';
import { turnoDaHora, ordTurma, hojeISO, chave } from './util.js';

export const D = {
  carregado: false, versao: 0,
  profs: new Map(),        // id -> professor
  discs: new Map(),        // id -> disciplina (com .professores [{professor_id, desde, ate}], .apelidos)
  horarios: [],            // {id, d (disciplina_id), p (professor_id), dia, hora}
  progresso: {},           // disciplina_id -> aulas dadas
  turnos: {}
};

export async function carregarCadastro() {
  const r = await api('cadastro', {}, { timeout: 45000 });
  D.profs = new Map(r.professores.map((p) => [p.id, p]));
  D.discs = new Map(r.disciplinas.map((d) => [d.id, d]));
  D.horarios = r.horarios.map(([id, d, p, dia, hora]) => ({ id, d, p, dia, hora }));
  D.progresso = r.progresso || {};
  D.versao = r.versao; D.carregado = true;
  D.turnos = sessao.config?.turnos || { M: { nome: 'Matutino', ini: '06:00', fim: '12:29' }, V: { nome: 'Vespertino', ini: '12:30', fim: '17:29' }, N: { nome: 'Noturno', ini: '17:30', fim: '23:59' } };
  window.dispatchEvent(new CustomEvent('supert:cadastro'));
  return D;
}
/** Turnos na ordem do dia (o banco não guarda a ordem das chaves). */
export const turnosOrdenados = () => Object.entries(D.turnos).sort((a, b) => a[1].ini.localeCompare(b[1].ini));
export async function garantirCadastro() { if (!D.carregado) await carregarCadastro(); return D; }

// ------------------------------------------------------------------ consultas
export const prof = (id) => D.profs.get(Number(id));
export const disc = (id) => D.discs.get(Number(id));
export const nomeProf = (id) => prof(id)?.nome || '?';
export const aulasDadas = (discId) => Number(D.progresso[discId] || 0);

/** Professores atuais (vínculo sem data de fim). */
export function profsAtuais(d, data = null) {
  if (!d) return [];
  return (d.professores || []).filter((v) => !v.ate && (!data || !v.desde || v.desde <= data)).map((v) => v.professor_id);
}
/** Quem era professor da disciplina numa data (para registros retroativos após troca). */
export function profsNaData(d, data) {
  const l = (d?.professores || []).filter((v) => (!v.desde || v.desde <= data) && (!v.ate || v.ate >= data)).map((v) => v.professor_id);
  return l.length ? l : profsAtuais(d);
}
export const ativas = () => [...D.discs.values()].filter((d) => !d.arquivada_em);
export function turmas({ incluirArquivadas = false } = {}) {
  const s = new Set(); for (const d of D.discs.values()) if (incluirArquivadas || !d.arquivada_em) s.add(d.turma);
  return [...s].sort(ordTurma);
}
export function discsDaTurma(turma, { incluirArquivadas = false } = {}) {
  return [...D.discs.values()].filter((d) => d.turma === turma && (incluirArquivadas || !d.arquivada_em)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}
/** Disciplinas ativas de um professor (com vínculo atual), com seus horários. */
export function discsDoProf(profId) {
  const out = [];
  for (const d of D.discs.values()) {
    if (d.arquivada_em) continue;
    if (profsAtuais(d).includes(Number(profId))) out.push(d);
  }
  return out.sort((a, b) => ordTurma(a.turma, b.turma) || a.nome.localeCompare(b.nome, 'pt'));
}
export const horariosDe = (discId, profId = null) => D.horarios.filter((h) => h.d === discId && (profId == null || h.p === profId));
export function profsOrdenados({ soAtivos = true } = {}) {
  return [...D.profs.values()].filter((p) => !soAtivos || p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}
/** Encontra a disciplina da turma pelo nome ou por um apelido já confirmado. */
export function discPorNome(turma, nome) {
  const k = chave(nome);
  let achou = null;
  for (const d of D.discs.values()) {
    if (d.turma !== turma) continue;
    if (chave(d.nome) === k || (d.apelidos || []).some((a) => a.chave === k)) { if (!achou || (achou.arquivada_em && !d.arquivada_em)) achou = d; }
  }
  return achou;
}

/**
 * Aulas previstas no horário para uma data e turno. Aulas seguidas da mesma disciplina e
 * professor viram uma linha só (ex.: 07:10 e 08:00 → 2 aulas).
 */
export function aulasPrevistas(dataISO, turno) {
  const dia = new Date(dataISO + 'T12:00:00Z').getUTCDay() || 7;
  const grupos = new Map();
  for (const h of D.horarios) {
    if (h.dia !== dia) continue;
    if (turno && turnoDaHora(h.hora, D.turnos) !== turno) continue;
    const d = D.discs.get(h.d); if (!d || d.arquivada_em) continue;
    // quem dava a aula NAQUELA data (lançamento retroativo depois de uma troca de professor)
    const naData = profsNaData(d, dataISO);
    let pid = h.p;
    if (!naData.includes(pid)) { if (naData.length === 1) pid = naData[0]; else continue; }
    const k = h.d + '|' + pid;
    if (!grupos.has(k)) grupos.set(k, { disciplina_id: h.d, professor_id: pid, horas: [] });
    if (!grupos.get(k).horas.includes(h.hora)) grupos.get(k).horas.push(h.hora);
  }
  const out = [];
  for (const g of grupos.values()) {
    g.horas.sort();
    const d = D.discs.get(g.disciplina_id), p = D.profs.get(g.professor_id);
    out.push({ ...g, aulas: g.horas.length, inicio: g.horas[0], horario: g.horas.join(', '), turma: d.turma, disc: d.nome, prof: p?.nome || '?', diario_id: d.diario_id, ch_total: d.ch_total });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio) || ordTurma(a.turma, b.turma) || a.prof.localeCompare(b.prof));
}

// ------------------------------------------------------------------ atualização automática
// A cada 20 s (com a aba visível) pergunta ao banco se algo mudou; se mudou, recarrega o cadastro.
let timer = null;
export function iniciarSincronia() {
  pararSincronia();
  const tique = async () => {
    if (document.visibilityState !== 'visible' || !sessao.token) return;
    try {
      const v = await api('versao', {}, { timeout: 10000 });
      if (v !== D.versao) { D.versao = v; window.dispatchEvent(new CustomEvent('supert:mudou', { detail: { versao: v } })); }
    } catch { /* offline: tenta de novo depois */ }
  };
  timer = setInterval(tique, 20000);
}
export function pararSincronia() { if (timer) clearInterval(timer); timer = null; }
export { hojeISO };
