import { db, auth } from "./firebase.js";
import { ref, onValue, remove, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
const outBtn = document.getElementById("OutButton");
const statusText = document.getElementById("statusText");

const roomRef = ref(db, "rooms/" + roomCode);

// ===== ждем инициализации auth =====
auth.onAuthStateChanged(async user => {
  if (!user) return;
  const uid = user.uid;

  // ===== добавляем игрока или ведущего в комнату =====
  const playerData = { name: playerName };
  if (role === "player") {
    playerData.score = 0;
  }
  await set(ref(db, `rooms/${roomCode}/players/${uid}`), playerData);


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
    liHost.textContent = `${players[hostId].name} (ведущий)`; // без баллов
    liHost.style.fontWeight = "bold";
    playersList.appendChild(liHost);
  }

  // ===== остальные игроки =====
  Object.entries(players).forEach(([id, p]) => {
    if (id === hostId) return;
    const li = document.createElement("li");
    li.textContent = `${p.name || "Игрок"} — ${p.score || 0}`;
    playersList.appendChild(li);
  });


    // ===== статус комнаты =====
    statusText.textContent = `Игроков: ${Object.keys(players).length} / 4`;

    // кнопка старта только у ведущего и если игроков >= 2
    startBtn.style.display = (uid === hostId && Object.keys(players).length >= 2) ? "block" : "none";

    // если игра началась
    if (room.status === "started") {
      window.location.href = "game.html";
    }
  });

  // ===== старт игры (только ведущий) =====
  startBtn.onclick = async () => {
    await update(roomRef, { status: "started" });
  };

  // ===== уход игрока =====
  outBtn.onclick = async () => {
    await remove(ref(db, `rooms/${roomCode}/players/${uid}`));
    window.location.href = "lobby.html";
  };

  // ===== уход при закрытии вкладки =====
  window.addEventListener("beforeunload", async () => {
    await remove(ref(db, `rooms/${roomCode}/players/${uid}`));
  });
});
