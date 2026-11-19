
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

// ==========================================
// ELEMENTOS DA TELA
// ==========================================

const btnCriar = document.getElementById("btnCriar");
const btnEntrar = document.getElementById("btnEntrar");
const campoCodigo = document.getElementById("codigoSala");

const areaJogadores = document.getElementById("areaJogadores");
const codigoExibido = document.getElementById("codigoExibido");
const nomeJogador = document.getElementById("nomeJogador");
const btnAdicionar = document.getElementById("btnAdicionar");
const listaJogadores = document.getElementById("listaJogadores");

const areaEscolhaPiao = document.getElementById("areaEscolhaPiao");
const mensagemPiao = document.getElementById("mensagemPiao");
const botoesPioes = document.querySelectorAll(".cor-piao");

const areaBanco = document.getElementById("areaBanco");
const areaExtrato = document.getElementById("areaExtrato");
const meuNome = document.getElementById("meuNome");
const meuSaldo = document.getElementById("meuSaldo");

const tipoOperacao = document.getElementById("tipoOperacao");
const areaDestinatario = document.getElementById("areaDestinatario");
const jogadorDestino = document.getElementById("jogadorDestino");
const valorOperacao = document.getElementById("valorOperacao");
const motivoOperacao = document.getElementById("motivoOperacao");
const btnConfirmarOperacao = document.getElementById("btnConfirmarOperacao");

const botoesValores = document.querySelectorAll(".btn-valor");
const botoesMotivos = document.querySelectorAll(".btn-motivo");

const listaExtrato = document.getElementById("listaExtrato");
const btnImprimirExtrato = document.getElementById("btnImprimirExtrato");

const areaFinalizar = document.getElementById("areaFinalizar");
const statusPartida = document.getElementById("statusPartida");
const btnFinalizar = document.getElementById("btnFinalizar");

const areaResultado = document.getElementById("areaResultado");
const tituloVencedor = document.getElementById("tituloVencedor");
const nomeVencedor = document.getElementById("nomeVencedor");
const saldoVencedor = document.getElementById("saldoVencedor");
const rankingFinal = document.getElementById("rankingFinal");

const btnCompartilhar = document.getElementById("btnCompartilhar");

// ==========================================
// VARIÁVEIS
// ==========================================

let codigoAtual = "";
let jogadores = [];
let transacoes = [];
let meuJogador = null;
let partidaAtual = null;
let corSelecionada = "";

let pararEscutaJogadores = null;
let pararEscutaExtrato = null;
let pararEscutaPartida = null;
let pararEscutaPioes = null;

let coresReservadas = new Set();

const LIMITE_CENTAVOS = 100000000000;

const CORES_PIOES = {
    amarelo: "#f0c400",
    preto: "#202020",
    branco: "#ffffff",
    verde: "#008c58",
    azul: "#08759c",
    vermelho: "#d92320"
};

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

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
    return doc(db, "partidas", codigoAtual, "jogadores", uid);
}

function referenciaPiao(cor) {
    return doc(db, "partidas", codigoAtual, "pioes", cor);
}

function obterNomeJogador(uid) {
    const jogador = jogadores.find(item => item.uid === uid);
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
        NAO_CRIADOR: "Somente o criador pode finalizar a partida.",
        PIAO_OCUPADO: "Este pião já foi escolhido. Selecione outra cor.",
        PIAO_INVALIDO: "Escolha uma cor de pião válida."
    };

    if (mensagens[erro.message]) {
        alert(mensagens[erro.message]);
    } else if (erro.code === "permission-denied") {
        alert(
            "Operação bloqueada pelo Firebase. " +
            "Confira as regras de segurança da partida."
        );
    } else {
        alert(mensagem);
    }
}

// ==========================================
// ESCOLHA DOS PIÕES
// ==========================================

function criarIconePiao(cor) {
    const icone = document.createElement("span");

    icone.textContent = "\u265F\uFE0E";
    icone.setAttribute("aria-hidden", "true");
    icone.style.color = CORES_PIOES[cor] || "#9ca3af";
    icone.style.fontSize = "28px";
    icone.style.lineHeight = "1";
    icone.style.display = "inline-block";
    icone.style.marginRight = "8px";

    if (cor === "branco") {
        icone.style.webkitTextStroke = "1px #666666";
        icone.style.textShadow = "0 0 1px #666666";
    }

    return icone;
}

function atualizarSelecaoPioes() {
    const podeEscolher =
        partidaAberta() && !meuJogador;

    botoesPioes.forEach(function(botao) {
        const cor = botao.dataset.cor;
        const ocupada = coresReservadas.has(cor);
        const selecionada = corSelecionada === cor;

        botao.disabled = !podeEscolher || ocupada;
        botao.classList.toggle("ativo", selecionada);
        botao.classList.toggle("ocupado", ocupada);
        botao.setAttribute("aria-pressed", String(selecionada));

        botao.style.opacity = ocupada ? "0.35" : "1";
        botao.style.cursor = botao.disabled
            ? "not-allowed"
            : "pointer";

        botao.style.outline = selecionada
            ? "3px solid #16a34a"
            : "";

        botao.style.outlineOffset = selecionada
            ? "2px"
            : "";

        botao.title = ocupada
            ? cor + " — ocupado"
            : cor + " — disponível";
    });

    if (areaEscolhaPiao) {
        areaEscolhaPiao.style.display =
            podeEscolher ? "block" : "none";
    }

    if (!mensagemPiao) return;

    if (corSelecionada) {
        mensagemPiao.textContent =
            "Pião selecionado: " + corSelecionada + ".";
    } else if (coresReservadas.size >= 6) {
        mensagemPiao.textContent =
            "Todos os seis piões estão ocupados.";
    } else {
        mensagemPiao.textContent =
            "Selecione uma cor disponível.";
    }
}

botoesPioes.forEach(function(botao) {
    botao.addEventListener("click", function() {
        const cor = botao.dataset.cor;

        if (
            !partidaAberta() ||
            meuJogador ||
            !Object.hasOwn(CORES_PIOES, cor) ||
            coresReservadas.has(cor)
        ) {
            return;
        }

        corSelecionada = cor;
        atualizarSelecaoPioes();
    });
});

function acompanharPioes(codigo) {
    if (pararEscutaPioes) {
        pararEscutaPioes();
    }

    coresReservadas = new Set();
    atualizarSelecaoPioes();

    const referencia = collection(
        db, "partidas", codigo, "pioes"
    );

    pararEscutaPioes = onSnapshot(
        referencia,
        function(resultado) {
            if (codigo !== codigoAtual) return;

            coresReservadas = new Set(
                resultado.docs.map(item => item.id)
            );

            if (coresReservadas.has(corSelecionada)) {
                corSelecionada = "";
            }

            atualizarSelecaoPioes();
        },
        function(erro) {
            console.error("Erro ao carregar piões:", erro);
            if (mensagemPiao) {
                mensagemPiao.textContent =
                    "Não foi possível carregar as cores disponíveis.";
            }
        }
    );
}

// ==========================================
// VALORES E MOTIVOS RÁPIDOS
// ==========================================

function atualizarDestaqueValores() {
    botoesValores.forEach(function(botao) {
        const selecionado =
            valorOperacao.value !== "" &&
            Number(botao.dataset.valor) ===
            Number(valorOperacao.value);

        botao.classList.toggle("ativo", selecionado);
    });
}

function atualizarDestaqueMotivos() {
    botoesMotivos.forEach(function(botao) {
        const selecionado =
            botao.dataset.motivo !== "" &&
            botao.dataset.motivo === motivoOperacao.value;

        botao.classList.toggle("ativo", selecionado);
    });
}

function limparDestaquesRapidos() {
    botoesValores.forEach(botao => {
        botao.classList.remove("ativo");
    });

    botoesMotivos.forEach(botao => {
        botao.classList.remove("ativo");
    });
}

function atualizarBotoesRapidos() {
    const desabilitar =
        !partidaAberta() || !meuJogador;

    botoesValores.forEach(botao => {
        botao.disabled = desabilitar;
    });

    botoesMotivos.forEach(botao => {
        botao.disabled = desabilitar;
    });
}

botoesValores.forEach(function(botao) {
    botao.addEventListener("click", function() {
        if (!partidaAberta() || !meuJogador) return;

        valorOperacao.value = botao.dataset.valor;
        atualizarDestaqueValores();
    });
});

botoesMotivos.forEach(function(botao) {
    botao.addEventListener("click", function() {
        if (!partidaAberta() || !meuJogador) return;

        motivoOperacao.value = botao.dataset.motivo;
        atualizarDestaqueMotivos();

        if (botao.dataset.motivo === "") {
            motivoOperacao.focus();
        }
    });
});

valorOperacao.addEventListener(
    "input", atualizarDestaqueValores
);

motivoOperacao.addEventListener(
    "input", atualizarDestaqueMotivos
);

// ==========================================
// LISTA DE JOGADORES
// ==========================================

function atualizarJogadores() {
    listaJogadores.innerHTML = "";

    jogadores.forEach(function(jogador) {
        const item = document.createElement("p");

        if (jogador.corPiao) {
            item.appendChild(
                criarIconePiao(jogador.corPiao)
            );
        }

        const texto = document.createElement("span");

        texto.textContent =
            jogador.nome + " - " +
            formatarDinheiro(jogador.saldo);

        item.appendChild(texto);
        listaJogadores.appendChild(item);
    });
}

// ==========================================
// MINHA CONTA
// ==========================================

function atualizarMinhaConta() {
    const uid = auth.currentUser?.uid;

    meuJogador = jogadores.find(
        jogador => jogador.uid === uid
    ) || null;

    if (!meuJogador) {
        areaBanco.style.display = "none";
        areaExtrato.style.display = "none";

        atualizarEstadoPartida();
        return;
    }

    meuNome.textContent = "";

    if (meuJogador.corPiao) {
        meuNome.appendChild(
            criarIconePiao(meuJogador.corPiao)
        );
    }

    meuNome.appendChild(
        document.createTextNode(meuJogador.nome)
    );

    meuSaldo.textContent =
        formatarDinheiro(meuJogador.saldo);

    areaBanco.style.display = "block";
    areaExtrato.style.display = "block";

    atualizarDestinatarios();
    atualizarEstadoPartida();
}

// ==========================================
// DESTINATÁRIOS
// ==========================================

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
        opcao.textContent = jogador.corPiao
            ? jogador.nome + " (" + jogador.corPiao + ")"
            : jogador.nome;

        jogadorDestino.appendChild(opcao);
    });

    if (
        jogadores.some(jogador =>
            jogador.uid === selecionado &&
            jogador.uid !== auth.currentUser?.uid
        )
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
    "change", atualizarTipoOperacao
);

// ==========================================
// RESULTADO FINAL
// ==========================================

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

    nomeVencedor.textContent = vencedores
        .map(item => item.nome)
        .join(" e ");

    saldoVencedor.textContent =
        formatarDinheiro(ranking[0].saldo);

    ranking.forEach(function(jogador, indice) {
        const linha = document.createElement("p");

        if (jogador.corPiao) {
            linha.appendChild(
                criarIconePiao(jogador.corPiao)
            );
        }

        const texto = document.createElement("span");

        texto.textContent =
            (indice + 1) + "º - " +
            jogador.nome + " - " +
            formatarDinheiro(jogador.saldo);

        linha.appendChild(texto);

        linha.style.padding = "10px";
        linha.style.borderBottom =
            "1px solid #e5e7eb";

        if (
            vencedores.some(
                vencedor => vencedor.uid === jogador.uid
            )
        ) {
            linha.style.fontWeight = "bold";
            linha.style.color = "#16803c";
        }

        rankingFinal.appendChild(linha);
    });
}

// ==========================================
// CONTROLE DA PARTIDA
// ==========================================

function atualizarEstadoPartida() {
    const finalizada = partidaFinalizada();
    const aberta = partidaAberta();

    const souCriador =
        partidaAtual?.criadorUid ===
        auth.currentUser?.uid;

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

    atualizarBotoesRapidos();
    atualizarSelecaoPioes();
    mostrarResultado();
}

// ==========================================
// ACOMPANHAR PARTIDA
// ==========================================

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

// ==========================================
// ACOMPANHAR JOGADORES
// ==========================================

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

            jogadores = resultado.docs.map(
                item => item.data()
            );

            jogadores.sort(
                (a, b) => a.nome.localeCompare(b.nome)
            );

            atualizarJogadores();
            atualizarMinhaConta();
            renderizarExtrato();
        },

        function(erro) {
            console.error("Erro nos jogadores:", erro);
            alert("Não foi possível atualizar os jogadores.");
        }
    );
}

// ==========================================
// EXTRATO COMPLETO
// ==========================================

function renderizarExtrato() {
    listaExtrato.innerHTML = "";

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const minhasTransacoes = transacoes.filter(
        item =>
            item.usuarioUid === uid ||
            item.destinatarioUid === uid
    );

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

        if (item.tipo === "transferir") {
            const origem =
                obterNomeJogador(item.usuarioUid);

            const destino =
                obterNomeJogador(item.destinatarioUid);

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

// ==========================================
// ACOMPANHAR EXTRATO
// ==========================================

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

            transacoes = resultado.docs.map(
                item => item.data()
            );

            renderizarExtrato();
        },

        function(erro) {
            console.error("Erro no extrato:", erro);
            listaExtrato.textContent =
                "Não foi possível carregar o extrato.";
        }
    );
}

// ==========================================
// IMPRIMIR EXTRATO
// ==========================================

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

// ==========================================
// ABRIR PARTIDA
// ==========================================

function mostrarPartida(codigo) {
    codigoAtual = codigo;
    partidaAtual = null;
    corSelecionada = "";
    coresReservadas = new Set();

    codigoExibido.textContent =
        "Código da partida: " + codigo;

    areaJogadores.style.display = "block";
    areaResultado.style.display = "none";
    areaFinalizar.style.display = "none";

    acompanharPartida(codigo);
    acompanharJogadores(codigo);
    acompanharPioes(codigo);
    acompanharExtrato(codigo);
}

// ==========================================
// CRIAR PARTIDA
// ==========================================

btnCriar.addEventListener(
    "click",
    async function() {
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
    }
);

// ==========================================
// ENTRAR NA PARTIDA
// ==========================================

btnEntrar.addEventListener(
    "click",
    async function() {
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
    }
);

// ==========================================
// CADASTRAR JOGADOR COM PIÃO EXCLUSIVO
// ==========================================

btnAdicionar.addEventListener(
    "click",
    async function() {
        if (!codigoAtual) {
            alert("Entre em uma partida primeiro.");
            return;
        }

        if (!partidaAberta()) {
            alert("Esta partida não aceita novos jogadores.");
            return;
        }

        const nome = nomeJogador.value.trim();
        const cor = corSelecionada;

        if (!nome || nome.length > 40) {
            alert("Digite um nome com até 40 caracteres.");
            return;
        }

        if (!Object.hasOwn(CORES_PIOES, cor)) {
            alert("Escolha a cor do seu pião.");
            return;
        }

        if (coresReservadas.has(cor)) {
            alert("Este pião já está ocupado.");
            return;
        }

        btnAdicionar.disabled = true;

        try {
            await autenticacaoPronta;

            const uid = auth.currentUser.uid;
            const jogadorRef = referenciaJogador(uid);
            const partidaRef = referenciaPartida();
            const piaoRef = referenciaPiao(cor);

            await runTransaction(
                db,
                async function(tx) {
                    const partidaDoc =
                        await tx.get(partidaRef);

                    const jogadorDoc =
                        await tx.get(jogadorRef);

                    const piaoDoc =
                        await tx.get(piaoRef);

                    if (
                        !partidaDoc.exists() ||
                        partidaDoc.data().status !== "aguardando"
                    ) {
                        throw new Error("PARTIDA_FINALIZADA");
                    }

                    if (jogadorDoc.exists()) {
                        throw new Error("JA_CADASTRADO");
                    }

                    if (piaoDoc.exists()) {
                        throw new Error("PIAO_OCUPADO");
                    }

                    // Reserva a cor para este jogador.
                    tx.set(piaoRef, {
                        uid: uid,
                        cor: cor
                    });

                    // Cria o jogador com seu pião.
                    tx.set(jogadorRef, {
                        uid: uid,
                        nome: nome,
                        saldo: 25000,
                        corPiao: cor
                    });
                }
            );

            nomeJogador.value = "";
            corSelecionada = "";
            atualizarSelecaoPioes();

            alert(
                "Jogador cadastrado com sucesso! " +
                "Seu pião é " + cor + "."
            );

        } catch (erro) {
            mostrarErro(
                erro,
                "Erro ao cadastrar jogador."
            );
        } finally {
            btnAdicionar.disabled = false;
        }
    }
);

// ==========================================
// MOVIMENTAÇÕES FINANCEIRAS
// ==========================================

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

                        if (novoSaldoDestino > LIMITE_CENTAVOS) {
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
            limparDestaquesRapidos();

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

// ==========================================
// FINALIZAR PARTIDA
// ==========================================

btnFinalizar.addEventListener(
    "click",
    async function() {
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

            await runTransaction(
                db,
                async function(tx) {
                    const partidaDoc =
                        await tx.get(partidaRef);

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
                            saldo: dados.saldo,
                            ...(dados.corPiao
                                ? { corPiao: dados.corPiao }
                                : {})
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
                }
            );

            alert("Partida finalizada com sucesso!");

        } catch (erro) {
            mostrarErro(
                erro,
                "Não foi possível finalizar a partida."
            );
        } finally {
            btnFinalizar.disabled = false;
        }
    }
);

// ==========================================
// COMPARTILHAR PARTIDA
// ==========================================

function gerarLinkPartida() {
    const link = new URL(window.location.href);

    link.searchParams.set("sala", codigoAtual);

    return link.toString();
}

btnCompartilhar.addEventListener(
    "click",
    async function() {
        if (!codigoAtual) {
            alert("Crie ou entre em uma partida primeiro.");
            return;
        }

        const link = gerarLinkPartida();

        const mensagem =
            "Venha jogar Banco Imobiliário Online comigo!\n\n" +
            "Entre na minha partida pelo link:\n" +
            link;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Banco Imobiliário Online",
                    text: mensagem
                });

                return;

            } catch (erro) {
                if (erro.name === "AbortError") return;

                console.error("Erro ao compartilhar:", erro);
            }
        }

        try {
            await navigator.clipboard.writeText(mensagem);

            alert(
                "Convite copiado!\n\n" +
                "Agora cole no WhatsApp e envie aos seus amigos."
            );

        } catch (erro) {
            window.prompt("Copie o link da partida:", link);
        }
    }
);

// ==========================================
// ENTRAR NA PARTIDA PELO LINK
// ==========================================

async function verificarConvite() {
    const parametros = new URLSearchParams(
        window.location.search
    );

    const codigoConvite = parametros.get("sala");

    if (!codigoConvite) return;

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

        mostrarPartida(codigoConvite);

    } catch (erro) {
        mostrarErro(
            erro,
            "Não foi possível abrir o convite."
        );
    }
}

// ==========================================
// INICIAR INTERFACE
// ==========================================

listaExtrato.textContent =
    "Nenhuma movimentação registrada.";

atualizarTipoOperacao();
atualizarBotoesRapidos();
atualizarSelecaoPioes();
verificarConvite();


/* ==========================================
   CORREÇÃO DOS PIÕES PARA CELULAR
   ========================================== */

function corrigirPioesCelular() {
    const cores = {
        amarelo: "#f0c400",
        preto: "#202020",
        branco: "#ffffff",
        verde: "#008c58",
        azul: "#08759c",
        vermelho: "#d92320"
    };

    document.querySelectorAll(".cor-piao").forEach(botao => {
        const cor = botao.dataset.cor;
        const piao = botao.querySelector(".piao-icone");

        if (!piao || !cores[cor]) return;

        // Força o símbolo a aparecer como texto.
        piao.textContent = "\u265F\uFE0E";

        // Define a cor correspondente.
        piao.style.setProperty(
            "color",
            cores[cor],
            "important"
        );

        piao.style.fontFamily =
            "Arial, sans-serif";

        piao.style.fontVariantEmoji = "text";
        piao.style.fontSize = "32px";

        if (cor === "branco") {
            piao.style.webkitTextStroke =
                "1px #555555";
        }
    });
}

// Executa a correção quando a página carregar.
corrigirPioesCelular();

