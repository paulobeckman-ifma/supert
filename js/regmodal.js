// Edição e exclusão de um registro de aula (usado no Painel, no Lançar turno e nas Notificações)
import { $, esc, modal, aviso, confirmar, pedirTexto, fmtData, STATUS } from './util.js';
import { api, pode, sessao } from './api.js';
import { D, profsOrdenados, discsDaTurma, turmas } from './dados.js';

export function editarRegistro(r, aoSalvar) {
  const opProf = profsOrdenados({ soAtivos: false }).map((p) => `<option value="${p.id}" ${p.id === r.professor_id ? 'selected' : ''}>${esc(p.nome)}${p.ativo ? '' : ' (inativo)'}</option>`).join('');
  const listaT = turmas({ incluirArquivadas: true });
  const opTurma = (listaT.includes(r.turma) ? listaT : [r.turma, ...listaT]).map((t) => `<option ${t === r.turma ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const corpo = `
    <div class="grade" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <label class="campo"><span>Data</span><input type="date" name="data" value="${esc(r.data)}"></label>
      <label class="campo"><span>Tipo</span><select name="tipo">${['regular', 'extra', 'permuta'].map((t) => `<option value="${t}" ${t === r.tipo ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
      <label class="campo"><span>Professor</span><select name="professor_id"><option value="">(${esc(r.prof || 'sem vínculo')})</option>${opProf}</select></label>
      <label class="campo"><span>Turma</span><select name="turma">${opTurma}</select></label>
      <label class="campo" style="grid-column:1/-1"><span>Disciplina</span><select name="disciplina_id"></select></label>
      <label class="campo"><span>Status</span><select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="campo"><span>Aulas</span><input type="number" name="aulas" min="0" max="20" value="${esc(r.aulas)}"></label>
      <label class="campo" data-min><span>Minutos (atraso/saída)</span><input type="number" name="minutos" min="0" max="600" step="5" value="${esc(r.minutos ?? '')}"></label>
      <label class="campo"><span>Horário</span><input type="text" name="horario" value="${esc(r.horario || '')}" placeholder="ex.: 07:10"></label>
      <label class="campo" style="grid-column:1/-1"><span>Observação</span><input type="text" name="obs" maxlength="300" value="${esc(r.obs || '')}"></label>
    </div>
    <small class="mudo">Registrado por ${esc(r.por || '—')}${r.criado_em ? ' em ' + new Date(r.criado_em).toLocaleString('pt-BR') : ''}${r.atualizado_por ? ` · editado por ${esc(r.atualizado_por)}` : ''}</small>`;
  const m = modal({
    titulo: 'Editar registro', corpo,
    aoAbrir: (el) => {
      const selT = $('[name=turma]', el), selD = $('[name=disciplina_id]', el), selS = $('[name=status]', el);
      const encherDisc = () => {
        const l = discsDaTurma(selT.value, { incluirArquivadas: true });
        selD.innerHTML = `<option value="">(${esc(r.disc || 'sem vínculo')})</option>` + l.map((d) => `<option value="${d.id}" ${d.id === r.disciplina_id ? 'selected' : ''}>${esc(d.nome)}${d.arquivada_em ? ' (arquivada)' : ''}</option>`).join('');
      };
      selT.onchange = encherDisc; encherDisc();
      const min = () => $('[data-min]', el).classList.toggle('oculto', !['atraso', 'saida'].includes(selS.value));
      selS.onchange = min; min();
    },
    botoes: [
      ...(pode('turno') || pode('registrar') ? [{ texto: pode('admin') ? 'Excluir' : 'Pedir exclusão', classe: 'perigo', acao: async (fechar) => { const ok = await excluirRegistro(r); if (ok) { fechar(true); aoSalvar?.(); } return false; } }] : []),
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
          const f = (n) => $(`[name=${n}]`, el).value;
          const d = f('disciplina_id') ? D.discs.get(Number(f('disciplina_id'))) : null;
          const p = f('professor_id') ? D.profs.get(Number(f('professor_id'))) : null;
          const reg = {
            id: r.id, data: f('data'), tipo: f('tipo'), status: f('status'), aulas: Number(f('aulas') || 0),
            minutos: f('minutos') || null, horario: f('horario'), obs: f('obs'),
            disciplina_id: d?.id || (f('turma') === r.turma ? r.disciplina_id : null), professor_id: p?.id || r.professor_id,
            prof: p?.nome || r.prof, disc: d?.nome || (f('turma') === r.turma ? r.disc : ''), turma: f('turma'),
            diario_id: d ? d.diario_id : r.diario_id, ch_total: d ? d.ch_total : r.ch_total
          };
          await api('registro_salvar', { p_reg: reg });
          aviso('Registro atualizado.', 'ok'); fechar(true); aoSalvar?.(); return false;
        }
      }
    ]
  });
  return m.promessa;
}

export async function excluirRegistro(r) {
  const desc = `${r.prof} · ${r.disc} · ${r.turma} · ${fmtData(r.data)} · ${STATUS[r.status] || r.status}`;
  if (pode('admin')) {
    if (!await confirmar(`Excluir este registro?\n\n${desc}\n\nEle fica guardado no log e pode ser restaurado.`, { titulo: 'Excluir registro', ok: 'Excluir', perigo: true })) return false;
    await api('registro_excluir', { p_id: r.id, p_motivo: '' });
    aviso('Registro excluído.', 'ok'); return true;
  }
  const motivo = await pedirTexto('Pedir exclusão', 'Por que este registro deve ser excluído?', { minimo: 5, dica: desc + ' · o administrador decide.' });
  if (!motivo) return false;
  await api('registro_excluir', { p_id: r.id, p_motivo: motivo });
  aviso('Pedido enviado ao administrador.', 'ok'); return true;
}
export const usuarioAtual = () => sessao.usuario?.login || '';
