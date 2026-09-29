# SUPERT 2 · Supervisão de aulas e recursos

IFMA Campus Imperatriz. Versão 2 (setembro de 2026): site estático no GitHub Pages e banco no Supabase, no mesmo padrão do PASES e do TeIA. O sistema anterior (PHP + arquivos JSON no HostGator) continua intacto em supert.concretta.org.

## O que mudou em relação ao SUPERT antigo

- **Disciplina da turma é a entidade estável.** Cada registro aponta para a disciplina (o diário), não para o nome do professor. Quando uma disciplina anual troca de professor, a contagem de aulas continua e o professor anterior fica no histórico (Turmas › Trocar professor, ou automaticamente ao importar o novo horário).
- **Apelidos de disciplina.** Se o horário novo traz a mesma disciplina com outro nome ("Matemática 1" x "Matemática I"), a importação pergunta se é a mesma; a resposta vira apelido e da próxima vez o reconhecimento é automático. Duplicadas antigas podem ser juntadas em Turmas › Possíveis duplicadas.
- **Lançar turno.** Todas as aulas previstas no horário para a data e o turno já entram como presença; o colaborador marca só falta, atraso, saída antecipada ou "não houve aula" e lança tudo com um clique. "Falta rápida" marca todas as aulas de um professor no turno.
- Senhas com bcrypt, sessão por token e perfis (admin, editor, usuário, consulta); tabelas sem acesso direto (RLS sem políticas), tudo passa pelas funções do banco.

## Estrutura

- `index.html`, `config.js`, `css/app.css`, `assets/`: interface.
- `js/app.js` (rotas, login, sessão), `js/api.js` (chamadas ao banco), `js/dados.js` (cadastro em memória e atualização automática), `js/util.js`.
- Telas: `pag-turno.js`, `pag-registrar.js`, `pag-painel.js`, `pag-turmas.js`, `pag-recursos.js`, `pag-notificacoes.js`, `pag-horario.js` (importação com conciliação), `pag-config.js`.
- `js/migracao.js`: conversão dos arquivos do sistema antigo (pasta `ifma_dados`).
- `infra/schema.sql`: tabelas e funções do banco (rodar no SQL Editor do Supabase; pode ser executado de novo).
- `infra/apps-script-backup.gs`: backup semanal no Google Drive e consulta diária para o projeto gratuito não pausar.
- `ferramentas/servidor_teste.py`: servidor de teste local (Postgres local imitando o Supabase).

## Senhas

Usuários migrados entram com senha provisória igual ao login e trocam no primeiro acesso. O admin gera nova senha provisória em Configurações › Usuários.
