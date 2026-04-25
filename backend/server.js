import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

/* ================================
   🔹 HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("NutriLens AI backend is running 🚀");
});

/* ================================
   🔹 FOOD ANALYSIS ENDPOINT
================================ */
app.post("/analyze", async (req, res) => {
  try {
    const { description, grams } = req.body;

    if (!description) {
      return res.status(400).json({
        error: "No food description provided",
      });
    }

    const portion = grams || 100;

    /* =====================================
       🔹 SIMPLE LOCAL FALLBACK DATABASE
       (works without ANY API key)
    ===================================== */

    const db = {
      rice: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      chicken: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
      egg: { kcal: 155, protein: 13, carbs: 1.1, fat: 11 },
      banana: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 },
      apple: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 },
      noodle: { kcal: 138, protein: 5, carbs: 25, fat: 2 },
    };

    let total = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };

    const foods = description.toLowerCase().split(" ");

    foods.forEach((food) => {
      if (db[food]) {
        const factor = portion / 100;

        total.calories += db[food].kcal * factor;
        total.protein += db[food].protein * factor;
        total.carbs += db[food].carbs * factor;
        total.fat += db[food].fat * factor;
      }
    });

    /* =====================================
       🔹 OPTIONAL GEMINI AI (if key exists)
    ===================================== */

    if (process.env.GEMINI_API_KEY) {
      try {
        const aiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Estimate nutrition for: ${description} (${portion}g). Return JSON with calories, protein, carbs, fat.`,
                    },
                  ],
                },
              ],
            }),
          }
        );

        const data = await aiResponse.json();

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
          try {
            const parsed = JSON.parse(text);
            return res.json({
              source: "AI",
              ...parsed,
            });
          } catch (e) {
            console.log("AI parse failed → fallback used");
          }
        }
      } catch (e) {
        console.log("AI failed → fallback used");
      }
    }

    /* =====================================
       🔹 FINAL RESPONSE (fallback)
    ===================================== */

    res.json({
      source: "local-db",
      food: description,
      calories: Math.round(total.calories),
      protein: Math.round(total.protein),
      carbs: Math.round(total.carbs),
      fat: Math.round(total.fat),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Server error",
    });
  }
});

/* ================================
   🚀 START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`NutriLens AI running on port ${PORT}`);
});