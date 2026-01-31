import { auth } from "./firebase.js";
import { signInAnonymously } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const input = document.getElementById("nameInput");
const btn = document.getElementById("startBtn");

// если имя уже есть — сразу в лобби
const savedName = localStorage.getItem("playerName");
if (savedName) {
  window.location.href = "lobby.html";
}

btn.addEventListener("click", async () => {
  const name = input.value.trim();

  if (name.length < 5 && name.length > 15) {
    alert("Имя должно быть минимум 5 символа и максимум 14 символов");
    return;
  }

  try {
    
    await signInAnonymously(auth);

    localStorage.setItem("playerName", name);

    window.location.href = "lobby.html";

  } catch (err) {
    alert("Ошибка входа");
    console.error(err);
  }
});
