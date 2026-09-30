import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ------------------------------------------------------------------ constantes

const STATUS = {
  agendado: { rotulo: 'Agendado', classe: 'bg-slate-100 text-slate-700 ring-slate-200' },
  aguardando_confirmacao: { rotulo: 'Aguardando resposta', classe: 'bg-amber-50 text-amber-800 ring-amber-200' },
  confirmado: { rotulo: 'Confirmado', classe: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  cancelado_por_falta_de_retorno: { rotulo: 'Sem retorno do cliente', classe: 'bg-rose-50 text-rose-700 ring-rose-200' },
  cancelado_pela_agencia: { rotulo: 'Cancelado pela equipe', classe: 'bg-slate-100 text-slate-500 ring-slate-200' },
  falha_envio: { rotulo: 'WhatsApp não entregue', classe: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

const PRECISA_ATENCAO = new Set(['cancelado_por_falta_de_retorno', 'falha_envio']);
const ATIVOS = new Set(['agendado', 'aguardando_confirmacao', 'confirmado']);
const REAGENDAVEL = new Set(['cancelado_por_falta_de_retorno', 'falha_envio', 'cancelado_pela_agencia']);

const UMA_HORA = 60 * 60 * 1000;
const FORM_VAZIO = { nome: '', telefone: '', dataHora: '', observacoes: '' };

// ------------------------------------------------------------------ helpers

const somenteDigitos = (v) => String(v ?? '').replace(/\D/g, '');

function mascararTelefone(valor) {
  let d = somenteDigitos(valor);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const telefoneValido = (d) => d.length === 10 || (d.length === 11 && d[2] === '9');

const exibirTelefone = (t) => mascararTelefone(t?.startsWith('55') ? t.slice(2) : t);

/** Date -> "YYYY-MM-DDTHH:mm" no fuso do navegador (formato do datetime-local) */
function paraInputLocal(data) {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const chaveDia = (d) => d.toLocaleDateString('en-CA');
const hora = (iso) => (iso ? fmtHora.format(new Date(iso)) : '');

function rotuloDia(data, agora) {
  const amanha = new Date(agora);
  amanha.setDate(amanha.getDate() + 1);
  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);

  const k = chaveDia(data);
  if (k === chaveDia(agora)) return 'Hoje';
  if (k === chaveDia(amanha)) return 'Amanhã';
  if (k === chaveDia(ontem)) return 'Ontem';
  const texto = fmtDia.format(data);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function descreverQuando(iso, agora) {
  const d = new Date(iso);
  const dia = rotuloDia(d, agora);
  return `${['Hoje', 'Amanhã', 'Ontem'].includes(dia) ? dia.toLowerCase() : dia} às ${fmtHora.format(d)}`;
}

function traduzirErro(error) {
  const msg = error?.message ?? '';
  if (msg.includes('agendamentos_telefone_chk')) return 'Confira o WhatsApp: use DDD + número, ex. (88) 99999-9999.';
  if (msg.includes('agendamentos_nome_chk')) return 'O nome do cliente precisa ter entre 2 e 120 caracteres.';
  if (msg.includes('row-level security')) return 'Sua sessão expirou. Entre novamente para agendar.';
  return msg || 'Não foi possível salvar. Tente de novo.';
}

function mesclar(lista, registro) {
  const semEle = lista.filter((a) => a.id !== registro.id);
  return [...semEle, registro].sort((a, b) => new Date(a.data_gravacao) - new Date(b.data_gravacao));
}

// ------------------------------------------------------------------ subcomponentes

function Etiqueta({ status }) {
  const s = STATUS[status] ?? { rotulo: status, classe: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.classe}`}>
      {s.rotulo}
    </span>
  );
}

/** Andamento do fluxo automático: é uma sequência real, por isso a trilha */
function Trilha({ ag }) {
  const etapas = [
    { rotulo: 'Agendado', em: ag.created_at },
    { rotulo: 'Pedido enviado', em: ag.confirmacao_enviada_em },
    { rotulo: 'Confirmado', em: ag.confirmado_em },
    { rotulo: 'Lembrete enviado', em: ag.lembrete_enviado_em },
  ];
  const interrompido = !ATIVOS.has(ag.status);
  const proxima = etapas.findIndex((e) => !e.em);

  return (
    <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Andamento das mensagens">
      {etapas.map((e, i) => {
        const feito = Boolean(e.em);
        const parouAqui = interrompido && i === proxima && ag.status !== 'cancelado_pela_agencia';
        return (
          <li key={e.rotulo} className="min-w-0">
            <div
              className={`h-1 rounded-full ${
                feito ? 'bg-gradient-to-r from-blue-600 to-violet-600' : parouAqui ? 'bg-rose-400' : 'bg-slate-200'
              }`}
            />
            <p
              className={`mt-1 truncate text-[11px] leading-4 ${
                feito ? 'text-slate-600' : parouAqui ? 'text-rose-600' : 'text-slate-400'
              }`}
            >
              {e.rotulo}
              {feito && i > 0 ? ` ${hora(e.em)}` : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function LinhaAgendamento({ ag, agora, onCancelar, onReagendar, ocupado }) {
  const passou = new Date(ag.data_gravacao) < agora;

  return (
    <li className={`px-4 py-4 sm:px-5 ${passou && ATIVOS.has(ag.status) ? 'opacity-60' : ''}`}>
      <div className="flex gap-4">
        <time
          dateTime={ag.data_gravacao}
          className="w-14 shrink-0 pt-0.5 text-lg font-semibold tabular-nums tracking-tight text-slate-900"
        >
          {hora(ag.data_gravacao)}
        </time>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{ag.cliente_nome}</p>
              <p className="text-sm tabular-nums text-slate-500">{exibirTelefone(ag.telefone)}</p>
            </div>
            <Etiqueta status={ag.status} />
          </div>

          {ag.observacoes && <p className="mt-2 text-sm text-slate-600">{ag.observacoes}</p>}

          {ag.status === 'aguardando_confirmacao' && ag.prazo_confirmacao && (
            <p className="mt-2 text-sm text-amber-800">O cliente tem até {hora(ag.prazo_confirmacao)} para responder.</p>
          )}
          {ag.status === 'cancelado_por_falta_de_retorno' && (
            <p className="mt-2 text-sm text-rose-700">O horário foi liberado. Combine uma nova data com o cliente.</p>
          )}
          {ag.status === 'falha_envio' && (
            <p className="mt-2 text-sm text-rose-700">
              A mensagem não chegou{ag.ultimo_erro ? ` (${ag.ultimo_erro})` : ''}. Confira o número e reagende.
            </p>
          )}

          <Trilha ag={ag} />

          {(ATIVOS.has(ag.status) && !passou) || REAGENDAVEL.has(ag.status) ? (
            <div className="mt-3 flex gap-4 text-sm">
              {REAGENDAVEL.has(ag.status) && (
                <button
                  type="button"
                  onClick={() => onReagendar(ag)}
                  className="rounded font-medium text-violet-700 hover:text-violet-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  Reagendar
                </button>
              )}
              {ATIVOS.has(ag.status) && !passou && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => onCancelar(ag)}
                  className="rounded text-slate-500 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
                >
                  Cancelar gravação
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ componente principal

export default function AgendamentoGravacoes() {
  const [form, setForm] = useState(FORM_VAZIO);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'erro', texto }

  const [agendamentos, setAgendamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState(null);
  const [filtro, setFiltro] = useState('proximas');
  const [cancelandoId, setCancelandoId] = useState(null);
  const [agora, setAgora] = useState(() => new Date());

  const campoDataRef = useRef(null);
  const campoNomeRef = useRef(null);

  // relógio da tela (agrupa "Hoje/Amanhã" e esmaece o que já passou)
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const carregar = useCallback(async () => {
    setErroLista(null);
    const desde = new Date(Date.now() - 14 * 24 * UMA_HORA).toISOString();
    const { data, error } = await supabase
      .from('agendamentos')
      .select('*')
      .gte('data_gravacao', desde)
      .order('data_gravacao', { ascending: true })
      .limit(500);

    if (error) setErroLista(traduzirErro(error));
    else setAgendamentos(data ?? []);
    setCarregando(false);
  }, []);

  // carga inicial + realtime (o bot muda status e a tela acompanha)
  useEffect(() => {
    carregar();
    const canal = supabase
      .channel('agendamentos-gravacao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, (p) => {
        setAgendamentos((atual) =>
          p.eventType === 'DELETE' ? atual.filter((a) => a.id !== p.old.id) : mesclar(atual, p.new)
        );
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  // ---------------------------------------------------------------- filtros

  const listas = useMemo(() => {
    const limiteProximas = agora.getTime() - UMA_HORA;
    return {
      proximas: agendamentos.filter(
        (a) => ATIVOS.has(a.status) && new Date(a.data_gravacao).getTime() >= limiteProximas
      ),
      atencao: agendamentos.filter((a) => PRECISA_ATENCAO.has(a.status)),
      todas: agendamentos,
    };
  }, [agendamentos, agora]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const ag of listas[filtro]) {
      const d = new Date(ag.data_gravacao);
      const k = chaveDia(d);
      if (!mapa.has(k)) mapa.set(k, { rotulo: rotuloDia(d, agora), itens: [] });
      mapa.get(k).itens.push(ag);
    }
    return [...mapa.values()];
  }, [listas, filtro, agora]);

  // ---------------------------------------------------------------- formulário

  const alterar = (campo) => (e) => {
    const valor = campo === 'telefone' ? mascararTelefone(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((er) => ({ ...er, [campo]: undefined }));
  };

  function validar() {
    const novo = {};
    const nome = form.nome.trim();
    const digitos = somenteDigitos(form.telefone);

    if (nome.length < 2) novo.nome = 'Informe o nome do cliente.';
    if (!telefoneValido(digitos)) novo.telefone = 'Use DDD + número, ex. (88) 99999-9999.';
    if (!form.dataHora) novo.dataHora = 'Escolha o dia e o horário.';
    else if (new Date(form.dataHora) <= new Date()) novo.dataHora = 'Escolha um horário no futuro.';

    setErros(novo);
    return Object.keys(novo).length === 0;
  }

  async function salvar(e) {
    e.preventDefault();
    setAviso(null);
    if (!validar()) return;

    setSalvando(true);
    const { data, error } = await supabase
      .from('agendamentos')
      .insert({
        cliente_nome: form.nome.trim(),
        telefone: `55${somenteDigitos(form.telefone)}`,
        data_gravacao: new Date(form.dataHora).toISOString(),
        observacoes: form.observacoes.trim() || null,
      })
      .select()
      .single();
    setSalvando(false);

    if (error) {
      setAviso({ tipo: 'erro', texto: traduzirErro(error) });
      return;
    }

    setAgendamentos((atual) => mesclar(atual, data));
    setAviso({
      tipo: 'ok',
      texto: `Gravação de ${data.cliente_nome} agendada para ${descreverQuando(data.data_gravacao, new Date())}.`,
    });
    setForm(FORM_VAZIO);
    setFiltro('proximas');
    campoNomeRef.current?.focus();
  }

  function reagendar(ag) {
    setForm({
      nome: ag.cliente_nome,
      telefone: exibirTelefone(ag.telefone),
      dataHora: '',
      observacoes: ag.observacoes ?? '',
    });
    setErros({});
    setAviso({ tipo: 'info', texto: `Escolha a nova data para ${ag.cliente_nome}.` });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => campoDataRef.current?.focus(), 250);
  }

  async function cancelar(ag) {
    const ok = window.confirm(
      `Cancelar a gravação de ${ag.cliente_nome} (${descreverQuando(ag.data_gravacao, agora)})?\nNenhuma mensagem será enviada ao cliente.`
    );
    if (!ok) return;

    setCancelandoId(ag.id);
    const { data, error } = await supabase
      .from('agendamentos')
      .update({ status: 'cancelado_pela_agencia' })
      .eq('id', ag.id)
      .select()
      .single();
    setCancelandoId(null);

    if (error) setAviso({ tipo: 'erro', texto: traduzirErro(error) });
    else setAgendamentos((atual) => mesclar(atual, data));
  }

  // aviso contextual do horário escolhido
  const horasAteGravacao = form.dataHora ? (new Date(form.dataHora) - agora) / UMA_HORA : null;
  let dicaHorario = 'O cliente recebe o pedido de confirmação 24h antes e tem 2h para responder.';
  if (horasAteGravacao !== null && horasAteGravacao > 0 && horasAteGravacao < 2) {
    dicaHorario = 'Faltam menos de 2h: o pedido de confirmação sai ao salvar e vale até o horário da gravação.';
  } else if (horasAteGravacao !== null && horasAteGravacao > 0 && horasAteGravacao < 24) {
    dicaHorario = 'Faltam menos de 24h: o pedido de confirmação sai assim que você salvar.';
  }

  const inputBase =
    'mt-1.5 block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-violet-600 sm:text-sm';
  const anel = (campo) => (erros[campo] ? 'ring-rose-400' : 'ring-slate-300');

  const abas = [
    { id: 'proximas', rotulo: 'Próximas', total: listas.proximas.length },
    { id: 'atencao', rotulo: 'Precisam de reagendamento', total: listas.atencao.length },
    { id: 'todas', rotulo: 'Últimos 14 dias e futuras', total: listas.todas.length },
  ];

  // ---------------------------------------------------------------- render

  return (
    <div className="text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <header className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agenda de gravações</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Agende aqui e o WhatsApp cuida do resto: pedido de confirmação 24h antes, liberação do horário se o
            cliente não responder em 2h e lembrete 1h antes da gravação.
          </p>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* ------------------------------------------------ formulário */}
          <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6 lg:sticky lg:top-8">
            <h2 className="text-base font-semibold">Nova gravação</h2>

            <form onSubmit={salvar} noValidate className="mt-5 space-y-5">
              <div>
                <label htmlFor="nome" className="block text-sm font-medium text-slate-700">
                  Nome do cliente
                </label>
                <input
                  id="nome"
                  ref={campoNomeRef}
                  type="text"
                  autoComplete="off"
                  maxLength={120}
                  value={form.nome}
                  onChange={alterar('nome')}
                  placeholder="Ex.: Clínica Sorriso Sobral"
                  aria-invalid={Boolean(erros.nome)}
                  aria-describedby={erros.nome ? 'erro-nome' : undefined}
                  className={`${inputBase} ${anel('nome')}`}
                />
                {erros.nome && <p id="erro-nome" className="mt-1.5 text-sm text-rose-600">{erros.nome}</p>}
              </div>

              <div>
                <label htmlFor="telefone" className="block text-sm font-medium text-slate-700">
                  WhatsApp do cliente
                </label>
                <input
                  id="telefone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.telefone}
                  onChange={alterar('telefone')}
                  placeholder="(88) 99999-9999"
                  aria-invalid={Boolean(erros.telefone)}
                  aria-describedby={erros.telefone ? 'erro-telefone' : undefined}
                  className={`${inputBase} tabular-nums ${anel('telefone')}`}
                />
                {erros.telefone && (
                  <p id="erro-telefone" className="mt-1.5 text-sm text-rose-600">{erros.telefone}</p>
                )}
              </div>

              <div>
                <label htmlFor="dataHora" className="block text-sm font-medium text-slate-700">
                  Data e horário da gravação
                </label>
                <input
                  id="dataHora"
                  ref={campoDataRef}
                  type="datetime-local"
                  min={paraInputLocal(new Date(agora.getTime() + 60_000))}
                  value={form.dataHora}
                  onChange={alterar('dataHora')}
                  aria-invalid={Boolean(erros.dataHora)}
                  aria-describedby="dica-horario"
                  className={`${inputBase} ${anel('dataHora')}`}
                />
                {erros.dataHora ? (
                  <p className="mt-1.5 text-sm text-rose-600">{erros.dataHora}</p>
                ) : (
                  <p id="dica-horario" className="mt-1.5 text-xs leading-5 text-slate-500">{dicaHorario}</p>
                )}
              </div>

              <div>
                <label htmlFor="observacoes" className="block text-sm font-medium text-slate-700">
                  Observações <span className="font-normal text-slate-400">(opcional, uso interno)</span>
                </label>
                <textarea
                  id="observacoes"
                  rows={2}
                  maxLength={500}
                  value={form.observacoes}
                  onChange={alterar('observacoes')}
                  placeholder="Local, roteiro, equipe…"
                  className={`${inputBase} resize-none ring-slate-300`}
                />
              </div>

              {aviso && (
                <p
                  role={aviso.tipo === 'erro' ? 'alert' : 'status'}
                  className={`rounded-lg px-3 py-2.5 text-sm ${
                    aviso.tipo === 'erro'
                      ? 'bg-rose-50 text-rose-800'
                      : aviso.tipo === 'ok'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-violet-50 text-violet-800'
                  }`}
                >
                  {aviso.texto}
                </p>
              )}

              <button
                type="submit"
                disabled={salvando}
                className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? 'Agendando…' : 'Agendar gravação'}
              </button>
            </form>
          </section>

          {/* ------------------------------------------------ agenda */}
          <section aria-labelledby="titulo-agenda" className="min-w-0">
            <h2 id="titulo-agenda" className="sr-only">Gravações agendadas</h2>

            <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
              {abas.map((aba) => {
                const ativa = filtro === aba.id;
                return (
                  <button
                    key={aba.id}
                    type="button"
                    role="tab"
                    aria-selected={ativa}
                    onClick={() => setFiltro(aba.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      ativa ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {aba.rotulo}
                    <span
                      className={`rounded-full px-1.5 text-xs tabular-nums ${
                        aba.id === 'atencao' && aba.total > 0
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {aba.total}
                    </span>
                  </button>
                );
              })}
            </div>

            {carregando ? (
              <div className="space-y-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
                ))}
              </div>
            ) : erroLista ? (
              <div className="rounded-2xl bg-white p-6 text-sm ring-1 ring-rose-200">
                <p className="text-rose-700">{erroLista}</p>
                <button
                  type="button"
                  onClick={carregar}
                  className="mt-3 font-medium text-violet-700 hover:text-violet-900"
                >
                  Carregar de novo
                </button>
              </div>
            ) : grupos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
                <p className="font-medium text-slate-700">
                  {filtro === 'atencao' ? 'Nenhuma gravação precisa de reagendamento.' : 'Nenhuma gravação na agenda.'}
                </p>
                {filtro !== 'atencao' && (
                  <p className="mt-1 text-sm text-slate-500">Use o formulário ao lado para agendar a primeira.</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {grupos.map((g) => (
                  <div key={g.rotulo}>
                    <h3 className="mb-2 flex items-baseline gap-2 px-1 text-sm font-semibold text-slate-900">
                      {g.rotulo}
                      <span className="text-xs font-normal text-slate-500">
                        {g.itens.length} {g.itens.length === 1 ? 'gravação' : 'gravações'}
                      </span>
                    </h3>
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                      {g.itens.map((ag) => (
                        <LinhaAgendamento
                          key={ag.id}
                          ag={ag}
                          agora={agora}
                          onCancelar={cancelar}
                          onReagendar={reagendar}
                          ocupado={cancelandoId === ag.id}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
