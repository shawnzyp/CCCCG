import { formatVertexAIError } from "../scripts/wizard_helpers.js";

describe("formatVertexAIError", () => {
  test("handles vertexAI/api-not-enabled code", () => {
    const err = { code: "vertexAI/api-not-enabled", message: "api not enabled" };
    expect(formatVertexAIError(err)).toBe(
      "There was an error talking to the tower. The Firebase Vertex AI API is not enabled. Enable it in the Firebase console's Vertex AI section."
    );
  });

  test("handles generic errors", () => {
    const err = { message: "unknown" };
    expect(formatVertexAIError(err)).toBe(
      "There was an error talking to the tower: unknown"
    );
  });
});
