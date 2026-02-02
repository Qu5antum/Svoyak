import { get, ref } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { db } from "./firebase.js";

const roomCode = localStorage.getItem("roomCode");
const podium = document.getElementById("podium");
const backBtn = document.getElementById("backBtn");

const roomRef = ref(db, `rooms/${roomCode}`);

const snap = await get(roomRef);
const room = snap.val();

if (!room?.players) {
  podium.innerHTML = "<p>Нет данных</p>";
} else {
  const players = Object.values(room.players)
    .filter(player => typeof player.score === "number")
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const places = ["first", "second", "third"];
  const medals = ["🥇", "🥈", "🥉"];

  players.forEach((player, index) => {
    const div = document.createElement("div");
    div.className = `place ${places[index]}`;
    div.style.animationDelay = `${index * 0.15}s`;

    div.innerHTML = `
      <h2>${medals[index]} ${index + 1} место</h2>
      <p>${player.name}</p>
      <span>${player.score} баллов</span>
    `;

    podium.appendChild(div);
  });
}

backBtn.onclick = () => {
  window.location.href = "lobby.html";
};
