import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to analyze battle and decree a winner
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const { contenders, terrain, question, language } = req.body;

      if (!contenders || !Array.isArray(contenders) || contenders.length < 2) {
        return res.status(400).json({ error: "At least two contenders are required for analysis." });
      }

      // Check if API Key is configured
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY non è configurata nell'ambiente. Configurala in Settings > Secrets." 
        });
      }

      // Format battle context
      let context = `QUESTION/SCENARIO:\n"${question}"\n\n`;

      if (terrain) {
        context += `TERRAIN OF THE BATTLE:\n- Name: ${terrain.title}\n- Description: ${terrain.description}\n\n`;
      }

      context += "CONTENDERS:\n";
      contenders.forEach((c: any) => {
        context += `- ID: ${c.id}\n  Name: ${c.title}\n  Description: ${c.description}\n`;
        if (c.equipment && c.equipment.length > 0) {
          context += `  Equipment:\n`;
          c.equipment.forEach((eq: any) => {
            context += `    * ${eq.title}: ${eq.description}\n`;
          });
        }
        if (c.notes) {
          context += `  Strategy/Notes: ${c.notes}\n`;
        }
        context += "\n";
      });

      const languageInstruction = language === "it" 
        ? "La motivazione deve essere scritta in ITALIANO ed essere esattamente lunga 2 righe (circa due frasi concise, divertenti e convincenti)."
        : "La motivazione deve essere scritta in OGNI CASO in INGLESE ed essere esattamente lunga 2 righe (approximatively two concise, witty and convincing sentences).";

      const prompt = `Sei un arbitro supremo e narratore ironico di incontri di combattimento ipotetici (VS Battle).
Analizza lo scenario di scontro e i contendenti (con i loro rispettivi equipaggiamenti e terreni, se presenti).
Decidi chi vince in base alle loro descrizioni, caratteristiche reali (o della cultura pop) e vantaggi tattici.
Devi decretare un vincitore assoluto restituendo il suo ID e spiegando in modo ironico e logico perché sconfigge gli avversari.

${languageInstruction}

Ecco i dati del combattimento da analizzare:
${context}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              winnerId: {
                type: Type.STRING,
                description: "The ID of the winning contender (e.g. '1' or '2'). Must match one of the contenders IDs exactly.",
              },
              motivation: {
                type: Type.STRING,
                description: "A perfect 2-line witty explanation in the chosen language justifying why they won.",
              }
            },
            required: ["winnerId", "motivation"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response text received from Gemini.");
      }

      const result = JSON.parse(text);
      res.json(result);
    } catch (err: any) {
      console.error("Gemini analysis error:", err);
      res.status(500).json({ error: err.message || "Failed to analyze fight" });
    }
  });

  // Vite middleware setup for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
