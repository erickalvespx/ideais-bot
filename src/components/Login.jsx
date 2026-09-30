import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Marca from './Marca';

function traduzir(error) {
  const msg = error?.message ?? '';
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado. Fale com o administrador.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (/fetch/i.test(msg)) return 'Sem conexão com o servidor. Confira sua internet.';
  return msg || 'Não foi possível entrar. Tente de novo.';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(null);
    if (!email.trim() || !senha) {
      setErro('Preencha e-mail e senha.');
      return;
    }
    setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEntrando(false);
    if (error) setErro(traduzir(error));
  }

  const input =
    'mt-1.5 block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-violet-600 sm:text-sm';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Marca tamanho={40} />
          <div>
            <p className="font-semibold text-slate-900">Ideais Agência</p>
            <p className="text-sm text-slate-500">Agenda de gravações</p>
          </div>
        </div>

        <form onSubmit={entrar} noValidate className="space-y-5 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h1 className="text-lg font-semibold text-slate-900">Entrar</h1>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@ideais.com.br"
              className={input}
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-slate-700">Senha</label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={input}
            />
          </div>

          {erro && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{erro}</p>
          )}

          <button
            type="submit"
            disabled={entrando}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Esqueceu a senha? Peça ao administrador para redefinir o seu acesso.
        </p>
      </div>
    </main>
  );
}
