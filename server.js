import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const USDA_API_KEY = process.env.USDA_API_KEY || "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

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
    gemini: GEMINI_API_KEY ? "active" : "missing",
    usda: USDA_API_KEY ? "active" : "missing",
    fallback: "active"
  });
});

app.get("/api/search-food", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();

    if (!query) return res.json([]);

    if (!USDA_API_KEY) {
      const fallbackResults = searchLocalFoods(query);
      return res.json(fallbackResults);
    }

    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("api_key", USDA_API_KEY);
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "12");
    url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS),Branded");

    const response = await fetch(url);

    if (!response.ok) {
      const fallbackResults = searchLocalFoods(query);
      return res.json(fallbackResults);
    }

    const data = await response.json();

    const foods = (data.foods || []).map((food) => {
      const nutrients = extractUsdaNutrients(food);

      return {
        id: food.fdcId,
        name: food.description || "Unknown food",
        brand: food.brandName || food.brandOwner || "",
        dataType: food.dataType || "",
        calories: cleanNumber(nutrients.calories),
        protein: cleanNumber(nutrients.protein),
        carbs: cleanNumber(nutrients.carbs),
        fat: cleanNumber(nutrients.fat)
      };
    });

    return res.json(foods);
  } catch (error) {
    console.error("Food search error:", error);
    return res.json(searchLocalFoods(String(req.query.q || "")));
  }
});

app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    const description = String(req.body.description || "").trim();
    const portion = cleanNumber(req.body.portion || 100);

    if (!description && !req.file) {
      return res.status(400).json({
        error: "Please upload an image or describe the food."
      });
    }

    if (GEMINI_API_KEY) {
      const aiResult = await analyzeWithGemini(description, portion, req.file);
      if (aiResult) return res.json(aiResult);
    }

    const fallbackResult = estimateNutritionLocally(description, portion);

    return res.json({
      ...fallbackResult,
      explanation:
        "Estimated using built-in nutrition fallback because AI is unavailable. Values are approximate."
    });
  } catch (error) {
    console.error("Analyze error:", error);

    const description = String(req.body.description || "").trim();
    const portion = cleanNumber(req.body.portion || 100);
    const fallbackResult = estimateNutritionLocally(description, portion);

    return res.json({
      ...fallbackResult,
      explanation:
        "Estimated using built-in fallback after analysis error. Values are approximate."
    });
  }
});

async function analyzeWithGemini(description, portion, imageFile) {
  try {
    const prompt = `
You are a clinical nutrition expert.

Food input:
"${description || "No written description"}"

Default portion if an item has no amount: ${portion} grams.

Rules:
- Extract each food item separately.
- Detect quantities such as 150g, 120 grams, 4 oz, 1 cup, 2 eggs, 1 banana, 1 roti.
- If no amount is given for an item, assume ${portion} grams.
- Return strict JSON only.

Return:
{
  "food": "summary food name",
  "items": [
    {
      "name": "food name",
      "amount": "amount used",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number
    }
  ],
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "explanation": "brief explanation"
}
`;

    const parts = [{ text: prompt }];

    if (imageFile) {
      parts.push({
        inline_data: {
          mime_type: imageFile.mimetype,
          data: imageFile.buffer.toString("base64")
        }
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return null;
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      parsed = JSON.parse(match[0]);
    }

    const items = Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          name: safeText(item.name, "Unknown food"),
          amount: safeText(item.amount, "Estimated amount"),
          calories: cleanNumber(item.calories),
          protein: cleanNumber(item.protein),
          carbs: cleanNumber(item.carbs),
          fat: cleanNumber(item.fat)
        }))
      : [];

    const totals = calculateTotals(items);

    return {
      food: safeText(parsed.food, description || "Analyzed meal"),
      items,
      calories: cleanNumber(parsed.calories || totals.calories),
      protein: cleanNumber(parsed.protein || totals.protein),
      carbs: cleanNumber(parsed.carbs || totals.carbs),
      fat: cleanNumber(parsed.fat || totals.fat),
      explanation: safeText(parsed.explanation, "Estimated using AI.")
    };
  } catch (error) {
    console.error("Gemini fallback error:", error);
    return null;
  }
}

const localFoodDb = {
  rice: { name: "Cooked white rice", calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  chicken: { name: "Cooked chicken breast", calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  egg: { name: "Boiled egg", calories: 155, protein: 13, carbs: 1.1, fat: 11, gramsPerUnit: 50 },
  banana: { name: "Banana", calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, gramsPerUnit: 118 },
  apple: { name: "Apple", calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2, gramsPerUnit: 182 },
  noodle: { name: "Cooked noodles", calories: 138, protein: 4.5, carbs: 25, fat: 2.1 },
  noodles: { name: "Cooked noodles", calories: 138, protein: 4.5, carbs: 25, fat: 2.1 },
  dal: { name: "Cooked lentils / dal", calories: 116, protein: 9, carbs: 20, fat: 0.4 },
  lentil: { name: "Cooked lentils", calories: 116, protein: 9, carbs: 20, fat: 0.4 },
  fish: { name: "Cooked fish", calories: 140, protein: 22, carbs: 0, fat: 5 },
  salmon: { name: "Cooked salmon", calories: 208, protein: 20, carbs: 0, fat: 13 },
  beef: { name: "Cooked beef", calories: 250, protein: 26, carbs: 0, fat: 15 },
  roti: { name: "Roti / chapati", calories: 297, protein: 9.6, carbs: 46, fat: 7.5, gramsPerUnit: 40 },
  chapati: { name: "Roti / chapati", calories: 297, protein: 9.6, carbs: 46, fat: 7.5, gramsPerUnit: 40 },
  bread: { name: "Bread", calories: 265, protein: 9, carbs: 49, fat: 3.2 },
  milk: { name: "Whole milk", calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
  yogurt: { name: "Plain yogurt", calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3 },
  potato: { name: "Boiled potato", calories: 87, protein: 1.9, carbs: 20, fat: 0.1 },
  vegetables: { name: "Mixed vegetables", calories: 65, protein: 2.5, carbs: 12, fat: 1 },
  vegetable: { name: "Mixed vegetables", calories: 65, protein: 2.5, carbs: 12, fat: 1 },
  avocado: { name: "Avocado", calories: 160, protein: 2, carbs: 8.5, fat: 14.7 },
  cheese: { name: "Cheese", calories: 402, protein: 25, carbs: 1.3, fat: 33 }
};

function estimateNutritionLocally(description, defaultPortion = 100) {
  const text = String(description || "").toLowerCase().trim();

  if (!text) {
    return {
      food: "Unknown food",
      items: [],
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    };
  }

  const items = [];

  Object.keys(localFoodDb).forEach((key) => {
    const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");

    if (!regex.test(text)) return;

    const food = localFoodDb[key];
    const grams = detectAmount(text, key, defaultPortion, food.gramsPerUnit);
    const factor = grams / 100;

    items.push({
      name: food.name,
      amount: `${cleanNumber(grams)}g`,
      calories: cleanNumber(food.calories * factor),
      protein: cleanNumber(food.protein * factor),
      carbs: cleanNumber(food.carbs * factor),
      fat: cleanNumber(food.fat * factor)
    });
  });

  if (items.length === 0) {
    const factor = defaultPortion / 100;

    items.push({
      name: description,
      amount: `${defaultPortion}g`,
      calories: cleanNumber(100 * factor),
      protein: cleanNumber(3 * factor),
      carbs: cleanNumber(15 * factor),
      fat: cleanNumber(3 * factor)
    });
  }

  const totals = calculateTotals(items);

  return {
    food: items.map((item) => item.name).join(" + "),
    items,
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat
  };
}

function detectAmount(text, foodName, defaultPortion, gramsPerUnit) {
  const escaped = escapeRegExp(foodName);

  const patterns = [
    new RegExp(`\\b${escaped}\\s*(\\d+(?:\\.\\d+)?)\\s*g\\b`, "i"),
    new RegExp(`\\b${escaped}\\s*(\\d+(?:\\.\\d+)?)\\s*grams?\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*g\\s*\\b${escaped}\\b`, "i"),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*grams?\\s*\\b${escaped}\\b`, "i")
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanNumber(match[1]);
  }

  const unitPattern = new RegExp(`\\b${escaped}\\s*(\\d+(?:\\.\\d+)?)\\b`, "i");
  const unitMatch = text.match(unitPattern);

  if (unitMatch && gramsPerUnit) {
    return cleanNumber(Number(unitMatch[1]) * gramsPerUnit);
  }

  return cleanNumber(defaultPortion || 100);
}

function searchLocalFoods(query) {
  const text = String(query || "").toLowerCase();

  return Object.keys(localFoodDb)
    .filter((key) => key.includes(text) || localFoodDb[key].name.toLowerCase().includes(text))
    .slice(0, 12)
    .map((key) => {
      const food = localFoodDb[key];

      return {
        id: `local-${key}`,
        name: food.name,
        brand: "Local fallback",
        dataType: "Fallback",
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat
      };
    });
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
    const unitName = String(nutrient.unitName || "").toLowerCase();
    const value = Number(nutrient.value || 0);

    if (name.includes("energy") && (unitName === "kcal" || nutrients.calories === 0)) {
      nutrients.calories = value;
    }

    if (name.includes("protein")) nutrients.protein = value;
    if (name.includes("carbohydrate")) nutrients.carbs = value;
    if (name.includes("total lipid") || name.includes("total fat")) nutrients.fat = value;
  });

  return nutrients;
}

function calculateTotals(items) {
  return items.reduce(
    (sum, item) => {
      sum.calories += cleanNumber(item.calories);
      sum.protein += cleanNumber(item.protein);
      sum.carbs += cleanNumber(item.carbs);
      sum.fat += cleanNumber(item.fat);

      return {
        calories: cleanNumber(sum.calories),
        protein: cleanNumber(sum.protein),
        carbs: cleanNumber(sum.carbs),
        fat: cleanNumber(sum.fat)
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function cleanNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 10) / 10;
}

function safeText(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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