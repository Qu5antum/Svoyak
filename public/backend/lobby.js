import { db, auth } from "./firebase.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ===== проверка имени =====
const playerName = localStorage.getItem("playerName");

if (!playerName) {
  window.location.href = "index.html";
}

document.getElementById("playerName").textContent = playerName;

// ===== генерация кода =====
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ===== ждем инициализации auth =====
auth.onAuthStateChanged(user => {
  if (!user) return;
  const uid = user.uid;

  // ===== создать комнату =====
  document.getElementById("createRoomBtn").onclick = async () => {
    const roomCode = generateRoomCode();
    const roomRef = ref(db, "rooms/" + roomCode);

    await set(roomRef, {
      host: uid,
      status: "waiting",
      players: {
        [uid]: { name: playerName }
      }
    });

    localStorage.setItem("roomCode", roomCode);
    localStorage.setItem("role", "host");

    window.location.href = "room.html";
  };

  // ===== войти в комнату =====
  document.getElementById("joinRoomBtn").onclick = async () => {
    const code = document
      .getElementById("roomCodeInput")
      .value
      .trim()
      .toUpperCase();

    if (code.length !== 5) {
      alert("Код комнаты должен быть из 5 символов");
      return;
    }

    const roomRef = ref(db, "rooms/" + code);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      alert("Комната не найдена");
      return;
    }

    const room = snapshot.val();
    const playersCount = room.players ? Object.keys(room.players).length : 0;

    if (playersCount >= 4) {
      alert("Комната заполнена");
      return;
    }

    // добавляем игрока в комнату
    await set(ref(db, `rooms/${code}/players/${uid}`), { name: playerName });

    localStorage.setItem("roomCode", code);
    localStorage.setItem("role", "player");

    window.location.href = "room.html";
  };
});
