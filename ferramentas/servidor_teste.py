#!/usr/bin/env python3
"""Servidor de teste local do SUPERT 2.

Serve os arquivos do site e imita o endpoint /rest/v1/rpc/<função> do Supabase
usando um PostgreSQL local com infra/schema.sql carregado.
Uso: python3 ferramentas/servidor_teste.py [porta]   (padrão 8080)
Variável PGURL: conexão do Postgres (padrão host=/tmp port=5433 user=postgres dbname=postgres)
"""
import json, os, sys, http.server, socketserver, threading
import psycopg2, psycopg2.extras

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PGURL = os.environ.get('PGURL', 'host=/tmp port=5433 user=postgres dbname=postgres')
_local = threading.local()

def conexao():
    c = getattr(_local, 'c', None)
    if c is None or c.closed:
        c = psycopg2.connect(PGURL); c.autocommit = True; _local.c = c
    return c

_assin = {}
def assinatura(fn):
    if fn not in _assin:
        cur = conexao().cursor()
        cur.execute("""select p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t)
                         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname=%s and p.proname !~ '^_'""", (fn,))
        r = cur.fetchone()
        _assin[fn] = dict(zip(r[0] or [], r[1])) if r else None
    return _assin[fn]

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=RAIZ, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_POST(self):
        if not self.path.startswith('/rest/v1/rpc/'):
            return self.send_error(404)
        fn = self.path.split('/rest/v1/rpc/')[1].split('?')[0]
        corpo = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        sig = assinatura(fn)
        if sig is None:
            return self._json(404, {'message': 'funcao inexistente: ' + fn})
        partes, vals = [], []
        for k, v in corpo.items():
            if k not in sig: continue
            t = sig[k]
            partes.append(f'{k} => %s::{t}')
            vals.append(json.dumps(v) if t in ('jsonb', 'json') else v)
        try:
            cur = conexao().cursor()
            cur.execute(f'select public.{fn}({", ".join(partes)})', vals)
            r = cur.fetchone()[0]
            self._json(200, r)
        except psycopg2.Error as e:
            msg = (e.diag.message_primary or str(e)).strip()
            self._json(400, {'message': msg, 'code': e.pgcode})
    def _json(self, st, obj):
        b = json.dumps(obj, default=str).encode()
        self.send_response(st); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)

class S(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True

if __name__ == '__main__':
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f'SUPERT 2 teste em http://localhost:{porta}')
    S(('', porta), H).serve_forever()
