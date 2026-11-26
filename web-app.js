// Se o script foi criado direto pela planilha (Extensões > Apps Script), deixe null.
// Se criou separado, coloque o ID da planilha entre aspas, ex.: "1AbCDefGhIjKlMnOpQrStUvWxYz"
const SPREADSHEET_ID = null;

const ABA_ESTOQUE = "Estoque";
const ABA_USUARIOS = "Usuarios";
const ABA_HISTORICO = "Historico";
const ABA_VENDAS = "vendas";

function obterPlanilha() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function responderJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lê os produtos da aba "Estoque" (sem expor senhas ou aba Usuarios)
function doGet(e) {
  try {
    const ss = obterPlanilha();
    const aba = ss.getSheetByName(ABA_ESTOQUE);
    if (!aba) {
      return responderJson({ ok: false, mensagem: "Aba 'Estoque' não encontrada." });
    }

    const ultimaLinha = aba.getLastRow();
    const ultimaColuna = aba.getLastColumn();

    if (ultimaLinha < 2 || ultimaColuna < 3) {
      return responderJson({ ok: true, itens: [] });
    }

    const valores = aba.getRange(2, 1, ultimaLinha - 1, ultimaColuna).getValues();
    const itens = [];

    for (let i = 0; i < valores.length; i++) {
      const linhaPlanilha = i + 2;
      const linha = valores[i];
      const nome = String(linha[0] ?? "").trim();
      const cor = String(linha[1] ?? "").trim();

      // Pula linhas completamente vazias
      if (!nome && !cor) continue;

      const qtd = Math.max(0, parseInt(linha[2], 10) || 0);
      const imagemBruta = String(linha[ultimaColuna - 1] ?? "").trim();
      const imagem = /^https?:\/\//i.test(imagemBruta) ? imagemBruta : "";

      itens.push({
        id: "linha-" + linhaPlanilha,
        linha: linhaPlanilha,
        nome: nome,
        cor: cor,
        quantidade: qtd,
        imagem: imagem
      });
    }

    return responderJson({ ok: true, itens: itens });
  } catch (erro) {
    return responderJson({ ok: false, mensagem: "Erro ao ler estoque: " + erro.message });
  }
}

// Valida a senha do funcionário e salva as quantidades alteradas
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responderJson({ ok: false, mensagem: "Requisição inválida." });
    }

    const dados = JSON.parse(e.postData.contents);
    const senhaInformada = String(dados.senha ?? "").trim();
    const alteracoes = Array.isArray(dados.alteracoes) ? dados.alteracoes : [];
    const acao = String(dados.acao ?? "salvar").trim().toLowerCase();

    if (!senhaInformada) {
      return responderJson({ ok: false, mensagem: "Informe a senha." });
    }

    const usuario = validarSenhaFuncionario(senhaInformada);
    if (!usuario) {
      return responderJson({ ok: false, mensagem: "Senha incorreta ou funcionário inativo." });
    }

    const ss = obterPlanilha();
    if (acao === "listarvendas") {
      return listarVendas(ss);
    }
    if (acao === "vender") {
      return registrarVenda(ss, usuario, dados.venda);
    }
    if (acao === "editarvenda") {
      return editarVenda(ss, usuario, dados.venda);
    }
    if (acao !== "salvar") {
      return responderJson({ ok: false, mensagem: "Ação não reconhecida." });
    }

    if (alteracoes.length === 0) {
      return responderJson({ ok: false, mensagem: "Nenhuma alteração enviada." });
    }

    const abaEstoque = ss.getSheetByName(ABA_ESTOQUE);
    if (!abaEstoque) {
      return responderJson({ ok: false, mensagem: "Aba 'Estoque' não encontrada." });
    }

    const registrosHistorico = [];

    for (const item of alteracoes) {
      const linha = Number(item.linha);
      const novaQtd = Math.max(0, parseInt(item.quantidadeNova, 10) || 0);

      if (!Number.isInteger(linha) || linha < 2 || linha > abaEstoque.getLastRow()) {
        continue;
      }

      // Coluna 3 = Quantidade
      const celulaQtd = abaEstoque.getRange(linha, 3);
      const qtdAnterior = Math.max(0, parseInt(celulaQtd.getValue(), 10) || 0);

      celulaQtd.setValue(novaQtd);

      registrosHistorico.push([
        new Date(),
        usuario.nome,
        String(item.nome ?? abaEstoque.getRange(linha, 1).getValue()),
        String(item.cor ?? abaEstoque.getRange(linha, 2).getValue()),
        qtdAnterior,
        novaQtd
      ]);
    }

    if (registrosHistorico.length > 0) {
      registrarHistorico(ss, registrosHistorico);
    }

    return responderJson({
      ok: true,
      mensagem: "Estoque atualizado com sucesso.",
      funcionario: usuario.nome
    });
  } catch (erro) {
    return responderJson({ ok: false, mensagem: "Erro ao salvar: " + erro.message });
  } finally {
    lock.releaseLock();
  }
}

function listarVendas(ss) {
  const abaVendas = ss.getSheetByName(ABA_VENDAS);
  if (!abaVendas || abaVendas.getLastRow() < 2) {
    return responderJson({ ok: true, vendas: [] });
  }

  const quantidadeColunas = Math.max(12, abaVendas.getLastColumn());
  const linhas = abaVendas
    .getRange(2, 1, abaVendas.getLastRow() - 1, quantidadeColunas)
    .getValues();
  const estoquePorChave = obterIndiceEstoque(ss);
  const vendasPorChave = new Map();

  for (let indice = 0; indice < linhas.length; indice++) {
    const linha = linhas[indice];
    const idVenda = String(linha[0] ?? "").trim();
    const dataValor = linha[1];
    const data = dataValor instanceof Date
      ? Utilities.formatDate(dataValor, Session.getScriptTimeZone(), "yyyy-MM-dd")
      : String(dataValor ?? "").trim();
    const cliente = String(linha[2] ?? "").trim();
    const endereco = String(linha[3] ?? "").trim();
    const telefone = String(linha[4] ?? "").trim();
    const observacao = String(linha[5] ?? "").trim();
    const vendedor = String(linha[6] ?? "").trim();
    const produto = String(linha[7] ?? "").trim();
    const cor = String(linha[8] ?? "").trim();
    const quantidade = Math.max(0, parseInt(linha[9], 10) || 0);
    const registradoPor = String(linha[10] ?? "").trim();

    if (!produto && !cliente) continue;

    const chave = chaveAgrupamentoVenda(linha);
    const linhaVenda = indice + 2;
    const linhaEstoqueGravada = Number(linha[11]);
    const chaveEstoque = chaveProdutoVenda(produto, cor);
    const correspondencias = estoquePorChave.get(chaveEstoque) || [];
    const linhaEstoqueGravadaValida = Number.isInteger(linhaEstoqueGravada) &&
      correspondencias.some((item) => item.linha === linhaEstoqueGravada);
    const linhaEstoque = linhaEstoqueGravadaValida
      ? linhaEstoqueGravada
      : correspondencias.length === 1 ? correspondencias[0].linha : null;

    if (!vendasPorChave.has(chave)) {
      vendasPorChave.set(chave, {
        idVenda,
        data,
        cliente,
        endereco,
        telefone,
        observacao,
        vendedor,
        registradoPor,
        itens: [],
        linhasVenda: [],
        chaveEdicao: chave,
      });
    }

    vendasPorChave.get(chave).linhasVenda.push(linhaVenda);
    if (produto) {
      vendasPorChave.get(chave).itens.push({
        produto,
        cor,
        quantidade,
        linhaVenda,
        linhaEstoque: Number.isInteger(linhaEstoque) ? linhaEstoque : null,
      });
    }
  }

  const vendas = Array.from(vendasPorChave.values()).reverse();
  for (const venda of vendas) {
    venda.editavel = venda.itens.every((item) => Number.isInteger(item.linhaEstoque));
  }
  return responderJson({ ok: true, vendas });
}

function normalizarChaveVenda(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function chaveAgrupamentoVenda(linha) {
  const idVenda = String(linha[0] ?? "").trim();
  const dataValor = linha[1];
  const data = dataValor instanceof Date
    ? Utilities.formatDate(dataValor, Session.getScriptTimeZone(), "yyyy-MM-dd")
    : String(dataValor ?? "").trim();
  const cliente = String(linha[2] ?? "").trim();
  const endereco = String(linha[3] ?? "").trim();
  const telefone = String(linha[4] ?? "").trim();
  const vendedor = String(linha[6] ?? "").trim();
  const telefoneNormalizado = telefone.replace(/\D/g, "");
  const pessoa = telefoneNormalizado
    ? `telefone:${telefoneNormalizado}`
    : `cliente:${normalizarChaveVenda(cliente || endereco)}`;
  return idVenda
    ? `id:${idVenda}|pessoa:${pessoa}`
    : `legado:${[data, pessoa, telefone, endereco, vendedor].map(normalizarChaveVenda).join("|")}`;
}

function chaveProdutoVenda(nome, cor) {
  return `${normalizarChaveVenda(nome)}|${normalizarChaveVenda(cor)}`;
}

function obterIndiceEstoque(ss) {
  const abaEstoque = ss.getSheetByName(ABA_ESTOQUE);
  if (!abaEstoque || abaEstoque.getLastRow() < 2) return new Map();
  const dados = abaEstoque.getRange(2, 1, abaEstoque.getLastRow() - 1, 3).getValues();
  const indice = new Map();
  for (let i = 0; i < dados.length; i++) {
    const nome = String(dados[i][0] ?? "").trim();
    const cor = String(dados[i][1] ?? "").trim();
    if (!nome) continue;
    const chave = chaveProdutoVenda(nome, cor);
    if (!indice.has(chave)) indice.set(chave, []);
    indice.get(chave).push({ linha: i + 2, nome, cor });
  }
  return indice;
}

function validarDadosBasicosVenda(venda, permiteSemItens) {
  const cliente = String(venda?.cliente ?? "").trim();
  const data = String(venda?.data ?? "").trim();
  const vendedor = String(venda?.vendedor ?? "").trim();
  const itens = Array.isArray(venda?.itens) ? venda.itens : [];
  if (!cliente || !data || !vendedor) {
    return { ok: false, mensagem: "Informe o nome do cliente, a data e o vendedor." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, mensagem: "A data da venda é inválida." };
  }
  const partesData = data.split("-").map(Number);
  const dataChecada = new Date(Date.UTC(partesData[0], partesData[1] - 1, partesData[2]));
  if (
    dataChecada.getUTCFullYear() !== partesData[0] ||
    dataChecada.getUTCMonth() !== partesData[1] - 1 ||
    dataChecada.getUTCDate() !== partesData[2]
  ) {
    return { ok: false, mensagem: "A data da venda é inválida." };
  }
  if (!permiteSemItens && itens.length === 0) {
    return { ok: false, mensagem: "Adicione pelo menos um produto à venda." };
  }
  if (itens.length > 100) {
    return { ok: false, mensagem: "A venda excede o limite de 100 itens." };
  }
  return { ok: true, itens };
}

function editarVenda(ss, usuario, venda) {
  if (!venda || typeof venda !== "object") {
    return responderJson({ ok: false, mensagem: "Dados da venda inválidos." });
  }
  const validacao = validarDadosBasicosVenda(venda, true);
  if (!validacao.ok) return responderJson(validacao);

  const abaVendas = ss.getSheetByName(ABA_VENDAS);
  const abaEstoque = ss.getSheetByName(ABA_ESTOQUE);
  if (!abaVendas || !abaEstoque) {
    return responderJson({ ok: false, mensagem: "A aba de vendas ou de estoque não foi encontrada." });
  }
  const ultimaLinhaVendas = abaVendas.getLastRow();
  if (ultimaLinhaVendas < 2) {
    return responderJson({ ok: false, mensagem: "A venda não foi encontrada. Atualize a lista e tente novamente." });
  }

  const todasLinhas = abaVendas.getRange(2, 1, ultimaLinhaVendas - 1, 12).getValues();
  const chaveEdicao = String(venda.chaveEdicao ?? "");
  const linhasVenda = [];
  const dadosLinhasVenda = [];
  for (let i = 0; i < todasLinhas.length; i++) {
    if (chaveAgrupamentoVenda(todasLinhas[i]) === chaveEdicao) {
      linhasVenda.push(i + 2);
      dadosLinhasVenda.push(todasLinhas[i]);
    }
  }
  const linhasRecebidas = Array.isArray(venda.linhasVenda)
    ? venda.linhasVenda.map(Number).filter((linha) => Number.isInteger(linha))
    : [];
  if (
    !chaveEdicao ||
    linhasVenda.length === 0 ||
    linhasVenda.length !== linhasRecebidas.length ||
    linhasVenda.some((linha, i) => linha !== linhasRecebidas.sort((a, b) => a - b)[i])
  ) {
    return responderJson({ ok: false, mensagem: "Esta venda foi alterada desde a consulta. Atualize a lista e tente novamente." });
  }

  const ultimaLinhaEstoque = abaEstoque.getLastRow();
  if (ultimaLinhaEstoque < 2) {
    return responderJson({ ok: false, mensagem: "Não há produtos cadastrados no estoque." });
  }
  const dadosEstoque = abaEstoque.getRange(2, 1, ultimaLinhaEstoque - 1, 3).getValues();
  const indiceEstoque = obterIndiceEstoque(ss);
  const itensOriginais = new Map();
  for (const linhaVenda of dadosLinhasVenda) {
    const nome = String(linhaVenda[7] ?? "").trim();
    const cor = String(linhaVenda[8] ?? "").trim();
    const quantidade = Math.max(0, parseInt(linhaVenda[9], 10) || 0);
    if (!nome || quantidade <= 0) continue;
    const linhaGravada = Number(linhaVenda[11]);
    let linhaEstoque = Number.isInteger(linhaGravada) && linhaGravada >= 2
      ? linhaGravada
      : null;
    if (!linhaEstoque) {
      const correspondencias = indiceEstoque.get(chaveProdutoVenda(nome, cor)) || [];
      if (correspondencias.length === 1) linhaEstoque = correspondencias[0].linha;
    }
    if (!linhaEstoque || linhaEstoque > ultimaLinhaEstoque) {
      return responderJson({
        ok: false,
        mensagem: `Não foi possível localizar ${nome}${cor ? ` (${cor})` : ""} no estoque. A venda não foi alterada.`,
      });
    }
    const produtoAtual = dadosEstoque[linhaEstoque - 2];
    if (
      normalizarChaveVenda(produtoAtual[0]) !== normalizarChaveVenda(nome) ||
      normalizarChaveVenda(produtoAtual[1]) !== normalizarChaveVenda(cor)
    ) {
      return responderJson({ ok: false, mensagem: "Um produto desta venda mudou no estoque. Atualize a lista e tente novamente." });
    }
    const existente = itensOriginais.get(linhaEstoque);
    if (existente) existente.quantidade += quantidade;
    else itensOriginais.set(linhaEstoque, { linha: linhaEstoque, nome, cor, quantidade });
  }

  const itensNovos = new Map();
  for (const recebido of validacao.itens) {
    const linha = Number(recebido?.linha);
    const quantidade = Number(recebido?.quantidade);
    if (
      !Number.isInteger(linha) || linha < 2 || linha > ultimaLinhaEstoque ||
      !Number.isInteger(quantidade) || quantidade <= 0
    ) {
      return responderJson({ ok: false, mensagem: "Um produto ou quantidade da venda é inválido." });
    }
    const dadosProduto = dadosEstoque[linha - 2];
    const nome = String(dadosProduto[0] ?? "").trim();
    const cor = String(dadosProduto[1] ?? "").trim();
    if (!nome || nome !== String(recebido.nome ?? "").trim() || cor !== String(recebido.cor ?? "").trim()) {
      return responderJson({ ok: false, mensagem: "Um produto mudou no estoque. Atualize a tela e tente novamente." });
    }
    const existente = itensNovos.get(linha);
    if (existente) existente.quantidade += quantidade;
    else itensNovos.set(linha, { linha, nome, cor, quantidade });
  }

  const linhasAfetadas = new Map();
  for (const [linha, item] of itensOriginais) linhasAfetadas.set(linha, item);
  for (const [linha, item] of itensNovos) {
    if (!linhasAfetadas.has(linha)) linhasAfetadas.set(linha, item);
  }
  for (const item of linhasAfetadas.values()) {
    const estoqueAtual = Math.max(0, parseInt(dadosEstoque[item.linha - 2][2], 10) || 0);
    const quantidadeOriginal = itensOriginais.get(item.linha)?.quantidade || 0;
    const quantidadeNova = itensNovos.get(item.linha)?.quantidade || 0;
    const maximoVenda = estoqueAtual + quantidadeOriginal;
    if (quantidadeNova > maximoVenda) {
      return responderJson({
        ok: false,
        mensagem: `Estoque insuficiente para ${item.nome}${item.cor ? ` (${item.cor})` : ""}. Disponível para esta edição: ${maximoVenda}.`,
      });
    }
    item.estoqueAnterior = estoqueAtual;
    item.estoqueNovo = estoqueAtual + quantidadeOriginal - quantidadeNova;
  }

  if (!String(abaVendas.getRange(1, 12).getValue() ?? "").trim()) {
    abaVendas.getRange(1, 12).setValue("Linha Estoque");
  }
  const cliente = String(venda.cliente ?? "").trim();
  const data = String(venda.data ?? "").trim();
  const endereco = String(venda.endereco ?? "").trim();
  const telefone = String(venda.telefone ?? "").trim();
  const observacao = String(venda.observacao ?? "").trim();
  const vendedor = String(venda.vendedor ?? "").trim();
  const idVenda = String(dadosLinhasVenda[0][0] ?? "").trim() || Utilities.getUuid();
  const novasLinhas = Array.from(itensNovos.values()).map((item) => [
    textoSeguroPlanilha(idVenda),
    textoSeguroPlanilha(data),
    textoSeguroPlanilha(cliente),
    textoSeguroPlanilha(endereco),
    textoSeguroPlanilha(telefone),
    textoSeguroPlanilha(observacao),
    textoSeguroPlanilha(vendedor),
    textoSeguroPlanilha(item.nome),
    textoSeguroPlanilha(item.cor),
    item.quantidade,
    textoSeguroPlanilha(usuario.nome),
    item.linha,
  ]);

  const linhasOriginais = linhasVenda.map((linha, indice) => ({
    linha,
    valores: dadosLinhasVenda[indice],
  }));
  const linhasMantidas = Math.min(linhasVenda.length, novasLinhas.length);
  const linhaAnexada = novasLinhas.length > linhasVenda.length ? ultimaLinhaVendas + 1 : null;
  const estoquesAtualizados = [];
  let gravacaoVendaIniciada = false;
  try {
    for (const item of linhasAfetadas.values()) {
      if (item.estoqueNovo === item.estoqueAnterior) continue;
      abaEstoque.getRange(item.linha, 3).setValue(item.estoqueNovo);
      estoquesAtualizados.push(item);
    }
    gravacaoVendaIniciada = true;
    for (let i = 0; i < linhasMantidas; i++) {
      abaVendas.getRange(linhasVenda[i], 1, 1, 12).setValues([novasLinhas[i]]);
    }
    for (let i = linhasMantidas; i < linhasVenda.length; i++) {
      abaVendas.getRange(linhasVenda[i], 1, 1, 12).clearContent();
    }
    if (linhaAnexada) {
      abaVendas.getRange(linhaAnexada, 1, novasLinhas.length - linhasVenda.length, 12)
        .setValues(novasLinhas.slice(linhasVenda.length));
    }
  } catch (erro) {
    const falhasRollback = [];
    if (gravacaoVendaIniciada) {
      try {
        for (const original of linhasOriginais) {
          abaVendas.getRange(original.linha, 1, 1, 12).setValues([original.valores]);
        }
        if (linhaAnexada) {
          abaVendas.getRange(linhaAnexada, 1, novasLinhas.length - linhasVenda.length, 12).clearContent();
        }
      } catch (erroRollbackVendas) {
        falhasRollback.push(erroRollbackVendas.message);
      }
    }
    for (let i = estoquesAtualizados.length - 1; i >= 0; i--) {
      const item = estoquesAtualizados[i];
      try {
        abaEstoque.getRange(item.linha, 3).setValue(item.estoqueAnterior);
      } catch (erroRollbackEstoque) {
        falhasRollback.push(erroRollbackEstoque.message);
      }
    }
    const sufixo = falhasRollback.length
      ? " Falha ao reverter parcialmente a operação: " + falhasRollback.join("; ")
      : " A operação foi revertida.";
    throw new Error("Não foi possível salvar a edição." + sufixo + " " + erro.message);
  }

  const vendaAtualizada = {
    idVenda,
    chaveEdicao: chaveEdicao,
    data,
    cliente,
    endereco,
    telefone,
    observacao,
    vendedor,
    registradoPor: usuario.nome,
    editavel: true,
    linhasVenda: linhasVenda.slice(0, linhasMantidas).concat(
      linhaAnexada ? novasLinhas.slice(linhasVenda.length).map((_, i) => linhaAnexada + i) : []
    ),
    itens: Array.from(itensNovos.values()).map((item) => ({
      produto: item.nome,
      cor: item.cor,
      quantidade: item.quantidade,
      linhaEstoque: item.linha,
    })),
  };
  vendaAtualizada.chaveEdicao = chaveAgrupamentoVenda([
    idVenda, data, cliente, endereco, telefone, observacao, vendedor,
  ]);
  return responderJson({
    ok: true,
    mensagem: "Venda atualizada e estoque ajustado.",
    venda: vendaAtualizada,
  });
}

function registrarVenda(ss, usuario, venda) {
  if (!venda || typeof venda !== "object") {
    return responderJson({ ok: false, mensagem: "Dados da venda inválidos." });
  }

  const idVendaInformado = String(venda.idVenda ?? "").trim();
  const abaVendasExistente = ss.getSheetByName(ABA_VENDAS);
  if (idVendaInformado && abaVendasExistente && abaVendasExistente.getLastRow() > 1) {
    const idsExistentes = abaVendasExistente
      .getRange(2, 1, abaVendasExistente.getLastRow() - 1, 1)
      .getValues();
    if (idsExistentes.some((linha) => String(linha[0] ?? "").trim() === idVendaInformado)) {
      return responderJson({
        ok: true,
        mensagem: "Esta venda já havia sido registrada.",
        vendaId: idVendaInformado,
        repetida: true,
      });
    }
  }

  const cliente = String(venda.cliente ?? "").trim();
  const data = String(venda.data ?? "").trim();
  const endereco = String(venda.endereco ?? "").trim();
  const telefone = String(venda.telefone ?? "").trim();
  const observacao = String(venda.observacao ?? "").trim();
  const vendedor = String(venda.vendedor ?? "").trim();
  const itensRecebidos = Array.isArray(venda.itens) ? venda.itens : [];

  if (!cliente || !data || !vendedor) {
    return responderJson({
      ok: false,
      mensagem: "Informe o nome do cliente, a data e o vendedor.",
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return responderJson({ ok: false, mensagem: "A data da venda é inválida." });
  }
  const partesData = data.split("-").map(Number);
  const dataChecada = new Date(Date.UTC(partesData[0], partesData[1] - 1, partesData[2]));
  if (
    dataChecada.getUTCFullYear() !== partesData[0] ||
    dataChecada.getUTCMonth() !== partesData[1] - 1 ||
    dataChecada.getUTCDate() !== partesData[2]
  ) {
    return responderJson({ ok: false, mensagem: "A data da venda é inválida." });
  }
  if (itensRecebidos.length === 0) {
    return responderJson({ ok: false, mensagem: "Adicione pelo menos um produto à venda." });
  }
  if (itensRecebidos.length > 100) {
    return responderJson({ ok: false, mensagem: "A venda excede o limite de 100 itens." });
  }

  const abaEstoque = ss.getSheetByName(ABA_ESTOQUE);
  if (!abaEstoque) {
    return responderJson({ ok: false, mensagem: "Aba 'Estoque' não encontrada." });
  }

  const ultimaLinhaEstoque = abaEstoque.getLastRow();
  if (ultimaLinhaEstoque < 2) {
    return responderJson({ ok: false, mensagem: "Não há produtos cadastrados no estoque." });
  }

  const dadosEstoque = abaEstoque.getRange(2, 1, ultimaLinhaEstoque - 1, 3).getValues();
  const itensPorLinha = new Map();

  for (const item of itensRecebidos) {
    const linha = Number(item?.linha);
    const quantidade = Number(item?.quantidade);
    if (
      !Number.isInteger(linha) ||
      linha < 2 ||
      linha > ultimaLinhaEstoque ||
      !Number.isInteger(quantidade) ||
      quantidade <= 0
    ) {
      return responderJson({ ok: false, mensagem: "Um produto ou quantidade da venda é inválido." });
    }

    const dadosLinha = dadosEstoque[linha - 2];
    const nome = String(dadosLinha[0] ?? "").trim();
    const cor = String(dadosLinha[1] ?? "").trim();
    if (!nome) {
      return responderJson({ ok: false, mensagem: "Um produto da venda não existe mais no estoque." });
    }

    // Confere que a linha ainda contém o produto e a cor escolhidos na tela.
    if (
      String(item.nome ?? "").trim() !== nome ||
      String(item.cor ?? "").trim() !== cor
    ) {
      return responderJson({
        ok: false,
        mensagem: `O produto da linha ${linha} mudou desde a abertura da tela. Atualize o estoque e tente novamente.`,
      });
    }

    const estoqueAtual = Math.max(0, parseInt(dadosLinha[2], 10) || 0);
    const existente = itensPorLinha.get(linha);
    if (existente) {
      existente.quantidade += quantidade;
    } else {
      itensPorLinha.set(linha, {
        linha,
        nome,
        cor,
        estoqueAnterior: estoqueAtual,
        quantidade,
      });
    }
  }

  for (const item of itensPorLinha.values()) {
    if (item.quantidade > item.estoqueAnterior) {
      return responderJson({
        ok: false,
        mensagem: `Estoque insuficiente para ${item.nome}${item.cor ? ` (${item.cor})` : ""}. Disponível: ${item.estoqueAnterior}.`,
      });
    }
    item.estoqueNovo = item.estoqueAnterior - item.quantidade;
  }

  let abaVendas = ss.getSheetByName(ABA_VENDAS);
  if (!abaVendas) {
    abaVendas = ss.insertSheet(ABA_VENDAS);
  }
  const cabecalhos = [
    "ID Venda",
    "Data",
    "Cliente",
    "Endereço",
    "Telefone",
    "Observação",
    "Vendedor",
    "Produto",
    "Cor",
    "Quantidade",
    "Registrado por",
    "Linha Estoque",
  ];
  if (abaVendas.getLastRow() === 0) {
    abaVendas.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  }
  if (!String(abaVendas.getRange(1, 12).getValue() ?? "").trim()) {
    abaVendas.getRange(1, 12).setValue("Linha Estoque");
  }

  const idVenda = idVendaInformado || Utilities.getUuid();
  const itensVenda = Array.from(itensPorLinha.values());
  const linhasVenda = itensVenda.map((item) => [
    textoSeguroPlanilha(idVenda),
    textoSeguroPlanilha(data),
    textoSeguroPlanilha(cliente),
    textoSeguroPlanilha(endereco),
    textoSeguroPlanilha(telefone),
    textoSeguroPlanilha(observacao),
    textoSeguroPlanilha(vendedor),
    textoSeguroPlanilha(item.nome),
    textoSeguroPlanilha(item.cor),
    item.quantidade,
    textoSeguroPlanilha(usuario.nome),
    item.linha,
  ]);
  const primeiraLinhaVenda = abaVendas.getLastRow() + 1;
  const estoqueAtualizado = [];
  let gravacaoVendaIniciada = false;

  try {
    for (const item of itensVenda) {
      abaEstoque.getRange(item.linha, 3).setValue(item.estoqueNovo);
      estoqueAtualizado.push(item);
    }

    gravacaoVendaIniciada = true;
    abaVendas
      .getRange(primeiraLinhaVenda, 1, linhasVenda.length, cabecalhos.length)
      .setValues(linhasVenda);
  } catch (erro) {
    const falhasRollback = [];
    if (gravacaoVendaIniciada) {
      try {
        abaVendas
          .getRange(primeiraLinhaVenda, 1, linhasVenda.length, cabecalhos.length)
          .clearContent();
      } catch (erroRollbackVendas) {
        falhasRollback.push(erroRollbackVendas.message);
      }
    }
    for (let i = estoqueAtualizado.length - 1; i >= 0; i--) {
      const item = estoqueAtualizado[i];
      try {
        abaEstoque.getRange(item.linha, 3).setValue(item.estoqueAnterior);
      } catch (erroRollbackEstoque) {
        falhasRollback.push(erroRollbackEstoque.message);
      }
    }
    const sufixoRollback = falhasRollback.length
      ? " Falha ao reverter parcialmente a operação: " + falhasRollback.join("; ")
      : " A operação foi revertida.";
    throw new Error("Não foi possível registrar a venda." + sufixoRollback + " " + erro.message);
  }

  return responderJson({
    ok: true,
    mensagem: "Venda registrada e estoque atualizado.",
    vendaId: idVenda,
    vendedorAutenticado: usuario.nome,
    itens: itensVenda.map((item) => ({
      linha: item.linha,
      quantidade: item.quantidade,
      estoqueNovo: item.estoqueNovo,
    })),
  });
}

function textoSeguroPlanilha(valor) {
  const texto = String(valor ?? "");
  return /^[\s]*[=+\-@]/.test(texto) ? "'" + texto : texto;
}

// =====================================================================
// ONDE FICAM AS SENHAS DOS FUNCIONÁRIOS
// Elas ficam na aba "Usuarios" da planilha (Coluna A: Nome | Coluna B: Senha | Coluna C: Ativo).
// Para alterar a senha de alguém, basta editar diretamente a célula na aba "Usuarios".
// =====================================================================
function validarSenhaFuncionario(senhaInformada) {
  const ss = obterPlanilha();
  const abaUsuarios = ss.getSheetByName(ABA_USUARIOS);
  if (!abaUsuarios) return null;

  const ultimaLinha = abaUsuarios.getLastRow();
  if (ultimaLinha < 2) return null;

  const usuarios = abaUsuarios.getRange(2, 1, ultimaLinha - 1, 3).getValues();

  for (let i = 0; i < usuarios.length; i++) {
    const nome = String(usuarios[i][0] ?? "").trim();
    const senha = String(usuarios[i][1] ?? "").trim();
    const ativo = String(usuarios[i][2] ?? "SIM").trim().toUpperCase();

    if (ativo !== "NAO" && ativo !== "NÃO" && ativo !== "INATIVO" && ativo !== "FALSE") {
      if (senha && senhaInformada === senha) {
        return { nome: nome || "Funcionário" };
      }
    }
  }

  return null;
}

function registrarHistorico(ss, linhas) {
  let abaHist = ss.getSheetByName(ABA_HISTORICO);
  if (!abaHist) {
    abaHist = ss.insertSheet(ABA_HISTORICO);
    abaHist.appendRow(["Data/Hora", "Funcionário", "Produto", "Cor", "Qtd Anterior", "Qtd Nova"]);
  }
  const inicio = abaHist.getLastRow() + 1;
  abaHist.getRange(inicio, 1, linhas.length, linhas[0].length).setValues(linhas);
}
