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
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }

    cb(null, true);
  }
});

const foods = {
  rice: {
    food: "Cooked white rice",
    calories: 130,
    protein: 2.7,
    carbs: 28.2,
    fat: 0.3
  },
  chicken: {
    food: "Cooked chicken",
    calories: 190,
    protein: 27,
    carbs: 0,
    fat: 8
  },
  egg: {
    food: "Boiled egg",
    calories: 155,
    protein: 13,
    carbs: 1.1,
    fat: 11,
    gramsPerUnit: 50
  },
  fish: {
    food: "Cooked fish",
    calories: 140,
    protein: 22,
    carbs: 0,
    fat: 5
  },
  dal: {
    food: "Cooked lentils / dal",
    calories: 116,
    protein: 9,
    carbs: 20,
    fat: 0.4
  },
  daal: {
    food: "Cooked lentils / dal",
    calories: 116,
    protein: 9,
    carbs: 20,
    fat: 0.4
  },
  lentil: {
    food: "Cooked lentils / dal",
    calories: 116,
    protein: 9,
    carbs: 20,
    fat: 0.4
  },
  banana: {
    food: "Banana",
    calories: 89,
    protein: 1.1,
    carbs: 22.8,
    fat: 0.3,
    gramsPerUnit: 118
  },
  apple: {
    food: "Apple",
    calories: 52,
    protein: 0.3,
    carbs: 13.8,
    fat: 0.2,
    gramsPerUnit: 182
  },
  potato: {
    food: "Boiled potato",
    calories: 87,
    protein: 1.9,
    carbs: 20,
    fat: 0.1
  },
  bread: {
    food: "Bread",
    calories: 265,
    protein: 9,
    carbs: 49,
    fat: 3.2,
    gramsPerUnit: 25
  },
  roti: {
    food: "Roti / chapati",
    calories: 297,
    protein: 9.6,
    carbs: 46,
    fat: 7.5,
    gramsPerUnit: 40
  },
  chapati: {
    food: "Roti / chapati",
    calories: 297,
    protein: 9.6,
    carbs: 46,
    fat: 7.5,
    gramsPerUnit: 40
  },
  vegetable: {
    food: "Mixed vegetables",
    calories: 65,
    protein: 2.5,
    carbs: 12,
    fat: 1
  },
  vegetables: {
    food: "Mixed vegetables",
    calories: 65,
    protein: 2.5,
    carbs: 12,
    fat: 1
  },
  beef: {
    food: "Cooked beef",
    calories: 250,
    protein: 26,
    carbs: 0,
    fat: 15
  },
  salmon: {
    food: "Cooked salmon",
    calories: 208,
    protein: 20,
    carbs: 0,
    fat: 13
  }
};

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
    const defaultPortion = cleanNumber(req.body.portion || 100);
    const imageFile = req.file;

    if (!description.trim() && !imageFile) {
      return res.status(400).json({
        error: "Please upload an image or describe the food."
      });
    }

    const localResult = analyzeLocally(description, defaultPortion);

    if (localResult.found) {
      return res.json(localResult.result);
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        food: description || "Unknown food",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        explanation:
          "AI is inactive and this food was not found in the local database."
      });
    }

    try {
      const aiResult = await analyzeWithGemini(description, defaultPortion, imageFile);
      return res.json(aiResult);
    } catch (error) {
      console.error("Gemini error:", error);

      return res.json({
        food: description || "Unknown food",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        explanation:
          "AI was unavailable or quota-limited, and this food was not found in the local database."
      });
    }
  } catch (error) {
    console.error("Analyze error:", error);

    return res.status(500).json({
      error: "Something went wrong while analyzing the meal."
    });
  }
});

async function analyzeWithGemini(description, portion, imageFile) {
  const parts = [];

  if (imageFile) {
    parts.push({
      inlineData: {
        mimeType: imageFile.mimetype,
        data: imageFile.buffer.toString("base64")
      }
    });
  }

  parts.push({
    text: `
Analyze this meal.

Description: ${description || "No description"}
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

  return {
    food: parsed.food || "Unknown food",
    calories: cleanNumber(parsed.calories),
    protein: cleanNumber(parsed.protein),
    carbs: cleanNumber(parsed.carbs),
    fat: cleanNumber(parsed.fat),
    explanation: parsed.explanation || "Estimated using AI."
  };
}

function analyzeLocally(description, defaultPortion) {
  const text = normalizeText(description);
  const matches = findFoodMatches(text);

  if (matches.length === 0) {
    return {
      found: false,
      result: null
    };
  }

  const total = {
    foods: [],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };

  matches.forEach((match) => {
    const item = foods[match.key];
    const amountInGrams = detectAmountForFood(text, match.key, item, defaultPortion);
    const multiplier = amountInGrams / 100;

    total.foods.push(`${item.food} (${amountInGrams}g)`);
    total.calories += item.calories * multiplier;
    total.protein += item.protein * multiplier;
    total.carbs += item.carbs * multiplier;
    total.fat += item.fat * multiplier;
  });

  return {
    found: true,
    result: {
      food: total.foods.join(" + "),
      calories: cleanNumber(total.calories),
      protein: cleanNumber(total.protein),
      carbs: cleanNumber(total.carbs),
      fat: cleanNumber(total.fat),
      explanation:
        "Estimated using the built-in local nutrition database with item-specific portion parsing. AI was not needed."
    }
  };
}

function findFoodMatches(text) {
  const matches = [];

  Object.keys(foods).forEach((key) => {
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");

    if (pattern.test(text)) {
      const index = text.search(pattern);

      matches.push({
        key,
        index
      });
    }
  });

  return matches.sort((a, b) => a.index - b.index);
}

function detectAmountForFood(text, foodKey, item, defaultPortion) {
  const escapedFood = escapeRegExp(foodKey);

  const patterns = [
    new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\s*g\\b`, "i"),
    new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\s*gram\\b`, "i"),
    new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\s*grams\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*g\\s*\\b${escapedFood}\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*gram\\s*\\b${escapedFood}\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*grams\\s*\\b${escapedFood}\\b`, "i")
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return cleanNumber(match[1]);
    }
  }

  const unitPatterns = [
    new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*\\b${escapedFood}\\b`, "i")
  ];

  if (item.gramsPerUnit) {
    for (const pattern of unitPatterns) {
      const match = text.match(pattern);

      if (match) {
        return cleanNumber(Number(match[1]) * item.gramsPerUnit);
      }
    }
  }

  return defaultPortion || 100;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\+/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

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