import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const OPCOES = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Card do Gestor: quanto tempo o cliente tem para responder antes do horário ser liberado */
export default function PrazoResposta() {
  const [salvo, setSalvo] = useState(null);
  const [valor, setValor] = useState(4);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    supabase
      .from('fluxo_config')
      .select('prazo_resposta_horas, atualizado_em')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setSalvo(data.prazo_resposta_horas);
        setValor(data.prazo_resposta_horas);
        setAtualizadoEm(data.atualizado_em);
      });
  }, []);

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    const { data, error } = await supabase
      .from('fluxo_config')
      .update({ prazo_resposta_horas: valor })
      .eq('id', 1)
      .select('prazo_resposta_horas, atualizado_em')
      .single();
    setSalvando(false);
    if (error || !data) {
      setAviso({ tipo: 'erro', texto: 'Não foi possível salvar. Só o Gestor pode alterar o prazo.' });
      return;
    }
    setSalvo(data.prazo_resposta_horas);
    setAtualizadoEm(data.atualizado_em);
    setAviso({ tipo: 'ok', texto: 'Prazo salvo. Vale para os próximos pedidos de confirmação.' });
  }

  const mudou = salvo !== null && valor !== salvo;

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-base font-semibold text-slate-900">Prazo para o cliente responder</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Depois do pedido de confirmação, o cliente tem esse tempo para responder. Sem resposta, o horário é liberado.
            Vale para gravações e reuniões. Se faltar menos que isso para o horário marcado, o prazo termina no próprio
            horário.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="prazo-resposta" className="sr-only">
            Prazo em horas
          </label>
          <select
            id="prazo-resposta"
            value={valor}
            onChange={(e) => {
              setValor(Number(e.target.value));
              setAviso(null);
            }}
            className="rounded-lg border-0 bg-white py-2 pl-3 pr-8 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-violet-600"
          >
            {OPCOES.map((h) => (
              <option key={h} value={h}>
                {h} {h === 1 ? 'hora' : 'horas'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={salvar}
            disabled={!mudou || salvando}
            className="rounded-lg bg-linear-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {aviso ? (
        <p
          role={aviso.tipo === 'erro' ? 'alert' : 'status'}
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${aviso.tipo === 'erro' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}
        >
          {aviso.texto}
        </p>
      ) : (
        atualizadoEm && (
          <p className="mt-3 text-xs text-slate-500">Última alteração em {fmt.format(new Date(atualizadoEm))}.</p>
        )
      )}
    </section>
  );
}
