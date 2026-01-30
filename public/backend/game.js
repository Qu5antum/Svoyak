import { db, auth } from "./firebase.js";
import {
  ref,
  onValue,
  update,
  get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const roomCode = localStorage.getItem("roomCode");
const role = localStorage.getItem("role");

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
  const res = await fetch("data/questions.json");
  const data = await res.json();

  data.themes.forEach(theme => {
    theme.questions.forEach(q => {
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
}

loadQuestions();

// ======================
// REALTIME
// ======================
onValue(roomRef, snap => {
  const room = snap.val();
  if (!room) return;

  // игроки
  playersEl.innerHTML = "";
  Object.entries(room.players || {}).forEach(([uid, p]) => {
    const li = document.createElement("li");
    li.textContent = `${p.name} — ${p.score || 0}`;

    if (room.answeringPlayer === uid) {
      li.style.color = "#22c55e";
      li.style.fontWeight = "bold";
    }

    playersEl.appendChild(li);
  });

  // вопрос
  if (room.currentQuestion) {
    questionBox.hidden = false;
    questionText.textContent = room.currentQuestion.question;
  } else {
    questionBox.hidden = true;
  }

  hostPanel.hidden = role !== "host";

  answerBtn.disabled =
    role !== "player" ||
    !room.currentQuestion ||
    room.answeringPlayer;
});

// ======================
// Ответить
// ======================
answerBtn.onclick = () => {
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
  const current = room.players[uid].score || 0;

  const value = prompt("Сколько баллов?");
  const points = Number(value);

  if (isNaN(points)) return;

  await update(ref(db, `rooms/${roomCode}/players/${uid}`), {
    score: current + sign * points
  });

  await update(roomRef, {
    currentQuestion: null,
    answeringPlayer: null
  });
}

document.getElementById("plusBtn").onclick = () => changeScore(1);
document.getElementById("minusBtn").onclick = () => changeScore(-1);
