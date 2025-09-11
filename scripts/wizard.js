import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAI, GoogleAIBackend, getLiveGenerativeModel, ResponseModality } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-ai.js";

// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};

const firebaseApp = initializeApp(firebaseConfig);
const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
const model = getLiveGenerativeModel(ai, {
  model: "gemini-2.0-flash-live-preview-04-09",
  generationConfig: { responseModalities: [ResponseModality.TEXT] },
});

async function sendPrompt() {
  const input = document.getElementById("wizard-input");
  const text = input.value.trim();
  if (!text) return;

  try {
    appendMessage("You", text);
    input.value = "";

    const session = await model.connect();
    session.send(text);

    const chat = document.getElementById("wizard-chat");
    const span = appendMessage("Wizard", "");
    let response = "";
    const messages = session.receive();
    for await (const message of messages) {
      if (message.type === "serverContent") {
        const parts = message.modelTurn?.parts;
        if (parts) {
          response += parts.map((part) => part.text).join("");
          span.textContent = response;
          chat.scrollTop = chat.scrollHeight;
        }
      }
    }
  } catch (e) {
    appendMessage("Wizard", "There was an error talking to the tower.");
  }
}

function appendMessage(speaker, message) {
  const chat = document.getElementById("wizard-chat");
  const div = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = `${speaker}:`;
  div.appendChild(strong);
  const span = document.createElement("span");
  span.textContent = ` ${message}`;
  div.appendChild(span);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return span;
}

const btn = document.getElementById("wizard-send");
if (btn) {
  btn.addEventListener("click", sendPrompt);
}
