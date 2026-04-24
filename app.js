const BACKEND_URL = "/analyze";

const imageInput = document.getElementById("imageInput");
const descriptionInput = document.getElementById("descriptionInput");
const portionInput = document.getElementById("portionInput");
const mealTypeInput = document.getElementById("mealTypeInput");

const analyzeButton = document.getElementById("analyzeButton");
const addToDayButton = document.getElementById("addToDayButton");
const clearDayButton = document.getElementById("clearDayButton");

const loadingMessage = document.getElementById("loadingMessage");
const errorMessage = document.getElementById("errorMessage");
const screenReaderSummary = document.getElementById("screenReaderSummary");

const foodName = document.getElementById("foodName");
const calories = document.getElementById("calories");
const protein = document.getElementById("protein");
const carbs = document.getElementById("carbs");
const fat = document.getElementById("fat");
const explanation = document.getElementById("explanation");

const dailyCalories = document.getElementById("dailyCalories");
const dailyProtein = document.getElementById("dailyProtein");
const dailyCarbs = document.getElementById("dailyCarbs");
const dailyFat = document.getElementById("dailyFat");
const mealLog = document.getElementById("mealLog");

let latestAnalysis = null;

analyzeButton.addEventListener("click", analyzeMeal);
addToDayButton.addEventListener("click", addLatestMealToDay);
clearDayButton.addEventListener("click", clearDailyTracker);

descriptionInput.addEventListener("keydown", function (event) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    analyzeMeal();
  }
});

loadDailyTracker();

async function analyzeMeal() {
  hideError();
  hideLoading();

  const imageFile = imageInput.files[0];
  const description = descriptionInput.value.trim();
  const portion = portionInput.value || "100";

  if (!imageFile && !description) {
    showError("Please upload a food image or type a food description.");
    descriptionInput.focus();
    return;
  }

  if (Number(portion) <= 0) {
    showError("Please enter a portion size greater than 0 grams.");
    portionInput.focus();
    return;
  }

  const formData = new FormData();

  if (imageFile) {
    formData.append("image", imageFile);
  }

  formData.append("description", description);
  formData.append("portion", portion);

  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing...";
  addToDayButton.disabled = true;
  showLoading("Analyzing meal. Please wait.");

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      body: formData
    });

    const responseText = await response.text();

    if (!responseText) {
      throw new Error("Backend returned an empty response.");
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
      throw new Error("Backend did not return valid JSON.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Meal analysis failed.");
    }

    latestAnalysis = {
      mealType: mealTypeInput.value,
      food: safeText(data.food, "Unknown food"),
      calories: safeNumber(data.calories),
      protein: safeNumber(data.protein),
      carbs: safeNumber(data.carbs),
      fat: safeNumber(data.fat),
      explanation: safeText(
        data.explanation,
        "Nutrition estimated from available information."
      ),
      timestamp: new Date().toISOString()
    };

    updateResults(latestAnalysis);
    addToDayButton.disabled = false;
  } catch (error) {
    latestAnalysis = null;
    addToDayButton.disabled = true;
    showError(error.message || "Failed to analyze meal.");
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze meal";
    hideLoading();
  }
}

function updateResults(data) {
  foodName.innerHTML = "<strong>Food:</strong> " + escapeHtml(data.food);
  calories.innerHTML = "<strong>Calories:</strong> " + data.calories + " kcal";
  protein.innerHTML = "<strong>Protein:</strong> " + data.protein + " g";
  carbs.innerHTML = "<strong>Carbs:</strong> " + data.carbs + " g";
  fat.innerHTML = "<strong>Fat:</strong> " + data.fat + " g";
  explanation.innerHTML =
    "<strong>Explanation:</strong> " + escapeHtml(data.explanation);

  screenReaderSummary.textContent =
    "Analysis complete. Food: " +
    data.food +
    ". Calories: " +
    data.calories +
    " kilocalories. Protein: " +
    data.protein +
    " grams. Carbohydrates: " +
    data.carbs +
    " grams. Fat: " +
    data.fat +
    " grams.";
}

function addLatestMealToDay() {
  if (!latestAnalysis) {
    showError("Please analyze a meal first.");
    return;
  }

  const meals = getStoredMeals();

  meals.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    ...latestAnalysis
  });

  localStorage.setItem("nutrilensDailyMeals", JSON.stringify(meals));
  renderDailyTracker(meals);

  screenReaderSummary.textContent =
    latestAnalysis.mealType + " added to daily tracker.";
}

function clearDailyTracker() {
  localStorage.removeItem("nutrilensDailyMeals");
  renderDailyTracker([]);
  screenReaderSummary.textContent = "Daily tracker cleared.";
}

function loadDailyTracker() {
  const meals = getStoredMeals();
  renderDailyTracker(meals);
}

function getStoredMeals() {
  try {
    const raw = localStorage.getItem("nutrilensDailyMeals");
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function renderDailyTracker(meals) {
  const totals = meals.reduce(
    (sum, meal) => {
      sum.calories += safeNumber(meal.calories);
      sum.protein += safeNumber(meal.protein);
      sum.carbs += safeNumber(meal.carbs);
      sum.fat += safeNumber(meal.fat);
      return sum;
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    }
  );

  dailyCalories.textContent = safeNumber(totals.calories) + " kcal";
  dailyProtein.textContent = safeNumber(totals.protein) + " g";
  dailyCarbs.textContent = safeNumber(totals.carbs) + " g";
  dailyFat.textContent = safeNumber(totals.fat) + " g";

  if (meals.length === 0) {
    mealLog.innerHTML = "<p>No meals added yet.</p>";
    return;
  }

  const groupedMeals = {
    Breakfast: [],
    Lunch: [],
    Dinner: [],
    Snack: []
  };

  meals.forEach((meal) => {
    const type = groupedMeals[meal.mealType] ? meal.mealType : "Snack";
    groupedMeals[type].push(meal);
  });

  mealLog.innerHTML = "";

  Object.keys(groupedMeals).forEach((mealType) => {
    const group = groupedMeals[mealType];

    if (group.length === 0) {
      return;
    }

    const section = document.createElement("section");
    section.className = "meal-section";

    const heading = document.createElement("h3");
    heading.textContent = mealType;
    section.appendChild(heading);

    group.forEach((meal) => {
      const item = document.createElement("div");
      item.className = "meal-item";

      item.innerHTML =
        "<strong>" +
        escapeHtml(meal.food) +
        "</strong>" +
        "<br />" +
        safeNumber(meal.calories) +
        " kcal | Protein " +
        safeNumber(meal.protein) +
        " g | Carbs " +
        safeNumber(meal.carbs) +
        " g | Fat " +
        safeNumber(meal.fat) +
        " g";

      section.appendChild(item);
    });

    mealLog.appendChild(section);
  });
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
  screenReaderSummary.textContent = "Error: " + message;
}

function hideError() {
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
}

function showLoading(message) {
  loadingMessage.textContent = message;
  loadingMessage.classList.remove("hidden");
  screenReaderSummary.textContent = message;
}

function hideLoading() {
  loadingMessage.textContent = "";
  loadingMessage.classList.add("hidden");
}

function safeText(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}

function safeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number * 10) / 10;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}