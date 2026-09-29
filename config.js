/*
 * SUPERT 2 · configuração da instalação
 * Banco: Supabase (projeto "supert"). A chave abaixo é a chave PÚBLICA (publishable):
 * ela só permite chamar as funções do SUPERT, que conferem login e sessão.
 */
window.SUPERT_CONFIG = {
  SUPABASE_URL: 'https://rejyrdvxhnvklcwshniu.supabase.co',
  SUPABASE_KEY: 'sb_publishable_LId3v7aXuJVMRlI3Do4DaA_Fq7RmnSu',
  // Apps Script (Google Drive) para backup semanal. Preenchido depois da implantação.
  APPS_SCRIPT_URL: '',
  INSTITUICAO: 'IFMA · Campus Imperatriz',
  FUSO: 'America/Fortaleza'
};

// Teste local (python3 ferramentas/servidor_teste.py): usa o servidor de teste.
if (['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('producao')) {
  window.SUPERT_CONFIG.SUPABASE_URL = location.origin;
  window.SUPERT_CONFIG.SUPABASE_KEY = 'teste-local';
}
