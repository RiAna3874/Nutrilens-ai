import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
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
    keywords: ["avocado"],
    food: "Avocado",
    calories: 160,
    protein: 2,
    carbs: 8.5,
    fat: 14.7
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
    keywords: ["beef"],
    food: "Cooked beef",
    calories: 250,
    protein: 26,
    carbs: 0,
    fat: 15
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
    keywords: ["vegetable", "vegetables", "mixed vegetables"],
    food: "Mixed vegetables",
    calories: 65,
    protein: 2.5,
    carbs: 12,
    fat: 1
  }
];

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "NutriLens AI backend is running"
  });
});

app.post(
  "/analyze",
  (req, res, next) => {
    upload.single("image")(req, res, function (error) {
      if (error) {
        return res.status(400).json({
          error: error.message || "Image upload failed."
        });
      }

      next();
    });
  },
  async (req, res) => {
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
            "AI is inactive and this food was not found in the local database. Try typing a clearer food name like rice, egg, chicken, salmon, dal, potato, banana, apple, bread, roti, beef, fish, or vegetables."
        });
      }

      try {
        const geminiResult = await analyzeWithGemini(description, portion, imageFile);
        return res.json(geminiResult);
      } catch (geminiError) {
        console.error("Gemini failed:", geminiError);

        return res.json({
          food: description || "Unknown food",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          explanation:
            "AI was unavailable or quota-limited, and this food was not found in the local database. Try a simpler description such as rice, chicken, egg, salmon, dal, potato, banana, apple, bread, roti, beef, fish, or vegetables."
        });
      }
    } catch (error) {
      console.error("Analyze error:", error);

      return res.status(500).json({
        error: "Something went wrong while analyzing the meal."
      });
    }
  }
);

async function analyzeWithGemini(description, portion, imageFile) {
  const prompt = `
You are NutriLens AI, a nutrition estimation assistant.

Analyze the meal from the uploaded image and/or user description.

User description:
${description || "No description provided."}

Portion size:
${portion} grams

Return ONLY valid JSON.
No markdown.
No code fence.
No extra text.

Use this exact JSON structure:
{
  "food": "string",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "explanation": "string"
}
`;

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
    text: prompt
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

  const rawText = response.text;

  if (!rawText || typeof rawText !== "string") {
    throw new Error("Gemini returned empty response.");
  }

  const cleanedText = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const parsed = JSON.parse(cleanedText);

  return {
    food: String(parsed.food || "Unknown food"),
    calories: cleanNumber(parsed.calories),
    protein: cleanNumber(parsed.protein),
    carbs: cleanNumber(parsed.carbs),
    fat: cleanNumber(parsed.fat),
    explanation: String(
      parsed.explanation ||
        "Nutrition estimated from available image and description."
    )
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
        "Estimated using the built-in local nutrition database. AI was not needed for this result."
    }
  };
}

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found."
  });
});

function cleanNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number * 10) / 10;
}

app.listen(PORT, () => {
  console.log(`NutriLens AI backend running at http://localhost:${PORT}`);
});