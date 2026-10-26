import { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

function formatarTelefone(t) {
  const d = String(t ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/**
 * Campo "Nome do cliente" com sugestões de clientes já atendidos.
 * Ao escolher, chama onEscolher({ cliente_nome, telefone }).
 */
export default function ClienteBusca({
  id,
  value,
  onChange,
  onEscolher,
  inputRef,
  className = '',
  invalido = false,
  describedBy,
  placeholder,
}) {
  const [sugestoes, setSugestoes] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const ultimaBusca = useRef(0);
  const listaId = useId();

  // busca com atraso curto para não consultar a cada tecla
  useEffect(() => {
    const termo = value.trim();
    if (termo.length < 2) {
      setSugestoes([]);
      setBuscando(false);
      return;
    }
    const n = ++ultimaBusca.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('buscar_clientes', { p_termo: termo });
      if (n !== ultimaBusca.current) return;
      setSugestoes(data ?? []);
      setAtivo(-1);
      setBuscando(false);
    }, 200);
    return () => clearTimeout(t);
  }, [value]);

  function escolher(c) {
    onEscolher({ cliente_nome: c.cliente_nome, telefone: c.telefone });
    setAberto(false);
    setAtivo(-1);
  }

  function teclado(e) {
    if (!aberto || sugestoes.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((i) => (i + 1) % sugestoes.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((i) => (i <= 0 ? sugestoes.length - 1 : i - 1));
    } else if (e.key === 'Enter' && ativo >= 0) {
      e.preventDefault();
      escolher(sugestoes[ativo]);
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  }

  const mostrar = aberto && value.trim().length >= 2 && (sugestoes.length > 0 || !buscando);

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        autoComplete="off"
        maxLength={120}
        value={value}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={mostrar && sugestoes.length > 0}
        aria-controls={listaId}
        aria-activedescendant={ativo >= 0 ? `${listaId}-${ativo}` : undefined}
        aria-invalid={invalido}
        aria-describedby={describedBy}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
        }}
        onFocus={() => value.trim().length >= 2 && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        onKeyDown={teclado}
        className={className}
      />

      {mostrar && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
        >
          {sugestoes.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-slate-500">Cliente novo, continue digitando normalmente.</li>
          ) : (
            sugestoes.map((c, i) => (
              <li
                key={c.telefone}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={i === ativo}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(c);
                }}
                onMouseEnter={() => setAtivo(i)}
                className={`cursor-pointer px-3 py-2 ${i === ativo ? 'bg-violet-50' : ''}`}
              >
                <p className="truncate text-sm font-medium text-slate-900">{c.cliente_nome}</p>
                <p className="truncate text-xs text-slate-500">
                  <span className="tabular-nums">{formatarTelefone(c.telefone)}</span>
                  {' · '}
                  última {c.ultimo_tipo === 'reuniao' ? 'reunião' : 'gravação'} em {fmtData.format(new Date(c.ultima_data))}
                </p>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
