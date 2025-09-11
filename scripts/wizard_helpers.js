export function formatVertexAIError(e) {
  const base = "There was an error talking to the tower";
  if (e && e.code === "vertexAI/api-not-enabled") {
    return (
      base +
      ". The Firebase Vertex AI API is not enabled. Enable it in the Firebase console's Vertex AI section."
    );
  }
  if (e && e.message) {
    return `${base}: ${e.message}`;
  }
  return base + ".";
}
