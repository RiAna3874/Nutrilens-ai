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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USDA_API_KEY = process.env.USDA_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

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
    usda: USDA_API_KEY ? "active" : "missing"
  });
});

app.get("/api/search-food", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();

    if (!query) return res.json([]);

    if (!USDA_API_KEY) {
      return res.status(400).json({ error: "USDA_API_KEY is missing." });
    }

    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("api_key", USDA_API_KEY);
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "12");
    url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS),Branded");

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "USDA food search failed."
      });
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
    return res.status(500).json({ error: "Food search failed." });
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

    if (!GEMINI_API_KEY) {
  const fallback = estimateFoodLocally(description, portion);

  return res.json({
    food: fallback.food,
    items: fallback.items,
    calories: fallback.calories,
    protein: fallback.protein,
    carbs: fallback.carbs,
    fat: fallback.fat,
    explanation: "Estimated using built-in fallback database because AI key is missing."
  });
}

    const prompt = `
You are a clinical nutrition expert.

Food input:
"${description || "No written description"}"

Default portion if an item has no amount: ${portion} grams.

Image context:
${req.file ? "A food image was uploaded. Use the image together with the written description." : "No image was uploaded. Use the written food description only."}

Rules:
- Extract each food item separately.
- Detect quantities such as: 150g, 120 grams, 4 oz, 1 cup, 2 eggs, 1 banana, 1 roti.
- If no amount is given for an item, assume ${portion} grams.
- Estimate realistic nutrition values using common cooked/prepared food values.
- Be practical and conservative.
- Return STRICT JSON only.
- No markdown.
- No text outside JSON.

Return exactly this structure:
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
  "explanation": "brief explanation of assumptions"
}
`;

    const parts = [{ text: prompt }];

    if (req.file) {
      parts.push({
        inline_data: {
          mime_type: req.file.mimetype,
          data: req.file.buffer.toString("base64")
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
          contents: [
            {
              parts
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", JSON.stringify(data, null, 2));
      return res.status(response.status).json({
        error: data?.error?.message || "Gemini API request failed."
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("Empty Gemini response:", JSON.stringify(data, null, 2));
      return res.status(500).json({
        error: "Gemini returned an empty response."
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return res.status(500).json({
          error: "Gemini response was not valid JSON."
        });
      }
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

    const totalsFromItems = items.reduce(
      (sum, item) => {
        sum.calories += cleanNumber(item.calories);
        sum.protein += cleanNumber(item.protein);
        sum.carbs += cleanNumber(item.carbs);
        sum.fat += cleanNumber(item.fat);
        return sum;
      },
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0
      }
    );

    const result = {
      food: safeText(parsed.food, description || "Analyzed meal"),
      items,
      calories: cleanNumber(parsed.calories || totalsFromItems.calories),
      protein: cleanNumber(parsed.protein || totalsFromItems.protein),
      carbs: cleanNumber(parsed.carbs || totalsFromItems.carbs),
      fat: cleanNumber(parsed.fat || totalsFromItems.fat),
      explanation: safeText(
        parsed.explanation,
        "Estimated from the provided food description and common nutrition references."
      )
    };

    return res.json(result);
  } catch (error) {
    console.error("Analyze error:", error);
    return res.status(500).json({
      error: "Something went wrong while analyzing the meal."
    });
  }
});

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

function cleanNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 10) / 10;
}

function safeText(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(400).json({
    error: err.message || "Request failed."
  });
});
function estimateFoodLocally(description, portion = 100) {
  const db = {
    rice: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
    chicken: { calories: 190, protein: 27, carbs: 0, fat: 8 },
    egg: { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
    banana: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
    noodle: { calories: 138, protein: 4.5, carbs: 25, fat: 2.1 },
    noodles: { calories: 138, protein: 4.5, carbs: 25, fat: 2.1 },
    dal: { calories: 116, protein: 9, carbs: 20, fat: 0.4 },
    fish: { calories: 140, protein: 22, carbs: 0, fat: 5 }
  };

  const text = String(description || "").toLowerCase();
  const items = [];

  Object.keys(db).forEach((name) => {
    if (text.includes(name)) {
      const food = db[name];
      const multiplier = Number(portion || 100) / 100;

      items.push({
        name,
        amount: `${portion}g`,
        calories: cleanNumber(food.calories * multiplier),
        protein: cleanNumber(food.protein * multiplier),
        carbs: cleanNumber(food.carbs * multiplier),
        fat: cleanNumber(food.fat * multiplier)
      });
    }
  });

  const totals = items.reduce(
    (sum, item) => {
      sum.calories += item.calories;
      sum.protein += item.protein;
      sum.carbs += item.carbs;
      sum.fat += item.fat;
      return sum;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    food: items.length ? items.map((i) => i.name).join(" + ") : description,
    items,
    calories: cleanNumber(totals.calories),
    protein: cleanNumber(totals.protein),
    carbs: cleanNumber(totals.carbs),
    fat: cleanNumber(totals.fat)
  };
}

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found."
  });
});

app.listen(PORT, () => {
  console.log(`NutriLens AI running on port ${PORT}`);
});