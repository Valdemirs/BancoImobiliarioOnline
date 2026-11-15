
import { db, auth, autenticacaoPronta } from "./firebase.js";

import {
    doc,
    setDoc,
    getDoc,
    getDocs,
    collection,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// ELEMENTOS DA TELA

const btnCriar = document.getElementById("btnCriar");
const btnEntrar = document.getElementById("btnEntrar");
const campoCodigo = document.getElementById("codigoSala");

const areaJogadores = document.getElementById("areaJogadores");
const codigoExibido = document.getElementById("codigoExibido");
const nomeJogador = document.getElementById("nomeJogador");
const btnAdicionar = document.getElementById("btnAdicionar");
const listaJogadores = document.getElementById("listaJogadores");

const areaBanco = document.getElementById("areaBanco");
const areaExtrato = document.getElementById("areaExtrato");
const meuNome = document.getElementById("meuNome");
const meuSaldo = document.getElementById("meuSaldo");

const tipoOperacao = document.getElementById("tipoOperacao");
const areaDestinatario = document.getElementById("areaDestinatario");
const jogadorDestino = document.getElementById("jogadorDestino");
const valorOperacao = document.getElementById("valorOperacao");
const motivoOperacao = document.getElementById("motivoOperacao");
const btnConfirmarOperacao =
    document.getElementById("btnConfirmarOperacao");

const listaExtrato = document.getElementById("listaExtrato");
const btnImprimirExtrato =
    document.getElementById("btnImprimirExtrato");

const areaFinalizar = document.getElementById("areaFinalizar");
const statusPartida = document.getElementById("statusPartida");
const btnFinalizar = document.getElementById("btnFinalizar");

const areaResultado = document.getElementById("areaResultado");
const tituloVencedor = document.getElementById("tituloVencedor");
const nomeVencedor = document.getElementById("nomeVencedor");
const saldoVencedor = document.getElementById("saldoVencedor");
const rankingFinal = document.getElementById("rankingFinal");

// VARIÁVEIS

let codigoAtual = "";
let jogadores = [];
let transacoes = [];
let meuJogador = null;
let partidaAtual = null;

let pararEscutaJogadores = null;
let pararEscutaExtrato = null;
let pararEscutaPartida = null;

const LIMITE_CENTAVOS = 100000000000;

// FUNÇÕES AUXILIARES

function formatarDinheiro(valor) {
    return Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function obterCentavos(texto) {
    if (String(texto).trim() === "") return null;

    const valor = Number(texto);

    if (!Number.isFinite(valor) || valor <= 0) {
        return null;
    }

    const centavos = Math.round(valor * 100);

    if (
        !Number.isSafeInteger(centavos) ||
        Math.abs(valor * 100 - centavos) > 0.000001
    ) {
        return null;
    }

    return centavos;
}

function partidaFinalizada() {
    return partidaAtual?.status === "finalizada";
}

function partidaAberta() {
    return partidaAtual?.status === "aguardando";
}

function referenciaPartida(codigo = codigoAtual) {
    return doc(db, "partidas", codigo);
}

function referenciaJogador(uid) {
    return doc(
        db, "partidas", codigoAtual,
        "jogadores", uid
    );
}

function obterNomeJogador(uid) {
    const jogador = jogadores.find(function(item) {
        return item.uid === uid;
    });

    return jogador ? jogador.nome : "Jogador desconhecido";
}

function mostrarErro(erro, mensagem) {
    console.error(mensagem, erro);

    const mensagens = {
        PARTIDA_FINALIZADA: "Esta partida já foi finalizada.",
        SALDO_INSUFICIENTE: "Saldo insuficiente.",
        LIMITE_SALDO: "O saldo ultrapassaria o limite permitido.",
        JOGADOR_INEXISTENTE: "Jogador não encontrado.",
        JA_CADASTRADO: "Você já está cadastrado.",
        MESMO_JOGADOR: "Você não pode transferir para si mesmo.",
        SEM_JOGADORES: "Cadastre pelo menos um jogador antes de finalizar.",
        NAO_CRIADOR: "Somente o criador pode finalizar a partida."
    };

    if (mensagens[erro.message]) {
        alert(mensagens[erro.message]);
    } else if (erro.code === "permission-denied") {
        alert(
            "Operação bloqueada pelo Firebase. " +
            "Confira as regras ou o status da partida."
        );
    } else {
        alert(mensagem);
    }
}

// LISTA DE JOGADORES

function atualizarJogadores() {
    listaJogadores.innerHTML = "";

    jogadores.forEach(function(jogador) {
        const item = document.createElement("p");

        item.textContent =
            jogador.nome + " - " +
            formatarDinheiro(jogador.saldo);

        listaJogadores.appendChild(item);
    });
}

// MINHA CONTA

function atualizarMinhaConta() {
    const uid = auth.currentUser?.uid;

    meuJogador = jogadores.find(function(jogador) {
        return jogador.uid === uid;
    }) || null;

    if (!meuJogador) {
        areaBanco.style.display = "none";
        areaExtrato.style.display = "none";
        atualizarEstadoPartida();
        return;
    }

    meuNome.textContent = meuJogador.nome;
    meuSaldo.textContent =
        formatarDinheiro(meuJogador.saldo);

    areaBanco.style.display = "block";
    areaExtrato.style.display = "block";

    atualizarDestinatarios();
    atualizarEstadoPartida();
}

// DESTINATÁRIOS

function atualizarDestinatarios() {
    const selecionado = jogadorDestino.value;

    jogadorDestino.innerHTML = "";

    const inicial = document.createElement("option");
    inicial.value = "";
    inicial.textContent = "Selecione um jogador";

    jogadorDestino.appendChild(inicial);

    jogadores.forEach(function(jogador) {
        if (jogador.uid === auth.currentUser?.uid) {
            return;
        }

        const opcao = document.createElement("option");
        opcao.value = jogador.uid;
        opcao.textContent = jogador.nome;

        jogadorDestino.appendChild(opcao);
    });

    if (
        jogadores.some(function(jogador) {
            return jogador.uid === selecionado &&
                jogador.uid !== auth.currentUser?.uid;
        })
    ) {
        jogadorDestino.value = selecionado;
    }
}

function atualizarTipoOperacao() {
    areaDestinatario.style.display =
        tipoOperacao.value === "transferir"
            ? "block"
            : "none";
}

tipoOperacao.addEventListener(
    "change",
    atualizarTipoOperacao
);

// RESULTADO FINAL

function mostrarResultado() {
    areaResultado.style.display = "none";
    rankingFinal.innerHTML = "";

    if (!partidaFinalizada()) return;

    const ranking = partidaAtual.rankingFinal || [];
    const vencedores = partidaAtual.vencedores || [];

    if (!ranking.length) return;

    areaResultado.style.display = "block";

    tituloVencedor.textContent =
        vencedores.length > 1
            ? "Empate na primeira colocação!"
            : "Vencedor da partida!";

    nomeVencedor.textContent =
        vencedores.map(function(item) {
            return item.nome;
        }).join(" e ");

    saldoVencedor.textContent =
        formatarDinheiro(ranking[0].saldo);

    ranking.forEach(function(jogador, indice) {
        const linha = document.createElement("p");

        linha.textContent =
            (indice + 1) + "º - " +
            jogador.nome + " - " +
            formatarDinheiro(jogador.saldo);

        linha.style.padding = "10px";
        linha.style.borderBottom = "1px solid #e5e7eb";

        if (
            vencedores.some(function(vencedor) {
                return vencedor.uid === jogador.uid;
            })
        ) {
            linha.style.fontWeight = "bold";
            linha.style.color = "#16803c";
        }

        rankingFinal.appendChild(linha);
    });
}

// CONTROLE DA PARTIDA

function atualizarEstadoPartida() {
    const finalizada = partidaFinalizada();
    const aberta = partidaAberta();

    const souCriador =
        partidaAtual?.criadorUid === auth.currentUser?.uid;

    areaFinalizar.style.display =
        partidaAtual ? "block" : "none";

    statusPartida.textContent = finalizada
        ? "Partida finalizada"
        : "Partida em andamento";

    btnFinalizar.style.display =
        souCriador && aberta ? "block" : "none";

    btnAdicionar.style.display =
        aberta && !meuJogador ? "block" : "none";

    nomeJogador.style.display =
        aberta && !meuJogador ? "block" : "none";

    tipoOperacao.disabled = !aberta;
    jogadorDestino.disabled = !aberta;
    valorOperacao.disabled = !aberta;
    motivoOperacao.disabled = !aberta;
    btnConfirmarOperacao.disabled = !aberta;

    mostrarResultado();
}

// ACOMPANHAR PARTIDA

function acompanharPartida(codigo) {
    if (pararEscutaPartida) {
        pararEscutaPartida();
    }

    pararEscutaPartida = onSnapshot(
        referenciaPartida(codigo),

        function(resultado) {
            if (codigo !== codigoAtual) return;

            if (!resultado.exists()) {
                alert("Partida não encontrada.");
                return;
            }

            partidaAtual = resultado.data();
            atualizarEstadoPartida();
        },

        function(erro) {
            console.error("Erro na partida:", erro);
            alert("Não foi possível acompanhar a partida.");
        }
    );
}

// ACOMPANHAR JOGADORES

function acompanharJogadores(codigo) {
    if (pararEscutaJogadores) {
        pararEscutaJogadores();
    }

    jogadores = [];
    meuJogador = null;

    atualizarJogadores();
    atualizarMinhaConta();

    const referencia = collection(
        db, "partidas", codigo, "jogadores"
    );

    pararEscutaJogadores = onSnapshot(
        referencia,

        function(resultado) {
            if (codigo !== codigoAtual) return;

            jogadores = resultado.docs.map(function(item) {
                return item.data();
            });

            jogadores.sort(function(a, b) {
                return a.nome.localeCompare(b.nome);
            });

            atualizarJogadores();
            atualizarMinhaConta();

            // Atualiza os nomes do extrato
            renderizarExtrato();
        },

        function(erro) {
            console.error("Erro nos jogadores:", erro);
            alert("Não foi possível atualizar os jogadores.");
        }
    );
}

// EXTRATO COMPLETO

function renderizarExtrato() {
    listaExtrato.innerHTML = "";

    const uid = auth.currentUser?.uid;

    if (!uid) return;

    const minhasTransacoes = transacoes.filter(function(item) {
        return item.usuarioUid === uid ||
            item.destinatarioUid === uid;
    });

    minhasTransacoes.sort(function(a, b) {
        const dataA = a.criadaEm?.toMillis?.() || 0;
        const dataB = b.criadaEm?.toMillis?.() || 0;

        return dataB - dataA;
    });

    if (minhasTransacoes.length === 0) {
        listaExtrato.textContent =
            "Nenhuma movimentação registrada.";
        return;
    }

    minhasTransacoes.forEach(function(item) {
        const div = document.createElement("div");
        const titulo = document.createElement("strong");
        const participantes = document.createElement("p");
        const detalhes = document.createElement("p");
        const data = document.createElement("small");

        const entrada =
            item.tipo === "receber" ||
            (
                item.tipo === "transferir" &&
                item.destinatarioUid === uid
            );

        let descricao = "";

        if (item.tipo === "receber") {
            descricao = "Recebimento do banco";
        } else if (item.tipo === "pagar") {
            descricao = "Pagamento ao banco";
        } else if (entrada) {
            descricao = "Transferência recebida";
        } else {
            descricao = "Transferência enviada";
        }

        titulo.textContent =
            descricao + ": " +
            (entrada ? "+ " : "- ") +
            formatarDinheiro(item.valor);

        titulo.style.color =
            entrada ? "#16804a" : "#dc3545";

        // NOMES DOS PARTICIPANTES

        if (item.tipo === "transferir") {
            const origem = obterNomeJogador(item.usuarioUid);
            const destino = obterNomeJogador(item.destinatarioUid);

            participantes.textContent =
                "De: " + origem + " → Para: " + destino;
        } else if (item.tipo === "receber") {
            participantes.textContent =
                "De: Banco → Para: " +
                obterNomeJogador(item.usuarioUid);
        } else {
            participantes.textContent =
                "De: " +
                obterNomeJogador(item.usuarioUid) +
                " → Para: Banco";
        }

        detalhes.textContent =
            "Motivo: " +
            (item.motivo || "Sem motivo informado");

        const dataOperacao = item.criadaEm?.toDate?.();

        data.textContent = dataOperacao
            ? dataOperacao.toLocaleString("pt-BR")
            : "Data indisponível";

        div.appendChild(titulo);
        div.appendChild(participantes);
        div.appendChild(detalhes);
        div.appendChild(data);

        listaExtrato.appendChild(div);
    });
}

// ACOMPANHAR EXTRATO EM TEMPO REAL

function acompanharExtrato(codigo) {
    if (pararEscutaExtrato) {
        pararEscutaExtrato();
    }

    transacoes = [];
    renderizarExtrato();

    const referencia = collection(
        db, "partidas", codigo, "transacoes"
    );

    pararEscutaExtrato = onSnapshot(
        referencia,

        function(resultado) {
            if (codigo !== codigoAtual) return;

            transacoes = resultado.docs.map(function(item) {
                return item.data();
            });

            renderizarExtrato();
        },

        function(erro) {
            console.error("Erro no extrato:", erro);
            listaExtrato.textContent =
                "Não foi possível carregar o extrato.";
        }
    );
}

// IMPRIMIR EXTRATO

if (btnImprimirExtrato) {
    btnImprimirExtrato.addEventListener(
        "click",
        function() {
            if (!meuJogador) {
                alert(
                    "Entre como jogador para imprimir seu extrato."
                );
                return;
            }

            window.print();
        }
    );
}

// ABRIR PARTIDA

function mostrarPartida(codigo) {
    codigoAtual = codigo;
    partidaAtual = null;

    codigoExibido.textContent =
        "Código da partida: " + codigo;

    areaJogadores.style.display = "block";
    areaResultado.style.display = "none";
    areaFinalizar.style.display = "none";

    acompanharPartida(codigo);
    acompanharJogadores(codigo);
    acompanharExtrato(codigo);
}

// CRIAR PARTIDA

btnCriar.addEventListener("click", async function() {
    btnCriar.disabled = true;

    try {
        await autenticacaoPronta;

        const referencia = doc(
            collection(db, "partidas")
        );

        await setDoc(referencia, {
            codigo: referencia.id,
            criadaEm: new Date(),
            status: "aguardando",
            criadorUid: auth.currentUser.uid
        });

        mostrarPartida(referencia.id);

        alert("Partida criada com sucesso!");

    } catch (erro) {
        mostrarErro(erro, "Erro ao criar partida.");
    } finally {
        btnCriar.disabled = false;
    }
});

// ENTRAR NA PARTIDA

btnEntrar.addEventListener("click", async function() {
    const codigo = campoCodigo.value.trim();

    if (!codigo) {
        alert("Digite o código da partida.");
        return;
    }

    btnEntrar.disabled = true;

    try {
        await autenticacaoPronta;

        const resultado = await getDoc(
            referenciaPartida(codigo)
        );

        if (!resultado.exists()) {
            alert("Partida não encontrada.");
            return;
        }

        mostrarPartida(codigo);

        alert("Você entrou na partida!");

    } catch (erro) {
        mostrarErro(erro, "Erro ao entrar na partida.");
    } finally {
        btnEntrar.disabled = false;
    }
});

// CADASTRAR JOGADOR

btnAdicionar.addEventListener("click", async function() {
    if (!codigoAtual) {
        alert("Entre em uma partida primeiro.");
        return;
    }

    if (!partidaAberta()) {
        alert("Esta partida não aceita novos jogadores.");
        return;
    }

    const nome = nomeJogador.value.trim();

    if (!nome || nome.length > 40) {
        alert("Digite um nome com até 40 caracteres.");
        return;
    }

    btnAdicionar.disabled = true;

    try {
        await autenticacaoPronta;

        const referencia = referenciaJogador(
            auth.currentUser.uid
        );

        const partidaRef = referenciaPartida();

        await runTransaction(db, async function(tx) {
            const partidaDoc = await tx.get(partidaRef);
            const existente = await tx.get(referencia);

            if (
                !partidaDoc.exists() ||
                partidaDoc.data().status !== "aguardando"
            ) {
                throw new Error("PARTIDA_FINALIZADA");
            }

            if (existente.exists()) {
                throw new Error("JA_CADASTRADO");
            }

            tx.set(referencia, {
                uid: auth.currentUser.uid,
                nome: nome,
                saldo: 25000
            });
        });

        nomeJogador.value = "";

        alert("Jogador cadastrado com sucesso!");

    } catch (erro) {
        mostrarErro(erro, "Erro ao cadastrar jogador.");
    } finally {
        btnAdicionar.disabled = false;
    }
});

// MOVIMENTAÇÕES FINANCEIRAS

btnConfirmarOperacao.addEventListener(
    "click",
    async function() {
        if (!meuJogador || !codigoAtual) {
            alert("Entre como jogador primeiro.");
            return;
        }

        if (!partidaAberta()) {
            alert("Esta partida já foi finalizada.");
            return;
        }

        const tipo = tipoOperacao.value;
        const centavos = obterCentavos(valorOperacao.value);
        const motivo = motivoOperacao.value.trim();
        const destinoUid = jogadorDestino.value;

        if (centavos === null) {
            alert(
                "Digite um valor válido com até duas casas decimais."
            );
            return;
        }

        if (motivo.length > 100) {
            alert("O motivo deve ter até 100 caracteres.");
            return;
        }

        if (!["receber", "pagar", "transferir"].includes(tipo)) {
            alert("Operação inválida.");
            return;
        }

        if (tipo === "transferir" && !destinoUid) {
            alert("Selecione o jogador destinatário.");
            return;
        }

        const valor = centavos / 100;

        btnConfirmarOperacao.disabled = true;

        try {
            await autenticacaoPronta;

            const uid = auth.currentUser.uid;
            const origemRef = referenciaJogador(uid);
            const partidaRef = referenciaPartida();

            const registroRef = doc(
                collection(
                    db, "partidas",
                    codigoAtual, "transacoes"
                )
            );

            if (tipo === "transferir") {
                if (destinoUid === uid) {
                    throw new Error("MESMO_JOGADOR");
                }

                const destinoRef =
                    referenciaJogador(destinoUid);

                await runTransaction(
                    db,
                    async function(tx) {
                        const partidaDoc =
                            await tx.get(partidaRef);

                        const origemDoc =
                            await tx.get(origemRef);

                        const destinoDoc =
                            await tx.get(destinoRef);

                        if (
                            !partidaDoc.exists() ||
                            partidaDoc.data().status !== "aguardando"
                        ) {
                            throw new Error("PARTIDA_FINALIZADA");
                        }

                        if (
                            !origemDoc.exists() ||
                            !destinoDoc.exists()
                        ) {
                            throw new Error("JOGADOR_INEXISTENTE");
                        }

                        const saldoOrigem = Math.round(
                            origemDoc.data().saldo * 100
                        );

                        const saldoDestino = Math.round(
                            destinoDoc.data().saldo * 100
                        );

                        const novoSaldoOrigem =
                            saldoOrigem - centavos;

                        const novoSaldoDestino =
                            saldoDestino + centavos;

                        if (novoSaldoOrigem < 0) {
                            throw new Error("SALDO_INSUFICIENTE");
                        }

                        if (
                            novoSaldoDestino > LIMITE_CENTAVOS
                        ) {
                            throw new Error("LIMITE_SALDO");
                        }

                        tx.update(origemRef, {
                            saldo: novoSaldoOrigem / 100,
                            ultimaTransacao: registroRef.id
                        });

                        tx.update(destinoRef, {
                            saldo: novoSaldoDestino / 100,
                            ultimaTransacao: registroRef.id
                        });

                        tx.set(registroRef, {
                            usuarioUid: uid,
                            tipo: "transferir",
                            valor: valor,
                            motivo: motivo,
                            destinatarioUid: destinoUid,
                            criadaEm: new Date()
                        });
                    }
                );

            } else {
                await runTransaction(
                    db,
                    async function(tx) {
                        const partidaDoc =
                            await tx.get(partidaRef);

                        const documento =
                            await tx.get(origemRef);

                        if (
                            !partidaDoc.exists() ||
                            partidaDoc.data().status !== "aguardando"
                        ) {
                            throw new Error("PARTIDA_FINALIZADA");
                        }

                        if (!documento.exists()) {
                            throw new Error("JOGADOR_INEXISTENTE");
                        }

                        const saldoAtual = Math.round(
                            documento.data().saldo * 100
                        );

                        const novoSaldo =
                            tipo === "receber"
                                ? saldoAtual + centavos
                                : saldoAtual - centavos;

                        if (novoSaldo < 0) {
                            throw new Error("SALDO_INSUFICIENTE");
                        }

                        if (novoSaldo > LIMITE_CENTAVOS) {
                            throw new Error("LIMITE_SALDO");
                        }

                        tx.update(origemRef, {
                            saldo: novoSaldo / 100
                        });

                        tx.set(registroRef, {
                            usuarioUid: uid,
                            tipo: tipo,
                            valor: valor,
                            motivo: motivo,
                            destinatarioUid: "",
                            criadaEm: new Date()
                        });
                    }
                );
            }

            valorOperacao.value = "";
            motivoOperacao.value = "";

            alert("Operação realizada com sucesso!");

        } catch (erro) {
            mostrarErro(
                erro,
                "Não foi possível realizar a operação."
            );
        } finally {
            btnConfirmarOperacao.disabled =
                !partidaAberta();
        }
    }
);

// FINALIZAR PARTIDA

btnFinalizar.addEventListener("click", async function() {
    if (!codigoAtual || !partidaAberta()) {
        alert("Não há uma partida aberta para finalizar.");
        return;
    }

    if (
        partidaAtual.criadorUid !==
        auth.currentUser?.uid
    ) {
        alert("Somente o criador pode finalizar.");
        return;
    }

    const confirmar = confirm(
        "Deseja realmente finalizar esta partida?\n\n" +
        "O jogador com maior saldo será o vencedor.\n" +
        "Depois disso, ninguém poderá movimentar dinheiro."
    );

    if (!confirmar) return;

    btnFinalizar.disabled = true;

    try {
        await autenticacaoPronta;

        const codigo = codigoAtual;
        const partidaRef = referenciaPartida(codigo);

        const jogadoresRef = collection(
            db, "partidas", codigo, "jogadores"
        );

        const listaInicial = await getDocs(jogadoresRef);

        if (listaInicial.empty) {
            throw new Error("SEM_JOGADORES");
        }

        await runTransaction(db, async function(tx) {
            const partidaDoc = await tx.get(partidaRef);

            if (
                !partidaDoc.exists() ||
                partidaDoc.data().status !== "aguardando"
            ) {
                throw new Error("PARTIDA_FINALIZADA");
            }

            if (
                partidaDoc.data().criadorUid !==
                auth.currentUser.uid
            ) {
                throw new Error("NAO_CRIADOR");
            }

            const documentos = [];

            for (const item of listaInicial.docs) {
                const documento = await tx.get(item.ref);

                if (!documento.exists()) {
                    throw new Error("JOGADOR_INEXISTENTE");
                }

                documentos.push(documento);
            }

            const ranking = documentos.map(function(item) {
                const dados = item.data();

                return {
                    uid: dados.uid,
                    nome: dados.nome,
                    saldo: dados.saldo
                };
            });

            ranking.sort(function(a, b) {
                const diferenca = b.saldo - a.saldo;

                if (diferenca !== 0) return diferenca;

                return a.nome.localeCompare(b.nome);
            });

            const maiorSaldo = ranking[0].saldo;

            const vencedores = ranking.filter(function(item) {
                return Math.round(item.saldo * 100) ===
                    Math.round(maiorSaldo * 100);
            });

            tx.update(partidaRef, {
                status: "finalizada",
                finalizadaEm: serverTimestamp(),
                vencedores: vencedores,
                rankingFinal: ranking
            });
        });

        alert("Partida finalizada com sucesso!");

    } catch (erro) {
        mostrarErro(
            erro,
            "Não foi possível finalizar a partida."
        );
    } finally {
        btnFinalizar.disabled = false;
    }
});

// INICIAR INTERFACE

listaExtrato.textContent =
    "Nenhuma movimentação registrada.";

atualizarTipoOperacao();


// ==========================================
// COMPARTILHAR PARTIDA
// ==========================================

const btnCompartilhar =
    document.getElementById("btnCompartilhar");

// Criar link de convite
function gerarLinkPartida() {
    const link = new URL(window.location.href);

    link.searchParams.set("sala", codigoAtual);

    return link.toString();
}

// Compartilhar com amigos
btnCompartilhar.addEventListener("click", async function() {

    if (!codigoAtual) {
        alert("Crie ou entre em uma partida primeiro.");
        return;
    }

    const link = gerarLinkPartida();

    const mensagem =
        "Venha jogar Banco Imobiliário Online comigo!\n\n" +
        "Entre na minha partida pelo link:\n" +
        link;

    // Compartilhamento nativo do celular
    if (navigator.share) {
        try {
            await navigator.share({
                title: "Banco Imobiliário Online",
                text: mensagem
            });

            return;
        } catch (erro) {
            if (erro.name === "AbortError") {
                return;
            }

            console.error("Erro ao compartilhar:", erro);
        }
    }

    // Copiar o convite no computador
    try {
        await navigator.clipboard.writeText(mensagem);

        alert(
            "Convite copiado!\n\n" +
            "Agora cole no WhatsApp e envie aos seus amigos."
        );

    } catch (erro) {
        window.prompt(
            "Copie o link da partida:",
            link
        );
    }
});

// ==========================================
// ENTRAR NA PARTIDA PELO LINK
// ==========================================

async function verificarConvite() {

    const parametros = new URLSearchParams(
        window.location.search
    );

    const codigoConvite = parametros.get("sala");

    if (!codigoConvite) {
        return;
    }

    // Mostrar o código no campo de entrada
    campoCodigo.value = codigoConvite;

    try {
        await autenticacaoPronta;

        const resultado = await getDoc(
            referenciaPartida(codigoConvite)
        );

        if (!resultado.exists()) {
            alert("A partida deste convite não foi encontrada.");
            return;
        }

        // Abrir a partida automaticamente
        mostrarPartida(codigoConvite);

    } catch (erro) {
        mostrarErro(
            erro,
            "Não foi possível abrir o convite."
        );
    }
}

// Verificar convite ao carregar o site
verificarConvite();

