import { db, auth } from "./firebase.js";
import {
  ref,
  onValue,
  remove,
  update,
  set
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ===== данные =====
const roomCode = localStorage.getItem("roomCode");
const playerName = localStorage.getItem("playerName");
const role = localStorage.getItem("role");

if (!roomCode || !playerName) {
  window.location.href = "index.html";
}

document.getElementById("roomCode").textContent = roomCode;
document.getElementById("playerName").textContent = playerName;

const playersList = document.getElementById("playersList");
const startBtn = document.getElementById("startGameBtn");
const outBtn = document.getElementById("OutButton")
const statusText = document.getElementById("statusText");

const roomRef = ref(db, "rooms/" + roomCode);

// ===== ждем инициализации auth =====
auth.onAuthStateChanged(async user => {
  if (!user) return;
  const uid = user.uid;

  // ===== добавляем игрока в комнату =====
  if (role === "player") {
    await set(ref(db, `rooms/${roomCode}/players/${uid}`), {
      name: playerName
    });
  }

  // ===== realtime слушатель комнаты =====
  onValue(roomRef, snapshot => {
    if (!snapshot.exists()) {
      alert("Комната была закрыта");
      window.location.href = "lobby.html";
      return;
    }

    const room = snapshot.val();
    const players = room.players || {};
    const hostId = room.host;

    // очищаем список
    playersList.innerHTML = "";

    // ===== сначала ведущий =====
    if (players[hostId]) {
      const liHost = document.createElement("li");
      liHost.textContent = players[hostId].name + " (ведущий)";
      liHost.style.fontWeight = "bold";
      playersList.appendChild(liHost);
    }

    // ===== остальные игроки =====
    Object.keys(players).forEach(id => {
      if (id === hostId) return; // ведущий уже добавлен
      const li = document.createElement("li");
      li.textContent = players[id].name;
      playersList.appendChild(li);
    });

    statusText.textContent = `Игроков: ${Object.keys(players).length} / 4`;

    // кнопка старта только у ведущего
    if (uid === hostId && Object.keys(players).length >= 2) {
      startBtn.style.display = "block";
    } else {
      startBtn.style.display = "none";
    }

    // если игра началась
    if (room.status === "started") {
      window.location.href = "game.html";
    }
  });

  // ===== старт игры (только ведущий) =====
  startBtn.onclick = async () => {
    await update(roomRef, { status: "started" });
  };
  
  outBtn.onclick = async() => {
    window.location.href = "lobby.html"
  }

  // ===== уход игрока =====
  window.addEventListener("beforeunload", () => {
    remove(ref(db, `rooms/${roomCode}/players/${uid}`));
  });
});
