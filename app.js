// Substitua pela URL /exec do seu Google Apps Script (Web App)
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw6qXvKfxN1c1w8M9qK44Nmdgt5uPsakc03al4IXXR42YesssC_lbPUuWbTHeFzjtasvQ/exec";

const estado = {
  itens: [], // { id, linha, nome, cor, quantidadeOriginal, quantidadeAtual, imagem }
  itensVenda: [], // Itens da venda em preparação no popup.
  idVendaAtual: null,
  dataVendaPadrao: null,
  rascunhoNovaVenda: null,
  modoFormularioVenda: "nova",
  chaveEdicaoVenda: null,
  vendaOriginalEdicao: null,
  rascunhosEdicaoVenda: new Map(),
  modoVendas: "consulta",
  preservarConsultaAoFechar: false,
  operacaoSenha: null,
  avisoErroCarregamentoMostrado: false,
  carregando: false,
  salvando: false,
  consultandoVendas: false,
  idConsultaVendas: 0,
  vendasCarregadas: [],
};

// Elementos do DOM
const el = {
  statusConexao: document.getElementById("status-conexao"),
  buscaNome: document.getElementById("busca-nome"),
  buscaCor: document.getElementById("busca-cor"),
  btnLimparFiltros: document.getElementById("btn-limpar-filtros"),
  btnRecarregarEstoque: document.getElementById("btn-recarregar-estoque"),
  btnAlternarTema: document.getElementById("btn-alternar-tema"),
  btnAbrirVendidos: document.getElementById("btn-abrir-vendidos"),
  btnAbrirEdicaoVenda: document.getElementById("btn-abrir-editar-venda"),
  btnAbrirVenda: document.getElementById("btn-abrir-venda"),
  corpoEstoque: document.getElementById("corpo-estoque"),
  mensagemVazia: document.getElementById("mensagem-vazia"),

  previewImagem: document.getElementById("preview-imagem"),
  previewImgTag: document.getElementById("preview-img-tag"),
  previewLegenda: document.getElementById("preview-legenda"),

  barraSalvar: document.getElementById("barra-salvar"),
  resumoAlteracoes: document.getElementById("resumo-alteracoes"),
  btnDescartar: document.getElementById("btn-descartar"),
  btnAbrirSalvar: document.getElementById("btn-abrir-salvar"),

  modalSenha: document.getElementById("modal-senha"),
  modalSenhaTitulo: document.getElementById("modal-senha-titulo"),
  modalSenhaDescricao: document.getElementById("modal-senha-descricao"),
  formSalvar: document.getElementById("form-salvar-estoque"),
  senhaFuncionario: document.getElementById("senha-funcionario"),
  labelSenhaFuncionario: document.getElementById("label-senha-funcionario"),
  erroSenha: document.getElementById("erro-senha"),
  btnCancelarModal: document.getElementById("btn-cancelar-modal"),
  btnConfirmarSalvar: document.getElementById("btn-confirmar-salvar"),

  modalVenda: document.getElementById("modal-venda"),
  formVenda: document.getElementById("form-venda"),
  tituloModalVenda: document.getElementById("titulo-modal-venda"),
  vendaCliente: document.getElementById("venda-cliente"),
  vendaData: document.getElementById("venda-data"),
  vendaEndereco: document.getElementById("venda-endereco"),
  vendaTelefone: document.getElementById("venda-telefone"),
  vendaObservacao: document.getElementById("venda-observacao"),
  vendaVendedor: document.getElementById("venda-vendedor"),
  buscaProdutoVenda: document.getElementById("busca-produto-venda"),
  resultadosProdutosVenda: document.getElementById("resultados-produtos-venda"),
  mensagemResultadosVenda: document.getElementById("mensagem-resultados-venda"),
  itensVenda: document.getElementById("itens-venda"),
  contadorItensVenda: document.getElementById("contador-itens-venda"),
  mensagemVenda: document.getElementById("mensagem-venda"),
  statusVenda: document.getElementById("status-venda"),
  btnFecharVenda: document.getElementById("btn-fechar-venda"),
  btnLimparVenda: document.getElementById("btn-limpar-venda"),
  btnCancelarVenda: document.getElementById("btn-cancelar-venda"),
  btnSalvarVenda: document.getElementById("btn-salvar-venda"),

  modalVendidos: document.getElementById("modal-vendidos"),
  descricaoVendidos: document.getElementById("descricao-vendidos"),
  btnFecharVendidos: document.getElementById("btn-fechar-vendidos"),
  btnCancelarVendidos: document.getElementById("btn-cancelar-vendidos"),
  formVendidos: document.getElementById("form-vendidos"),
  senhaVendidos: document.getElementById("senha-vendidos"),
  erroVendidos: document.getElementById("erro-vendidos"),
  btnConsultarVendidos: document.getElementById("btn-consultar-vendidos"),
  conteudoVendidos: document.getElementById("conteudo-vendidos"),
  filtroVendidosCliente: document.getElementById("filtro-vendidos-cliente"),
  filtroVendidosMovel: document.getElementById("filtro-vendidos-movel"),
  filtroVendidosData: document.getElementById("filtro-vendidos-data"),
  mensagemVendidos: document.getElementById("mensagem-vendidos"),
  listaVendidos: document.getElementById("lista-vendidos"),
};

// Cria um popup de aviso caso não exista no HTML (usado para o erro único de carregamento)
const modalAvisoErro = criarModalAvisoErro();

function criarModalAvisoErro() {
  const dialog = document.createElement("dialog");
  dialog.className = "modal-senha";
  dialog.innerHTML = `
    <div class="modal-conteudo">
      <h2>Não foi possível carregar a planilha</h2>
      <p class="modal-descricao">
        Verifique sua conexão com a internet ou a publicação do Google Web App e tente recarregar a página.
      </p>
      <div class="modal-acoes">
        <button type="button" id="btn-fechar-aviso-erro" class="btn btn-primario">
          Entendi
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.querySelector("#btn-fechar-aviso-erro").addEventListener("click", () => {
    dialog.close();
  });
  return dialog;
}

function mostrarAvisoErroCarregamentoUnico() {
  if (estado.avisoErroCarregamentoMostrado) return;
  estado.avisoErroCarregamentoMostrado = true;

  if (typeof modalAvisoErro.showModal === "function") {
    modalAvisoErro.showModal();
  } else {
    alert("Não foi possível carregar a planilha.");
  }
}

function definirStatus(texto, tipo = "info") {
  if (!el.statusConexao) return;
  el.statusConexao.textContent = texto;
  el.statusConexao.style.background =
    tipo === "ok" ? "#dcfce7" : tipo === "erro" ? "#fee2e2" : "#eff6ff";
  el.statusConexao.style.color =
    tipo === "ok" ? "#15803d" : tipo === "erro" ? "#b91c1c" : "#2563eb";
}

// Normaliza texto para busca (sem acentos, minúsculas, espaços extras)
function normalizar(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function definirTema(modoNoturno) {
  const tema = modoNoturno ? "noturno" : "diurno";
  document.body.dataset.tema = tema;
  if (el.btnAlternarTema) {
    const rotulo = modoNoturno ? "Ativar modo diurno" : "Ativar modo noturno";
    el.btnAlternarTema.textContent = modoNoturno ? "☀" : "☾";
    el.btnAlternarTema.setAttribute("aria-label", rotulo);
    el.btnAlternarTema.title = rotulo;
    el.btnAlternarTema.setAttribute("aria-pressed", String(modoNoturno));
  }
}

function inicializarTema() {
  let modoNoturno = false;
  try {
    modoNoturno = localStorage.getItem("tema-estoque") === "noturno";
  } catch (erro) {
    // A página continua funcionando mesmo se o navegador bloquear o armazenamento local.
  }
  definirTema(modoNoturno);
}

function alternarTema() {
  const modoNoturno = document.body.dataset.tema !== "noturno";
  definirTema(modoNoturno);
  try {
    localStorage.setItem("tema-estoque", modoNoturno ? "noturno" : "diurno");
  } catch (erro) {
    // A alternância permanece válida até a página ser fechada.
  }
}

// Similaridade entre duas strings curtas (0 a 1) usando bigramas de caracteres
function similaridadeTexto(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  if (a.length < 2 || b.length < 2) {
    return a[0] === b[0] ? 0.35 : 0;
  }

  const bigramas = (str) => {
    const mapa = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const par = str.slice(i, i + 2);
      mapa.set(par, (mapa.get(par) || 0) + 1);
    }
    return mapa;
  };

  const mapA = bigramas(a);
  const mapB = bigramas(b);
  let intersecao = 0;

  for (const [par, qtdA] of mapA.entries()) {
    if (mapB.has(par)) {
      intersecao += Math.min(qtdA, mapB.get(par));
    }
  }

  return (2 * intersecao) / (a.length - 1 + (b.length - 1));
}

// Pontuação de proximidade entre o termo digitado e um campo do produto
function pontuarCampo(valorCampo, termoBusca) {
  if (!termoBusca) return { match: true, score: 1 };

  const alvo = normalizar(valorCampo);
  if (!alvo) return { match: false, score: 0 };

  if (alvo === termoBusca) return { match: true, score: 100 };
  if (alvo.startsWith(termoBusca)) return { match: true, score: 85 };

  const palavras = alvo.split(" ");
  if (palavras.some((p) => p.startsWith(termoBusca))) {
    return { match: true, score: 75 };
  }

  if (alvo.includes(termoBusca)) {
    return { match: true, score: 65 };
  }

  // Verifica cada palavra individualmente para permitir aproximação ("camseta" ~ "camiseta", "azl" ~ "azul")
  const termos = termoBusca.split(" ");
  let somaMelhores = 0;
  let todosProximos = true;

  for (const t of termos) {
    let melhorPalavra = similaridadeTexto(alvo, t);
    for (const p of palavras) {
      const sim = similaridadeTexto(p, t);
      if (sim > melhorPalavra) melhorPalavra = sim;
    }
    if (melhorPalavra < 0.38) {
      todosProximos = false;
    }
    somaMelhores += melhorPalavra;
  }

  const media = somaMelhores / termos.length;
  if (todosProximos && media >= 0.42) {
    return { match: true, score: Math.round(media * 55) };
  }

  return { match: false, score: 0 };
}

function obterItensFiltradosEOrdenados() {
  const termoNome = normalizar(el.buscaNome?.value || "");
  const termoCor = normalizar(el.buscaCor?.value || "");

  if (!termoNome && !termoCor) {
    return estado.itens.map((item, idx) => ({ item, idx, score: 0 }));
  }

  const resultados = [];

  estado.itens.forEach((item, idx) => {
    const resNome = pontuarCampo(item.nome, termoNome);
    const resCor = pontuarCampo(item.cor, termoCor);

    if (resNome.match && resCor.match) {
      const score =
        (termoNome ? resNome.score : 0) + (termoCor ? resCor.score : 0);
      resultados.push({ item, idx, score });
    }
  });

  // Ordena pelos mais parecidos primeiro; mantém ordem original em caso de empate
  resultados.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return resultados;
}

// Normaliza os registros recebidos da planilha (colunas: 1=Nome, 2=Cor, 3=Quantidade, última=Imagem)
function normalizarDadosPlanilha(payload) {
  const bruto = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.itens)
    ? payload.itens
    : Array.isArray(payload?.dados)
    ? payload.dados
    : null;

  if (!bruto) {
    throw new Error("Formato de dados inválido");
  }

  return bruto.map((registro, index) => {
    if (Array.isArray(registro)) {
      const nome = String(registro[0] ?? "").trim();
      const cor = String(registro[1] ?? "").trim();
      const qtdNum = Math.max(0, Number.parseInt(registro[2], 10) || 0);
      const imagem = String(registro[registro.length - 1] ?? "").trim();
      const urlImagem = imagem.startsWith("http") ? imagem : "";

      return {
        id: `item-${index + 2}`,
        linha: index + 2,
        nome,
        cor,
        quantidadeOriginal: qtdNum,
        quantidadeAtual: qtdNum,
        imagem: urlImagem,
      };
    }

    const qtdNum = Math.max(
      0,
      Number.parseInt(
        registro.quantidade ?? registro.estoque ?? registro.qtd ?? 0,
        10
      ) || 0
    );

    return {
      id: String(registro.id ?? `item-${registro.linha ?? index + 2}`),
      linha: Number(registro.linha) || index + 2,
      nome: String(registro.nome ?? registro.produto ?? "").trim(),
      cor: String(registro.cor ?? "").trim(),
      quantidadeOriginal: qtdNum,
      quantidadeAtual: qtdNum,
      imagem: String(registro.imagem ?? registro.foto ?? registro.url ?? "").trim(),
    };
  });
}

async function carregarEstoque() {
  if (!WEB_APP_URL || WEB_APP_URL.includes("SEU_ID_AQUI")) {
    definirStatus("Configure a URL do Web App", "erro");
    mostrarAvisoErroCarregamentoUnico();
    renderizarTabela();
    return false;
  }

  estado.carregando = true;
  definirStatus("Carregando estoque...", "info");
  let carregouComSucesso = false;

  try {
    const resposta = await fetch(`${WEB_APP_URL}?acao=listar`, {
      method: "GET",
      cache: "no-store",
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();
    if (dados && dados.ok === false) {
      throw new Error(dados.mensagem || "Erro retornado pelo Web App");
    }

    estado.itens = normalizarDadosPlanilha(dados);
    carregouComSucesso = true;
    definirStatus("Estoque atualizado", "ok");
  } catch (erro) {
    console.error("Erro ao carregar planilha:", erro);
    definirStatus("Erro ao carregar", "erro");
    mostrarAvisoErroCarregamentoUnico();
  } finally {
    estado.carregando = false;
    renderizarTabela();
    atualizarBarraSalvar();
  }
  return carregouComSucesso;
}

async function recarregarEstoqueManualmente() {
  if (estado.carregando || estado.salvando) return;
  if (
    obterItensAlterados().length > 0 &&
    !window.confirm("Há alterações de estoque ainda não salvas. Recarregar descartará essas alterações. Deseja continuar?")
  ) {
    return;
  }

  if (el.btnRecarregarEstoque) {
    el.btnRecarregarEstoque.disabled = true;
    el.btnRecarregarEstoque.textContent = "Recarregando...";
  }
  try {
    await carregarEstoque();
  } finally {
    if (el.btnRecarregarEstoque) {
      el.btnRecarregarEstoque.disabled = false;
      el.btnRecarregarEstoque.textContent = "Recarregar Estoque";
    }
  }
}

function renderizarTabela() {
  esconderImagem();
  el.corpoEstoque.innerHTML = "";

  const filtrados = obterItensFiltradosEOrdenados();

  if (filtrados.length === 0) {
    el.mensagemVazia.hidden = false;
    el.mensagemVazia.textContent = estado.carregando
      ? "Carregando produtos..."
      : "Nenhum produto encontrado com esse filtro.";
    return;
  }

  el.mensagemVazia.hidden = true;
  const fragmento = document.createDocumentFragment();

  for (const { item } of filtrados) {
    const alterada = item.quantidadeAtual !== item.quantidadeOriginal;
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.dataset.linha = String(item.linha);
    if (item.imagem) tr.dataset.imagem = item.imagem;
    if (alterada) tr.classList.add("alterada");

    // Coluna 1: Nome do produto (exibe/oculta imagem ao tocar ou passar o cursor)
    const tdProduto = document.createElement("td");
    tdProduto.className = "col-produto";
    tdProduto.dataset.label = "Produto";

    const btnNome = document.createElement("button");
    btnNome.type = "button";
    btnNome.className = "nome-produto";
    if (Number(item.quantidadeAtual) <= 0) btnNome.classList.add("sem-estoque");
    btnNome.textContent = item.nome || "Produto sem nome";
    btnNome.setAttribute("aria-expanded", "false");

    btnNome.addEventListener("pointerenter", () => {
      btnNome.setAttribute("aria-expanded", "true");
      mostrarImagem(item);
    });

    btnNome.addEventListener("pointerleave", (e) => {
      // Se o cursor foi direto para a caixa de preview, mantém a imagem aberta
      if (el.previewImagem && e.relatedTarget && el.previewImagem.contains(e.relatedTarget)) {
        return;
      }
      btnNome.setAttribute("aria-expanded", "false");
      esconderImagem();
    });

    btnNome.addEventListener("focus", () => {
      btnNome.setAttribute("aria-expanded", "true");
      mostrarImagem(item);
    });

    btnNome.addEventListener("blur", (e) => {
      if (el.previewImagem && e.relatedTarget && el.previewImagem.contains(e.relatedTarget)) {
        return;
      }
      btnNome.setAttribute("aria-expanded", "false");
      esconderImagem();
    });
    btnNome.addEventListener("pointerup", esconderImagem);
    btnNome.addEventListener("pointercancel", esconderImagem);
    btnNome.addEventListener("blur", esconderImagem);

    tdProduto.appendChild(btnNome);

    // Coluna 2: Cor
    const tdCor = document.createElement("td");
    tdCor.className = "col-cor";
    tdCor.dataset.label = "Cor";

    const spanCor = document.createElement("span");
    spanCor.className = "tag-cor";
    spanCor.textContent = item.cor || "—";
    const corNormalizada = String(item.cor ?? "").trim().toLocaleUpperCase("pt-BR");
    const classesPorCor = {
      BR: "cor-br",
      CN: "cor-cn",
      "CN/OFF": "cor-cn-off",
      "CN/GRAFITE": "cor-cn-grafite",
      PR: "cor-pr",
      PT: "cor-pt",
      FR: "cor-fr",
      CS: "cor-cs",
    };
    if (classesPorCor[corNormalizada]) {
      spanCor.classList.add(classesPorCor[corNormalizada]);
    }
    tdCor.appendChild(spanCor);

    // Coluna 3: Quantidade com + e - (nunca menor que 0)
    const tdQtd = document.createElement("td");
    tdQtd.className = "col-qtd";
    tdQtd.dataset.label = "Quantidade";

    const controle = document.createElement("div");
    controle.className = "controle-qtd";

    const btnMenos = document.createElement("button");
    btnMenos.type = "button";
    btnMenos.className = "btn-qtd btn-menos";
    btnMenos.setAttribute("aria-label", `Diminuir quantidade de ${item.nome}`);
    btnMenos.textContent = "−";
    btnMenos.disabled = item.quantidadeAtual <= 0;
    btnMenos.addEventListener("click", () => alterarQuantidade(item.id, -1));

    const spanQtd = document.createElement("span");
    spanQtd.className = "valor-qtd";
    spanQtd.dataset.qtdAtual = String(item.quantidadeAtual);
    spanQtd.dataset.qtdOriginal = String(item.quantidadeOriginal);
    spanQtd.textContent = String(item.quantidadeAtual);

    const btnMais = document.createElement("button");
    btnMais.type = "button";
    btnMais.className = "btn-qtd btn-mais";
    btnMais.setAttribute("aria-label", `Aumentar quantidade de ${item.nome}`);
    btnMais.textContent = "+";
    btnMais.addEventListener("click", () => alterarQuantidade(item.id, 1));

    controle.append(btnMenos, spanQtd, btnMais);
    tdQtd.appendChild(controle);

    tr.append(tdProduto, tdCor, tdQtd);
    fragmento.appendChild(tr);
  }

  el.corpoEstoque.appendChild(fragmento);
}

function alterarQuantidade(id, delta) {
  const item = estado.itens.find((i) => i.id === id);
  if (!item) return;

  // Garante que a quantidade nunca fique menor que 0
  const novaQtd = Math.max(0, item.quantidadeAtual + delta);
  if (novaQtd === item.quantidadeAtual) return;

  item.quantidadeAtual = novaQtd;
  renderizarTabela();
  atualizarBarraSalvar();
}

function obterItensAlterados() {
  return estado.itens.filter(
    (item) => item.quantidadeAtual !== item.quantidadeOriginal
  );
}

function atualizarBarraSalvar() {
  const alterados = obterItensAlterados();
  const total = alterados.length;

  if (total === 0) {
    el.barraSalvar.classList.remove("visivel");
    return;
  }

  el.resumoAlteracoes.innerHTML = `<strong>${total}</strong> item(ns) alterado(s)`;
  el.barraSalvar.classList.add("visivel");
}

function descartarAlteracoes() {
  for (const item of estado.itens) {
    item.quantidadeAtual = item.quantidadeOriginal;
  }
  renderizarTabela();
  atualizarBarraSalvar();
}

// Exibição da imagem do produto enquanto toca/segura ou passa o cursor
function mostrarImagem(item) {
  if (!item.imagem || !el.previewImagem || !el.previewImgTag) return;

  el.previewImgTag.src = item.imagem;
  el.previewImgTag.alt = `${item.nome}${item.cor ? ` — ${item.cor}` : ""}`;
  if (el.previewLegenda) {
    el.previewLegenda.textContent = item.cor
      ? `${item.nome} (${item.cor})`
      : item.nome;
  }
  el.previewImagem.classList.add("visivel");
  el.previewImagem.setAttribute("aria-hidden", "false");
}

function esconderImagem() {
  if (!el.previewImagem) return;
  el.previewImagem.classList.remove("visivel");
  el.previewImagem.setAttribute("aria-hidden", "true");
  if (el.previewImgTag) {
    el.previewImgTag.src = "";
  }
}

function dataLocalISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function abrirNovaVenda() {
  if (estado.rascunhoNovaVenda) restaurarRascunhoNovaVenda();
  estado.modoFormularioVenda = "nova";
  estado.chaveEdicaoVenda = null;
  estado.vendaOriginalEdicao = null;
  definirModoFormularioVenda();
  abrirModalVenda();
}

function abrirModalVenda() {
  if (!el.modalVenda) return;

  if (estado.modoFormularioVenda === "nova" && !estado.idVendaAtual) {
    estado.idVendaAtual = gerarIdVendaCliente();
  }
  renderizarResultadosVenda();
  renderizarItensVenda();

  if (typeof el.modalVenda.showModal === "function") {
    el.modalVenda.showModal();
  } else {
    el.modalVenda.setAttribute("open", "");
  }
  el.vendaCliente?.focus();
}

function definirModoFormularioVenda() {
  const editando = estado.modoFormularioVenda === "editar";
  if (el.tituloModalVenda) el.tituloModalVenda.textContent = editando ? "Editar venda" : "Nova venda";
  if (el.btnSalvarVenda) el.btnSalvarVenda.textContent = editando ? "Salvar edição" : "Registrar venda";
  if (el.btnLimparVenda) el.btnLimparVenda.hidden = editando;
  const aviso = el.modalVenda?.querySelector(".aviso-venda");
  if (aviso) {
    aviso.textContent = editando
      ? "As alterações ficam em rascunho até salvar. A senha será solicitada para atualizar a venda e o estoque."
      : "Ao registrar, será solicitada a senha do vendedor e o estoque será atualizado.";
  }
}

function limparFichaVenda() {
  el.formVenda?.reset();
  estado.dataVendaPadrao = dataLocalISO();
  if (el.vendaData) el.vendaData.value = estado.dataVendaPadrao;
  estado.itensVenda = [];
  estado.idVendaAtual = gerarIdVendaCliente();
  if (el.statusVenda) {
    el.statusVenda.hidden = true;
    el.statusVenda.textContent = "";
  }
  renderizarResultadosVenda();
  renderizarItensVenda();
}

function temRascunhoVenda() {
  const camposPreenchidos = [
    el.vendaCliente,
    el.vendaEndereco,
    el.vendaTelefone,
    el.vendaVendedor,
    el.vendaObservacao,
  ].some((campo) => campo?.value.trim());
  const dataAlterada = el.vendaData?.value && el.vendaData.value !== estado.dataVendaPadrao;
  const rascunhoAtivo = estado.modoFormularioVenda === "nova" &&
    (camposPreenchidos || Boolean(dataAlterada) || estado.itensVenda.length > 0);
  return Boolean(rascunhoAtivo || estado.rascunhoNovaVenda || estado.rascunhosEdicaoVenda.size > 0);
}

function protegerRecarregamento(evento) {
  if (obterItensAlterados().length === 0 && !temRascunhoVenda()) return;

  // O navegador apresenta o diálogo nativo de confirmação para recarga ou saída.
  evento.preventDefault();
  evento.returnValue = "";
}

function gerarIdVendaCliente() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fecharModalVenda() {
  const voltandoParaLista = estado.modoFormularioVenda === "editar";
  if (voltandoParaLista) guardarRascunhoEdicaoVenda();
  if (typeof el.modalVenda?.close === "function") {
    el.modalVenda.close();
  } else {
    el.modalVenda?.removeAttribute("open");
  }
  if (voltandoParaLista) {
    estado.modoFormularioVenda = "nova";
    estado.chaveEdicaoVenda = null;
    estado.vendaOriginalEdicao = null;
    limparFichaVenda();
    definirModoFormularioVenda();
    mostrarListaEdicaoVendas();
  }
}

function obterChaveEdicaoVenda(venda) {
  return venda.idVenda
    ? `id:${venda.idVenda}`
    : venda.chaveEdicao || `linhas:${(venda.linhasVenda || []).join(",")}`;
}

function criarRascunhoEdicaoVenda(venda) {
  const itensPorLinha = new Map();
  for (const item of venda.itens || []) {
    const linha = Number(item.linhaEstoque);
    if (!Number.isInteger(linha) || linha < 2) continue;
    const estoque = estado.itens.find((produto) => produto.linha === linha);
    if (!estoque) continue;
    const existente = itensPorLinha.get(estoque.id);
    if (existente) existente.quantidade += Math.max(0, Number(item.quantidade) || 0);
    else {
      itensPorLinha.set(estoque.id, {
        id: estoque.id,
        nome: estoque.nome,
        cor: estoque.cor,
        quantidade: Math.max(0, Number(item.quantidade) || 0),
      });
    }
  }
  return {
    cliente: venda.cliente || "",
    data: venda.data || "",
    endereco: venda.endereco || "",
    telefone: venda.telefone || "",
    observacao: venda.observacao || "",
    vendedor: venda.vendedor || "",
    itens: Array.from(itensPorLinha.values()).filter((item) => item.quantidade > 0),
  };
}

function guardarRascunhoEdicaoVenda() {
  if (estado.modoFormularioVenda !== "editar" || !estado.chaveEdicaoVenda) return;
  estado.rascunhosEdicaoVenda.set(estado.chaveEdicaoVenda, {
    cliente: el.vendaCliente?.value.trim() || "",
    data: el.vendaData?.value || "",
    endereco: el.vendaEndereco?.value.trim() || "",
    telefone: el.vendaTelefone?.value.trim() || "",
    observacao: el.vendaObservacao?.value.trim() || "",
    vendedor: el.vendaVendedor?.value.trim() || "",
    itens: estado.itensVenda.map((item) => ({ ...item })),
  });
}

function guardarRascunhoNovaVenda() {
  if (estado.modoFormularioVenda !== "nova") return;
  const camposPreenchidos = [
    el.vendaCliente,
    el.vendaEndereco,
    el.vendaTelefone,
    el.vendaVendedor,
    el.vendaObservacao,
  ].some((campo) => campo?.value.trim());
  const dataAlterada = el.vendaData?.value && el.vendaData.value !== estado.dataVendaPadrao;
  if (!camposPreenchidos && !dataAlterada && estado.itensVenda.length === 0) return;
  estado.rascunhoNovaVenda = {
    cliente: el.vendaCliente.value,
    data: el.vendaData.value,
    endereco: el.vendaEndereco.value,
    telefone: el.vendaTelefone.value,
    observacao: el.vendaObservacao.value,
    vendedor: el.vendaVendedor.value,
    idVenda: estado.idVendaAtual,
    itens: estado.itensVenda.map((item) => ({ ...item })),
  };
}

function restaurarRascunhoNovaVenda() {
  const rascunho = estado.rascunhoNovaVenda;
  if (!rascunho) return;
  el.formVenda?.reset();
  el.vendaCliente.value = rascunho.cliente;
  el.vendaData.value = rascunho.data;
  el.vendaEndereco.value = rascunho.endereco;
  el.vendaTelefone.value = rascunho.telefone;
  el.vendaObservacao.value = rascunho.observacao;
  el.vendaVendedor.value = rascunho.vendedor;
  estado.idVendaAtual = rascunho.idVenda;
  estado.itensVenda = rascunho.itens.map((item) => ({ ...item }));
  estado.rascunhoNovaVenda = null;
  renderizarItensVenda();
}

async function abrirEditorVenda(venda) {
  if (obterItensAlterados().length > 0) {
    definirStatus("Salve ou descarte as alterações do estoque antes de editar uma venda.", "erro");
    return;
  }
  if (!venda?.editavel) return;
  if (!await carregarEstoque()) return;

  const chave = obterChaveEdicaoVenda(venda);
  estado.modoFormularioVenda = "editar";
  estado.chaveEdicaoVenda = chave;
  estado.vendaOriginalEdicao = JSON.parse(JSON.stringify(venda));
  const rascunho = estado.rascunhosEdicaoVenda.get(chave) || criarRascunhoEdicaoVenda(venda);
  el.formVenda?.reset();
  el.vendaCliente.value = rascunho.cliente;
  el.vendaData.value = rascunho.data;
  el.vendaEndereco.value = rascunho.endereco;
  el.vendaTelefone.value = rascunho.telefone;
  el.vendaObservacao.value = rascunho.observacao;
  el.vendaVendedor.value = rascunho.vendedor;
  estado.itensVenda = rascunho.itens.map((item) => ({ ...item }));
  estado.idVendaAtual = null;
  if (el.statusVenda) {
    el.statusVenda.hidden = true;
    el.statusVenda.textContent = "";
  }
  definirModoFormularioVenda();
  guardarRascunhoEdicaoVenda();
  fecharModalVendidos(true);
  abrirModalVenda();
}

function mostrarListaEdicaoVendas() {
  if (!el.modalVendidos || estado.modoVendas !== "editar") return;
  if (el.formVendidos) el.formVendidos.hidden = true;
  if (el.conteudoVendidos) el.conteudoVendidos.hidden = false;
  if (el.descricaoVendidos) el.descricaoVendidos.textContent = "Escolha uma venda para editar. Os rascunhos são mantidos até serem salvos.";
  renderizarVendas();
  if (typeof el.modalVendidos.showModal === "function") el.modalVendidos.showModal();
  else el.modalVendidos.setAttribute("open", "");
}

function renderizarResultadosVenda() {
  if (!el.resultadosProdutosVenda || !el.mensagemResultadosVenda) return;

  el.resultadosProdutosVenda.innerHTML = "";
  const termo = normalizar(el.buscaProdutoVenda?.value || "");
  if (!termo) {
    el.mensagemResultadosVenda.textContent = "Digite para pesquisar os produtos do estoque.";
    el.mensagemResultadosVenda.hidden = false;
    return;
  }

  const resultados = estado.itens
    .map((item, indice) => ({
      item,
      indice,
      pontuacao: pontuarCampo(`${item.nome} ${item.cor}`, termo),
    }))
    .filter(({ item, pontuacao }) => item.nome && pontuacao.match)
    .sort((a, b) => b.pontuacao.score - a.pontuacao.score || a.indice - b.indice)
    .slice(0, 20);

  if (resultados.length === 0) {
    el.mensagemResultadosVenda.textContent = "Nenhum produto encontrado.";
    el.mensagemResultadosVenda.hidden = false;
    return;
  }

  el.mensagemResultadosVenda.hidden = true;
  const fragmento = document.createDocumentFragment();

  for (const { item } of resultados) {
    const quantidadeRascunho = estado.itensVenda.find((produto) => produto.id === item.id)?.quantidade || 0;
    const quantidadeMaxima = obterLimiteQuantidadeVenda(item);
    const semEstoque = quantidadeRascunho >= quantidadeMaxima;
    const li = document.createElement("li");
    li.className = `resultado-venda${semEstoque ? " sem-estoque" : ""}`;

    const dados = document.createElement("div");
    dados.className = "dados-produto-venda";
    const nome = document.createElement("div");
    nome.className = `nome-produto-venda${semEstoque ? " nome-sem-estoque" : ""}`;
    nome.textContent = item.nome || "Produto sem nome";
    const detalhe = document.createElement("div");
    detalhe.className = "detalhe-produto-venda";
    detalhe.textContent = `${item.cor ? `Cor ${item.cor} · ` : ""}Estoque: ${item.quantidadeAtual}${estado.modoFormularioVenda === "editar" ? ` · Na venda: ${quantidadeRascunho}/${quantidadeMaxima}` : ` · Disponível: ${Math.max(0, quantidadeMaxima - quantidadeRascunho)}`}`;
    dados.append(nome, detalhe);

    const btnAdicionar = document.createElement("button");
    btnAdicionar.type = "button";
    btnAdicionar.className = "btn-adicionar-produto";
    btnAdicionar.textContent = "Adicionar";
    btnAdicionar.setAttribute("aria-label", `Adicionar ${item.nome}${item.cor ? `, cor ${item.cor}` : ""}`);
    btnAdicionar.disabled = semEstoque;
    if (semEstoque) {
      btnAdicionar.setAttribute("aria-label", `${item.nome}${item.cor ? `, cor ${item.cor}` : ""} sem unidades disponíveis para esta venda`);
    }
    btnAdicionar.addEventListener("click", () => adicionarProdutoAVenda(item));

    li.append(dados, btnAdicionar);
    fragmento.appendChild(li);
  }

  el.resultadosProdutosVenda.appendChild(fragmento);
}

function obterQuantidadeOriginalVenda(idProduto) {
  if (estado.modoFormularioVenda !== "editar" || !estado.vendaOriginalEdicao) return 0;
  const produto = estado.itens.find((item) => item.id === idProduto);
  if (!produto) return 0;
  return (estado.vendaOriginalEdicao.itens || [])
    .filter((item) => Number(item.linhaEstoque) === produto.linha)
    .reduce((soma, item) => soma + Math.max(0, Number(item.quantidade) || 0), 0);
}

function obterLimiteQuantidadeVenda(item) {
  const estoqueAtual = Math.max(0, Number(item.quantidadeAtual) || 0);
  return estoqueAtual + obterQuantidadeOriginalVenda(item.id);
}

function adicionarProdutoAVenda(item) {
  const limite = obterLimiteQuantidadeVenda(item);
  if (limite <= 0) return;

  const existente = estado.itensVenda.find((produto) => produto.id === item.id);
  if ((existente?.quantidade || 0) >= limite) return;
  if (existente) {
    existente.quantidade += 1;
  } else {
    estado.itensVenda.push({
      id: item.id,
      nome: item.nome,
      cor: item.cor,
      quantidade: 1,
    });
  }
  renderizarItensVenda();
  guardarRascunhoEdicaoVenda();
}

function alterarQuantidadeItemVenda(id, delta) {
  const item = estado.itensVenda.find((produto) => produto.id === id);
  if (!item) return;
  const produtoEstoque = estado.itens.find((produto) => produto.id === id);
  if (delta > 0 && (!produtoEstoque || item.quantidade >= obterLimiteQuantidadeVenda(produtoEstoque))) return;
  item.quantidade = Math.max(1, item.quantidade + delta);
  renderizarItensVenda();
  guardarRascunhoEdicaoVenda();
}

function removerItemDaVenda(id) {
  estado.itensVenda = estado.itensVenda.filter((produto) => produto.id !== id);
  renderizarItensVenda();
  guardarRascunhoEdicaoVenda();
}

function renderizarItensVenda() {
  if (!el.itensVenda) return;
  el.itensVenda.innerHTML = "";

  const quantidadeTotal = estado.itensVenda.reduce((soma, item) => soma + item.quantidade, 0);
  if (el.contadorItensVenda) {
    el.contadorItensVenda.textContent = `${quantidadeTotal} ${quantidadeTotal === 1 ? "item" : "itens"}`;
  }
  if (el.mensagemVenda) {
    el.mensagemVenda.hidden = estado.itensVenda.length > 0;
    el.mensagemVenda.textContent = "Nenhum produto adicionado ainda.";
  }

  const fragmento = document.createDocumentFragment();
  for (const item of estado.itensVenda) {
    const li = document.createElement("li");
    li.className = "item-venda";

    const dados = document.createElement("div");
    dados.className = "dados-produto-venda";
    const nome = document.createElement("div");
    nome.className = "nome-produto-venda";
    nome.textContent = item.nome || "Produto sem nome";
    const detalhe = document.createElement("div");
    detalhe.className = "detalhe-produto-venda";
    detalhe.textContent = item.cor ? `Cor ${item.cor}` : "Sem cor informada";
    dados.append(nome, detalhe);

    const controles = document.createElement("div");
    controles.className = "quantidade-item-venda";
    const btnMenos = document.createElement("button");
    btnMenos.type = "button";
    btnMenos.className = "btn-quantidade-venda";
    btnMenos.textContent = "−";
    btnMenos.disabled = item.quantidade <= 1;
    btnMenos.setAttribute("aria-label", `Diminuir quantidade de ${item.nome}`);
    btnMenos.addEventListener("click", () => alterarQuantidadeItemVenda(item.id, -1));
    const quantidade = document.createElement("strong");
    quantidade.textContent = String(item.quantidade);
    const btnMais = document.createElement("button");
    btnMais.type = "button";
    btnMais.className = "btn-quantidade-venda";
    btnMais.textContent = "+";
    const produtoEstoque = estado.itens.find((produto) => produto.id === item.id);
    btnMais.disabled = !produtoEstoque || item.quantidade >= obterLimiteQuantidadeVenda(produtoEstoque);
    btnMais.setAttribute("aria-label", `Aumentar quantidade de ${item.nome}`);
    btnMais.addEventListener("click", () => alterarQuantidadeItemVenda(item.id, 1));
    const btnRemover = document.createElement("button");
    btnRemover.type = "button";
    btnRemover.className = "btn-remover-item";
    btnRemover.textContent = "Remover";
    btnRemover.addEventListener("click", () => removerItemDaVenda(item.id));
    controles.append(btnMenos, quantidade, btnMais, btnRemover);

    li.append(dados, controles);
    fragmento.appendChild(li);
  }
  el.itensVenda.appendChild(fragmento);
  renderizarResultadosVenda();
}

function limparConsultaVendidos() {
  estado.idConsultaVendas += 1;
  el.formVendidos?.reset();
  if (el.formVendidos) el.formVendidos.hidden = false;
  if (el.descricaoVendidos) el.descricaoVendidos.textContent = "Informe sua senha para consultar as vendas.";
  if (el.erroVendidos) {
    el.erroVendidos.hidden = true;
    el.erroVendidos.textContent = "";
  }
  if (el.conteudoVendidos) el.conteudoVendidos.hidden = true;
  if (el.filtroVendidosCliente) el.filtroVendidosCliente.value = "";
  if (el.filtroVendidosMovel) el.filtroVendidosMovel.value = "";
  if (el.filtroVendidosData) el.filtroVendidosData.value = "";
  if (el.mensagemVendidos) el.mensagemVendidos.textContent = "";
  if (el.listaVendidos) el.listaVendidos.innerHTML = "";
  estado.vendasCarregadas = [];
  estado.consultandoVendas = false;
  if (el.btnConsultarVendidos) {
    el.btnConsultarVendidos.disabled = false;
    el.btnConsultarVendidos.textContent = "Ver vendas";
  }
}

function abrirModalVendidos(modo = "consulta") {
  if (!el.modalVendidos) return;
  if (modo === "editar") guardarRascunhoNovaVenda();
  estado.modoVendas = modo;
  limparConsultaVendidos();
  if (el.btnConsultarVendidos) el.btnConsultarVendidos.textContent = modo === "editar" ? "Buscar vendas" : "Ver vendas";
  if (el.descricaoVendidos) {
    el.descricaoVendidos.textContent = modo === "editar"
      ? "Informe sua senha para escolher uma venda que deseja editar."
      : "Informe sua senha para consultar as vendas.";
  }
  if (typeof el.modalVendidos.showModal === "function") {
    el.modalVendidos.showModal();
  } else {
    el.modalVendidos.setAttribute("open", "");
  }
  el.senhaVendidos?.focus();
}

function fecharModalVendidos(preservarLista = false) {
  estado.preservarConsultaAoFechar = preservarLista;
  if (typeof el.modalVendidos?.close === "function") {
    el.modalVendidos.close();
  } else {
    el.modalVendidos?.removeAttribute("open");
    if (!preservarLista) limparConsultaVendidos();
    estado.preservarConsultaAoFechar = false;
  }
}

async function consultarVendas(evento) {
  evento.preventDefault();
  if (estado.consultandoVendas) return;

  const senha = el.senhaVendidos?.value.trim();
  if (!senha) return;

  estado.consultandoVendas = true;
  const idConsulta = ++estado.idConsultaVendas;
  el.erroVendidos.hidden = true;
  el.btnConsultarVendidos.disabled = true;
  el.btnConsultarVendidos.textContent = "Consultando...";

  try {
    const resposta = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ acao: "listarvendas", senha }),
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

    const resultado = await resposta.json();
    if (idConsulta !== estado.idConsultaVendas) return;
    el.senhaVendidos.value = "";
    if (!resultado || resultado.ok !== true) {
      el.erroVendidos.textContent = resultado?.mensagem || "Não foi possível consultar as vendas.";
      el.erroVendidos.hidden = false;
      return;
    }

    el.formVendidos.hidden = true;
    el.descricaoVendidos.textContent = estado.modoVendas === "editar"
      ? "Escolha uma venda para editar. A senha será solicitada novamente ao salvar."
      : "Os produtos da mesma venda estão agrupados por cliente.";
    el.conteudoVendidos.hidden = false;
    estado.vendasCarregadas = Array.isArray(resultado.vendas) ? resultado.vendas : [];
    renderizarVendas();
  } catch (erro) {
    if (idConsulta !== estado.idConsultaVendas) return;
    console.error("Erro ao consultar vendas:", erro);
    el.senhaVendidos.value = "";
    el.erroVendidos.textContent = "Não foi possível consultar as vendas. Verifique a conexão e tente novamente.";
    el.erroVendidos.hidden = false;
  } finally {
    if (idConsulta === estado.idConsultaVendas) {
      estado.consultandoVendas = false;
      el.btnConsultarVendidos.disabled = false;
      el.btnConsultarVendidos.textContent = estado.modoVendas === "editar" ? "Buscar vendas" : "Ver vendas";
    }
  }
}

function formatarDataHistorico(data) {
  const partes = String(data || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : data || "Data não informada";
}

function renderizarVendas() {
  el.listaVendidos.innerHTML = "";
  if (estado.vendasCarregadas.length === 0) {
    el.mensagemVendidos.textContent = "Nenhuma venda registrada.";
    return;
  }

  const clienteBuscado = normalizar(el.filtroVendidosCliente?.value || "");
  const movelBuscado = normalizar(el.filtroVendidosMovel?.value || "");
  const dataBuscada = el.filtroVendidosData?.value || "";
  const vendas = estado.vendasCarregadas.filter((venda) => {
    const clienteCorresponde = !clienteBuscado || normalizar(venda.cliente || "").includes(clienteBuscado);
    const movelCorresponde = !movelBuscado || (venda.itens || []).some((item) =>
      normalizar(`${item.produto || ""} ${item.cor || ""}`).includes(movelBuscado)
    );
    const dataCorresponde = !dataBuscada || String(venda.data || "") === dataBuscada;
    return clienteCorresponde && movelCorresponde && dataCorresponde;
  });

  if (vendas.length === 0) {
    el.mensagemVendidos.textContent = "Nenhuma venda corresponde aos filtros.";
    return;
  }

  el.mensagemVendidos.textContent = `${vendas.length} ${vendas.length === 1 ? "venda encontrada" : "vendas encontradas"}.`;
  const fragmento = document.createDocumentFragment();

  for (const venda of vendas) {
    const cartao = document.createElement("li");
    cartao.className = "venda-historico";

    const cabecalho = document.createElement("div");
    cabecalho.className = "venda-historico-cabecalho";
    const titulo = document.createElement("h3");
    titulo.textContent = venda.cliente || "Cliente não informado";
    const data = document.createElement("time");
    data.textContent = formatarDataHistorico(venda.data);
    cabecalho.append(titulo, data);
    cartao.appendChild(cabecalho);

    const detalhes = [
      venda.endereco && `Endereço: ${venda.endereco}`,
      venda.telefone && `Telefone: ${venda.telefone}`,
      venda.vendedor && `Vendedor: ${venda.vendedor}`,
      venda.registradoPor && `Registrado por: ${venda.registradoPor}`,
      venda.observacao && `Observação: ${venda.observacao}`,
    ].filter(Boolean);
    if (detalhes.length > 0) {
      const paragrafo = document.createElement("p");
      paragrafo.className = "venda-historico-detalhes";
      paragrafo.textContent = detalhes.join(" · ");
      cartao.appendChild(paragrafo);
    }

    const itens = document.createElement("ul");
    itens.className = "venda-historico-itens";
    for (const item of venda.itens || []) {
      const linhaItem = document.createElement("li");
      linhaItem.textContent = `${item.produto}${item.cor ? ` · ${item.cor}` : ""} — ${item.quantidade} ${item.quantidade === 1 ? "unidade" : "unidades"}`;
      itens.appendChild(linhaItem);
    }
    cartao.appendChild(itens);
    if (estado.modoVendas === "editar") {
      const acoes = document.createElement("div");
      acoes.className = "acoes-venda-historico";
      const btnEditar = document.createElement("button");
      btnEditar.type = "button";
      btnEditar.className = "btn btn-editar-venda-cartao";
      btnEditar.textContent = venda.editavel ? "Editar venda" : "Produto sem correspondência no estoque";
      btnEditar.disabled = !venda.editavel;
      btnEditar.addEventListener("click", () => abrirEditorVenda(venda));
      acoes.appendChild(btnEditar);
      cartao.appendChild(acoes);
    }
    fragmento.appendChild(cartao);
  }

  el.listaVendidos.appendChild(fragmento);
}

function iniciarRegistroVenda(evento) {
  evento.preventDefault();
  if (!el.statusVenda || estado.salvando) return;

  if (estado.itensVenda.length === 0) {
    el.statusVenda.textContent = estado.modoFormularioVenda === "editar"
      ? "A venda precisa ter ao menos um item para salvar a edição."
      : "Adicione pelo menos um produto à venda.";
    el.statusVenda.hidden = false;
    return;
  }
  if (obterItensAlterados().length > 0) {
    el.statusVenda.textContent = "Salve ou descarte as alterações do estoque antes de registrar a venda.";
    el.statusVenda.hidden = false;
    return;
  }

  el.statusVenda.hidden = true;
  el.statusVenda.textContent = "";
  if (estado.modoFormularioVenda === "editar") {
    guardarRascunhoEdicaoVenda();
    abrirModalSenha("editarVenda");
  } else {
    abrirModalSenha("venda");
  }
}

// Popup de senha para salvar
function abrirModalSenha(operacao = "estoque") {
  if (operacao === "estoque" && obterItensAlterados().length === 0) return;

  estado.operacaoSenha = operacao;
  if (el.modalSenhaTitulo) {
    el.modalSenhaTitulo.textContent = operacao === "venda"
      ? "Confirmar venda"
      : operacao === "editarVenda" ? "Salvar edição da venda" : "Confirmar alterações";
  }
  if (el.modalSenhaDescricao) {
    el.modalSenhaDescricao.textContent = operacao === "venda"
      ? "Digite a senha do vendedor para registrar a venda e baixar os itens do estoque."
      : operacao === "editarVenda"
        ? "Digite sua senha novamente para salvar os dados da venda e ajustar o estoque."
        : "Digite sua senha de funcionário para salvar as novas quantidades na planilha.";
  }
  if (el.labelSenhaFuncionario) {
    el.labelSenhaFuncionario.textContent = operacao === "venda"
      ? "Senha do vendedor"
      : "Senha do funcionário";
  }

  el.erroSenha.hidden = true;
  el.erroSenha.textContent = "";
  el.senhaFuncionario.value = "";
  el.btnConfirmarSalvar.disabled = false;
  el.btnConfirmarSalvar.textContent = operacao === "venda"
    ? "Confirmar e Registrar Venda"
    : operacao === "editarVenda" ? "Confirmar e Salvar Edição" : "Confirmar e Salvar";

  if (typeof el.modalSenha.showModal === "function") {
    el.modalSenha.showModal();
  } else {
    el.modalSenha.setAttribute("open", "");
  }
  el.senhaFuncionario.focus();
}

function fecharModalSenha() {
  if (estado.salvando) return;
  if (typeof el.modalSenha.close === "function") {
    el.modalSenha.close();
  } else {
    el.modalSenha.removeAttribute("open");
  }
  el.senhaFuncionario.value = "";
  estado.operacaoSenha = null;
}

async function salvarAlteracoesComSenha(evento) {
  evento.preventDefault();
  if (estado.salvando) return;

  const senha = el.senhaFuncionario.value.trim();
  if (!senha) {
    el.erroSenha.textContent = "Digite sua senha para salvar.";
    el.erroSenha.hidden = false;
    return;
  }

  if (estado.operacaoSenha === "venda") {
    return registrarVendaComSenha(senha);
  }
  if (estado.operacaoSenha === "editarVenda") {
    return editarVendaComSenha(senha);
  }

  const alterados = obterItensAlterados().map((item) => ({
    linha: item.linha,
    nome: item.nome,
    cor: item.cor,
    quantidadeAnterior: item.quantidadeOriginal,
    quantidadeNova: Math.max(0, item.quantidadeAtual),
  }));

  if (alterados.length === 0) return;

  estado.salvando = true;
  el.erroSenha.hidden = true;
  el.btnConfirmarSalvar.disabled = true;
  el.btnConfirmarSalvar.textContent = "Verificando e salvando...";

  try {
    // text/plain evita preflight CORS desnecessário no Google Apps Script
    const resposta = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "salvar",
        senha,
        alteracoes: alterados,
      }),
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const resultado = await resposta.json();

    if (!resultado || resultado.ok !== true) {
      el.erroSenha.textContent =
        resultado?.mensagem || "Senha inválida ou falha ao salvar.";
      el.erroSenha.hidden = false;
      el.btnConfirmarSalvar.disabled = false;
      el.btnConfirmarSalvar.textContent = "Confirmar e Salvar";
      return;
    }

    // Confirma as novas quantidades como base atual
    for (const item of estado.itens) {
      item.quantidadeOriginal = item.quantidadeAtual;
    }

    estado.salvando = false;
    fecharModalSenha();
    renderizarTabela();
    atualizarBarraSalvar();
    definirStatus("Alterações salvas", "ok");
  } catch (erro) {
    console.error("Erro ao salvar alterações:", erro);
    el.erroSenha.textContent =
      "Não foi possível comunicar com o servidor. Tente novamente.";
    el.erroSenha.hidden = false;
    el.btnConfirmarSalvar.disabled = false;
    el.btnConfirmarSalvar.textContent = "Confirmar e Salvar";
  } finally {
    estado.salvando = false;
  }
}

async function registrarVendaComSenha(senha) {
  if (estado.salvando) return;

  const itens = estado.itensVenda.map((produto) => {
    const itemEstoque = estado.itens.find((item) => item.id === produto.id);
    return itemEstoque
      ? {
          linha: itemEstoque.linha,
          nome: itemEstoque.nome,
          cor: itemEstoque.cor,
          quantidade: produto.quantidade,
        }
      : null;
  }).filter(Boolean);

  if (itens.length === 0) {
    el.erroSenha.textContent = "Não há produtos válidos para registrar.";
    el.erroSenha.hidden = false;
    return;
  }

  estado.salvando = true;
  el.erroSenha.hidden = true;
  el.btnConfirmarSalvar.disabled = true;
  el.btnConfirmarSalvar.textContent = "Verificando senha e registrando...";

  try {
    const resposta = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "vender",
        senha,
        idVenda: estado.idVendaAtual,
        venda: {
          cliente: el.vendaCliente.value.trim(),
          data: el.vendaData.value,
          endereco: el.vendaEndereco.value.trim(),
          telefone: el.vendaTelefone.value.trim(),
          observacao: el.vendaObservacao.value.trim(),
          vendedor: el.vendaVendedor.value.trim(),
          itens,
        },
      }),
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const resultado = await resposta.json();
    if (!resultado || resultado.ok !== true) {
      const mensagem = resultado?.mensagem || "Não foi possível registrar a venda.";
      el.erroSenha.textContent = mensagem;
      el.erroSenha.hidden = false;
      if (el.statusVenda) {
        el.statusVenda.textContent = mensagem;
        el.statusVenda.hidden = false;
      }
      el.btnConfirmarSalvar.disabled = false;
      el.btnConfirmarSalvar.textContent = "Confirmar e Registrar Venda";
      return;
    }

    estado.salvando = false;
    fecharModalSenha();
    estado.rascunhoNovaVenda = null;
    limparFichaVenda();
    fecharModalVenda();
    definirStatus("Venda registrada; atualizando estoque...", "ok");
    const estoqueCarregado = await carregarEstoque();
    if (estoqueCarregado) {
      definirStatus("Venda registrada e estoque atualizado", "ok");
    } else {
      definirStatus("Venda registrada; não foi possível atualizar a tela do estoque", "erro");
    }
  } catch (erro) {
    console.error("Erro ao registrar venda:", erro);
    el.erroSenha.textContent =
      "Não foi possível confirmar o resultado. Verifique a aba vendas antes de tentar novamente.";
    el.erroSenha.hidden = false;
    el.btnConfirmarSalvar.disabled = false;
    el.btnConfirmarSalvar.textContent = "Confirmar e Registrar Venda";
  } finally {
    estado.salvando = false;
  }
}

async function editarVendaComSenha(senha) {
  if (estado.salvando || !estado.vendaOriginalEdicao || !estado.chaveEdicaoVenda) return;
  if (estado.itensVenda.length === 0) {
    el.erroSenha.textContent = "A venda precisa ter ao menos um item para salvar a edição.";
    el.erroSenha.hidden = false;
    return;
  }

  const itens = estado.itensVenda.map((produto) => {
    const itemEstoque = estado.itens.find((item) => item.id === produto.id);
    return itemEstoque
      ? {
          linha: itemEstoque.linha,
          nome: itemEstoque.nome,
          cor: itemEstoque.cor,
          quantidade: produto.quantidade,
        }
      : null;
  });
  if (itens.some((item) => !item)) {
    el.erroSenha.textContent = "Um produto não foi localizado no estoque. Atualize os dados e tente novamente.";
    el.erroSenha.hidden = false;
    return;
  }

  const vendaOriginal = estado.vendaOriginalEdicao;
  const chaveOriginal = estado.chaveEdicaoVenda;
  estado.salvando = true;
  el.erroSenha.hidden = true;
  el.btnConfirmarSalvar.disabled = true;
  el.btnConfirmarSalvar.textContent = "Verificando senha e salvando...";

  try {
    const resposta = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "editarvenda",
        senha,
        venda: {
          idVenda: vendaOriginal.idVenda,
          chaveEdicao: vendaOriginal.chaveEdicao,
          linhasVenda: vendaOriginal.linhasVenda,
          cliente: el.vendaCliente.value.trim(),
          data: el.vendaData.value,
          endereco: el.vendaEndereco.value.trim(),
          telefone: el.vendaTelefone.value.trim(),
          observacao: el.vendaObservacao.value.trim(),
          vendedor: el.vendaVendedor.value.trim(),
          itens,
        },
      }),
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

    const resultado = await resposta.json();
    if (!resultado || resultado.ok !== true || !resultado.venda) {
      el.erroSenha.textContent = resultado?.mensagem || "Não foi possível salvar a edição.";
      el.erroSenha.hidden = false;
      el.btnConfirmarSalvar.disabled = false;
      el.btnConfirmarSalvar.textContent = "Confirmar e Salvar Edição";
      return;
    }

    estado.rascunhosEdicaoVenda.delete(chaveOriginal);
    const indiceVenda = estado.vendasCarregadas.findIndex((venda) => obterChaveEdicaoVenda(venda) === chaveOriginal);
    if (indiceVenda >= 0) {
      if (resultado.venda.itens.length === 0) estado.vendasCarregadas.splice(indiceVenda, 1);
      else estado.vendasCarregadas[indiceVenda] = resultado.venda;
    }

    estado.salvando = false;
    fecharModalSenha();
    estado.modoFormularioVenda = "nova";
    estado.chaveEdicaoVenda = null;
    estado.vendaOriginalEdicao = null;
    limparFichaVenda();
    definirModoFormularioVenda();
    if (typeof el.modalVenda.close === "function") el.modalVenda.close();
    else el.modalVenda.removeAttribute("open");
    mostrarListaEdicaoVendas();
    definirStatus("Edição salva; atualizando estoque...", "ok");
    const estoqueCarregado = await carregarEstoque();
    if (estoqueCarregado) definirStatus("Venda editada e estoque atualizado", "ok");
    else definirStatus("Venda editada; não foi possível atualizar a tela do estoque", "erro");
  } catch (erro) {
    console.error("Erro ao editar venda:", erro);
    el.erroSenha.textContent = "Não foi possível confirmar o resultado. Consulte as vendas antes de tentar novamente.";
    el.erroSenha.hidden = false;
    el.btnConfirmarSalvar.disabled = false;
    el.btnConfirmarSalvar.textContent = "Confirmar e Salvar Edição";
  } finally {
    estado.salvando = false;
  }
}

// Eventos gerais
el.buscaNome?.addEventListener("input", renderizarTabela);
el.buscaCor?.addEventListener("input", renderizarTabela);

el.btnLimparFiltros?.addEventListener("click", () => {
  if (el.buscaNome) el.buscaNome.value = "";
  if (el.buscaCor) el.buscaCor.value = "";
  renderizarTabela();
});

el.btnRecarregarEstoque?.addEventListener("click", recarregarEstoqueManualmente);
el.btnDescartar?.addEventListener("click", descartarAlteracoes);
el.btnAbrirSalvar?.addEventListener("click", abrirModalSenha);
el.btnCancelarModal?.addEventListener("click", fecharModalSenha);
el.formSalvar?.addEventListener("submit", salvarAlteracoesComSenha);
el.btnAlternarTema?.addEventListener("click", alternarTema);
el.btnAbrirVendidos?.addEventListener("click", abrirModalVendidos);
el.btnAbrirEdicaoVenda?.addEventListener("click", () => abrirModalVendidos("editar"));
el.btnFecharVendidos?.addEventListener("click", fecharModalVendidos);
el.btnCancelarVendidos?.addEventListener("click", fecharModalVendidos);
el.formVendidos?.addEventListener("submit", consultarVendas);
el.modalVendidos?.addEventListener("close", () => {
  if (estado.preservarConsultaAoFechar) {
    estado.preservarConsultaAoFechar = false;
    return;
  }
  limparConsultaVendidos();
});
el.filtroVendidosCliente?.addEventListener("input", renderizarVendas);
el.filtroVendidosMovel?.addEventListener("input", renderizarVendas);
el.filtroVendidosData?.addEventListener("input", renderizarVendas);
el.btnAbrirVenda?.addEventListener("click", abrirNovaVenda);
el.btnFecharVenda?.addEventListener("click", fecharModalVenda);
el.btnLimparVenda?.addEventListener("click", limparFichaVenda);
el.btnCancelarVenda?.addEventListener("click", fecharModalVenda);
el.modalVenda?.addEventListener("cancel", (evento) => {
  evento.preventDefault();
  fecharModalVenda();
});
el.buscaProdutoVenda?.addEventListener("input", renderizarResultadosVenda);
[
  el.vendaCliente,
  el.vendaData,
  el.vendaEndereco,
  el.vendaTelefone,
  el.vendaObservacao,
  el.vendaVendedor,
].forEach((campo) => {
  campo?.addEventListener("input", guardarRascunhoEdicaoVenda);
  campo?.addEventListener("change", guardarRascunhoEdicaoVenda);
});
el.formVenda?.addEventListener("submit", iniciarRegistroVenda);
window.addEventListener("beforeunload", protegerRecarregamento);

// Mantém o rascunho apenas durante a vida da página e descarta após atualização.
limparFichaVenda();
inicializarTema();
window.addEventListener("pageshow", (evento) => {
  if (evento.persisted && estado.modoFormularioVenda !== "editar") limparFichaVenda();
});

// Garante que a imagem suma se o usuário soltar o dedo/mouse fora do botão
document.addEventListener("pointerup", esconderImagem);
document.addEventListener("pointercancel", esconderImagem);

// Inicia carregando os dados da planilha ao abrir o site
carregarEstoque();
