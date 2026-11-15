
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// Configuração do nosso Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBO8cKvqDmtVtEORdso2ClBjXLNvqCNiBU",
    authDomain: "bancoimobiliarioonline.firebaseapp.com",
    projectId: "bancoimobiliarioonline",
    storageBucket: "bancoimobiliarioonline.firebasestorage.app",
    messagingSenderId: "954654331287",
    appId: "1:954654331287:web:627751f2e51840e959b4d2",
    measurementId: "G-NWR8V2QZ7F"
};

// Iniciar Firebase
const app = initializeApp(firebaseConfig);

// Autenticação e banco de dados
const auth = getAuth(app);
const db = getFirestore(app);

// Entrar sem e-mail e senha
const autenticacaoPronta = signInAnonymously(auth)
    .then(() => {
        console.log("Firebase conectado com sucesso!");
    })
    .catch((erro) => {
        console.error("Erro ao conectar Firebase:", erro);
        throw erro;
    });

// Disponibilizar para o script.js
export { auth, db, autenticacaoPronta };
