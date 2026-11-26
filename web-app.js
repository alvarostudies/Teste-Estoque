// Se o script foi criado direto pela planilha (Extensões > Apps Script), deixe null.
// Se criou separado, coloque o ID da planilha entre aspas, ex.: "1AbCDefGhIjKlMnOpQrStUvWxYz"
const SPREADSHEET_ID = null;

const ABA_ESTOQUE = "Estoque";
const ABA_USUARIOS = "Usuarios";
const ABA_HISTORICO = "Historico";
const ABA_VENDAS = "vendas";
const ABA_AFAZERES = "Afazeres";

// Escolhe a planilha ativa quando o script está vinculado a ela ou abre outra pelo ID.
function obterPlanilha() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

// Padroniza respostas do Apps Script como JSON para o navegador.
function responderJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lê o estoque ou a lista de afazeres sem expor dados da aba Usuarios.
function doGet(e) {
  try {
    const ss = obterPlanilha();
    const acao = String(e?.parameter?.acao ?? "").trim().toLowerCase();
    if (acao === "listarafazeres") return listarAfazeres(ss);

    const aba = ss.getSheetByName(ABA_ESTOQUE);
    if (!aba) {
      return responderJson({ ok: false, mensagem: "Aba 'Estoque' não encontrada." });
    }

    const ultimaLinha = aba.getLastRow();
    const ultimaColuna = aba.getLastColumn();

    if (ultimaLinha < 2 || ultimaColuna < 3) {
      return responderJson({ ok: true, itens: [] });
    }

    // A imagem permanece na última coluna da aba; A:C guardam nome, cor e quantidade.
    const colunaImagem = Math.max(4, ultimaColuna);
    const valores = aba.getRange(2, 1, ultimaLinha - 1, colunaImagem).getValues();
    const itens = [];

    for (let i = 0; i < valores.length; i++) {
      const linhaPlanilha = i + 2;
      const linha = valores[i];
      const nome = String(linha[0] ?? "").trim();
      const cor = String(linha[1] ?? "").trim();

      // Pula linhas completamente vazias
      if (!nome && !cor) continue;

      const qtd = Math.max(0, parseInt(linha[2], 10) || 0);
      const imagemBruta = String(linha[colunaImagem - 1] ?? "").trim();
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

// Roteia operações da lista de afazeres e operações de estoque/vendas protegidas por senha.
function doPost(e) {
  // Serializa alterações simultâneas para evitar que duas vendas sobrescrevam o mesmo estoque.
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

    const ss = obterPlanilha();
    if (acao === "adicionarafazer") return adicionarAfazer(ss, dados.texto);
    if (acao === "removerafazer") return removerAfazer(ss, dados.id);

    if (!senhaInformada) {
      return responderJson({ ok: false, mensagem: "Informe a senha." });
    }

    // A autenticação é exigida para toda operação de escrita ou leitura protegida de vendas.
    const usuario = validarSenhaFuncionario(senhaInformada);
    if (!usuario) {
      return responderJson({ ok: false, mensagem: "Senha incorreta ou funcionário inativo." });
    }

    if (acao === "listarvendas") {
      return listarVendas(ss);
    }
    if (acao === "vender") {
      return registrarVenda(ss, usuario, dados.venda);
    }
    if (acao === "editarvenda") {
      return editarVenda(ss, usuario, dados.venda);
    }
    if (acao === "adicionarproduto") {
      return adicionarProduto(ss, usuario, dados.produto);
    }
    if (acao === "removerproduto") {
      return removerProduto(ss, usuario, dados.produto);
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

    // Aplica alterações da tela de estoque e prepara o histórico dos valores anteriores/novos.
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

// Cria a aba própria da lista quando ela ainda não existe e garante seus cabeçalhos.
function obterAbaAfazeres(ss) {
  let aba = ss.getSheetByName(ABA_AFAZERES);
  if (!aba) aba = ss.insertSheet(ABA_AFAZERES);
  if (aba.getLastRow() === 0 || !String(aba.getRange(1, 1).getValue() ?? "").trim()) {
    aba.getRange(1, 1, 1, 3).setValues([["ID", "Afazer", "Criado em"]]);
  }
  return aba;
}

// Retorna os afazeres sem expor dados de outras abas nem exigir senha.
function listarAfazeres(ss) {
  const aba = obterAbaAfazeres(ss);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return responderJson({ ok: true, afazeres: [] });

  const valores = aba.getRange(2, 1, ultimaLinha - 1, 3).getValues();
  const afazeres = valores
    .map((linha) => ({
      id: String(linha[0] ?? "").trim(),
      texto: String(linha[1] ?? "").trim(),
    }))
    .filter((afazer) => afazer.id && afazer.texto);
  return responderJson({ ok: true, afazeres });
}

// Grava um novo afazer na aba própria sem passar pelo fluxo de senha dos funcionários.
function adicionarAfazer(ss, textoRecebido) {
  const texto = String(textoRecebido ?? "").trim();
  if (!texto || texto.length > 500) {
    return responderJson({ ok: false, mensagem: "Digite um afazer com até 500 caracteres." });
  }

  const aba = obterAbaAfazeres(ss);
  const afazer = { id: Utilities.getUuid(), texto };
  aba.getRange(aba.getLastRow() + 1, 1, 1, 3).setValues([[
    afazer.id,
    textoSeguroPlanilha(afazer.texto),
    new Date(),
  ]]);
  return responderJson({ ok: true, afazer });
}

// Apaga apenas a linha que corresponde ao identificador solicitado.
function removerAfazer(ss, idRecebido) {
  const id = String(idRecebido ?? "").trim();
  if (!id || id.length > 100) {
    return responderJson({ ok: false, mensagem: "Afazer inválido." });
  }

  const aba = obterAbaAfazeres(ss);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return responderJson({ ok: false, mensagem: "O afazer não foi encontrado." });

  const ids = aba.getRange(2, 1, ultimaLinha - 1, 1).getValues();
  const indice = ids.findIndex(([idPlanilha]) => String(idPlanilha ?? "").trim() === id);
  if (indice < 0) return responderJson({ ok: false, mensagem: "O afazer não foi encontrado. Recarregue a lista." });

  aba.deleteRow(indice + 2);
  return responderJson({ ok: true });
}

// Adiciona as cores enviadas; variantes existentes recebem a nova quantidade na mesma linha.
function adicionarProduto(ss, usuario, produto) {
  if (!produto || typeof produto !== "object") {
    return responderJson({ ok: false, mensagem: "Dados do produto inválidos." });
  }

  const nome = String(produto.nome ?? "").trim();
  const imagem = String(produto.imagem ?? "").trim();
  const quantidade = Number(produto.quantidade);
  const coresRecebidas = Array.isArray(produto.cores) ? produto.cores : [];
  const cores = [];
  const chavesCores = new Set();

  if (!nome || nome.length > 150) {
    return responderJson({ ok: false, mensagem: "Informe um nome de produto válido (até 150 caracteres)." });
  }
  if (!Number.isSafeInteger(quantidade) || quantidade < 0) {
    return responderJson({ ok: false, mensagem: "A quantidade deve ser um número inteiro igual ou maior que zero." });
  }
  if (coresRecebidas.length === 0 || coresRecebidas.length > 50) {
    return responderJson({ ok: false, mensagem: "Informe de 1 a 50 cores para o produto." });
  }
  if (imagem && (imagem.length > 2000 || !/^https?:\/\/\S+$/i.test(imagem))) {
    return responderJson({ ok: false, mensagem: "O link da foto deve ser um endereço HTTP ou HTTPS válido." });
  }
  for (const corBruta of coresRecebidas) {
    const cor = String(corBruta ?? "").trim();
    const chaveCor = normalizarChaveVenda(cor);
    if (!cor || cor.length > 100) {
      return responderJson({ ok: false, mensagem: "Cada cor precisa ter entre 1 e 100 caracteres." });
    }
    if (!chavesCores.has(chaveCor)) {
      chavesCores.add(chaveCor);
      cores.push(cor);
    }
  }
  if (cores.length === 0) {
    return responderJson({ ok: false, mensagem: "Informe ao menos uma cor válida." });
  }

  const abaEstoque = ss.getSheetByName(ABA_ESTOQUE);
  if (!abaEstoque) return responderJson({ ok: false, mensagem: "Aba 'Estoque' não encontrada." });

  const ultimaLinha = abaEstoque.getLastRow();
  const colunaImagem = Math.max(4, abaEstoque.getLastColumn());
  const dadosEstoque = ultimaLinha >= 2
    ? abaEstoque.getRange(2, 1, ultimaLinha - 1, colunaImagem).getValues()
    : [];
  const linhasPorChave = new Map();
  for (let indice = 0; indice < dadosEstoque.length; indice++) {
    const nomeAtual = String(dadosEstoque[indice][0] ?? "").trim();
    const corAtual = String(dadosEstoque[indice][1] ?? "").trim();
    if (!nomeAtual) continue;
    const chave = chaveProdutoVenda(nomeAtual, corAtual);
    if (!linhasPorChave.has(chave)) linhasPorChave.set(chave, []);
    linhasPorChave.get(chave).push({ linha: indice + 2, valores: dadosEstoque[indice] });
  }

  const atualizacoes = [];
  const novasLinhas = [];
  for (const cor of cores) {
    const chave = chaveProdutoVenda(nome, cor);
    const existentes = linhasPorChave.get(chave) || [];
    if (existentes.length > 1) {
      return responderJson({
        ok: false,
        mensagem: `Há mais de uma linha para ${nome} (${cor}). Corrija as duplicatas antes de adicionar o produto.`,
      });
    }
    if (existentes.length === 1) {
      const existente = existentes[0];
      const quantidadeAnterior = Math.max(0, parseInt(existente.valores[2], 10) || 0);
      const quantidadeNova = quantidadeAnterior + quantidade;
      if (!Number.isSafeInteger(quantidadeNova)) {
        return responderJson({ ok: false, mensagem: `A quantidade final de ${nome} (${cor}) excede o limite permitido.` });
      }
      atualizacoes.push({
        linha: existente.linha,
        valoresOriginais: existente.valores,
        quantidadeNova,
        imagemNova: imagem || "",
      });
    } else {
      const novaLinha = new Array(colunaImagem).fill("");
      novaLinha[0] = textoSeguroPlanilha(nome);
      novaLinha[1] = textoSeguroPlanilha(cor);
      novaLinha[2] = quantidade;
      novaLinha[colunaImagem - 1] = imagem ? textoSeguroPlanilha(imagem) : "";
      novasLinhas.push(novaLinha);
    }
  }

  const linhaHistoricaMaxima = obterMaiorLinhaEstoqueHistorica(ss);
  const primeiraLinhaNova = Math.max(abaEstoque.getLastRow(), linhaHistoricaMaxima) + 1;
  if (novasLinhas.length > 0) {
    const ultimaLinhaNova = primeiraLinhaNova + novasLinhas.length - 1;
    const linhasFaltantes = ultimaLinhaNova - abaEstoque.getMaxRows();
    if (linhasFaltantes > 0) abaEstoque.insertRowsAfter(abaEstoque.getMaxRows(), linhasFaltantes);
  }

  const atualizacoesGravadas = [];
  let linhasNovasGravadas = false;
  try {
    for (const atualizacao of atualizacoes) {
      atualizacoesGravadas.push(atualizacao);
      abaEstoque.getRange(atualizacao.linha, 3).setValue(atualizacao.quantidadeNova);
      if (atualizacao.imagemNova) abaEstoque.getRange(atualizacao.linha, colunaImagem).setValue(textoSeguroPlanilha(atualizacao.imagemNova));
    }
    if (novasLinhas.length > 0) {
      linhasNovasGravadas = true;
      abaEstoque.getRange(primeiraLinhaNova, 1, novasLinhas.length, 4).setValues(novasLinhas);
    }
  } catch (erro) {
    const falhasRollback = [];
    if (linhasNovasGravadas) {
      try {
        abaEstoque.getRange(primeiraLinhaNova, 1, novasLinhas.length, colunaImagem).clearContent();
      } catch (erroRollback) {
        falhasRollback.push(erroRollback.message);
      }
    }
    for (let indice = atualizacoesGravadas.length - 1; indice >= 0; indice--) {
      const atualizacao = atualizacoesGravadas[indice];
      try {
        abaEstoque.getRange(atualizacao.linha, 1, 1, colunaImagem).setValues([atualizacao.valoresOriginais]);
      } catch (erroRollback) {
        falhasRollback.push(erroRollback.message);
      }
    }
    const detalheRollback = falhasRollback.length
      ? " Falha ao reverter parcialmente a operação: " + falhasRollback.join("; ")
      : " A operação foi revertida.";
    throw new Error("Não foi possível adicionar o produto." + detalheRollback + " " + erro.message);
  }

  return responderJson({
    ok: true,
    mensagem: "Produto adicionado ao estoque.",
    funcionario: usuario.nome,
    variantesAdicionadas: novasLinhas.length,
    variantesAtualizadas: atualizacoes.length,
  });
}

// Remove todas as cores de um produto sem apagar linhas, evitando deslocar referências de vendas.
function removerProduto(ss, usuario, produto) {
  const nome = String(produto?.nome ?? "").trim();
  if (!nome || nome.length > 150) {
    return responderJson({ ok: false, mensagem: "Selecione um produto válido para remover." });
  }

  const abaEstoque = ss.getSheetByName(ABA_ESTOQUE);
  if (!abaEstoque) return responderJson({ ok: false, mensagem: "Aba 'Estoque' não encontrada." });
  const ultimaLinha = abaEstoque.getLastRow();
  const colunaImagem = Math.max(4, abaEstoque.getLastColumn());
  if (ultimaLinha < 2) return responderJson({ ok: false, mensagem: "O estoque está vazio." });

  const dados = abaEstoque.getRange(2, 1, ultimaLinha - 1, colunaImagem).getValues();
  const chaveProcurada = normalizarChaveVenda(nome);
  const linhasEncontradas = [];
  for (let indice = 0; indice < dados.length; indice++) {
    const nomeAtual = String(dados[indice][0] ?? "").trim();
    if (nomeAtual && normalizarChaveVenda(nomeAtual) === chaveProcurada) {
      linhasEncontradas.push({ linha: indice + 2, valores: dados[indice] });
    }
  }
  if (linhasEncontradas.length === 0) {
    return responderJson({ ok: false, mensagem: "O produto não foi encontrado no estoque. Atualize a lista e tente novamente." });
  }

  const linhasRemovidas = [];
  try {
    for (const item of linhasEncontradas) {
      linhasRemovidas.push(item);
      abaEstoque.getRange(item.linha, 1, 1, colunaImagem).clearContent();
    }
  } catch (erro) {
    const falhasRollback = [];
    for (let indice = linhasRemovidas.length - 1; indice >= 0; indice--) {
      const item = linhasRemovidas[indice];
      try {
        abaEstoque.getRange(item.linha, 1, 1, colunaImagem).setValues([item.valores]);
      } catch (erroRollback) {
        falhasRollback.push(erroRollback.message);
      }
    }
    const detalheRollback = falhasRollback.length
      ? " Falha ao restaurar parcialmente os dados: " + falhasRollback.join("; ")
      : " Os dados foram restaurados.";
    throw new Error("Não foi possível remover o produto." + detalheRollback + " " + erro.message);
  }

  return responderJson({
    ok: true,
    mensagem: "Produto removido do estoque.",
    funcionario: usuario.nome,
    variantesRemovidas: linhasEncontradas.length,
  });
}

// Mantém as linhas citadas em vendas antigas reservadas para que novos produtos não reutilizem seus números.
function obterMaiorLinhaEstoqueHistorica(ss) {
  const abaVendas = ss.getSheetByName(ABA_VENDAS);
  if (!abaVendas || abaVendas.getLastRow() < 2 || abaVendas.getLastColumn() < 12) return 1;
  const valores = abaVendas.getRange(2, 12, abaVendas.getLastRow() - 1, 1).getValues();
  let maiorLinha = 1;
  for (const [valor] of valores) {
    const linha = Number(valor);
    if (Number.isInteger(linha) && linha >= 2) maiorLinha = Math.max(maiorLinha, linha);
  }
  return maiorLinha;
}

// Lê as linhas de vendas, agrupa os itens da mesma compra e fornece referências ao estoque.
function listarVendas(ss) {
  const abaVendas = ss.getSheetByName(ABA_VENDAS);
  if (!abaVendas || abaVendas.getLastRow() < 2) {
    return responderJson({ ok: true, vendas: [] });
  }

  const quantidadeColunas = Math.max(12, abaVendas.getLastColumn());
  const linhas = abaVendas
    .getRange(2, 1, abaVendas.getLastRow() - 1, quantidadeColunas)
    .getValues();
  // O índice liga vendas antigas e novas às respectivas linhas de estoque.
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

// Normaliza texto para formar chaves consistentes mesmo com acentos e espaços diferentes.
function normalizarChaveVenda(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

// Cria a chave usada para agrupar e localizar as linhas pertencentes a uma venda.
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

// Identifica um produto pela combinação normalizada de nome e cor.
function chaveProdutoVenda(nome, cor) {
  return `${normalizarChaveVenda(nome)}|${normalizarChaveVenda(cor)}`;
}

// Indexa produtos do estoque para localizar linhas únicas e reconhecer duplicidades.
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

// Confere campos obrigatórios, data e limite de itens antes de gravar uma venda.
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

// Atualiza os dados e itens de uma venda, ajusta o estoque pela diferença e reverte falhas.
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

  // Localiza a venda pela identidade recebida e confere que o conjunto de linhas não mudou.
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
  // Reconstrói os itens originais pela linha de estoque para calcular devoluções e novas baixas.
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

  // Calcula o estoque final como: estoque atual + unidades da venda antiga - unidades novas.
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

  // Guarda os dados atuais para tentar reverter a operação caso alguma gravação falhe.
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

// Valida e grava uma venda nova, deduzindo as quantidades correspondentes do estoque.
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

  // Agrega quantidades por linha para validar o saldo e não baixar o mesmo produto duas vezes.
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
  // Salva primeiro o estoque e depois as linhas da venda; em caso de falha, desfaz o que gravou.
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

// Impede que texto iniciado por caracteres de fórmula seja interpretado como fórmula.
function textoSeguroPlanilha(valor) {
  const texto = String(valor ?? "");
  return /^[\s]*[=+\-@]/.test(texto) ? "'" + texto : texto;
}

// =====================================================================
// ONDE FICAM AS SENHAS DOS FUNCIONÁRIOS
// Elas ficam na aba "Usuarios" da planilha (Coluna A: Nome | Coluna B: Senha | Coluna C: Ativo).
// Para alterar a senha de alguém, basta editar diretamente a célula na aba "Usuarios".
// =====================================================================
// Confere a senha na aba Usuarios e rejeita contas marcadas como inativas.
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

// Garante que a aba Historico exista e acrescenta nela as alterações de estoque.
function registrarHistorico(ss, linhas) {
  let abaHist = ss.getSheetByName(ABA_HISTORICO);
  if (!abaHist) {
    abaHist = ss.insertSheet(ABA_HISTORICO);
    abaHist.appendRow(["Data/Hora", "Funcionário", "Produto", "Cor", "Qtd Anterior", "Qtd Nova"]);
  }
  const inicio = abaHist.getLastRow() + 1;
  abaHist.getRange(inicio, 1, linhas.length, linhas[0].length).setValues(linhas);
}
