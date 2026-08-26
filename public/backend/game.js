import { db, auth } from "./firebase.js";
import {
  ref,
  onValue,
  update,
  get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const roomCode = localStorage.getItem("roomCode");
const playerName = localStorage.getItem("playerName");
const role = localStorage.getItem("role");

if (!roomCode || !playerName) {
  window.location.href = "index.html";
  throw new Error("Room code or player name is missing");
}

const roomRef = ref(db, `rooms/${roomCode}`);
const board = document.getElementById("board");
const playersEl = document.getElementById("players");
const questionBox = document.getElementById("questionBox");
const questionText = document.getElementById("questionText");
const questionImage = document.getElementById("questionImage");
const answerBtn = document.getElementById("answerBtn");
const hostPanel = document.getElementById("hostPanel");
const answerBox = document.getElementById("answerBox");
const answerText = document.getElementById("answerText");
const endBtn = document.getElementById("EndBtn");
const GameEndButton = document.getElementById("gameEndBtn");
const gameEndWrapper = document.getElementById("GameEndBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const plusBtn = document.getElementById("plusBtn");
const minusBtn = document.getElementById("minusBtn");
let lastThemes = null;
let lastQuestionId = null;
let selectedPlayerId = null;

// UTILS
function shuffle(array) {
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function shuffleThemes(themes) {
  return themes.map(theme => ({
    ...theme,
    questions: shuffle(theme.questions || [])
  }));
}

// QUESTION
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
}

function hideQuestion() {
  questionBox.hidden = true;
  questionText.textContent = "";
  questionImage.src = "";
  questionImage.style.display = "none";
  answerBox.hidden = true;
  answerText.textContent = "";
}

// OPEN QUESTION
async function openQuestion(question, cell, score, key) {
  cell.classList.add("used");
  cell.onclick = null;

  await update(roomRef, {
    currentQuestion: {
      ...question,
      score
    },

    answeringPlayer: null,
    blockedPlayers: null,
    showAnswer: false,

    [`usedQuestions/${key}`]: true
  });
}

// LOAD QUESTIONS
async function loadQuestions() {
  try {
    const [roomSnap, dataSnap] = await Promise.all([
      get(roomRef),
      fetch("data/questions.json").then(r => r.json())
    ]);

    let room = roomSnap.val() || {};
    const usedQuestions = room.usedQuestions || {};
    const allThemes = (dataSnap.themes || []).filter(t => t?.title);

    // SELECT THEMES
    if (role === "host" && !room.selectedThemes) {
      const selected = shuffle(allThemes).slice(0, 5);

      await update(roomRef, {
        selectedThemes: selected
      });

      room = {
        ...room,
        selectedThemes: selected
      };
    }
    const themes = room.selectedThemes || [];
    board.innerHTML = "";

    // THEMES ROW
    const themeRow = document.createElement("div");
    themeRow.className = "row theme-row";
    themes.forEach(theme => {
      const cell = document.createElement("div");
      cell.className = "cell theme-cell";
      cell.textContent = theme.title;
      themeRow.appendChild(cell);
    });

    board.appendChild(themeRow);

    // QUESTIONS
    const maxRows = Math.max(
      ...themes.map(t => t.questions?.length || 0)
    );


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
        }
        else if (q && role === "host") {
          cell.onclick = () => {
            openQuestion(
              q,
              cell,
              score,
              key
            );
          };
        }
        row.appendChild(cell);
      });
      board.appendChild(row);
    }
  } catch (e) {
    console.error("Ошибка загрузки вопросов:", e);
  }
}

loadQuestions();

// AUTH / PLAYER
auth.onAuthStateChanged(async user => {
  if (!user) return;
  const uid = user.uid;

  const playerRef = ref(
    db,
    `rooms/${roomCode}/players/${uid}`
  );

  const snap = await get(playerRef);
  const existingPlayer = snap.val();

  // Игрок уже существует
  // Не изменяем его score
  if (existingPlayer) {
    await update(playerRef, {
      name: playerName
    });
  }

  // Новый игрок
  else {
    const player = {
      name: playerName
    };

    if (role === "player") {
      player.score = 0;
    }

    await update(playerRef, player);
  }
});

// REALTIME LISTENER
onValue(roomRef, snap => {
  const room = snap.val();
  if (!room) return;

  // GAME END
  if (room.gameEnded) {
    window.location.href = "end_game.html";
    return;
  }

  // THEMES CHANGED
  if (
    JSON.stringify(room.selectedThemes) !==
    JSON.stringify(lastThemes)
  ) {
    lastThemes = room.selectedThemes;
    loadQuestions();
  }

  // CURRENT QUESTION
  const currentQId =
    room.currentQuestion?.id || null;

  if (currentQId !== lastQuestionId) {
    lastQuestionId = currentQId;

    if (room.currentQuestion) {
      showQuestion(room.currentQuestion);
    }

    else {
      hideQuestion();
    }
  }

  // QUESTION SELECTION
  const selection = document.getElementById("questionSelection");

  if (selection) {
    selection.style.display =
      room.currentQuestion
        ? "none"
        : "block";
  }

  // HOST CONTROLS
  gameEndWrapper.hidden = !(role === "host" && !room.gameEnded);
  document.getElementById("hostEnd").hidden = role !== "host" || !room.currentQuestion;
  hostPanel.hidden = role !== "host";

  // PLAYERS
  playersEl.innerHTML = "";
  const players = room.players || {};
  const hostId = room.host;
  const hasAnsweringPlayer = !!room.answeringPlayer;

  // PLUS / MINUS VISIBILITY
  // Теперь кнопки показываются,
  // если ведущий выбрал игрока.
  // НЕ зависит от answeringPlayer.
  if (role === "host" && selectedPlayerId) {
    plusBtn.style.display = "inline-block";
    minusBtn.style.display = "inline-block";

  }

  else {
    plusBtn.style.display = "none";
    minusBtn.style.display = "none";
  }

  // HOST
  if (players[hostId]) {
    const li = document.createElement("li");
    li.textContent = `${players[hostId].name} (Ведущий)`;
    li.style.fontWeight = "bold";
    playersEl.appendChild(li);
  }

  // PLAYERS
  Object.entries(players).forEach(([id, p]) => {
    if (id === hostId) return;
    const li = document.createElement("li");
    li.textContent = `${p.name}: ${p.score ?? 0} баллов`;

    // Игрок отвечает на вопрос
    if (room.answeringPlayer === id) {
      li.style.color = "#22c55e";
      li.style.fontWeight = "bold";
    }

    // Игрок выбран ведущим
    if (
      role === "host" &&
      selectedPlayerId === id
    ) {
      li.style.backgroundColor = "#3b82f6";
      li.style.color = "white";
      li.style.fontWeight = "bold";
      li.style.cursor = "pointer";
    }

    // Клик по игроку
    if (role === "host") {
      li.style.cursor = "pointer";
      li.onclick = () => {
        selectedPlayerId = id;
        // Перерисовываем список,
        // чтобы выбранный игрок подсветился
        renderPlayers(room);
      };
    }

    playersEl.appendChild(li);
  });

  // ANSWER
  if (
    room.currentQuestion &&
    (
      role === "host" ||
      room.showAnswer === true
    )
  ) {
    answerBox.hidden = false;
    answerText.textContent = room.currentQuestion.options.join(", ");
  }

  else {
    answerBox.hidden = true;
    answerText.textContent = "";
  }

  // BLOCKED PLAYERS
  const blocked = room.blockedPlayers || {};

  // ANSWER BUTTON
  answerBtn.hidden =
    role !== "player";
  answerBtn.disabled =
    role !== "player" ||
    !room.currentQuestion ||
    !!room.answeringPlayer ||
    room.showAnswer === true ||
    blocked[auth.currentUser?.uid];
});

// RENDER PLAYERS
// Нужен отдельный render,
// чтобы при клике по игроку
// сразу обновлять его подсветку.
function renderPlayers(room) {
  playersEl.innerHTML = "";
  const players = room.players || {};
  const hostId = room.host;

  // HOST
  if (players[hostId]) {
    const li = document.createElement("li");
    li.textContent = `${players[hostId].name} (Ведущий)`;
    li.style.fontWeight = "bold";
    playersEl.appendChild(li);
  }

  // PLAYERS
  Object.entries(players).forEach(([id, p]) => {
    if (id === hostId) return;
    const li = document.createElement("li");
    li.textContent = `${p.name}: ${p.score ?? 0} баллов`;

    // Игрок отвечает
    if (room.answeringPlayer === id) {
      li.style.color = "#22c55e";
      li.style.fontWeight = "bold";
    }

    // Игрок выбран для изменения счёта
    if (
      role === "host" &&
      selectedPlayerId === id
    ) {
      li.style.backgroundColor = "#3b82f6";
      li.style.color = "white";
      li.style.fontWeight = "bold";
    }


    if (role === "host") {
      li.style.cursor = "pointer";
      li.onclick = () => {

        // Повторный клик по уже выбранному игроку
        // снимает выбор
        if (selectedPlayerId === id) {
          selectedPlayerId = null;
          plusBtn.style.display = "none";
          minusBtn.style.display = "none";

        } else {
          // Выбираем игрока
          selectedPlayerId = id;
          plusBtn.style.display = "inline-block";
          minusBtn.style.display = "inline-block";
        }
        renderPlayers(room);
      };
    }
    playersEl.appendChild(li);
  });
}


// ANSWER BUTTON
answerBtn.onclick = async () => {
  if (!auth.currentUser) return;
  await update(roomRef, {
    answeringPlayer:
      auth.currentUser.uid
  });
};

// Эта функция полностью независима
// от answeringPlayer.
// Вопрос НЕ закрывается.
// blockedPlayers НЕ изменяется.
// currentQuestion НЕ изменяется.
async function changeSelectedPlayerScore(sign) {
  if (role !== "host") return;

  if (!selectedPlayerId) {
    alert("Сначала выберите игрока");
    return;
  }

  const value = Number(prompt("Сколько баллов?"));

  if (
    isNaN(value) ||
    value <= 0
  ) {
    return;
  }

  const playerRef = ref(
    db,
    `rooms/${roomCode}/players/${selectedPlayerId}`
  );

  const snap = await get(playerRef);
  const player = snap.val();

  if (!player) {
    selectedPlayerId = null;

    plusBtn.style.display = "none";
    minusBtn.style.display = "none";

    return;
  }

  const currentScore = Number(player.score || 0);
  const newScore = currentScore + sign * value;

  // Добавляем изменения игрока
  await update(playerRef, {
    score: newScore
  });

  // Если ведущий СНЯЛ баллы
  if (sign === -1) {
    await update(roomRef, {
      // Игрок больше не отвечает
      answeringPlayer: null,

      // Блокируем этого игрока
      [`blockedPlayers/${selectedPlayerId}`]: true
    });
  }
}


// PLUS / MINUS

plusBtn.onclick = () => {
  changeSelectedPlayerScore(1);
};


minusBtn.onclick = () => {
  changeSelectedPlayerScore(-1);
};

// SHOW ANSWER
endBtn.onclick = async () => {
  await update(roomRef, {
    showAnswer: true,
    answeringPlayer: null,
    blockedPlayers: null
  });
};
// END GAME
GameEndButton.onclick = async () => {
  await update(roomRef, {
    gameEnded: true
  });
};

// SHUFFLE
if (shuffleBtn) {
  shuffleBtn.onclick = async () => {
    if (role !== "host") return;
    try {
      const data = await fetch("data/questions.json").then(r => r.json());
      const allThemes = (data.themes || []).filter(t => t?.title);
      const shuffledThemes = shuffle(allThemes);
      const selected = shuffledThemes.slice(0, 5);
      const finalThemes = shuffleThemes(selected);
      await update(roomRef, {
        selectedThemes: finalThemes,
        usedQuestions: null,
        currentQuestion: null,
        answeringPlayer: null,
        blockedPlayers: null,
        showAnswer: false
      });
      selectedPlayerId = null;
      plusBtn.style.display = "none";
      minusBtn.style.display = "none";
      await loadQuestions();
    }
    catch (e) {
      console.error(
        "Ошибка shuffle:",
        e
      );
    }
  };
}