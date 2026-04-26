import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "https://nutrilens-ai-5n05.onrender.com";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [description, setDescription] = useState("");
  const [grams, setGrams] = useState(100);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [meals, setMeals] = useState([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("nutrilensMeals") || "[]");
    setMeals(saved);
  }, []);

  function saveMeals(updatedMeals) {
    setMeals(updatedMeals);
    localStorage.setItem("nutrilensMeals", JSON.stringify(updatedMeals));
  }

  async function analyzeMeal() {
    if (!description.trim()) {
      setMessage("Please enter food description.");
      return;
    }

    setMessage("Analyzing...");
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          description,
          grams: Number(grams || 100)
        })
      });

      const data = await res.json();

      if (data.error) {
        setMessage(data.error);
        return;
      }

      setResult({
        id: Date.now().toString(),
        date: todayKey(),
        food: data.food || description,
        calories: Number(data.calories || 0),
        protein: Number(data.protein || 0),
        carbs: Number(data.carbs || 0),
        fat: Number(data.fat || 0),
        source: data.source || "estimated"
      });

      setMessage("");
    } catch {
      setMessage("Backend error. Try again.");
    }
  }

  function addMeal() {
    if (!result) return;

    const updatedMeals = [...meals, result];
    saveMeals(updatedMeals);

    setResult(null);
    setDescription("");
    setMessage("Added to daily tracker.");
  }

  function deleteMeal(id) {
    saveMeals(meals.filter((meal) => meal.id !== id));
  }

  function editMeal(id) {
    const meal = meals.find((item) => item.id === id);
    if (!meal) return;

    const calories = prompt("Calories:", meal.calories);
    if (calories === null) return;

    const protein = prompt("Protein:", meal.protein);
    if (protein === null) return;

    const carbs = prompt("Carbs:", meal.carbs);
    if (carbs === null) return;

    const fat = prompt("Fat:", meal.fat);
    if (fat === null) return;

    const updatedMeals = meals.map((item) =>
      item.id === id
        ? {
            ...item,
            calories: Number(calories || 0),
            protein: Number(protein || 0),
            carbs: Number(carbs || 0),
            fat: Number(fat || 0)
          }
        : item
    );

    saveMeals(updatedMeals);
  }

  function clearToday() {
    saveMeals(meals.filter((meal) => meal.date !== todayKey()));
  }

  const todayMeals = meals.filter((meal) => meal.date === todayKey());

  const totals = todayMeals.reduce(
    (sum, meal) => {
      sum.calories += meal.calories;
      sum.protein += meal.protein;
      sum.carbs += meal.carbs;
      sum.fat += meal.fat;
      return sum;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const targetCalories = 2000;
  const remainingCalories = targetCalories - totals.calories;

  return (
    <main className="app">
      <section className="hero">
        <h1>🍽 NutriLens AI</h1>
        <p>Smart calorie and nutrition tracker</p>
      </section>

      <section className="card">
        <h2>Analyze Food</h2>

        <label>Food description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Example: rice chicken banana"
        />

        <label>Portion size in grams</label>
        <input
          type="number"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
        />

        <button onClick={analyzeMeal}>Analyze Meal</button>

        {message && <p className="message">{message}</p>}

        {result && (
          <div className="result">
            <h3>🍽 {result.food}</h3>
            <p><strong>Calories:</strong> {result.calories} kcal</p>
            <p><strong>Protein:</strong> {result.protein} g</p>
            <p><strong>Carbs:</strong> {result.carbs} g</p>
            <p><strong>Fat:</strong> {result.fat} g</p>
            <p className="source">Source: {result.source}</p>
            <button onClick={addMeal}>Add to Daily Tracker</button>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Daily Tracker</h2>

        <div className="summary">
          <div>
            <strong>{totals.calories}</strong>
            <span>Eaten</span>
          </div>
          <div>
            <strong>{remainingCalories}</strong>
            <span>Remaining</span>
          </div>
        </div>

        <p><strong>Protein:</strong> {totals.protein.toFixed(1)} g</p>
        <p><strong>Carbs:</strong> {totals.carbs.toFixed(1)} g</p>
        <p><strong>Fat:</strong> {totals.fat.toFixed(1)} g</p>

        <h3>Meals Today</h3>

        {todayMeals.length === 0 ? (
          <p>No meals added today.</p>
        ) : (
          todayMeals.map((meal) => (
            <div className="meal" key={meal.id}>
              <strong>{meal.food}</strong>
              <p>
                {meal.calories} kcal | P {meal.protein}g | C {meal.carbs}g | F{" "}
                {meal.fat}g
              </p>

              <div className="meal-actions">
                <button onClick={() => editMeal(meal.id)}>Edit</button>
                <button className="danger" onClick={() => deleteMeal(meal.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}

        <button className="danger full" onClick={clearToday}>
          Clear Today
        </button>
      </section>
    </main>
  );
}