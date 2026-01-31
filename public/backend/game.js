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

const roomRef = ref(db, "rooms/" + roomCode);

// ======================
// Загрузка вопросов
// ======================
async function loadQuestions() {
  try {
    const res = await fetch("data/questions.json");
    const data = await res.json();

    const themes = data.themes || [];
    themes.forEach(theme => {
      const questions = theme.questions || [];
      questions.forEach(q => {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.textContent = theme.title;

        if (role === "host") {
          cell.onclick = () => {
            update(roomRef, {
              currentQuestion: q,
              answeringPlayer: null
            });
          };
        }

        board.appendChild(cell);
      });
    });
  } catch (err) {
    console.error("Ошибка загрузки вопросов:", err);
  }
}

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
