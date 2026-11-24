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
    if (acao === "vender") {
      return registrarVenda(ss, usuario, dados.venda);
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
  ];
  if (abaVendas.getLastRow() === 0) {
    abaVendas.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
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
