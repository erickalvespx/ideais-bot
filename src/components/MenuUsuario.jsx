import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

function iniciais(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

export default function MenuUsuario({ nome, gestor, onNomeAtualizado }) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome ?? '');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const raiz = useRef(null);
  const campo = useRef(null);

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => raiz.current && !raiz.current.contains(e.target) && fechar();
    const esc = (e) => e.key === 'Escape' && fechar();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  useEffect(() => {
    if (editando) campo.current?.focus();
  }, [editando]);

  function fechar() {
    setAberto(false);
    setEditando(false);
    setErro(null);
  }

  function abrirEdicao() {
    setValor(nome ?? '');
    setErro(null);
    setEditando(true);
  }

  async function salvar(e) {
    e.preventDefault();
    const limpo = valor.trim().replace(/\s+/g, ' ');
    if (limpo.length < 2 || limpo.length > 60) {
      setErro('Use entre 2 e 60 caracteres.');
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.rpc('atualizar_meu_nome', { p_nome: limpo });
    setSalvando(false);
    if (error) {
      setErro(error.message || 'Não foi possível salvar.');
      return;
    }
    onNomeAtualizado(data);
    setEditando(false);
  }

  const semNome = !nome;

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-sm transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-blue-600 to-violet-600 text-xs font-semibold text-white"
        >
          {semNome ? '?' : iniciais(nome)}
        </span>
        <span className={`hidden max-w-40 truncate font-medium sm:inline ${semNome ? 'text-violet-700' : 'text-slate-800'}`}>
          {semNome ? 'Adicionar seu nome' : nome}
        </span>
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-400" aria-hidden="true">
          <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            {editando ? (
              <form onSubmit={salvar} noValidate>
                <label htmlFor="meu-nome" className="block text-xs font-medium text-slate-600">
                  Como você quer ser chamado
                </label>
                <input
                  id="meu-nome"
                  ref={campo}
                  type="text"
                  maxLength={60}
                  autoComplete="name"
                  value={valor}
                  onChange={(e) => {
                    setValor(e.target.value);
                    setErro(null);
                  }}
                  placeholder="Ex.: Erick Alves"
                  className="mt-1.5 block w-full rounded-lg border-0 px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-violet-600"
                />
                {erro && <p className="mt-1.5 text-xs text-rose-600">{erro}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditando(false)}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvando}
                    className="rounded-lg bg-linear-to-r from-blue-600 to-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {salvando ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{semNome ? 'Sem nome definido' : nome}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{gestor ? 'Gestor' : 'Equipe'}</p>
                </div>
                {gestor && (
                  <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">Gestor</span>
                )}
              </div>
            )}
          </div>

          {!editando && (
            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={abrirEdicao}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                {semNome ? 'Adicionar meu nome' : 'Alterar meu nome'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => supabase.auth.signOut()}
                className="block w-full px-4 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 focus:bg-rose-50 focus:outline-none"
              >
                Sair
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}