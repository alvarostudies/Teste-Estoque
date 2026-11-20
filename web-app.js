// Se o script foi criado direto pela planilha (Extensões > Apps Script), deixe null.
// Se criou separado, coloque o ID da planilha entre aspas, ex.: "1AbCDefGhIjKlMnOpQrStUvWxYz"
const SPREADSHEET_ID = null;

const ABA_ESTOQUE = "Estoque";
const ABA_USUARIOS = "Usuarios";
const ABA_HISTORICO = "Historico";

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

    if (!senhaInformada) {
      return responderJson({ ok: false, mensagem: "Informe a senha." });
    }

    const usuario = validarSenhaFuncionario(senhaInformada);
    if (!usuario) {
      return responderJson({ ok: false, mensagem: "Senha incorreta ou funcionário inativo." });
    }

    if (alteracoes.length === 0) {
      return responderJson({ ok: false, mensagem: "Nenhuma alteração enviada." });
    }

    const ss = obterPlanilha();
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
