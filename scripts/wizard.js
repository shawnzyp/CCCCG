import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getVertexAI, getGenerativeModel } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-vertexai.js";

// Firebase project configuration for Vertex AI access
// NOTE: Do not expose the API key publicly in production.
const firebaseConfig = {
  apiKey: "AIzaSyA3DZNONr73L62eERENpVOnujzyxhoiydY",
  authDomain: "ccccg-7d6b6.firebaseapp.com",
  projectId: "ccccg-7d6b6",
  // Example app ID using the provided project number
  appId: "1:705656976850:web:placeholder",
};

const firebaseApp = initializeApp(firebaseConfig);
// Explicitly set the region used for Vertex AI requests
const vertexAI = getVertexAI(firebaseApp, { location: "us-central1" });
const model = getGenerativeModel(vertexAI, {
  model: "gemini-1.5-flash",
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

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text }] }],
    });
    const parts = result.response?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        appendMessage("Wizard", part.text);
      } else if (part.inlineData) {
        appendImage(part.inlineData);
      }
    }
  } catch (e) {
    console.error("Wizard error:", e);
    appendMessage("Wizard", `There was an error talking to the tower: ${e.message}`);
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
