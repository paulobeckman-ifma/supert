/**
 * SUPERT 2 · backup no Google Drive (Apps Script)
 *
 * Implantação: Implantar > Nova implantação > App da Web
 *   Executar como: Eu (conta institucional dona dos backups)
 *   Quem pode acessar: Qualquer pessoa
 * Depois copie a URL que termina em /exec para APPS_SCRIPT_URL no config.js do SUPERT 2
 * e use "Conectar ao Drive" em Configurações > Backup (logado como admin no SUPERT 2).
 */
const SUPABASE_URL = 'https://rejyrdvxhnvklcwshniu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LId3v7aXuJVMRlI3Do4DaA_Fq7RmnSu';
const NOME_PASTA = 'SUPERT - Backups';
const FUSO = 'America/Fortaleza';

const P = PropertiesService.getScriptProperties();

function doPost(e) {
  let dados = {};
  try { dados = JSON.parse(e.postData.contents || '{}'); } catch (err) { return resp_({ ok: false, erro: 'Corpo inválido' }); }
  try {
    switch (dados.acao) {
      case 'status': exigirAdmin_(dados.token); return resp_(status_());
      case 'conectar': return resp_(conectar_(dados.token, dados.backup || {}));
      case 'agendar_backup': exigirAdmin_(dados.token); agendar_(dados.backup || {}); return resp_({ ok: true });
      case 'backup': exigirAdmin_(dados.token); return resp_(fazerBackup_('manual'));
      default: return resp_({ ok: false, erro: 'Ação desconhecida' });
    }
  } catch (err) {
    return resp_({ ok: false, erro: String(err && err.message || err) });
  }
}
function doGet() { return resp_({ ok: true, sistema: 'SUPERT 2 backup' }); }

function resp_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function rpc_(fn, args) {
  const r = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SUPABASE_KEY }, payload: JSON.stringify(args || {})
  });
  const txt = r.getContentText();
  let corpo = null; try { corpo = JSON.parse(txt); } catch (e) { corpo = txt; }
  if (r.getResponseCode() >= 300) throw new Error((corpo && corpo.message) || ('ERRO_BANCO_' + r.getResponseCode()));
  return corpo;
}

// Só admin do SUPERT 2 (token válido) pode acionar o script
function exigirAdmin_(token) { rpc_('backup_info', { p_token: token || '' }); }

function pasta_() {
  const id = P.getProperty('PASTA_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ } }
  const it = DriveApp.getFoldersByName(NOME_PASTA);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(NOME_PASTA);
  P.setProperty('PASTA_ID', f.getId());
  return f;
}

function conectar_(token, cfg) {
  const segredo = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  rpc_('backup_registrar', { p_token: token || '', p_segredo: segredo, p_config: normalizar_(cfg) });
  P.setProperty('SEGREDO', segredo);
  const f = pasta_();
  agendar_(cfg);
  return Object.assign({ ok: true }, status_(), { pasta_url: f.getUrl() });
}

function normalizar_(cfg) {
  return {
    automatico: cfg.automatico !== false,
    dia_semana: Math.min(7, Math.max(1, Number(cfg.dia_semana || 5))),
    hora: Math.min(23, Math.max(0, Number(cfg.hora == null ? 22 : cfg.hora))),
    manter: Math.min(520, Math.max(4, Number(cfg.manter || 26)))
  };
}

function agendar_(cfg) {
  const c = normalizar_(cfg);
  P.setProperty('CONFIG', JSON.stringify(c));
  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (h === 'backupSemanal' || h === 'manterAtivo') ScriptApp.deleteTrigger(t);
  });
  const dias = [null, ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY, ScriptApp.WeekDay.SATURDAY, ScriptApp.WeekDay.SUNDAY];
  if (c.automatico) ScriptApp.newTrigger('backupSemanal').timeBased().onWeekDay(dias[c.dia_semana]).atHour(c.hora).inTimezone(FUSO).create();
  ScriptApp.newTrigger('manterAtivo').timeBased().everyDays(1).atHour(6).inTimezone(FUSO).create();
  const seg = P.getProperty('SEGREDO');
  if (seg) try { rpc_('backup_anotar', { p_segredo: seg, p_tipo: 'agenda', p_url: null, p_detalhe: JSON.stringify(c) }); } catch (e) { }
}

function status_() {
  const gat = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  let url = null; try { url = pasta_().getUrl(); } catch (e) { }
  return { ok: true, pasta_url: url, backup_automatico: gat.indexOf('backupSemanal') >= 0, manter_ativo: gat.indexOf('manterAtivo') >= 0, config: JSON.parse(P.getProperty('CONFIG') || '{}') };
}

function fazerBackup_(tipo) {
  const seg = P.getProperty('SEGREDO');
  if (!seg) throw new Error('Drive não conectado. Use "Conectar ao Drive" no SUPERT 2.');
  const dump = rpc_('backup_dump', { p_segredo: seg });
  const txt = JSON.stringify(dump);
  const nome = 'supert_backup_' + Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd_HHmm') + '_' + tipo + '.json';
  const f = pasta_();
  const arq = f.createFile(nome, txt, MimeType.PLAIN_TEXT);
  // limpeza: mantém só os N mais recentes
  const cfg = JSON.parse(P.getProperty('CONFIG') || '{}');
  const manter = Number(cfg.manter || 26);
  const lista = [];
  const it = f.getFiles();
  while (it.hasNext()) { const x = it.next(); if (/^supert_backup_/.test(x.getName())) lista.push(x); }
  lista.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  lista.slice(manter).forEach(x => x.setTrashed(true));
  const detalhe = (dump.registros || []).length + ' registros, ' + (dump.disciplinas || []).length + ' disciplinas, ' + (dump.rec_movs || []).length + ' movimentos de recursos, ' + Math.round(txt.length / 1024) + ' KB';
  rpc_('backup_anotar', { p_segredo: seg, p_tipo: tipo, p_url: arq.getUrl(), p_detalhe: detalhe });
  return { ok: true, arquivo_url: arq.getUrl(), detalhe: detalhe };
}

// ── gatilhos ──
function backupSemanal() { fazerBackup_('automatico'); }
function manterAtivo() { const seg = P.getProperty('SEGREDO'); if (seg) rpc_('ping', { p_segredo: seg }); }

// Rode esta função uma vez pelo editor para autorizar o acesso ao Drive.
function autorizar() { pasta_(); UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/', { muteHttpExceptions: true }); }
