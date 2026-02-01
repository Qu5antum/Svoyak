import { db, auth } from "./firebase.js";
import { ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* ======================
   INIT DATA
====================== */
const roomCode = localStorage.getItem("roomCode");
const playerName = localStorage.getItem("playerName");
const role = localStorage.getItem("role");

if (!roomCode || !playerName) {
  window.location.href = "index.html";
}

const roomRef = ref(db, `rooms/${roomCode}`);

/* ======================
   DOM
====================== */
const board = document.getElementById("board");
const playersEl = document.getElementById("players");
const questionBox = document.getElementById("questionBox");
const questionText = document.getElementById("questionText");
const questionImage = document.getElementById("questionImage");
const answerBtn = document.getElementById("answerBtn");
const hostPanel = document.getElementById("hostPanel");

const answerBox = document.getElementById("answerBox");
const answerText = document.getElementById("answerText");

/* ======================
   QUESTION VIEW
====================== */
function showQuestion(q) {
  questionBox.hidden = false;
  questionText.textContent = q.question;

  if (q.type === "image" && q.image) {
    questionImage.src = q.image;
    questionImage.style.display = "block";
  } else {
    questionImage.style.display = "none";
    questionImage.src = "";
  }

  if (
    role === "host" ||      // ведущий всегда видит
    showAnswer === true     // либо все после завершения
  ) {
    answerText.textContent = q.options.join(", ");
    answerBox.hidden = false;
  } else {
    answerBox.hidden = true;
    answerText.textContent = "";
  }
}

function hideQuestion() {
  questionBox.hidden = true;
  questionText.textContent = "";
  questionImage.src = "";
  questionImage.style.display = "none";
  answerBox.hidden = true;
  answerText.textContent = "";
}

/* ======================
   OPEN QUESTION (HOST)
====================== */
async function openQuestion(question, cell, score, key) {
  cell.classList.add("used");
  cell.onclick = null;

  await update(roomRef, {
    currentQuestion: {
      ...question,
      score
    },
    answeringPlayer: null,
    [`usedQuestions/${key}`]: true
  });
}

/* ======================
   LOAD BOARD
====================== */
async function loadQuestions() {
  try {
    const [roomSnap, dataSnap] = await Promise.all([
      get(roomRef),
      fetch("data/questions.json").then(r => r.json())
    ]);

    const room = roomSnap.val() || {};
    const usedQuestions = room.usedQuestions || {};
    const themes = (dataSnap.themes || []).filter(t => t?.title);

    board.innerHTML = "";

    /* ===== THEMES ===== */
    const themeRow = document.createElement("div");
    themeRow.className = "row theme-row";

    themes.forEach(theme => {
      const cell = document.createElement("div");
      cell.className = "cell theme-cell";
      cell.textContent = theme.title;
      themeRow.appendChild(cell);
    });

    board.appendChild(themeRow);

    /* ===== QUESTIONS ===== */
    const maxRows = Math.max(...themes.map(t => t.questions?.length || 0));

    for (let i = 0; i < maxRows; i++) {
      const row = document.createElement("div");
      row.className = "row";

      themes.forEach(theme => {
        const q = theme.questions?.[i];
        const cell = document.createElement("div");
        cell.className = "cell score-cell";

        const score = (i + 1) * 100;
        const key = `${theme.title}_${score}`;

        cell.textContent = q ? score : "";

        if (usedQuestions[key]) {
          cell.classList.add("used");
        } else if (q && role === "host") {
          cell.onclick = () => openQuestion(q, cell, score, key);
        }

        row.appendChild(cell);
      });

      board.appendChild(row);
    }
  } catch (e) {
    console.error("Ошибка загрузки вопросов:", e);
  }
}

/* ======================
   INIT BOARD
====================== */
loadQuestions();

/* ======================
   AUTH & REALTIME
====================== */
auth.onAuthStateChanged(async user => {
  if (!user) return;

  const uid = user.uid;
  const playerRef = ref(db, `rooms/${roomCode}/players/${uid}`);

  const snap = await get(playerRef);
  const existingPlayer = snap.val();

  // Если игрок уже есть — НЕ ТРОГАЕМ score
  if (existingPlayer) {
    await update(playerRef, {
      name: playerName
    });
  } 
  // Если игрок новый — создаём с 0 баллов
  else {
    const player = { name: playerName };
    if (role === "player") player.score = 0;

    await update(playerRef, player);
  }

  /* ===== REALTIME LISTENER ===== */
  onValue(roomRef, snap => {
    const room = snap.val();
    if (!room) return;

    playersEl.innerHTML = "";
    const players = room.players || {};
    const hostId = room.host;

    const hasAnsweringPlayer = !!room.answeringPlayer;

    document.getElementById("plusBtn").style.display =
      role === "host" && hasAnsweringPlayer ? "inline-block" : "none";

    document.getElementById("minusBtn").style.display =
      role === "host" && hasAnsweringPlayer ? "inline-block" : "none";

    if (players[hostId]) {
      const li = document.createElement("li");
      li.textContent = `${players[hostId].name} (ведущий)`;
      li.style.fontWeight = "bold";
      playersEl.appendChild(li);
    }

    Object.entries(players).forEach(([id, p]) => {
      if (id === hostId) return;
      const li = document.createElement("li");
      li.textContent = `${p.name} — ${p.score ?? 0}`;

      if (room.answeringPlayer === id) {
        li.style.color = "#22c55e";
        li.style.fontWeight = "bold";
      }

      playersEl.appendChild(li);
    });

    room.currentQuestion ? showQuestion(room.currentQuestion) : hideQuestion();

    answerBtn.hidden = role !== "player";
    answerBtn.disabled =
      role !== "player" ||
      !room.currentQuestion ||
      !!room.answeringPlayer;

    hostPanel.hidden = role !== "host";
  });
});


/* ======================
   ANSWER BUTTON
====================== */
answerBtn.onclick = () => {
  if (!auth.currentUser) return;
  update(roomRef, { answeringPlayer: auth.currentUser.uid });
};

/* ======================
   SCORE CONTROL (HOST)
====================== */
async function changeScore(sign) {
  const snap = await get(roomRef);
  const room = snap.val();
  if (!room?.answeringPlayer) return;

  const uid = room.answeringPlayer;
  const current = room.players?.[uid]?.score || 0;
  const value = Number(prompt("Сколько баллов?"));

  if (isNaN(value)) return;

  await update(ref(db, `rooms/${roomCode}/players/${uid}`), {
    score: current + sign * value
  });

  await update(roomRef, {
    currentQuestion: null,
    answeringPlayer: null
  });
}

document.getElementById("plusBtn").onclick = () => changeScore(1);
document.getElementById("minusBtn").onclick = () => changeScore(-1);
