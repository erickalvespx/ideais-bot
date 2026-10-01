import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import Marca from './components/Marca';
import AgendamentoGravacoes from './components/AgendamentoGravacoes';
import MensagensModelos from './components/MensagensModelos';
import MenuUsuario from './components/MenuUsuario';

export default function App() {
  const [sessao, setSessao] = useState(undefined); // undefined = verificando
  const [gestor, setGestor] = useState(false);
  const [nome, setNome] = useState(null);
  const [pagina, setPagina] = useState('agenda');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Perfil do usuário: nome de exibição + papel.
  // O menu "Mensagens" só aparece para o Gestor (o banco também bloqueia os demais).
  useEffect(() => {
    if (!sessao) {
      setGestor(false);
      setNome(null);
      setPagina('agenda');
      return;
    }
    supabase.rpc('meu_perfil').then(({ data }) => {
      const perfil = Array.isArray(data) ? data[0] : data;
      setGestor(perfil?.papel === 'gestor');
      setNome(perfil?.nome ?? null);
    });
  }, [sessao?.user?.id]);

  if (sessao === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500" aria-busy="true">
        Carregando…
      </div>
    );
  }

  if (!sessao) return <Login />;

  const itens = [{ id: 'agenda', rotulo: 'Agenda' }, ...(gestor ? [{ id: 'mensagens', rotulo: 'Mensagens' }] : [])];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5 py-3">
              <Marca tamanho={28} />
              <span className="hidden font-semibold text-slate-900 sm:inline">Ideais Agência</span>
            </div>
            {itens.length > 1 && (
              <nav className="flex gap-1 self-stretch" aria-label="Seções">
                {itens.map((item) => {
                  const ativo = pagina === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPagina(item.id)}
                      aria-current={ativo ? 'page' : undefined}
                      className={`relative px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 ${
                        ativo ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {item.rotulo}
                      {ativo && (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-linear-to-r from-blue-600 to-violet-600" />
                      )}
                    </button>
                  );
                })}
              </nav>
            )}
          </div>

          <div className="py-2">
            <MenuUsuario nome={nome} gestor={gestor} onNomeAtualizado={setNome} />
          </div>
        </div>
      </header>

      {pagina === 'mensagens' && gestor ? <MensagensModelos /> : <AgendamentoGravacoes />}
    </div>
  );
}