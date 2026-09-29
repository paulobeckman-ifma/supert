// Comunicação com o banco (Supabase/PostgREST): cada ação é uma função (RPC) que confere o token.
import { CFG } from './util.js';

export class ApiErro extends Error {
  constructor(codigo, rede = false) { super(traduzir(codigo)); this.codigo = codigo; this.rede = rede; }
}

const MSG = {
  REDE: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
  SESSAO_INVALIDA: 'Sua sessão expirou. Entre novamente.',
  TROCAR_SENHA: 'Defina uma nova senha antes de continuar.',
  SENHA_IGUAL: 'A nova senha deve ser diferente da atual e do seu usuário.',
  SEM_PERMISSAO: 'Seu perfil não tem permissão para esta ação.',
  LOGIN_INVALIDO: 'Usuário ou senha incorretos.',
  BLOQUEADO: 'Muitas tentativas incorretas. Aguarde 15 minutos.',
  SENHA_CURTA: 'A senha precisa ter pelo menos 6 caracteres.',
  SENHA_ATUAL_INCORRETA: 'A senha atual não confere.',
  LOGIN_EM_USO: 'Este login já está em uso.',
  LOGIN_INVALIDO_FORMATO: 'Login: use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.',
  NAO_PODE_REBAIXAR_A_SI: 'Você não pode desativar nem trocar o perfil da sua própria conta.',
  ULTIMO_ADMIN: 'O sistema precisa de pelo menos um administrador ativo.',
  NAO_ENCONTRADO: 'Registro não encontrado (pode ter sido alterado por outra pessoa). Atualize a tela.',
  NOME_OBRIGATORIO: 'Preencha o nome.',
  PROFESSOR_DUPLICADO: 'Já existe um professor com este nome abreviado.',
  JA_EXISTE_REGULAR: 'Já existe aula REGULAR deste professor nesta disciplina e turma neste dia.',
  DATA_OBRIGATORIA: 'Informe a data.',
  STATUS_OBRIGATORIO: 'Escolha o status (presente, falta, atraso ou saída).',
  DATA_FUTURA: 'Não é possível registrar aula em data futura.',
  JA_RESTAURADO: 'Este registro já foi restaurado.',
  ITEM_EM_USO: 'Não é possível excluir: o item está em uso.',
  MATRICULA_DUPLICADA: 'Já existe um servidor com esta matrícula.',
  CONFIRMACAO_INVALIDA: 'Confirmação inválida.',
  SEGREDO_INVALIDO: 'O backup perdeu a conexão com o banco. Use "Conectar ao Drive" de novo.'
};
export function traduzir(c) {
  const k = String(c || '').split(':')[0].trim();
  return MSG[k] || String(c || 'Erro desconhecido');
}

// ------------------------------------------------------------------ sessão (fica neste navegador)
const CHAVE = 'supert2_sessao';
export const sessao = {
  dados: (() => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; } })(),
  config: {},
  get token() { return this.dados?.token || null; },
  get usuario() { return this.dados?.usuario || null; },
  get perfil() { return this.dados?.usuario?.perfil || null; },
  salvar(token, usuario) { this.dados = { token, usuario }; try { localStorage.setItem(CHAVE, JSON.stringify(this.dados)); } catch { /* modo privado */ } },
  atualizarUsuario(u) { if (this.dados) { this.dados.usuario = u; try { localStorage.setItem(CHAVE, JSON.stringify(this.dados)); } catch { /* */ } } },
  limpar() { this.dados = null; try { localStorage.removeItem(CHAVE); } catch { /* */ } }
};

/** Permissão do usuário logado (mesma regra da função _pode do banco). */
export function pode(perm) {
  const u = sessao.usuario; if (!u) return false;
  if (u.perfil === 'admin') return true;
  if (perm === 'admin') return false;
  if (perm === 'editar_turmas') return u.perfil === 'editor';
  if (u.perfil === 'consulta') return ['painel', 'turmas', 'ver'].includes(perm);
  if (perm === 'ver') return true;
  return (u.permissoes || []).includes(perm);
}

// ------------------------------------------------------------------ chamada
export async function rpc(fn, args = {}, { timeout = 30000 } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  const headers = { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY };
  if (/^eyJ/.test(CFG.SUPABASE_KEY || '')) headers.Authorization = 'Bearer ' + CFG.SUPABASE_KEY;
  let r;
  try {
    r = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args), signal: ctrl.signal, cache: 'no-store' });
  } catch (e) { throw new ApiErro('REDE', true); }
  finally { clearTimeout(t); }
  const txt = await r.text();
  let corpo = null; try { corpo = txt ? JSON.parse(txt) : null; } catch { corpo = txt; }
  if (!r.ok) {
    const cod = corpo?.message || `HTTP_${r.status}`;
    if (cod === 'SESSAO_INVALIDA') window.dispatchEvent(new CustomEvent('supert:sessao-expirada'));
    if (cod === 'TROCAR_SENHA') window.dispatchEvent(new CustomEvent('supert:trocar-senha'));
    throw new ApiErro(cod, r.status >= 500 || r.status === 0 || r.status === 408 || r.status === 429);
  }
  return corpo;
}
export const api = (fn, args = {}, opcoes) => rpc(fn, { p_token: sessao.token, ...args }, opcoes);
