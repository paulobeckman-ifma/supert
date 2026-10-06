-- ════════════════════════════════════════════════════════════════════════════
-- SUPERT 2 · Supervisão de aulas e recursos · IFMA Campus Imperatriz
-- Banco no Supabase (mesmo padrão do PASES e do TeIA).
--
-- Principais mudanças em relação ao sistema antigo (api.php + arquivos JSON):
--   * A DISCIPLINA DA TURMA (o "diário") passa a ser a entidade estável. Os
--     registros apontam para ela, e não para o nome do professor. Assim, quando
--     uma disciplina anual troca de professor no meio do ano, a contagem de
--     aulas continua de onde parou (tabela disciplina_professores guarda quem
--     deu aula em cada período).
--   * Apelidos de disciplina (disciplina_apelidos): quando o horário novo traz a
--     mesma disciplina com outro nome, o sistema pergunta uma vez e guarda a
--     equivalência; nas próximas importações o reconhecimento é automático.
--   * Senhas com bcrypt e sessão por token; todas as tabelas com RLS e sem
--     políticas: a chave pública só consegue chamar as funções abaixo, que
--     conferem o token e o perfil do usuário.
--
-- Rode este arquivo inteiro no SQL Editor. Pode ser executado de novo sem
-- perder dados (create if not exists / create or replace).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────── tabelas
create table if not exists public.usuarios (
  id                bigserial primary key,
  login             text not null unique,
  nome              text not null default '',
  hash              text not null,
  perfil            text not null default 'usuario' check (perfil in ('admin','editor','usuario','consulta')),
  permissoes        text[] not null default array['turno','registrar','painel','turmas']::text[],
  ativo             boolean not null default true,
  deve_trocar_senha boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create table if not exists public.sessoes (
  token      text primary key,
  usuario_id bigint not null references public.usuarios(id) on delete cascade,
  dispositivo text,
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null default now() + interval '14 hours'
);
create index if not exists sessoes_usuario on public.sessoes(usuario_id);

create table if not exists public.tentativas (
  login text not null,
  em    timestamptz not null default now()
);
create index if not exists tentativas_login on public.tentativas(login, em);

create table if not exists public.professores (
  id            bigserial primary key,
  nome          text not null,              -- nome abreviado usado no horário (ex.: ANTONIO JOSE)
  nome_completo text not null default '',
  matricula     text not null default '',
  setor         text not null default '',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);
create unique index if not exists professores_nome on public.professores(upper(nome));

create table if not exists public.disciplinas (
  id               bigserial primary key,
  turma            text not null,
  nome             text not null,
  diario_id        bigint,
  ch_total         int,
  arquivada_em     timestamptz,
  arquivada_motivo text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists disciplinas_turma on public.disciplinas(turma);
create index if not exists disciplinas_diario on public.disciplinas(diario_id);

-- Quem é (ou foi) professor de cada disciplina. ate = null → vínculo atual.
create table if not exists public.disciplina_professores (
  id            bigserial primary key,
  disciplina_id bigint not null references public.disciplinas(id) on delete cascade,
  professor_id  bigint not null references public.professores(id) on delete cascade,
  desde         date,
  ate           date,
  criado_em     timestamptz not null default now()
);
create index if not exists dp_disc on public.disciplina_professores(disciplina_id);
create index if not exists dp_prof on public.disciplina_professores(professor_id);

-- Outros nomes pelos quais a mesma disciplina aparece nos horários.
create table if not exists public.disciplina_apelidos (
  id            bigserial primary key,
  disciplina_id bigint not null references public.disciplinas(id) on delete cascade,
  turma         text not null,
  nome          text not null,
  chave         text not null,
  criado_em     timestamptz not null default now()
);
create unique index if not exists apelidos_turma_chave on public.disciplina_apelidos(turma, chave);

create table if not exists public.horarios (
  id            bigserial primary key,
  disciplina_id bigint not null references public.disciplinas(id) on delete cascade,
  professor_id  bigint not null references public.professores(id) on delete cascade,
  dia           smallint not null check (dia between 1 and 7),   -- 1 = segunda
  hora          text not null check (hora ~ '^\d{2}:\d{2}$')
);
create unique index if not exists horarios_unico on public.horarios(disciplina_id, professor_id, dia, hora);
create index if not exists horarios_dia on public.horarios(dia, hora);

create table if not exists public.registros (
  id              text primary key default replace(gen_random_uuid()::text, '-', ''),
  data            date not null,
  tipo            text not null default 'regular' check (tipo in ('regular','extra','permuta')),
  status          text not null check (status in ('presente','ausente','atraso','saida','nao')),   -- nao = não houve aula (0 aulas, com justificativa)
  aulas           int not null default 1 check (aulas between 0 and 20),
  minutos         int,
  horario         text,
  obs             text not null default '',
  disciplina_id   bigint references public.disciplinas(id) on delete set null,
  professor_id    bigint references public.professores(id) on delete set null,
  prof_nome       text not null default '',
  disc_nome       text not null default '',
  turma           text not null default '',
  diario_id       bigint,
  ch_total        int,
  registrado_por  text not null default '',
  lote            text,
  origem          text not null default 'manual',   -- manual | turno | permuta | legado
  notif_arquivada boolean not null default false,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz,
  atualizado_por  text
);
-- v2.1: "não houve aula" passa a ser registro, com justificativa (bancos criados antes recebem a coluna e a regra aqui).
alter table public.registros add column if not exists justificativa text not null default '';
alter table public.registros drop constraint if exists registros_status_check;
alter table public.registros add constraint registros_status_check check (status in ('presente','ausente','atraso','saida','nao'));
create index if not exists registros_data on public.registros(data);
create index if not exists registros_disc on public.registros(disciplina_id);
create index if not exists registros_prof on public.registros(professor_id);

create table if not exists public.exclusoes (
  registro_id    text primary key references public.registros(id) on delete cascade,
  solicitado_por text not null,
  motivo         text not null default '',
  criado_em      timestamptz not null default now()
);

create table if not exists public.log (
  id      bigserial primary key,
  em      timestamptz not null default now(),
  usuario text not null default '',
  acao    text not null,
  detalhe text not null default '',
  payload jsonb
);
create index if not exists log_em on public.log(em desc);

create table if not exists public.servidores (
  id        bigserial primary key,
  nome      text not null,
  matricula text not null default '',
  setor     text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists servidores_mat on public.servidores(matricula);

create table if not exists public.rec_itens (
  id        text primary key default replace(gen_random_uuid()::text, '-', ''),
  tipo      text not null check (tipo in ('chaves','equip','mat')),
  c1        text not null default '',
  c2        text not null default '',
  icone     text not null default '',
  bloco     text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.rec_movs (
  id             text primary key default replace(gen_random_uuid()::text, '-', ''),
  tipo           text not null,
  item_id        text not null,
  matricula      text not null default '',
  servidor_nome  text not null default '',
  entregue_em    timestamptz not null default now(),
  entregue_por   text not null default '',
  devolvido_em   timestamptz,
  recebido_por   text not null default '',
  obs            text not null default '',
  permutado_para text,
  permutado_mat  text,
  permuta_origem text
);
create index if not exists rec_movs_item on public.rec_movs(item_id, devolvido_em);
create index if not exists rec_movs_em on public.rec_movs(entregue_em desc);

create table if not exists public.config (
  chave text primary key,
  valor jsonb not null
);

create table if not exists public.estado (
  id            int primary key default 1 check (id = 1),
  versao        bigint not null default 1,
  atualizado_em timestamptz not null default now()
);
insert into public.estado(id) values (1) on conflict do nothing;

create table if not exists public.backup_cfg (
  id           int primary key default 1 check (id = 1),
  segredo_hash text,
  config       jsonb not null default '{}'::jsonb,
  ts           timestamptz not null default now()
);
insert into public.backup_cfg(id) values (1) on conflict do nothing;

create table if not exists public.backups_feitos (
  id          bigserial primary key,
  em          timestamptz not null default now(),
  tipo        text,
  arquivo_url text,
  detalhe     text
);

insert into public.config(chave, valor) values
  ('turnos', '{"M":{"nome":"Matutino","ini":"06:00","fim":"12:29"},"V":{"nome":"Vespertino","ini":"12:30","fim":"17:29"},"N":{"nome":"Noturno","ini":"17:30","fim":"23:59"}}'::jsonb),
  ('inatividade_min', '20'::jsonb),
  ('instituicao', '"IFMA · Campus Imperatriz"'::jsonb)
on conflict (chave) do nothing;

-- RLS ligado e sem políticas: nada é acessível diretamente pela chave pública.
do $$
declare t text;
begin
  foreach t in array array['usuarios','sessoes','tentativas','professores','disciplinas','disciplina_professores',
    'disciplina_apelidos','horarios','registros','exclusoes','log','servidores','rec_itens','rec_movs','config',
    'estado','backup_cfg','backups_feitos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────── versão (para atualização automática)
create or replace function public._bump() returns trigger
language plpgsql security definer set search_path = public as
$$ begin update public.estado set versao = versao + 1, atualizado_em = now() where id = 1; return null; end $$;

do $$
declare t text;
begin
  foreach t in array array['registros','disciplinas','disciplina_professores','disciplina_apelidos','horarios',
    'professores','exclusoes','rec_itens','rec_movs','servidores','config'] loop
    execute format('drop trigger if exists %I on public.%I', 'bump_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each statement execute function public._bump()', 'bump_' || t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────── utilitários internos
create or replace function public._hash(p text) returns text
language sql volatile set search_path = public, extensions as
$$ select extensions.crypt(p, extensions.gen_salt('bf', 10)) $$;

create or replace function public._confere(p text, h text) returns boolean
language sql stable set search_path = public, extensions as
$$ select h is not null and extensions.crypt(p, h) = h $$;

-- Normaliza nomes para comparação: minúsculas, sem acento e sem pontuação.
create or replace function public._chave(p text) returns text
language sql immutable as
$$ select trim(regexp_replace(regexp_replace(lower(translate(coalesce(p,''),
     'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
     'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) $$;

create or replace function public._usuario_json(u public.usuarios) returns jsonb
language sql stable as
$$ select jsonb_build_object('id', u.id, 'login', u.login, 'nome', u.nome, 'perfil', u.perfil,
     'permissoes', to_jsonb(u.permissoes), 'ativo', u.ativo, 'deve_trocar_senha', u.deve_trocar_senha) $$;

-- Valida o token. Erro SESSAO_INVALIDA se não valer; TROCAR_SENHA se a senha provisória ainda não foi trocada.
create or replace function public._sessao(p_token text, p_livre boolean default false) returns public.usuarios
language plpgsql stable security definer set search_path = public as
$$
declare u public.usuarios;
begin
  select us.* into u from public.sessoes s join public.usuarios us on us.id = s.usuario_id
   where s.token = coalesce(p_token,'') and s.expira_em > now() and us.ativo;
  if u.id is null then raise exception 'SESSAO_INVALIDA'; end if;
  if u.deve_trocar_senha and not p_livre then raise exception 'TROCAR_SENHA'; end if;
  return u;
end $$;

create or replace function public._pode(u public.usuarios, p_perm text) returns boolean
language sql stable as
$$ select u.perfil = 'admin'
       or p_perm = 'ver'
       or (p_perm = 'editar_turmas' and u.perfil = 'editor')
       or (u.perfil <> 'consulta' and p_perm = any(u.permissoes))
       or (u.perfil = 'consulta' and p_perm in ('painel','turmas','ver')) $$;

create or replace function public._exige(p_token text, p_perm text) returns public.usuarios
language plpgsql stable security definer set search_path = public as
$$
declare u public.usuarios := public._sessao(p_token);
begin
  if p_perm = 'admin' then
    if u.perfil <> 'admin' then raise exception 'SEM_PERMISSAO'; end if;
  elsif p_perm is not null and not public._pode(u, p_perm) then
    raise exception 'SEM_PERMISSAO';
  end if;
  return u;
end $$;

create or replace function public._log(p_usuario text, p_acao text, p_detalhe text, p_payload jsonb default null) returns void
language sql security definer set search_path = public as
$$ insert into public.log(usuario, acao, detalhe, payload) values (coalesce(p_usuario,''), p_acao, coalesce(p_detalhe,''), p_payload) $$;

-- Aulas já dadas (presente, atraso ou saída antecipada) por disciplina.
create or replace function public._progresso() returns jsonb
language sql stable security definer set search_path = public as
$$ select coalesce(jsonb_object_agg(disciplina_id, total), '{}'::jsonb) from (
     select disciplina_id, sum(aulas) total from public.registros
      where disciplina_id is not null and status in ('presente','atraso','saida')
      group by disciplina_id) x $$;

create or replace function public._registro_json(r public.registros) returns jsonb
language sql stable as
$$ select jsonb_build_object('id', r.id, 'data', r.data, 'tipo', r.tipo, 'status', r.status, 'aulas', r.aulas,
     'minutos', r.minutos, 'horario', r.horario, 'obs', r.obs, 'justificativa', r.justificativa, 'disciplina_id', r.disciplina_id,
     'professor_id', r.professor_id, 'prof', r.prof_nome, 'disc', r.disc_nome, 'turma', r.turma,
     'diario_id', r.diario_id, 'ch_total', r.ch_total, 'por', r.registrado_por, 'lote', r.lote,
     'origem', r.origem, 'notif_arquivada', r.notif_arquivada, 'criado_em', r.criado_em,
     'atualizado_em', r.atualizado_em, 'atualizado_por', r.atualizado_por) $$;

-- ─────────────────────────────────────────────────────────────── sessão
create or replace function public.status() returns jsonb
language sql stable as $$ select jsonb_build_object('ok', true, 'sistema', 'SUPERT 2', 'servidor', now()) $$;

create or replace function public.login(p_login text, p_senha text, p_dispositivo text default null) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  l text := lower(trim(coalesce(p_login,'')));
  u public.usuarios; tok text;
begin
  if (select count(*) from public.tentativas where login = l and em > now() - interval '15 minutes') >= 8 then
    return jsonb_build_object('erro', 'BLOQUEADO');
  end if;
  select * into u from public.usuarios where login = l and ativo;
  if u.id is null or not public._confere(coalesce(p_senha,''), u.hash) then
    insert into public.tentativas(login) values (l);
    return jsonb_build_object('erro', 'LOGIN_INVALIDO');
  end if;
  delete from public.tentativas where login = l or em < now() - interval '1 day';
  delete from public.sessoes where expira_em < now();
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.sessoes(token, usuario_id, dispositivo) values (tok, u.id, left(p_dispositivo, 180));
  return jsonb_build_object('token', tok, 'usuario', public._usuario_json(u), 'servidor', now());
end $$;

create or replace function public.logout(p_token text) returns void
language sql security definer set search_path = public as
$$ delete from public.sessoes where token = coalesce(p_token,'') $$;

create or replace function public.sessao_info(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare u public.usuarios := public._sessao(p_token, true);
begin
  update public.sessoes set expira_em = greatest(expira_em, now() + interval '2 hours') where token = p_token;
  return jsonb_build_object('usuario', public._usuario_json(u), 'servidor', now(),
    'config', (select jsonb_object_agg(chave, valor) from public.config));
end $$;

create or replace function public.trocar_senha(p_token text, p_atual text, p_nova text) returns void
language plpgsql security definer set search_path = public as
$$
declare u public.usuarios := public._sessao(p_token, true);
begin
  if not public._confere(coalesce(p_atual,''), u.hash) then raise exception 'SENHA_ATUAL_INCORRETA'; end if;
  if length(coalesce(p_nova,'')) < 6 then raise exception 'SENHA_CURTA'; end if;
  if p_nova = p_atual or lower(p_nova) = u.login then raise exception 'SENHA_IGUAL'; end if;
  update public.usuarios set hash = public._hash(p_nova), deve_trocar_senha = false, atualizado_em = now() where id = u.id;
  perform public._log(u.login, 'senha', 'Senha alterada pelo próprio usuário');
end $$;

create or replace function public.versao(p_token text) returns bigint
language plpgsql stable security definer set search_path = public as
$$ begin perform public._sessao(p_token); return (select versao from public.estado where id = 1); end $$;

-- ─────────────────────────────────────────────────────────────── usuários (admin)
create or replace function public.usuarios_listar(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._exige(p_token, 'admin');
  return (select coalesce(jsonb_agg(public._usuario_json(u) order by u.ativo desc, u.login), '[]'::jsonb) from public.usuarios u);
end $$;

create or replace function public.usuario_salvar(p_token text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  eu public.usuarios := public._exige(p_token, 'admin');
  v_id bigint := nullif(p_dados->>'id','')::bigint;
  v_login text := lower(trim(coalesce(p_dados->>'login','')));
  v_perfil text := coalesce(nullif(p_dados->>'perfil',''), 'usuario');
  v_perms text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_dados->'permissoes','[]'::jsonb)) x), '{}');
  v_ativo boolean := coalesce((p_dados->>'ativo')::boolean, true);
  u public.usuarios;
begin
  if v_login !~ '^[a-z0-9._-]{3,40}$' then raise exception 'LOGIN_INVALIDO_FORMATO'; end if;
  if v_id is null then
    if exists(select 1 from public.usuarios where login = v_login) then raise exception 'LOGIN_EM_USO'; end if;
    insert into public.usuarios(login, nome, hash, perfil, permissoes, deve_trocar_senha)
    values (v_login, coalesce(p_dados->>'nome',''), public._hash(coalesce(nullif(p_dados->>'senha',''), v_login)), v_perfil, v_perms, true)
    returning * into u;
    perform public._log(eu.login, 'usuario', 'Usuário criado: ' || v_login);
  else
    if v_id = eu.id and (v_perfil <> 'admin' or not v_ativo) then raise exception 'NAO_PODE_REBAIXAR_A_SI'; end if;
    if exists(select 1 from public.usuarios where login = v_login and id <> v_id) then raise exception 'LOGIN_EM_USO'; end if;
    update public.usuarios set login = v_login, nome = coalesce(p_dados->>'nome', nome), perfil = v_perfil,
      permissoes = v_perms, ativo = v_ativo, atualizado_em = now() where id = v_id returning * into u;
    if u.id is null then raise exception 'NAO_ENCONTRADO'; end if;
    if not v_ativo then delete from public.sessoes where usuario_id = v_id; end if;
    perform public._log(eu.login, 'usuario', 'Usuário alterado: ' || v_login);
  end if;
  if not exists(select 1 from public.usuarios where perfil = 'admin' and ativo) then raise exception 'ULTIMO_ADMIN'; end if;
  return public._usuario_json(u);
end $$;

create or replace function public.usuario_resetar_senha(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'admin'); u public.usuarios; nova text;
begin
  nova := lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  update public.usuarios set hash = public._hash(nova), deve_trocar_senha = true, atualizado_em = now()
   where id = p_id returning * into u;
  if u.id is null then raise exception 'NAO_ENCONTRADO'; end if;
  delete from public.sessoes where usuario_id = p_id;
  perform public._log(eu.login, 'usuario', 'Senha provisória gerada para ' || u.login);
  return jsonb_build_object('login', u.login, 'senha', nova);
end $$;

-- ─────────────────────────────────────────────────────────────── cadastro (professores, disciplinas, horários)
-- Tudo o que o navegador precisa para montar as telas, numa chamada só.
create or replace function public.cadastro(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._sessao(p_token);
  return jsonb_build_object(
    'professores', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'nome_completo', p.nome_completo,
        'matricula', p.matricula, 'setor', p.setor, 'ativo', p.ativo) order by p.nome), '[]'::jsonb) from public.professores p),
    'disciplinas', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'turma', d.turma, 'nome', d.nome,
        'diario_id', d.diario_id, 'ch_total', d.ch_total, 'arquivada_em', d.arquivada_em, 'arquivada_motivo', d.arquivada_motivo,
        'professores', (select coalesce(jsonb_agg(jsonb_build_object('id', dp.id, 'professor_id', dp.professor_id,
              'desde', dp.desde, 'ate', dp.ate) order by dp.ate nulls last, dp.desde), '[]'::jsonb)
            from public.disciplina_professores dp where dp.disciplina_id = d.id),
        'apelidos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'chave', a.chave)), '[]'::jsonb)
            from public.disciplina_apelidos a where a.disciplina_id = d.id)
      ) order by d.turma, d.nome), '[]'::jsonb) from public.disciplinas d),
    'horarios', (select coalesce(jsonb_agg(jsonb_build_array(h.id, h.disciplina_id, h.professor_id, h.dia, h.hora)), '[]'::jsonb) from public.horarios h),
    'progresso', public._progresso(),
    'versao', (select versao from public.estado where id = 1));
end $$;

create or replace function public.professor_salvar(p_token text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'editar_turmas'); v_id bigint := nullif(p_dados->>'id','')::bigint;
  v_nome text := upper(trim(coalesce(p_dados->>'nome',''))); r public.professores;
begin
  if v_nome = '' then raise exception 'NOME_OBRIGATORIO'; end if;
  if exists(select 1 from public.professores where upper(nome) = v_nome and id is distinct from v_id) then raise exception 'PROFESSOR_DUPLICADO'; end if;
  if v_id is null then
    insert into public.professores(nome, nome_completo, matricula, setor)
    values (v_nome, trim(coalesce(p_dados->>'nome_completo','')), trim(coalesce(p_dados->>'matricula','')), trim(coalesce(p_dados->>'setor','')))
    returning * into r;
  else
    update public.professores set nome = v_nome, nome_completo = trim(coalesce(p_dados->>'nome_completo', nome_completo)),
      matricula = trim(coalesce(p_dados->>'matricula', matricula)), setor = trim(coalesce(p_dados->>'setor', setor)),
      ativo = coalesce((p_dados->>'ativo')::boolean, ativo)
     where id = v_id returning * into r;
  end if;
  perform public._log(eu.login, 'professor', 'Professor salvo: ' || v_nome);
  return to_jsonb(r);
end $$;

create or replace function public.professor_excluir(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'editar_turmas'); n text;
begin
  select nome into n from public.professores where id = p_id;
  if exists(select 1 from public.registros where professor_id = p_id) then
    update public.professores set ativo = false where id = p_id;   -- tem histórico: só desativa
    delete from public.horarios where professor_id = p_id;
    update public.disciplina_professores set ate = current_date where professor_id = p_id and ate is null;
  else
    delete from public.professores where id = p_id;
  end if;
  perform public._log(eu.login, 'professor', 'Professor removido: ' || coalesce(n,'?'));
end $$;

-- Cria ou altera uma disciplina da turma, com seus professores atuais e horários.
-- p_dados: {id?, turma, nome, diario_id, ch_total, professores:[id...], horarios:[{professor_id, dia, hora}]}
create or replace function public.disciplina_salvar(p_token text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  eu public.usuarios := public._exige(p_token, 'editar_turmas');
  v_id bigint := nullif(p_dados->>'id','')::bigint;
  v_turma text := trim(coalesce(p_dados->>'turma',''));
  v_nome text := trim(coalesce(p_dados->>'nome',''));
  v_antigo text; pid bigint;
  v_profs bigint[] := coalesce((select array_agg(x::bigint) from jsonb_array_elements_text(coalesce(p_dados->'professores','[]'::jsonb)) x), '{}');
begin
  if v_turma = '' or v_nome = '' then raise exception 'NOME_OBRIGATORIO'; end if;
  if v_id is null then
    insert into public.disciplinas(turma, nome, diario_id, ch_total)
    values (v_turma, v_nome, nullif(p_dados->>'diario_id','')::bigint, nullif(p_dados->>'ch_total','')::int) returning id into v_id;
  else
    select nome into v_antigo from public.disciplinas where id = v_id;
    if v_antigo is null then raise exception 'NAO_ENCONTRADO'; end if;
    update public.disciplinas set turma = v_turma, nome = v_nome, diario_id = nullif(p_dados->>'diario_id','')::bigint,
      ch_total = nullif(p_dados->>'ch_total','')::int, atualizado_em = now() where id = v_id;
    if public._chave(v_antigo) <> public._chave(v_nome) then
      insert into public.disciplina_apelidos(disciplina_id, turma, nome, chave)
      values (v_id, v_turma, v_antigo, public._chave(v_antigo)) on conflict (turma, chave) do nothing;
    end if;
  end if;
  -- professores atuais: encerra quem saiu, abre quem entrou
  update public.disciplina_professores set ate = current_date
   where disciplina_id = v_id and ate is null and not (professor_id = any(v_profs));
  foreach pid in array v_profs loop
    if not exists(select 1 from public.disciplina_professores where disciplina_id = v_id and professor_id = pid and ate is null) then
      insert into public.disciplina_professores(disciplina_id, professor_id, desde) values (v_id, pid, current_date);
    end if;
  end loop;
  if p_dados ? 'horarios' then
    delete from public.horarios where disciplina_id = v_id;
    insert into public.horarios(disciplina_id, professor_id, dia, hora)
    select distinct v_id, (h->>'professor_id')::bigint, (h->>'dia')::smallint, h->>'hora'
      from jsonb_array_elements(p_dados->'horarios') h
     where (h->>'professor_id')::bigint = any(v_profs)
    on conflict do nothing;
  end if;
  perform public._log(eu.login, 'disciplina', 'Disciplina salva: ' || v_nome || ' · ' || v_turma);
  return jsonb_build_object('id', v_id);
end $$;

-- Troca o professor de uma disciplina (anual) sem perder o histórico nem a contagem de aulas.
create or replace function public.disciplina_trocar_professor(p_token text, p_disciplina bigint, p_de bigint, p_para bigint,
  p_desde date default current_date, p_mover_horarios boolean default true) returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'editar_turmas'); dn text; pn1 text; pn2 text;
begin
  select nome || ' · ' || turma into dn from public.disciplinas where id = p_disciplina;
  if dn is null then raise exception 'NAO_ENCONTRADO'; end if;
  select nome into pn1 from public.professores where id = p_de;
  select nome into pn2 from public.professores where id = p_para;
  if pn2 is null then raise exception 'NAO_ENCONTRADO'; end if;
  if p_de is not null then
    update public.disciplina_professores set ate = coalesce(p_desde, current_date) - 1
     where disciplina_id = p_disciplina and professor_id = p_de and ate is null;
  end if;
  if not exists(select 1 from public.disciplina_professores where disciplina_id = p_disciplina and professor_id = p_para and ate is null) then
    insert into public.disciplina_professores(disciplina_id, professor_id, desde) values (p_disciplina, p_para, coalesce(p_desde, current_date));
  end if;
  if p_mover_horarios and p_de is not null then
    insert into public.horarios(disciplina_id, professor_id, dia, hora)
    select disciplina_id, p_para, dia, hora from public.horarios where disciplina_id = p_disciplina and professor_id = p_de
    on conflict do nothing;
    delete from public.horarios where disciplina_id = p_disciplina and professor_id = p_de;
  end if;
  perform public._log(eu.login, 'disciplina', 'Troca de professor em ' || dn || ': ' || coalesce(pn1,'(nenhum)') || ' → ' || pn2 ||
    ' a partir de ' || to_char(coalesce(p_desde, current_date), 'DD/MM/YYYY'));
end $$;

create or replace function public.disciplinas_arquivar(p_token text, p_ids bigint[], p_arquivar boolean, p_motivo text default null) returns int
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'editar_turmas'); n int;
begin
  if p_arquivar then
    update public.disciplinas set arquivada_em = now(), arquivada_motivo = p_motivo, atualizado_em = now()
     where id = any(p_ids) and arquivada_em is null;
  else
    update public.disciplinas set arquivada_em = null, arquivada_motivo = null, atualizado_em = now()
     where id = any(p_ids) and arquivada_em is not null;
  end if;
  get diagnostics n = row_count;
  perform public._log(eu.login, 'disciplina', case when p_arquivar then 'Arquivadas: ' else 'Desarquivadas: ' end || n || coalesce(' · ' || p_motivo, ''));
  return n;
end $$;

create or replace function public.disciplina_excluir(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'editar_turmas'); dn text;
begin
  select nome || ' · ' || turma into dn from public.disciplinas where id = p_id;
  if exists(select 1 from public.registros where disciplina_id = p_id) then
    update public.disciplinas set arquivada_em = now(), arquivada_motivo = 'Removida (tem registros)' where id = p_id;
    delete from public.horarios where disciplina_id = p_id;
  else
    delete from public.disciplinas where id = p_id;
  end if;
  perform public._log(eu.login, 'disciplina', 'Disciplina removida: ' || coalesce(dn,'?'));
end $$;

-- Junta duas disciplinas que são a mesma (nomes diferentes). Os registros, horários e
-- professores da removida passam para a mantida, e o nome antigo vira apelido.
create or replace function public.disciplinas_unificar(p_token text, p_manter bigint, p_remover bigint) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'editar_turmas'); m public.disciplinas; r public.disciplinas; n int;
begin
  select * into m from public.disciplinas where id = p_manter;
  select * into r from public.disciplinas where id = p_remover;
  if m.id is null or r.id is null or m.id = r.id then raise exception 'NAO_ENCONTRADO'; end if;
  update public.registros set disciplina_id = m.id where disciplina_id = r.id;
  get diagnostics n = row_count;
  insert into public.horarios(disciplina_id, professor_id, dia, hora)
    select m.id, professor_id, dia, hora from public.horarios where disciplina_id = r.id on conflict do nothing;
  insert into public.disciplina_professores(disciplina_id, professor_id, desde, ate)
    select m.id, dp.professor_id, dp.desde, dp.ate from public.disciplina_professores dp
     where dp.disciplina_id = r.id
       and not exists(select 1 from public.disciplina_professores x where x.disciplina_id = m.id and x.professor_id = dp.professor_id
                        and x.ate is not distinct from dp.ate);
  insert into public.disciplina_apelidos(disciplina_id, turma, nome, chave)
    select m.id, m.turma, a.nome, a.chave from public.disciplina_apelidos a where a.disciplina_id = r.id
  on conflict (turma, chave) do update set disciplina_id = excluded.disciplina_id;
  if public._chave(r.nome) <> public._chave(m.nome) then
    insert into public.disciplina_apelidos(disciplina_id, turma, nome, chave) values (m.id, m.turma, r.nome, public._chave(r.nome))
    on conflict (turma, chave) do update set disciplina_id = excluded.disciplina_id;
  end if;
  update public.disciplinas set diario_id = coalesce(m.diario_id, r.diario_id), ch_total = coalesce(m.ch_total, r.ch_total),
    arquivada_em = case when m.arquivada_em is not null and r.arquivada_em is null then null else m.arquivada_em end,
    atualizado_em = now() where id = m.id;
  delete from public.disciplinas where id = r.id;
  perform public._log(eu.login, 'disciplina', 'Unificadas: "' || r.nome || '" em "' || m.nome || '" (' || m.turma || '), ' || n || ' registro(s) movidos');
  return jsonb_build_object('registros', n);
end $$;

create or replace function public.apelido_salvar(p_token text, p_disciplina bigint, p_nome text) returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'editar_turmas'); t text;
begin
  select turma into t from public.disciplinas where id = p_disciplina;
  if t is null then raise exception 'NAO_ENCONTRADO'; end if;
  insert into public.disciplina_apelidos(disciplina_id, turma, nome, chave) values (p_disciplina, t, trim(p_nome), public._chave(p_nome))
  on conflict (turma, chave) do update set disciplina_id = excluded.disciplina_id, nome = excluded.nome;
end $$;

create or replace function public.apelido_excluir(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as
$$ begin perform public._exige(p_token, 'editar_turmas'); delete from public.disciplina_apelidos where id = p_id; end $$;

-- Aplica o resultado da conciliação de um horário novo (planilha).
-- p_plano: {
--   continuar: [{disciplina_id, nome_planilha, professores:[{professor_id|nome}], horarios:[{prof(idx), dia, hora}], atualizar_nome:bool}],
--   novas:     [{turma, nome, professores:[...], horarios:[...]}],
--   arquivar:  [disciplina_id...],
--   data_troca: 'YYYY-MM-DD' }
-- Professores podem vir por id ou por nome (criados se não existirem).
create or replace function public.importar_horario(p_token text, p_plano jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  eu public.usuarios := public._exige(p_token, 'admin');
  v_data date := coalesce(nullif(p_plano->>'data_troca','')::date, current_date);
  c jsonb; p jsonb; h jsonb; v_disc bigint; v_prof bigint; v_profs bigint[]; v_nome text; v_turma text;
  n_cont int := 0; n_nova int := 0; n_arq int := 0; n_troca int := 0; n_prof_novo int := 0;
begin
  -- 1) arquivamentos
  update public.disciplinas set arquivada_em = now(), arquivada_motivo = 'Arquivada na importação do horário de ' || to_char(v_data,'DD/MM/YYYY')
   where id in (select x::bigint from jsonb_array_elements_text(coalesce(p_plano->'arquivar','[]'::jsonb)) x) and arquivada_em is null;
  get diagnostics n_arq = row_count;

  -- 2) continuações e 3) novas: mesmo tratamento, muda só a criação da disciplina
  for c in select * from jsonb_array_elements(coalesce(p_plano->'continuar','[]'::jsonb) || coalesce(p_plano->'novas','[]'::jsonb)) loop
    v_disc := nullif(c->>'disciplina_id','')::bigint;
    if v_disc is null then
      insert into public.disciplinas(turma, nome, diario_id, ch_total)
      values (trim(c->>'turma'), trim(c->>'nome'), nullif(c->>'diario_id','')::bigint, nullif(c->>'ch_total','')::int)
      returning id into v_disc;
      n_nova := n_nova + 1;
    else
      select turma, nome into v_turma, v_nome from public.disciplinas where id = v_disc;
      if v_turma is null then continue; end if;
      update public.disciplinas set arquivada_em = null, arquivada_motivo = null, atualizado_em = now() where id = v_disc;
      -- guarda o nome da planilha como apelido (reconhecimento automático na próxima vez)
      if coalesce(c->>'nome_planilha','') <> '' and public._chave(c->>'nome_planilha') <> public._chave(v_nome) then
        insert into public.disciplina_apelidos(disciplina_id, turma, nome, chave)
        values (v_disc, v_turma, trim(c->>'nome_planilha'), public._chave(c->>'nome_planilha'))
        on conflict (turma, chave) do update set disciplina_id = excluded.disciplina_id;
      end if;
      if coalesce((c->>'atualizar_nome')::boolean, false) and coalesce(c->>'nome_planilha','') <> '' then
        insert into public.disciplina_apelidos(disciplina_id, turma, nome, chave) values (v_disc, v_turma, v_nome, public._chave(v_nome))
        on conflict (turma, chave) do update set disciplina_id = excluded.disciplina_id;
        update public.disciplinas set nome = trim(c->>'nome_planilha') where id = v_disc;
      end if;
      n_cont := n_cont + 1;
    end if;
    -- professores da planilha para esta disciplina
    v_profs := '{}';
    for p in select * from jsonb_array_elements(coalesce(c->'professores','[]'::jsonb)) loop
      v_prof := nullif(p->>'professor_id','')::bigint;
      if v_prof is null and coalesce(trim(p->>'nome'),'') <> '' then
        select id into v_prof from public.professores where upper(nome) = upper(trim(p->>'nome'));
        if v_prof is null then
          insert into public.professores(nome) values (upper(trim(p->>'nome'))) returning id into v_prof;
          n_prof_novo := n_prof_novo + 1;
        end if;
      end if;
      if v_prof is not null then v_profs := v_profs || v_prof; end if;
    end loop;
    -- encerra vínculos de quem saiu (troca de professor) e abre os novos
    if array_length(v_profs, 1) > 0 then
      if exists(select 1 from public.disciplina_professores where disciplina_id = v_disc and ate is null and not (professor_id = any(v_profs))) then
        n_troca := n_troca + 1;
      end if;
      update public.disciplina_professores set ate = v_data - 1
       where disciplina_id = v_disc and ate is null and not (professor_id = any(v_profs));
      foreach v_prof in array v_profs loop
        if not exists(select 1 from public.disciplina_professores where disciplina_id = v_disc and professor_id = v_prof and ate is null) then
          insert into public.disciplina_professores(disciplina_id, professor_id, desde) values (v_disc, v_prof, v_data);
        end if;
      end loop;
    end if;
    -- horários: substitui pelos da planilha
    delete from public.horarios where disciplina_id = v_disc;
    for h in select * from jsonb_array_elements(coalesce(c->'horarios','[]'::jsonb)) loop
      v_prof := v_profs[coalesce((h->>'prof')::int, 0) + 1];
      if v_prof is null then continue; end if;
      insert into public.horarios(disciplina_id, professor_id, dia, hora) values (v_disc, v_prof, (h->>'dia')::smallint, h->>'hora')
      on conflict do nothing;
    end loop;
  end loop;
  perform public._log(eu.login, 'importacao', format('Horário importado: %s continuadas (%s com troca de professor), %s novas, %s arquivadas, %s professores novos',
    n_cont, n_troca, n_nova, n_arq, n_prof_novo));
  return jsonb_build_object('continuadas', n_cont, 'trocas', n_troca, 'novas', n_nova, 'arquivadas', n_arq, 'professores_novos', n_prof_novo);
end $$;

-- Atualiza diário do SUAP e CH de várias disciplinas de uma vez. p_itens: [{id, diario_id, ch_total}]
create or replace function public.diarios_vincular(p_token text, p_itens jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'admin'); n int;
begin
  update public.disciplinas d set diario_id = coalesce(nullif(x->>'diario_id','')::bigint, d.diario_id),
    ch_total = coalesce(nullif(x->>'ch_total','')::int, d.ch_total), atualizado_em = now()
    from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) x where d.id = (x->>'id')::bigint;
  get diagnostics n = row_count;
  perform public._log(eu.login, 'importacao', 'Diários do SUAP vinculados: ' || n);
  return n;
end $$;

-- ─────────────────────────────────────────────────────────────── registros de aula
-- p_f: {ini, fim, professor_id, prof, turma, disciplina_id, status, limite}
create or replace function public.registros_listar(p_token text, p_f jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare lim int := least(coalesce(nullif(p_f->>'limite','')::int, 30000), 50000);
begin
  perform public._exige(p_token, 'ver');
  return (select coalesce(jsonb_agg(public._registro_json(r) order by r.data desc, r.criado_em desc), '[]'::jsonb) from (
    select * from public.registros r
     where (nullif(p_f->>'ini','') is null or r.data >= (p_f->>'ini')::date)
       and (nullif(p_f->>'fim','') is null or r.data <= (p_f->>'fim')::date)
       and (nullif(p_f->>'professor_id','') is null or r.professor_id = (p_f->>'professor_id')::bigint)
       and (nullif(p_f->>'disciplina_id','') is null or r.disciplina_id = (p_f->>'disciplina_id')::bigint)
       and (nullif(p_f->>'turma','') is null or r.turma = p_f->>'turma')
       and (nullif(p_f->>'status','') is null or r.status = p_f->>'status')
     order by r.data desc, r.criado_em desc limit lim) r);
end $$;

create or replace function public.exclusoes_listar(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._exige(p_token, 'ver');
  return (select coalesce(jsonb_agg(jsonb_build_object('registro_id', e.registro_id, 'por', e.solicitado_por, 'motivo', e.motivo,
      'em', e.criado_em, 'registro', public._registro_json(r)) order by e.criado_em), '[]'::jsonb)
    from public.exclusoes e join public.registros r on r.id = e.registro_id);
end $$;

-- Preenche os campos de "foto" (nomes, turma, diário) a partir dos ids.
create or replace function public._completar(r public.registros) returns public.registros
language plpgsql stable security definer set search_path = public as
$$
declare d public.disciplinas; p public.professores;
begin
  if r.disciplina_id is not null then
    select * into d from public.disciplinas where id = r.disciplina_id;
    if d.id is not null then
      r.disc_nome := coalesce(nullif(r.disc_nome,''), d.nome); r.turma := coalesce(nullif(r.turma,''), d.turma);
      r.diario_id := coalesce(r.diario_id, d.diario_id); r.ch_total := coalesce(r.ch_total, d.ch_total);
    end if;
  end if;
  if r.professor_id is not null then
    select * into p from public.professores where id = r.professor_id;
    if p.id is not null then r.prof_nome := coalesce(nullif(r.prof_nome,''), p.nome); end if;
  end if;
  return r;
end $$;

create or replace function public._reg_de_json(j jsonb, p_por text) returns public.registros
language plpgsql stable as
$$
declare r public.registros;
begin
  r.id := coalesce(nullif(j->>'id',''), replace(gen_random_uuid()::text, '-', ''));
  r.data := (j->>'data')::date;
  r.tipo := coalesce(nullif(j->>'tipo',''), 'regular');
  r.status := j->>'status';
  r.aulas := case when j->>'status' = 'nao' then 0 else coalesce(nullif(j->>'aulas','')::int, 1) end;
  r.justificativa := case when j->>'status' = 'nao' then trim(coalesce(j->>'justificativa','')) else '' end;
  r.minutos := case when j->>'status' in ('atraso','saida') then nullif(j->>'minutos','')::int end;
  r.horario := nullif(j->>'horario','');
  r.obs := coalesce(j->>'obs','');
  r.disciplina_id := nullif(j->>'disciplina_id','')::bigint;
  r.professor_id := nullif(j->>'professor_id','')::bigint;
  r.prof_nome := coalesce(j->>'prof','');
  r.disc_nome := coalesce(j->>'disc','');
  r.turma := coalesce(j->>'turma','');
  r.diario_id := nullif(j->>'diario_id','')::bigint;
  r.ch_total := nullif(j->>'ch_total','')::int;
  r.registrado_por := p_por;
  r.lote := nullif(j->>'lote','');
  r.origem := coalesce(nullif(j->>'origem',''), 'manual');
  r.notif_arquivada := false;
  r.criado_em := now();
  if r.data is null then raise exception 'DATA_OBRIGATORIA'; end if;
  if r.status is null then raise exception 'STATUS_OBRIGATORIO'; end if;
  if r.status = 'nao' and r.justificativa = '' then raise exception 'JUSTIFICATIVA_OBRIGATORIA'; end if;
  if r.data > current_date + 1 then raise exception 'DATA_FUTURA'; end if;
  return r;
end $$;

create or replace function public._conflito(r public.registros) returns text
language sql stable security definer set search_path = public as
$$ select x.id from public.registros x
    where x.data = r.data and x.tipo = 'regular' and x.id <> r.id
      and ((r.disciplina_id is not null and x.disciplina_id = r.disciplina_id) or (r.disciplina_id is null and x.disc_nome = r.disc_nome and x.turma = r.turma))
      and ((r.professor_id is not null and x.professor_id = r.professor_id) or (r.professor_id is null and x.prof_nome = r.prof_nome))
    limit 1 $$;

-- Salva um registro individual. Regular repetido (mesmo professor, disciplina e dia) → erro JA_EXISTE_REGULAR.
-- p_reg.permuta = {professor_id, disciplina_id, horario} lança também a falta do professor substituído.
create or replace function public.registro_salvar(p_token text, p_reg jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  eu public.usuarios := public._sessao(p_token);
  r public.registros; f public.registros; v_novo boolean := nullif(p_reg->>'id','') is null; pm jsonb := p_reg->'permuta';
  v_old public.registros;
begin
  if not (public._pode(eu, 'turno') or public._pode(eu, 'registrar')) then raise exception 'SEM_PERMISSAO'; end if;
  r := public._completar(public._reg_de_json(p_reg, eu.login));
  if not v_novo then
    select * into v_old from public.registros where id = r.id;
    if v_old.id is null then raise exception 'NAO_ENCONTRADO'; end if;
  end if;
  if r.tipo = 'regular' and public._conflito(r) is not null then raise exception 'JA_EXISTE_REGULAR'; end if;
  if v_novo then
    if r.tipo = 'permuta' and pm is not null then
      f := public._completar(public._reg_de_json(jsonb_build_object('data', r.data, 'tipo', 'regular', 'status', 'ausente',
        'aulas', r.aulas, 'horario', coalesce(pm->>'horario', r.horario), 'disciplina_id', pm->>'disciplina_id', 'professor_id', pm->>'professor_id',
        'origem', 'permuta', 'obs', 'Falta por permuta com ' || r.prof_nome || ' (' || r.disc_nome || ' · ' || r.turma || ')'), eu.login));
      r.obs := trim(both ' ·' from r.obs || ' · Aula assumida em permuta de ' || f.prof_nome || ' (' || f.disc_nome || ' · ' || f.turma || ')');
      if public._conflito(f) is null then insert into public.registros select f.*; end if;
    end if;
    insert into public.registros select r.*;
    perform public._log(eu.login, 'insert', format('Prof: %s | %s | Turma: %s | %s aula(s) | %s | %s', r.prof_nome, r.disc_nome, r.turma, r.aulas, r.status, to_char(r.data,'DD/MM/YYYY')));
  else
    update public.registros set data = r.data, tipo = r.tipo, status = r.status, aulas = r.aulas, minutos = r.minutos, horario = r.horario,
      obs = r.obs, justificativa = r.justificativa, disciplina_id = r.disciplina_id, professor_id = r.professor_id, prof_nome = r.prof_nome, disc_nome = r.disc_nome,
      turma = r.turma, diario_id = r.diario_id, ch_total = r.ch_total, atualizado_em = now(), atualizado_por = eu.login
     where id = r.id;
    perform public._log(eu.login, 'edit', format('Registro editado: %s | %s | %s', r.prof_nome, r.disc_nome, to_char(r.data,'DD/MM/YYYY')), to_jsonb(v_old));
  end if;
  return public._registro_json(r);
end $$;

-- Lançamento do turno: vários registros de uma vez. Pula os que já existem (mesmo professor, disciplina e dia).
create or replace function public.registros_lancar(p_token text, p_regs jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  eu public.usuarios := public._sessao(p_token);
  j jsonb; r public.registros; v_lote text := replace(gen_random_uuid()::text, '-', '');
  n_ok int := 0; n_pulado int := 0; n_falta int := 0; pulados jsonb := '[]'::jsonb;
begin
  if not public._pode(eu, 'turno') then raise exception 'SEM_PERMISSAO'; end if;
  for j in select * from jsonb_array_elements(coalesce(p_regs,'[]'::jsonb)) loop
    r := public._completar(public._reg_de_json(j || jsonb_build_object('lote', v_lote, 'origem', 'turno', 'tipo', 'regular'), eu.login));
    if public._conflito(r) is not null then
      n_pulado := n_pulado + 1; pulados := pulados || jsonb_build_object('prof', r.prof_nome, 'disc', r.disc_nome, 'turma', r.turma);
      continue;
    end if;
    insert into public.registros select r.*;
    n_ok := n_ok + 1;
    if r.status not in ('presente','nao') then n_falta := n_falta + 1; end if;
  end loop;
  if n_ok > 0 then
    perform public._log(eu.login, 'turno', format('Lançamento do turno: %s registro(s) em %s, %s com falta/atraso/saída', n_ok,
      to_char((p_regs->0->>'data')::date, 'DD/MM/YYYY'), n_falta), jsonb_build_object('lote', v_lote));
  end if;
  return jsonb_build_object('lote', v_lote, 'lancados', n_ok, 'pulados', n_pulado, 'lista_pulados', pulados);
end $$;

-- Exclusão: admin e editor excluem na hora (fica no log para restaurar); os demais geram um pedido.
create or replace function public.registro_excluir(p_token text, p_id text, p_motivo text default '') returns jsonb
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._sessao(p_token); r public.registros;
begin
  select * into r from public.registros where id = p_id;
  if r.id is null then raise exception 'NAO_ENCONTRADO'; end if;
  if eu.perfil in ('admin','editor') then   -- v2.2: editores também excluem sem pedir autorização
    delete from public.registros where id = p_id;
    perform public._log(eu.login, 'delete', format('Prof: %s | %s | Turma: %s | %s aula(s) | %s | %s', r.prof_nome, r.disc_nome, r.turma, r.aulas, r.status, to_char(r.data,'DD/MM/YYYY')), to_jsonb(r));
    return jsonb_build_object('excluido', true);
  end if;
  if not (public._pode(eu, 'turno') or public._pode(eu, 'registrar')) then raise exception 'SEM_PERMISSAO'; end if;
  insert into public.exclusoes(registro_id, solicitado_por, motivo) values (p_id, eu.login, coalesce(p_motivo,''))
  on conflict (registro_id) do nothing;
  return jsonb_build_object('pedido', true);
end $$;

create or replace function public.exclusao_decidir(p_token text, p_id text, p_aprovar boolean) returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'admin'); r public.registros; e public.exclusoes;
begin
  select * into e from public.exclusoes where registro_id = p_id;
  if e.registro_id is null then raise exception 'NAO_ENCONTRADO'; end if;
  if p_aprovar then
    select * into r from public.registros where id = p_id;
    delete from public.registros where id = p_id;
    perform public._log(eu.login, 'delete', format('[APROVADO, pedido de %s] Prof: %s | %s | %s | %s', e.solicitado_por, r.prof_nome, r.disc_nome, r.turma, to_char(r.data,'DD/MM/YYYY')), to_jsonb(r));
  else
    delete from public.exclusoes where registro_id = p_id;
  end if;
end $$;

create or replace function public.registro_arquivar_notif(p_token text, p_id text, p_arquivar boolean) returns void
language plpgsql security definer set search_path = public as
$$ begin perform public._exige(p_token, 'notificacoes'); update public.registros set notif_arquivada = p_arquivar where id = p_id; end $$;

-- ─────────────────────────────────────────────────────────────── log
create or replace function public.log_listar(p_token text, p_limite int default 500) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._exige(p_token, 'admin');
  return (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'em', l.em, 'usuario', l.usuario, 'acao', l.acao,
      'detalhe', l.detalhe, 'restauravel', l.acao = 'delete' and l.payload is not null) order by l.em desc), '[]'::jsonb)
    from (select * from public.log order by em desc limit least(coalesce(p_limite, 500), 5000)) l);
end $$;

create or replace function public.log_restaurar(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'admin'); l public.log; r public.registros;
begin
  select * into l from public.log where id = p_id;
  if l.id is null or l.acao <> 'delete' or l.payload is null then raise exception 'NAO_ENCONTRADO'; end if;
  r := jsonb_populate_record(null::public.registros, l.payload);
  if exists(select 1 from public.registros where id = r.id) then raise exception 'JA_RESTAURADO'; end if;
  if r.disciplina_id is not null and not exists(select 1 from public.disciplinas where id = r.disciplina_id) then r.disciplina_id := null; end if;
  if r.professor_id is not null and not exists(select 1 from public.professores where id = r.professor_id) then r.professor_id := null; end if;
  insert into public.registros select r.*;
  update public.log set payload = null, detalhe = detalhe || ' [RESTAURADO]' where id = p_id;
  perform public._log(eu.login, 'restore', 'Registro restaurado: ' || r.prof_nome || ' | ' || r.disc_nome || ' | ' || to_char(r.data,'DD/MM/YYYY'));
end $$;

-- ─────────────────────────────────────────────────────────────── recursos (chaves, equipamentos, materiais)
create or replace function public.recursos(p_token text, p_hist_dias int default 60) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._exige(p_token, 'recursos');
  return jsonb_build_object(
    'itens', (select coalesce(jsonb_agg(to_jsonb(i) order by i.tipo, i.c1), '[]'::jsonb) from public.rec_itens i where i.ativo),
    'movs', (select coalesce(jsonb_agg(to_jsonb(m) order by m.entregue_em desc), '[]'::jsonb) from public.rec_movs m
              where m.devolvido_em is null or m.entregue_em > now() - make_interval(days => coalesce(p_hist_dias, 60))),
    'servidores', (select coalesce(jsonb_agg(to_jsonb(s) order by s.nome), '[]'::jsonb) from public.servidores s));
end $$;

create or replace function public.rec_historico(p_token text, p_tipo text, p_ini date, p_fim date) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._exige(p_token, 'recursos');
  return (select coalesce(jsonb_agg(to_jsonb(m) order by m.entregue_em desc), '[]'::jsonb) from public.rec_movs m
           where m.tipo = p_tipo and m.entregue_em::date between coalesce(p_ini, '2000-01-01') and coalesce(p_fim, current_date));
end $$;

-- v2.2: materiais de almoxarifado com foto (data URI reduzida) e quantidade em estoque
alter table public.rec_itens add column if not exists foto text not null default '';
alter table public.rec_itens add column if not exists qtd int;
create or replace function public.rec_item_salvar(p_token text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'recursos_gerir'); i public.rec_itens;
begin
  if nullif(p_dados->>'id','') is null then
    insert into public.rec_itens(tipo, c1, c2, icone, bloco, foto, qtd)
    values (p_dados->>'tipo', trim(coalesce(p_dados->>'c1','')), trim(coalesce(p_dados->>'c2','')), coalesce(p_dados->>'icone',''), nullif(p_dados->>'bloco',''),
            coalesce(p_dados->>'foto',''), nullif(p_dados->>'qtd','')::int)
    returning * into i;
  else
    update public.rec_itens set c1 = trim(coalesce(p_dados->>'c1', c1)), c2 = trim(coalesce(p_dados->>'c2', c2)),
      icone = coalesce(p_dados->>'icone', icone), bloco = case when p_dados ? 'bloco' then nullif(p_dados->>'bloco','') else bloco end,
      foto = case when p_dados ? 'foto' then coalesce(p_dados->>'foto','') else foto end,
      qtd = case when p_dados ? 'qtd' then nullif(p_dados->>'qtd','')::int else qtd end
     where id = p_dados->>'id' returning * into i;
  end if;
  return to_jsonb(i);
end $$;

create or replace function public.rec_item_excluir(p_token text, p_id text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform public._exige(p_token, 'recursos_gerir');
  if exists(select 1 from public.rec_movs where item_id = p_id and devolvido_em is null) then raise exception 'ITEM_EM_USO'; end if;
  update public.rec_itens set ativo = false where id = p_id;
end $$;

-- Retirada de um ou vários itens pelo mesmo servidor (um movimento por item).
create or replace function public.rec_retirar(p_token text, p_tipo text, p_itens text[], p_matricula text, p_nome text) returns int
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'recursos'); it text; n int := 0; v_nome text := trim(coalesce(p_nome,''));
begin
  if v_nome = '' then raise exception 'NOME_OBRIGATORIO'; end if;
  if coalesce(trim(p_matricula),'') <> '' and not exists(select 1 from public.servidores where matricula = trim(p_matricula)) then
    insert into public.servidores(nome, matricula) values (v_nome, trim(p_matricula));
  end if;
  foreach it in array p_itens loop
    if p_tipo <> 'mat' and exists(select 1 from public.rec_movs where item_id = it and devolvido_em is null) then continue; end if;
    insert into public.rec_movs(tipo, item_id, matricula, servidor_nome, entregue_por, devolvido_em)
    values (p_tipo, it, trim(coalesce(p_matricula,'')), v_nome, eu.login, case when p_tipo = 'mat' then now() end);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.rec_devolver(p_token text, p_mov text, p_obs text default '') returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'recursos');
begin
  update public.rec_movs set devolvido_em = now(), recebido_por = eu.login,
    obs = trim(both ' ·' from obs || ' · ' || coalesce(p_obs,'')) where id = p_mov and devolvido_em is null;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
end $$;

-- Permuta de chave: fecha o movimento atual e abre outro no nome de quem ficou com a chave.
create or replace function public.rec_permutar(p_token text, p_mov text, p_matricula text, p_nome text) returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'recursos'); m public.rec_movs;
begin
  select * into m from public.rec_movs where id = p_mov and devolvido_em is null;
  if m.id is null then raise exception 'NAO_ENCONTRADO'; end if;
  update public.rec_movs set devolvido_em = now(), recebido_por = eu.login, permutado_para = p_nome, permutado_mat = p_matricula,
    obs = trim(both ' ·' from obs || ' · Permutada para ' || p_nome) where id = p_mov;
  insert into public.rec_movs(tipo, item_id, matricula, servidor_nome, entregue_por, permuta_origem)
  values (m.tipo, m.item_id, coalesce(p_matricula,''), p_nome, eu.login || ' (permuta de ' || coalesce(nullif(m.servidor_nome,''), m.matricula) || ')', m.id);
end $$;

create or replace function public.servidor_salvar(p_token text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s public.servidores;
begin
  perform public._exige(p_token, 'recursos_gerir');
  if coalesce(trim(p_dados->>'nome'),'') = '' then raise exception 'NOME_OBRIGATORIO'; end if;
  if nullif(p_dados->>'id','') is null then
    if coalesce(trim(p_dados->>'matricula'),'') <> '' and exists(select 1 from public.servidores where matricula = trim(p_dados->>'matricula')) then
      raise exception 'MATRICULA_DUPLICADA'; end if;
    insert into public.servidores(nome, matricula, setor) values (trim(p_dados->>'nome'), trim(coalesce(p_dados->>'matricula','')), trim(coalesce(p_dados->>'setor','')))
    returning * into s;
  else
    update public.servidores set nome = trim(p_dados->>'nome'), matricula = trim(coalesce(p_dados->>'matricula','')), setor = trim(coalesce(p_dados->>'setor',''))
     where id = (p_dados->>'id')::bigint returning * into s;
  end if;
  return to_jsonb(s);
end $$;

create or replace function public.servidor_excluir(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as
$$ begin perform public._exige(p_token, 'recursos_gerir'); delete from public.servidores where id = p_id; end $$;

-- ─────────────────────────────────────────────────────────────── configurações
create or replace function public.config_salvar(p_token text, p_chave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'admin');
begin
  insert into public.config(chave, valor) values (p_chave, p_valor) on conflict (chave) do update set valor = excluded.valor;
  perform public._log(eu.login, 'config', 'Configuração alterada: ' || p_chave);
end $$;

-- Cópia completa (JSON) para o admin baixar.
create or replace function public._dump() returns jsonb
language sql stable security definer set search_path = public as
$$ select jsonb_build_object('sistema', 'SUPERT 2', 'gerado_em', now(),
     'usuarios', (select coalesce(jsonb_agg(to_jsonb(u) - 'hash'), '[]') from public.usuarios u),
     'professores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.professores x),
     'disciplinas', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.disciplinas x),
     'disciplina_professores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.disciplina_professores x),
     'disciplina_apelidos', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.disciplina_apelidos x),
     'horarios', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.horarios x),
     'registros', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.registros x),
     'exclusoes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.exclusoes x),
     'servidores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.servidores x),
     'rec_itens', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.rec_itens x),
     'rec_movs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.rec_movs x),
     'config', (select coalesce(jsonb_object_agg(chave, valor), '{}') from public.config),
     'log', (select coalesce(jsonb_agg(to_jsonb(x) order by x.em desc), '[]') from (select * from public.log order by em desc limit 3000) x)) $$;

create or replace function public.backup_baixar(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$ begin perform public._exige(p_token, 'admin'); return public._dump(); end $$;

-- Backup automático no Google Drive (Apps Script): o script guarda um segredo e usa estas funções.
create or replace function public.backup_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._exige(p_token, 'admin');
  return jsonb_build_object('conectado', (select segredo_hash is not null from public.backup_cfg where id = 1),
    'config', (select config from public.backup_cfg where id = 1),
    'ultimos', (select coalesce(jsonb_agg(to_jsonb(b) order by b.em desc), '[]') from (select * from public.backups_feitos order by em desc limit 10) b));
end $$;

create or replace function public.backup_registrar(p_token text, p_segredo text, p_config jsonb) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform public._exige(p_token, 'admin');
  update public.backup_cfg set segredo_hash = encode(extensions.digest(p_segredo, 'sha256'), 'hex'), config = coalesce(p_config, '{}'), ts = now() where id = 1;
end $$;

create or replace function public._backup_ok(p_segredo text) returns void
language plpgsql stable security definer set search_path = public, extensions as
$$
begin
  if not exists(select 1 from public.backup_cfg where id = 1 and segredo_hash = encode(extensions.digest(coalesce(p_segredo,''), 'sha256'), 'hex')) then
    raise exception 'SEGREDO_INVALIDO';
  end if;
end $$;

create or replace function public.backup_dump(p_segredo text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$ begin perform public._backup_ok(p_segredo); return public._dump(); end $$;

create or replace function public.backup_anotar(p_segredo text, p_tipo text, p_url text, p_detalhe text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform public._backup_ok(p_segredo);
  insert into public.backups_feitos(tipo, arquivo_url, detalhe) values (p_tipo, p_url, p_detalhe);
  delete from public.backups_feitos where id not in (select id from public.backups_feitos order by em desc limit 200);
end $$;

create or replace function public.ping(p_segredo text) returns jsonb
language plpgsql security definer set search_path = public as
$$ begin perform public._backup_ok(p_segredo); delete from public.sessoes where expira_em < now(); return jsonb_build_object('ok', true, 'em', now()); end $$;

-- ─────────────────────────────────────────────────────────────── migração do sistema antigo
-- Usada uma vez para carregar os dados do SUPERT antigo (api.php). Só admin.
-- p_parte: limpar | professores | disciplinas | disc_profs | horarios | apelidos | registros | exclusoes |
--          log | servidores | rec_itens | rec_movs | usuarios | sequencias
create or replace function public.migracao_carregar(p_token text, p_parte text, p_dados jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare eu public.usuarios := public._exige(p_token, 'admin'); n int := 0;
begin
  if p_parte = 'limpar' then
    if p_dados->>'confirmar' <> 'APAGAR_TUDO' then raise exception 'CONFIRMACAO_INVALIDA'; end if;
    truncate public.exclusoes, public.registros, public.horarios, public.disciplina_apelidos, public.disciplina_professores,
      public.disciplinas, public.professores, public.rec_movs, public.rec_itens, public.servidores restart identity cascade;
    delete from public.log where acao <> 'migracao';
    return 0;
  elsif p_parte = 'professores' then
    insert into public.professores(id, nome, nome_completo, matricula, setor, ativo)
    select (x->>'id')::bigint, upper(trim(x->>'nome')), coalesce(x->>'nome_completo',''), coalesce(x->>'matricula',''), coalesce(x->>'setor',''), coalesce((x->>'ativo')::boolean, true)
      from jsonb_array_elements(p_dados) x on conflict do nothing;
  elsif p_parte = 'disciplinas' then
    insert into public.disciplinas(id, turma, nome, diario_id, ch_total, arquivada_em, arquivada_motivo)
    select (x->>'id')::bigint, x->>'turma', x->>'nome', nullif(x->>'diario_id','')::bigint, nullif(x->>'ch_total','')::int,
           nullif(x->>'arquivada_em','')::timestamptz, nullif(x->>'arquivada_motivo','')
      from jsonb_array_elements(p_dados) x on conflict do nothing;
  elsif p_parte = 'disc_profs' then
    insert into public.disciplina_professores(disciplina_id, professor_id, desde, ate)
    select (x->>'disciplina_id')::bigint, (x->>'professor_id')::bigint, nullif(x->>'desde','')::date, nullif(x->>'ate','')::date
      from jsonb_array_elements(p_dados) x;
  elsif p_parte = 'horarios' then
    insert into public.horarios(disciplina_id, professor_id, dia, hora)
    select (x->>'disciplina_id')::bigint, (x->>'professor_id')::bigint, (x->>'dia')::smallint, x->>'hora'
      from jsonb_array_elements(p_dados) x on conflict do nothing;
  elsif p_parte = 'apelidos' then
    insert into public.disciplina_apelidos(disciplina_id, turma, nome, chave)
    select (x->>'disciplina_id')::bigint, x->>'turma', x->>'nome', public._chave(x->>'nome')
      from jsonb_array_elements(p_dados) x on conflict (turma, chave) do nothing;
  elsif p_parte = 'registros' then
    insert into public.registros(id, data, tipo, status, aulas, minutos, horario, obs, disciplina_id, professor_id, prof_nome, disc_nome,
      turma, diario_id, ch_total, registrado_por, origem, notif_arquivada, criado_em, atualizado_em)
    select x->>'id', (x->>'data')::date, coalesce(nullif(x->>'tipo',''),'regular'), x->>'status', coalesce(nullif(x->>'aulas','')::int, 1),
           nullif(x->>'minutos','')::int, nullif(x->>'horario',''), coalesce(x->>'obs',''), nullif(x->>'disciplina_id','')::bigint,
           nullif(x->>'professor_id','')::bigint, coalesce(x->>'prof',''), coalesce(x->>'disc',''), coalesce(x->>'turma',''),
           nullif(x->>'diario_id','')::bigint, nullif(x->>'ch_total','')::int, coalesce(x->>'por',''), 'legado',
           coalesce((x->>'notif_arquivada')::boolean, false), coalesce(nullif(x->>'criado_em','')::timestamptz, now()), nullif(x->>'atualizado_em','')::timestamptz
      from jsonb_array_elements(p_dados) x on conflict (id) do nothing;
  elsif p_parte = 'exclusoes' then
    insert into public.exclusoes(registro_id, solicitado_por, motivo, criado_em)
    select x->>'registro_id', coalesce(x->>'por',''), coalesce(x->>'motivo',''), coalesce(nullif(x->>'em','')::timestamptz, now())
      from jsonb_array_elements(p_dados) x where exists(select 1 from public.registros r where r.id = x->>'registro_id')
    on conflict do nothing;
  elsif p_parte = 'log' then
    insert into public.log(em, usuario, acao, detalhe, payload)
    select coalesce(nullif(x->>'em','')::timestamptz, now()), coalesce(x->>'usuario',''), coalesce(nullif(x->>'acao',''),'legado'), coalesce(x->>'detalhe',''), x->'payload'
      from jsonb_array_elements(p_dados) x;
  elsif p_parte = 'servidores' then
    insert into public.servidores(nome, matricula, setor)
    select trim(x->>'nome'), coalesce(trim(x->>'matricula'),''), coalesce(trim(x->>'setor'),'')
      from jsonb_array_elements(p_dados) x
     where coalesce(trim(x->>'nome'),'') <> ''
       and (coalesce(trim(x->>'matricula'),'') = '' or not exists(select 1 from public.servidores s where s.matricula = trim(x->>'matricula')));
  elsif p_parte = 'rec_itens' then
    insert into public.rec_itens(id, tipo, c1, c2, icone, bloco, ativo)
    select x->>'id', x->>'tipo', coalesce(x->>'c1',''), coalesce(x->>'c2',''), coalesce(x->>'icone',''), nullif(x->>'bloco',''), coalesce((x->>'ativo')::boolean, true)
      from jsonb_array_elements(p_dados) x on conflict (id) do nothing;
  elsif p_parte = 'rec_movs' then
    insert into public.rec_movs(id, tipo, item_id, matricula, servidor_nome, entregue_em, entregue_por, devolvido_em, recebido_por, obs,
      permutado_para, permutado_mat, permuta_origem)
    select x->>'id', x->>'tipo', x->>'item_id', coalesce(x->>'matricula',''), coalesce(x->>'servidor_nome',''),
           coalesce(nullif(x->>'entregue_em','')::timestamptz, now()), coalesce(x->>'entregue_por',''), nullif(x->>'devolvido_em','')::timestamptz,
           coalesce(x->>'recebido_por',''), coalesce(x->>'obs',''), nullif(x->>'permutado_para',''), nullif(x->>'permutado_mat',''), nullif(x->>'permuta_origem','')
      from jsonb_array_elements(p_dados) x on conflict (id) do nothing;
  elsif p_parte = 'usuarios' then
    -- senha provisória = login (troca obrigatória no primeiro acesso)
    insert into public.usuarios(login, nome, hash, perfil, permissoes, deve_trocar_senha)
    select lower(trim(x->>'login')), coalesce(x->>'nome',''), public._hash(lower(trim(x->>'login'))), coalesce(nullif(x->>'perfil',''),'usuario'),
           coalesce((select array_agg(p) from jsonb_array_elements_text(x->'permissoes') p), '{}'), true
      from jsonb_array_elements(p_dados) x
     where lower(trim(x->>'login')) ~ '^[a-z0-9._-]{2,40}$'
    on conflict (login) do nothing;
  elsif p_parte = 'sequencias' then
    perform setval(pg_get_serial_sequence('public.professores','id'), greatest((select coalesce(max(id),0) from public.professores), 1));
    perform setval(pg_get_serial_sequence('public.disciplinas','id'), greatest((select coalesce(max(id),0) from public.disciplinas), 1));
    perform public._log(eu.login, 'migracao', 'Dados do SUPERT antigo carregados: ' || coalesce(p_dados->>'resumo',''));
    return 0;
  else
    raise exception 'PARTE_INVALIDA';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- ─────────────────────────────────────────────────────────────── permissões de execução
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.proname, 1) <> '_' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

-- Primeiro administrador (senha provisória: troque no primeiro acesso).
insert into public.usuarios(login, nome, hash, perfil, permissoes, deve_trocar_senha)
values ('admin', 'Administrador', public._hash('supert2026'), 'admin', array['turno','registrar','painel','turmas','recursos','recursos_gerir','notificacoes'], true)
on conflict (login) do nothing;
