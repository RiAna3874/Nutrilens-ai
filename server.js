import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.get("/", (req, res) => {
  const publicIndex = path.join(__dirname, "public", "index.html");
  const rootIndex = path.join(__dirname, "index.html");

  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }

  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }

  return res.status(500).send("index.html not found.");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "NutriLens AI is running"
  });
});

app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    const description = req.body.description || "";
    const portion = Number(req.body.portion || 100);

    if (!description.trim() && !req.file) {
      return res.status(400).json({
        error: "Please upload an image or describe the food."
      });
    }

    const localResult = localAnalyze(description, portion);

    if (localResult) {
      return res.json(localResult);
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        food: description || "Unknown food",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        explanation: "AI is inactive and this food is not in the local database."
      });
    }

    const parts = [];

    if (req.file) {
      parts.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString("base64")
        }
      });
    }

    parts.push({
      text: `
Analyze this meal.

Description: ${description}
Portion: ${portion} grams

Return only JSON:
{
  "food": "string",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "explanation": "string"
}
`
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const parsed = JSON.parse(response.text.trim());

    return res.json({
      food: parsed.food || "Unknown food",
      calories: cleanNumber(parsed.calories),
      protein: cleanNumber(parsed.protein),
      carbs: cleanNumber(parsed.carbs),
      fat: cleanNumber(parsed.fat),
      explanation: parsed.explanation || "Estimated using AI."
    });
  } catch (error) {
    console.error(error);

    return res.json({
      food: req.body.description || "Unknown food",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      explanation: "AI failed or quota was exceeded. Local fallback did not find this food."
    });
  }
});

function localAnalyze(description, portion) {
  const foods = {
    rice: { food: "Cooked white rice", calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
    egg: { food: "Boiled egg", calories: 155, protein: 13, carbs: 1.1, fat: 11 },
    chicken: { food: "Cooked chicken", calories: 190, protein: 27, carbs: 0, fat: 8 },
    fish: { food: "Cooked fish", calories: 140, protein: 22, carbs: 0, fat: 5 },
    dal: { food: "Cooked lentils / dal", calories: 116, protein: 9, carbs: 20, fat: 0.4 },
    banana: { food: "Banana", calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
    apple: { food: "Apple", calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
    potato: { food: "Boiled potato", calories: 87, protein: 1.9, carbs: 20, fat: 0.1 },
    bread: { food: "Bread", calories: 265, protein: 9, carbs: 49, fat: 3.2 },
    roti: { food: "Roti / chapati", calories: 297, protein: 9.6, carbs: 46, fat: 7.5 },
    vegetable: { food: "Mixed vegetables", calories: 65, protein: 2.5, carbs: 12, fat: 1 }
  };

  const text = String(description || "").toLowerCase();
  const matched = Object.keys(foods).filter((key) => text.includes(key));

  if (matched.length === 0) return null;

  const multiplier = portion / 100;

  let total = {
    food: [],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };

  matched.forEach((key) => {
    const item = foods[key];
    total.food.push(item.food);
    total.calories += item.calories * multiplier;
    total.protein += item.protein * multiplier;
    total.carbs += item.carbs * multiplier;
    total.fat += item.fat * multiplier;
  });

  return {
    food: total.food.join(" + "),
    calories: cleanNumber(total.calories),
    protein: cleanNumber(total.protein),
    carbs: cleanNumber(total.carbs),
    fat: cleanNumber(total.fat),
    explanation: "Estimated using the built-in local nutrition database. AI was not needed."
  };
}

function cleanNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 10) / 10;
}

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found."
  });
});

app.listen(PORT, () => {
  console.log(`NutriLens AI running on port ${PORT}`);
});