import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const TIPOS = [
  { valor: 'gravacao', rotulo: 'Gravação', icone: '🎬' },
  { valor: 'reuniao', rotulo: 'Reunião', icone: '🤝' },
];

// Dados fictícios só para a prévia (por tipo)
const EXEMPLO_BASE = {
  primeiro_nome: 'Maria',
  nome_cliente: 'Maria Souza',
  dia: 'amanhã, terça-feira (29/09)',
  data: '29/09',
  hora: '14:30',
  prazo: '16:30',
  agencia: 'Ideais Agência',
};
const EXEMPLOS = {
  gravacao: { ...EXEMPLO_BASE, tipo: 'gravação', modalidade: '', local: 'Estúdio Ideais', link: '', onde: '📍 Local: Estúdio Ideais' },
  reuniao: {
    ...EXEMPLO_BASE,
    tipo: 'reunião',
    modalidade: 'online',
    local: '',
    link: 'https://meet.google.com/abc-defg-hij',
    onde: '💻 Link: https://meet.google.com/abc-defg-hij',
  },
};
const VARIAVEIS = Object.keys(EXEMPLOS.gravacao);

const DESCRICAO_VARIAVEL = {
  primeiro_nome: 'Primeiro nome do cliente',
  nome_cliente: 'Nome completo do cliente',
  dia: 'Dia por extenso (hoje, amanhã…)',
  data: 'Data curta (dd/mm)',
  hora: 'Horário marcado',
  prazo: 'Limite para responder',
  agencia: 'Nome da agência',
  tipo: '"gravação" ou "reunião"',
  modalidade: '"presencial" ou "online" (reuniões)',
  local: 'Local informado no agendamento',
  link: 'Link da reunião online',
  onde: 'Local ou link já formatado; some se não houver',
};

const chaveDe = (tipo, chave) => `${tipo}:${chave}`;

const LIMITE = 1000;
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function validar(chave, texto) {
  const t = texto.trim();
  if (!t) return 'A mensagem não pode ficar vazia.';
  if (t.length > LIMITE) return `A mensagem passou de ${LIMITE} caracteres.`;
  const desconhecida = [...t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).find((v) => !VARIAVEIS.includes(v));
  if (desconhecida) return `A variável {{${desconhecida}}} não existe. Use os botões abaixo do texto.`;
  if (chave === 'confirmacao') {
    if (!/(^|[^0-9])1([^0-9]|$)/.test(t)) return 'Peça para o cliente responder 1, senão o bot não reconhece a confirmação.';
    if (!/\{\{\s*prazo\s*\}\}/.test(t)) return 'Inclua {{prazo}} para o cliente saber até quando pode confirmar.';
  }
  return null;
}

function escapar(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Remove linhas formadas só por variáveis vazias (mesma regra do bot) */
function removerLinhasVazias(texto, exemplo) {
  return texto
    .split('\n')
    .filter((linha) => {
      const vars = [...linha.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
      const resto = linha.replace(/\{\{\s*\w+\s*\}\}/g, '').trim();
      return !(vars.length && !resto && vars.every((k) => k in exemplo && !exemplo[k]));
    })
    .join('\n');
}

/** Converte o texto em HTML no estilo WhatsApp (*negrito*, _itálico_, ~riscado~) */
function renderizarPrevia(texto, exemplo) {
  return escapar(removerLinhasVazias(texto, exemplo))
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (inteiro, v) =>
      v in exemplo ? escapar(exemplo[v]) : `<mark class="rounded bg-rose-100 px-0.5 text-rose-700">${inteiro}</mark>`
    )
    .replace(/\*([^*\n]+)\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');
}

function traduzirErro(error) {
  const msg = error?.message ?? '';
  if (/0 rows|multiple \(or no\) rows|PGRST116/i.test(msg) || error?.code === 'PGRST116') {
    return 'Só o Gestor pode alterar as mensagens.';
  }
  if (/row-level security|permission denied/i.test(msg)) return 'Só o Gestor pode alterar as mensagens.';
  return msg || 'Não foi possível salvar. Tente de novo.';
}

export default function MensagensModelos() {
  const [modelos, setModelos] = useState([]);
  const [rascunhos, setRascunhos] = useState({}); // { "tipo:chave": { conteudo, ativo } }
  const [tipo, setTipo] = useState('gravacao');
  const [selecionada, setSelecionada] = useState('confirmacao');
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo, texto }
  const [historico, setHistorico] = useState([]);
  const [verHistorico, setVerHistorico] = useState(false);
  const textoRef = useRef(null);

  const carregar = useCallback(async () => {
    setErroCarga(null);
    const { data, error } = await supabase
      .from('mensagem_modelos')
      .select('tipo, chave, ordem, titulo, quando, obrigatoria, conteudo, conteudo_padrao, ativo, atualizado_em')
      .order('tipo')
      .order('ordem');
    if (error) setErroCarga(error.message);
    else {
      setModelos(data);
      setRascunhos(Object.fromEntries(data.map((m) => [chaveDe(m.tipo, m.chave), { conteudo: m.conteudo, ativo: m.ativo }])));
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atual = chaveDe(tipo, selecionada);
  const doTipo = modelos.filter((m) => m.tipo === tipo);
  const modelo = doTipo.find((m) => m.chave === selecionada);
  const rascunho = rascunhos[atual] ?? { conteudo: '', ativo: true };
  const alterado = (m) => {
    const r = m && rascunhos[chaveDe(m.tipo, m.chave)];
    return Boolean(r && (r.conteudo !== m.conteudo || r.ativo !== m.ativo));
  };
  const alteradosNoTipo = (t) => modelos.some((m) => m.tipo === t && alterado(m));

  const erroValidacao = useMemo(() => validar(selecionada, rascunho.conteudo), [selecionada, rascunho.conteudo]);
  const previa = useMemo(() => renderizarPrevia(rascunho.conteudo, EXEMPLOS[tipo]), [rascunho.conteudo, tipo]);

  // histórico da mensagem aberta
  useEffect(() => {
    if (!verHistorico) return;
    let ativo = true;
    supabase
      .from('mensagem_modelos_historico')
      .select('id, conteudo, ativo, alterado_em')
      .eq('tipo', tipo)
      .eq('chave', selecionada)
      .order('alterado_em', { ascending: false })
      .limit(15)
      .then(({ data }) => ativo && setHistorico(data ?? []));
    return () => {
      ativo = false;
    };
  }, [verHistorico, tipo, selecionada, modelos]);

  function editar(campos) {
    setAviso(null);
    setRascunhos((r) => ({ ...r, [atual]: { ...r[atual], ...campos } }));
  }

  function inserirVariavel(v) {
    const el = textoRef.current;
    const token = `{{${v}}}`;
    const ini = el?.selectionStart ?? rascunho.conteudo.length;
    const fim = el?.selectionEnd ?? ini;
    const novo = rascunho.conteudo.slice(0, ini) + token + rascunho.conteudo.slice(fim);
    editar({ conteudo: novo });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + token.length, ini + token.length);
    });
  }

  async function salvar() {
    if (erroValidacao) {
      setAviso({ tipo: 'erro', texto: erroValidacao });
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase
      .from('mensagem_modelos')
      .update({ conteudo: rascunho.conteudo.trim(), ativo: rascunho.ativo })
      .eq('tipo', tipo)
      .eq('chave', selecionada)
      .select('tipo, chave, ordem, titulo, quando, obrigatoria, conteudo, conteudo_padrao, ativo, atualizado_em')
      .single();
    setSalvando(false);

    if (error) {
      setAviso({ tipo: 'erro', texto: traduzirErro(error) });
      return;
    }
    setModelos((lista) => lista.map((m) => (m.tipo === data.tipo && m.chave === data.chave ? data : m)));
    setRascunhos((r) => ({ ...r, [chaveDe(data.tipo, data.chave)]: { conteudo: data.conteudo, ativo: data.ativo } }));
    setAviso({ tipo: 'ok', texto: 'Mensagem salva. O bot usa o novo texto a partir dos próximos envios.' });
  }

  function trocar(chave) {
    setSelecionada(chave);
    setAviso(null);
  }

  function trocarTipo(novo) {
    setTipo(novo);
    setAviso(null);
  }

  if (carregando) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-busy="true">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl bg-white p-6 text-sm ring-1 ring-rose-200">
          <p className="text-rose-700">Não foi possível carregar as mensagens: {erroCarga}</p>
          <button type="button" onClick={carregar} className="mt-3 font-medium text-violet-700 hover:text-violet-900">
            Carregar de novo
          </button>
        </div>
      </div>
    );
  }

  const contador = rascunho.conteudo.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-slate-900 sm:px-6 lg:py-12">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mensagens do WhatsApp</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Os textos que o bot envia aos clientes, separados por tipo de agendamento. As alterações valem a partir dos
          próximos envios, sem precisar publicar nada.
        </p>
      </header>

      <div role="radiogroup" aria-label="Tipo de agendamento" className="mb-6 inline-flex rounded-lg bg-slate-100 p-1">
        {TIPOS.map((t) => {
          const ativo = t.valor === tipo;
          return (
            <button
              key={t.valor}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => trocarTipo(t.valor)}
              className={`relative flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                ativo ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span aria-hidden="true">{t.icone}</span>
              {t.rotulo}
              {alteradosNoTipo(t.valor) && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Alterações não salvas" />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* lista */}
        <nav aria-label="Mensagens" className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          <ul className="divide-y divide-slate-100">
            {doTipo.map((m) => {
              const ativa = m.chave === selecionada;
              const desligada = !(rascunhos[chaveDe(m.tipo, m.chave)]?.ativo ?? m.ativo);
              return (
                <li key={chaveDe(m.tipo, m.chave)}>
                  <button
                    type="button"
                    onClick={() => trocar(m.chave)}
                    aria-current={ativa ? 'true' : undefined}
                    className={`relative block w-full px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 ${
                      ativa ? 'bg-violet-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    {ativa && <span className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-blue-600 to-violet-600" />}
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium ${desligada ? 'text-slate-400' : 'text-slate-900'}`}>
                        {m.titulo}
                      </span>
                      {alterado(m) && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" title="Alterações não salvas" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {desligada ? 'Desligada' : m.quando}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* editor + prévia */}
        {modelo && (
          <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{modelo.titulo}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{modelo.quando}</p>
              </div>

              {modelo.obrigatoria ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  Sempre enviada, o fluxo depende dela
                </span>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <span>Enviar esta mensagem</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rascunho.ativo}
                    onClick={() => editar({ ativo: !rascunho.ativo })}
                    className={`relative h-6 w-11 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                      rascunho.ativo ? 'bg-violet-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        rascunho.ativo ? 'left-5.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </label>
              )}
            </div>

            <div className="mt-5 grid gap-6 xl:grid-cols-2">
              {/* editor */}
              <div className={rascunho.ativo ? '' : 'opacity-60'}>
                <label htmlFor="texto-modelo" className="block text-sm font-medium text-slate-700">
                  Texto
                </label>
                <textarea
                  id="texto-modelo"
                  ref={textoRef}
                  rows={11}
                  value={rascunho.conteudo}
                  onChange={(e) => editar({ conteudo: e.target.value })}
                  aria-invalid={Boolean(erroValidacao)}
                  aria-describedby="ajuda-modelo"
                  className={`mt-1.5 block w-full resize-y rounded-lg border-0 px-3 py-2.5 text-sm leading-6 text-slate-900 shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset focus:ring-violet-600 ${
                    erroValidacao ? 'ring-rose-400' : 'ring-slate-300'
                  }`}
                />
                <div id="ajuda-modelo" className="mt-1.5 flex justify-between gap-3 text-xs">
                  <span className={erroValidacao ? 'text-rose-600' : 'text-slate-500'}>
                    {erroValidacao ?? 'Use *texto* para negrito e _texto_ para itálico.'}
                  </span>
                  <span className={`shrink-0 tabular-nums ${contador > LIMITE ? 'text-rose-600' : 'text-slate-400'}`}>
                    {contador}/{LIMITE}
                  </span>
                </div>

                <p className="mt-4 text-sm font-medium text-slate-700">Inserir informação do agendamento</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {VARIAVEIS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => inserirVariavel(v)}
                      title={DESCRICAO_VARIAVEL[v]}
                      className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-violet-50 hover:text-violet-800 hover:ring-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* prévia */}
              <div>
                <p className="text-sm font-medium text-slate-700">Como o cliente vai ver</p>
                <div className="mt-1.5 rounded-xl bg-[#efeae2] p-4">
                  <div className={`ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 shadow-sm ${rascunho.ativo ? '' : 'opacity-50'}`}>
                    <p
                      className="whitespace-pre-wrap wrap-break-word text-[14px] leading-[1.45] text-[#111b21]"
                      dangerouslySetInnerHTML={{ __html: previa || '&nbsp;' }}
                    />
                    <p className="mt-1 text-right text-[11px] text-[#667781]">09:41</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Prévia com dados fictícios{tipo === 'reuniao' ? ' (reunião online)' : ''}. Linhas só com variáveis vazias, como {'{{onde}}'} sem local, não aparecem para o cliente.
                </p>
              </div>
            </div>

            {aviso && (
              <p
                role={aviso.tipo === 'erro' ? 'alert' : 'status'}
                className={`mt-5 rounded-lg px-3 py-2.5 text-sm ${
                  aviso.tipo === 'erro' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                {aviso.texto}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={salvar}
                disabled={salvando || !alterado(modelo)}
                className="rounded-lg bg-linear-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando ? 'Salvando…' : 'Salvar mensagem'}
              </button>
              {alterado(modelo) && (
                <button
                  type="button"
                  onClick={() => editar({ conteudo: modelo.conteudo, ativo: modelo.ativo })}
                  className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  Descartar alterações
                </button>
              )}
              <button
                type="button"
                onClick={() => editar({ conteudo: modelo.conteudo_padrao })}
                disabled={rascunho.conteudo === modelo.conteudo_padrao}
                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40"
              >
                Voltar ao texto original
              </button>
              <button
                type="button"
                onClick={() => setVerHistorico((v) => !v)}
                aria-expanded={verHistorico}
                className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                {verHistorico ? 'Ocultar versões anteriores' : 'Versões anteriores'}
              </button>
            </div>

            {verHistorico && (
              <div className="mt-4">
                {historico.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
                    Esta mensagem ainda não foi alterada. As versões anteriores aparecem aqui depois de salvar.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                    {historico.map((h) => (
                      <li key={h.id} className="flex gap-4 px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-500">
                            Em uso até {fmtDataHora.format(new Date(h.alterado_em))}
                            {!h.ativo && ' (desligada)'}
                          </p>
                          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{h.conteudo}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => editar({ conteudo: h.conteudo })}
                          className="shrink-0 self-start rounded px-2 py-1 text-sm font-medium text-violet-700 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          Usar este texto
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}