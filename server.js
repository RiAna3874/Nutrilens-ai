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
const USDA_API_KEY = process.env.USDA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  }
});

const localFoods = {
  rice: { food: "Cooked white rice", calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  chicken: { food: "Cooked chicken", calories: 190, protein: 27, carbs: 0, fat: 8 },
  egg: { food: "Boiled egg", calories: 155, protein: 13, carbs: 1.1, fat: 11, gramsPerUnit: 50 },
  banana: { food: "Banana", calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, gramsPerUnit: 118 },
  apple: { food: "Apple", calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2, gramsPerUnit: 182 },
  dal: { food: "Cooked lentils / dal", calories: 116, protein: 9, carbs: 20, fat: 0.4 },
  fish: { food: "Cooked fish", calories: 140, protein: 22, carbs: 0, fat: 5 },
  beef: { food: "Cooked beef", calories: 250, protein: 26, carbs: 0, fat: 15 },
  salmon: { food: "Cooked salmon", calories: 208, protein: 20, carbs: 0, fat: 13 },
  roti: { food: "Roti / chapati", calories: 297, protein: 9.6, carbs: 46, fat: 7.5, gramsPerUnit: 40 },
  chapati: { food: "Roti / chapati", calories: 297, protein: 9.6, carbs: 46, fat: 7.5, gramsPerUnit: 40 },
  vegetables: { food: "Mixed vegetables", calories: 65, protein: 2.5, carbs: 12, fat: 1 },
  vegetable: { food: "Mixed vegetables", calories: 65, protein: 2.5, carbs: 12, fat: 1 }
};

app.get("/", (req, res) => {
  const publicIndex = path.join(__dirname, "public", "index.html");
  const rootIndex = path.join(__dirname, "index.html");

  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);

  return res.status(500).send("index.html not found.");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    usda: USDA_API_KEY ? "active" : "missing",
    gemini: GEMINI_API_KEY ? "active" : "missing"
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

    const parsedFoods = parseFoodDescription(description, defaultPortion);

    if (parsedFoods.length > 0) {
      const usdaResult = await analyzeWithUsda(parsedFoods);

      if (usdaResult.found) {
        return res.json(usdaResult.result);
      }

      const localResult = analyzeLocally(parsedFoods);

      if (localResult.found) {
        return res.json(localResult.result);
      }
    }

    if (ai && (imageFile || description.trim())) {
      try {
        const aiResult = await analyzeWithGemini(description, defaultPortion, imageFile);
        return res.json(aiResult);
      } catch (error) {
        console.error("Gemini error:", error.message);
      }
    }

    return res.json({
      food: description || "Unknown food",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      explanation:
        "Food was not found in USDA, local database, or AI fallback."
    });
  } catch (error) {
    console.error("Analyze error:", error);

    return res.status(500).json({
      error: "Something went wrong while analyzing the meal."
    });
  }
});

function parseFoodDescription(description, defaultPortion) {
  const text = normalizeText(description);

  if (!text) return [];

  const knownFoods = [
    "rice",
    "chicken",
    "egg",
    "banana",
    "apple",
    "dal",
    "daal",
    "lentil",
    "fish",
    "beef",
    "salmon",
    "roti",
    "chapati",
    "vegetable",
    "vegetables",
    "potato",
    "bread",
    "milk",
    "yogurt",
    "oatmeal",
    "pasta",
    "noodle",
    "beans",
    "avocado"
  ];

  const found = [];

  knownFoods.forEach((food) => {
    const pattern = new RegExp(`\\b${escapeRegExp(food)}\\b`, "i");

    if (pattern.test(text)) {
      found.push({
        name: food,
        grams: detectAmountForFood(text, food, defaultPortion)
      });
    }
  });

  if (found.length > 0) return found;

  return text
    .split(/\s*,\s*|\s+and\s+|\s+\+\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({
      name: item.replace(/\d+(?:\.\d+)?\s*(g|gram|grams|oz|lb|cup|cups)/gi, "").trim(),
      grams: detectAmountForFood(text, item, defaultPortion)
    }))
    .filter((item) => item.name);
}

async function analyzeWithUsda(parsedFoods) {
  if (!USDA_API_KEY) {
    return { found: false, result: null };
  }

  const total = {
    foods: [],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };

  let matchedCount = 0;

  for (const item of parsedFoods) {
    const usdaFood = await searchUsdaFood(item.name);

    if (!usdaFood) continue;

    const nutrients = extractUsdaNutrients(usdaFood);
    const multiplier = item.grams / 100;

    total.foods.push(`${usdaFood.description} (${item.grams}g)`);
    total.calories += nutrients.calories * multiplier;
    total.protein += nutrients.protein * multiplier;
    total.carbs += nutrients.carbs * multiplier;
    total.fat += nutrients.fat * multiplier;

    matchedCount += 1;
  }

  if (matchedCount === 0) {
    return { found: false, result: null };
  }

  return {
    found: true,
    result: {
      food: total.foods.join(" + "),
      calories: cleanNumber(total.calories),
      protein: cleanNumber(total.protein),
      carbs: cleanNumber(total.carbs),
      fat: cleanNumber(total.fat),
      explanation:
        "Estimated using USDA FoodData Central. Values are approximate and depend on food match, preparation method, and portion size."
    }
  };
}

async function searchUsdaFood(query) {
  try {
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");

    url.searchParams.set("api_key", USDA_API_KEY);
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "5");
    url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");

    const response = await fetch(url);

    if (!response.ok) {
      console.error("USDA response error:", response.status);
      return null;
    }

    const data = await response.json();

    if (!data.foods || data.foods.length === 0) {
      return null;
    }

    return data.foods[0];
  } catch (error) {
    console.error("USDA fetch error:", error.message);
    return null;
  }
}

function extractUsdaNutrients(food) {
  const nutrients = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };

  if (!food.foodNutrients) return nutrients;

  food.foodNutrients.forEach((nutrient) => {
    const name = String(nutrient.nutrientName || "").toLowerCase();
    const value = Number(nutrient.value || 0);

    if (name.includes("energy")) nutrients.calories = value;
    if (name.includes("protein")) nutrients.protein = value;
    if (name.includes("carbohydrate")) nutrients.carbs = value;
    if (name.includes("total lipid") || name === "fat") nutrients.fat = value;
  });

  return nutrients;
}

function analyzeLocally(parsedFoods) {
  const total = {
    foods: [],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };

  let matchedCount = 0;

  parsedFoods.forEach((item) => {
    const key = Object.keys(localFoods).find((foodKey) =>
      item.name.toLowerCase().includes(foodKey)
    );

    if (!key) return;

    const food = localFoods[key];
    const multiplier = item.grams / 100;

    total.foods.push(`${food.food} (${item.grams}g)`);
    total.calories += food.calories * multiplier;
    total.protein += food.protein * multiplier;
    total.carbs += food.carbs * multiplier;
    total.fat += food.fat * multiplier;

    matchedCount += 1;
  });

  if (matchedCount === 0) {
    return { found: false, result: null };
  }

  return {
    found: true,
    result: {
      food: total.foods.join(" + "),
      calories: cleanNumber(total.calories),
      protein: cleanNumber(total.protein),
      carbs: cleanNumber(total.carbs),
      fat: cleanNumber(total.fat),
      explanation:
        "Estimated using the built-in local nutrition database. USDA match was unavailable."
    }
  };
}

async function analyzeWithGemini(description, portion, imageFile) {
  if (!ai) {
    throw new Error("Gemini API key missing.");
  }

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
Default portion: ${portion} grams

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
    explanation: parsed.explanation || "Estimated using Gemini AI."
  };
}

function detectAmountForFood(text, foodName, defaultPortion) {
  const escapedFood = escapeRegExp(foodName);

  const gramPatterns = [
    new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\s*g\\b`, "i"),
    new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\s*grams?\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*g\\s*\\b${escapedFood}\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*grams?\\s*\\b${escapedFood}\\b`, "i")
  ];

  for (const pattern of gramPatterns) {
    const match = text.match(pattern);
    if (match) return cleanNumber(match[1]);
  }

  const ozPatterns = [
    new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\s*oz\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*oz\\s*\\b${escapedFood}\\b`, "i")
  ];

  for (const pattern of ozPatterns) {
    const match = text.match(pattern);
    if (match) return cleanNumber(Number(match[1]) * 28.3495);
  }

  const cupPatterns = [
    new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\s*cups?\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*cups?\\s*\\b${escapedFood}\\b`, "i")
  ];

  for (const pattern of cupPatterns) {
    const match = text.match(pattern);
    if (match) return cleanNumber(Number(match[1]) * 158);
  }

  const unitPattern = new RegExp(`\\b${escapedFood}\\s*(\\d+(?:\\.\\d+)?)\\b`, "i");
  const unitMatch = text.match(unitPattern);

  if (unitMatch) {
    const units = Number(unitMatch[1]);

    const localMatch = localFoods[foodName];

    if (localMatch?.gramsPerUnit) {
      return cleanNumber(units * localMatch.gramsPerUnit);
    }
  }

  return cleanNumber(defaultPortion || 100);
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

  if (!Number.isFinite(number)) return 0;

  return Math.round(number * 10) / 10;
}

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  res.status(400).json({
    error: err.message || "Request failed."
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found."
  });
});

app.listen(PORT, () => {
  console.log(`NutriLens AI running on port ${PORT}`);
});