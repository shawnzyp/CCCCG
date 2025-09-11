import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getVertexAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-vertexai.js";

// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};

const firebaseApp = initializeApp(firebaseConfig);
const vertexAI = getVertexAI(firebaseApp);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-image-preview",
  generationConfig: {
    responseMimeTypes: ["text/plain", "image/png"],
  },
});

async function sendPrompt() {
  const input = document.getElementById("wizard-input");
  const text = input.value.trim();
  if (!text) return;

  try {
    appendMessage("You", text);
    input.value = "";

    const result = await model.generateContent(text);
    const parts = result.response?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        appendMessage("Wizard", part.text);
      } else if (part.inlineData) {
        appendImage(part.inlineData);
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
  const input = document.getElementById("wizard-input");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendPrompt();
    });
  }
}

function appendImage(data) {
  const chat = document.getElementById("wizard-chat");
  const div = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = "Wizard:";
  div.appendChild(strong);
  const img = document.createElement("img");
  img.src = `data:${data.mimeType};base64,${data.data}`;
  img.alt = "Wizard response image";
  div.appendChild(img);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
