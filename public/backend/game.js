import { db, auth } from "./firebase.js";
import { ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const roomCode = localStorage.getItem("roomCode");
const playerName = localStorage.getItem("playerName");
const role = localStorage.getItem("role");

if (!roomCode || !playerName) {
  window.location.href = "index.html";
}

const board = document.getElementById("board");
const playersEl = document.getElementById("players");
const questionBox = document.getElementById("questionBox");
const questionText = document.getElementById("questionText");
const answerBtn = document.getElementById("answerBtn");
const hostPanel = document.getElementById("hostPanel");
const questionImage = document.getElementById("questionImage");

const roomRef = ref(db, "rooms/" + roomCode);

// ======================
// Загрузка вопросов
// ======================

// ===== OPEN QUESTION =====
async function openQuestion(question, cell, score) {
  cell.classList.add("used");
  cell.onclick = null;

  showQuestion(question);

  const snap = await get(roomRef);
  const room = snap.val() || {};
  const used = room.usedQuestions || {};

  await update(roomRef, {
    currentQuestion: {
      ...question,
      score
    },
    answeringPlayer: null,
    usedQuestions: {
      ...used,
      [`${question.theme}_${score}`]: true
    }
  });
}
// ===== HIDE QUESTION =====
function hideQuestion() {
  questionBox.hidden = true;
  questionText.textContent = "";
  questionImage.src = "";
  questionImage.style.display = "none";
}

// ===== SHOW QUESTION =====
function showQuestion(question) {
  questionBox.hidden = false;
  questionText.textContent = question.question;

  if (question.type === "image" && question.image) {
    questionImage.src = question.image;
    questionImage.style.display = "block";
  } else {
    questionImage.style.display = "none";
    questionImage.src = "";
  }
}

async function loadQuestions() {
  try {
    const res = await fetch("data/questions.json");
    const data = await res.json();

    const themes = (data.themes || []).filter(t => t?.title);
    board.innerHTML = "";

    // ===== THEMES ROW =====
    const themeRow = document.createElement("div");
    themeRow.className = "row theme-row";

    themes.forEach(theme => {
      const cell = document.createElement("div");
      cell.className = "cell theme-cell";
      cell.textContent = theme.title;
      themeRow.appendChild(cell);
    });

    board.appendChild(themeRow);

    // ===== MAX QUESTIONS =====
    const maxQuestions = Math.max(
      ...themes.map(t => (t.questions || []).length)
    );

    // ===== SCORE ROWS =====
    for (let i = 0; i < maxQuestions; i++) {
      const row = document.createElement("div");
      row.className = "row";

      themes.forEach(theme => {
        const question = theme.questions?.[i];
        const cell = document.createElement("div");
        cell.className = "cell score-cell";

        const score = (i + 1) * 100;
        cell.textContent = question ? score : "";

        if (question && role === "host") {
          cell.onclick = () => openQuestion(question, cell, score);
        }

        row.appendChild(cell);
      });

      board.appendChild(row);
    }
  } catch (err) {
    console.error("Ошибка загрузки вопросов:", err);
  }
}


// ===== INIT =====
loadQuestions();


// ======================
// Добавление игрока при входе
// ======================
auth.onAuthStateChanged(async user => {
  if (!user) return;
  const uid = user.uid;

  // ===== только участники получают score =====
  const playerData = { name: playerName };
  if (role === "player") {
    playerData.score = 0;
  }

  await update(ref(db, `rooms/${roomCode}/players/${uid}`), playerData);

  // ======================
  // REALTIME слушатель комнаты
  // ======================
  onValue(roomRef, snap => {
    const room = snap.val();
    if (!room) return;

    playersEl.innerHTML = "";
    const players = room.players || {};
    const hostId = room.host;

    // ===== сначала ведущий без баллов =====
    if (players[hostId]) {
      const liHost = document.createElement("li");
      liHost.textContent = `${players[hostId].name} (ведущий)`; // без баллов
      liHost.style.fontWeight = "bold";
      playersEl.appendChild(liHost);
    }

    // Показ текущего вопроса
    if (room.currentQuestion) {
      showQuestion(room.currentQuestion);
    } else {
      hideQuestion();
    }

    // ===== остальные игроки с баллами =====
    Object.entries(players).forEach(([id, p]) => {
      if (id === hostId) return;
      const li = document.createElement("li");
      li.textContent = `${p.name || "Игрок"} — ${p.score || 0}`;
      
      // Подсветка отвечающего
      if (room.answeringPlayer === id) {
        li.style.color = "#22c55e";
        li.style.fontWeight = "bold";
      }

      playersEl.appendChild(li);
    });

    // Показ текущего вопроса
    questionBox.hidden = !room.currentQuestion;
    questionText.textContent = room.currentQuestion?.question || "";

    // Панель ведущего
    hostPanel.hidden = role !== "host";

    // Кнопка "Ответить"
    answerBtn.disabled = role !== "player" || !room.currentQuestion || room.answeringPlayer;
  });
});

// ======================
// Ответить
// ======================
answerBtn.onclick = () => {
  if (!auth.currentUser) {
    alert("Ошибка: пользователь не авторизован");
    return;
  }

  update(roomRef, {
    answeringPlayer: auth.currentUser.uid
  });
};

// ======================
// Ведущий меняет баллы
// ======================
async function changeScore(sign) {
  const snap = await get(roomRef);
  const room = snap.val();
  if (!room?.answeringPlayer) return;

  const uid = room.answeringPlayer;
  const current = room.players?.[uid]?.score || 0;

  const value = prompt("Сколько баллов?");
  const points = Number(value);
  if (isNaN(points)) return;

  await update(ref(db, `rooms/${roomCode}/players/${uid}`), {
    score: current + sign * points
  });

  // Сброс текущего вопроса и отвечающего
  await update(roomRef, {
    currentQuestion: null,
    answeringPlayer: null
  });
}

document.getElementById("plusBtn").onclick = () => changeScore(1);
document.getElementById("minusBtn").onclick = () => changeScore(-1);
