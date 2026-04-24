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

const publicPath = path.join(__dirname, "public");

app.use(cors());
app.use(express.static(publicPath));

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

const nutritionDatabase = [
  {
    keywords: ["rice", "white rice", "bhat"],
    food: "Cooked white rice",
    calories: 130,
    protein: 2.7,
    carbs: 28.2,
    fat: 0.3
  },
  {
    keywords: ["brown rice"],
    food: "Cooked brown rice",
    calories: 112,
    protein: 2.6,
    carbs: 23.5,
    fat: 0.9
  },
  {
    keywords: ["chicken breast", "grilled chicken"],
    food: "Cooked chicken breast",
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6
  },
  {
    keywords: ["chicken curry"],
    food: "Chicken curry",
    calories: 190,
    protein: 16,
    carbs: 5,
    fat: 12
  },
  {
    keywords: ["chicken"],
    food: "Cooked chicken",
    calories: 190,
    protein: 27,
    carbs: 0,
    fat: 8
  },
  {
    keywords: ["egg", "boiled egg"],
    food: "Boiled egg",
    calories: 155,
    protein: 13,
    carbs: 1.1,
    fat: 11
  },
  {
    keywords: ["salmon"],
    food: "Cooked salmon",
    calories: 208,
    protein: 20,
    carbs: 0,
    fat: 13
  },
  {
    keywords: ["lentil", "dal", "daal"],
    food: "Cooked lentils / dal",
    calories: 116,
    protein: 9,
    carbs: 20,
    fat: 0.4
  },
  {
    keywords: ["potato"],
    food: "Boiled potato",
    calories: 87,
    protein: 1.9,
    carbs: 20,
    fat: 0.1
  },
  {
    keywords: ["banana"],
    food: "Banana",
    calories: 89,
    protein: 1.1,
    carbs: 22.8,
    fat: 0.3
  },
  {
    keywords: ["apple"],
    food: "Apple",
    calories: 52,
    protein: 0.3,
    carbs: 13.8,
    fat: 0.2
  },
  {
    keywords: ["bread"],
    food: "Bread",
    calories: 265,
    protein: 9,
    carbs: 49,
    fat: 3.2
  },
  {
    keywords: ["roti", "chapati"],
    food: "Roti / chapati",
    calories: 297,
    protein: 9.6,
    carbs: 46,
    fat: 7.5
  },
  {
    keywords: ["fish"],
    food: "Cooked fish",
    calories: 140,
    protein: 22,
    carbs: 0,
    fat: 5
  },
  {
    keywords: ["vegetable", "vegetables"],
    food: "Mixed vegetables",
    calories: 65,
    protein: 2.5,
    carbs: 12,
    fat: 1
  }
];

app.get("/", (req, res) => {
  const indexPath = path.join(publicPath, "index.html");

  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  return res.status(500).send("index.html not found inside public folder.");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "NutriLens AI backend is running"
  });
});

app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    const description = req.body.description || "";
    const portion = req.body.portion || "100";
    const imageFile = req.file;

    if (!imageFile && !description.trim()) {
      return res.status(400).json({
        error: "Please upload a food image or describe the food."
      });
    }

    const localResult = analyzeWithLocalDatabase(description, portion);

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
      const geminiResult = await analyzeWithGemini(description, portion, imageFile);
      return res.json(geminiResult);
    } catch (error) {
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
    contents: [
      {
        role: "user",
        parts
      }
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const parsed = JSON.parse(response.text.trim());

  return {
    food: String(parsed.food || "Unknown food"),
    calories: cleanNumber(parsed.calories),
    protein: cleanNumber(parsed.protein),
    carbs: cleanNumber(parsed.carbs),
    fat: cleanNumber(parsed.fat),
    explanation: String(parsed.explanation || "Estimated using AI.")
  };
}

function analyzeWithLocalDatabase(description, portion) {
  const text = String(description || "").toLowerCase();
  const portionNumber = cleanNumber(portion) || 100;
  const multiplier = portionNumber / 100;

  const matches = nutritionDatabase.filter((item) =>
    item.keywords.some((keyword) => text.includes(keyword))
  );

  if (matches.length === 0) {
    return {
      found: false,
      result: null
    };
  }

  const total = matches.reduce(
    (sum, item) => {
      sum.calories += item.calories * multiplier;
      sum.protein += item.protein * multiplier;
      sum.carbs += item.carbs * multiplier;
      sum.fat += item.fat * multiplier;
      sum.foods.push(item.food);
      return sum;
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      foods: []
    }
  );

  return {
    found: true,
    result: {
      food: total.foods.join(" + "),
      calories: cleanNumber(total.calories),
      protein: cleanNumber(total.protein),
      carbs: cleanNumber(total.carbs),
      fat: cleanNumber(total.fat),
      explanation:
        "Estimated using the built-in local nutrition database. AI was not needed."
    }
  };
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