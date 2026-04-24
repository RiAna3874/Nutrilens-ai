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

const sexInput = document.getElementById("sexInput");
const ageInput = document.getElementById("ageInput");
const heightInput = document.getElementById("heightInput");
const weightInput = document.getElementById("weightInput");
const activityInput = document.getElementById("activityInput");
const goalInput = document.getElementById("goalInput");
const calculateRequirementButton = document.getElementById("calculateRequirementButton");

const bmrResult = document.getElementById("bmrResult");
const tdeeResult = document.getElementById("tdeeResult");
const targetResult = document.getElementById("targetResult");
const remainingResult = document.getElementById("remainingResult");
const requirementExplanation = document.getElementById("requirementExplanation");

let latestAnalysis = null;
let latestCalorieTarget = null;

analyzeButton.addEventListener("click", analyzeMeal);
addToDayButton.addEventListener("click", addLatestMealToDay);
clearDayButton.addEventListener("click", clearDailyTracker);
calculateRequirementButton.addEventListener("click", calculateCalorieRequirement);

descriptionInput.addEventListener("keydown", function (event) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    analyzeMeal();
  }
});

loadDailyTracker();
loadRequirementInputs();
calculateCalorieRequirement(false);

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
  updateRemainingCalories();

  screenReaderSummary.textContent =
    latestAnalysis.mealType + " added to daily tracker.";
}

function clearDailyTracker() {
  localStorage.removeItem("nutrilensDailyMeals");
  renderDailyTracker([]);
  updateRemainingCalories();
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

function getDailyTotals() {
  const meals = getStoredMeals();

  return meals.reduce(
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

function calculateCalorieRequirement(announce = true) {
  const sex = sexInput.value;
  const age = safeNumber(ageInput.value);
  const heightCm = safeNumber(heightInput.value);
  const weightKg = safeNumber(weightInput.value);
  const activityFactor = Number(activityInput.value);
  const goal = goalInput.value;

  if (age <= 0 || heightCm <= 0 || weightKg <= 0 || !Number.isFinite(activityFactor)) {
    showError("Please enter valid age, height, weight, and activity level.");
    return;
  }

  let bmr;

  if (sex === "male") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  const tdee = bmr * activityFactor;

  let target = tdee;
  let goalText = "maintenance";

  if (goal === "mildLoss") {
    target = tdee - 250;
    goalText = "mild weight loss";
  } else if (goal === "loss") {
    target = tdee - 500;
    goalText = "weight loss";
  } else if (goal === "gain") {
    target = tdee + 300;
    goalText = "weight gain";
  }

  target = Math.max(target, 1200);

  latestCalorieTarget = {
    bmr: cleanWholeNumber(bmr),
    tdee: cleanWholeNumber(tdee),
    target: cleanWholeNumber(target),
    goalText
  };

  saveRequirementInputs();

  bmrResult.innerHTML =
    "<strong>BMR:</strong> " + latestCalorieTarget.bmr + " kcal/day";

  tdeeResult.innerHTML =
    "<strong>Estimated TDEE:</strong> " + latestCalorieTarget.tdee + " kcal/day";

  targetResult.innerHTML =
    "<strong>Suggested target:</strong> " +
    latestCalorieTarget.target +
    " kcal/day for " +
    escapeHtml(goalText);

  requirementExplanation.innerHTML =
    "<strong>Explanation:</strong> BMR is estimated using the Mifflin–St Jeor equation. TDEE is BMR multiplied by your selected activity factor. This is an estimate, not a measured metabolic rate.";

  updateRemainingCalories();

  if (announce) {
    screenReaderSummary.textContent =
      "Calorie requirement calculated. Estimated target is " +
      latestCalorieTarget.target +
      " kilocalories per day.";
  }
}

function updateRemainingCalories() {
  if (!latestCalorieTarget) {
    remainingResult.innerHTML =
      "<strong>Today remaining:</strong> Calculate requirement first.";
    return;
  }

  const totals = getDailyTotals();
  const remaining = cleanWholeNumber(latestCalorieTarget.target - totals.calories);

  if (remaining >= 0) {
    remainingResult.innerHTML =
      "<strong>Today remaining:</strong> " + remaining + " kcal remaining";
  } else {
    remainingResult.innerHTML =
      "<strong>Today remaining:</strong> " +
      Math.abs(remaining) +
      " kcal above target";
  }
}

function saveRequirementInputs() {
  const data = {
    sex: sexInput.value,
    age: ageInput.value,
    height: heightInput.value,
    weight: weightInput.value,
    activity: activityInput.value,
    goal: goalInput.value
  };

  localStorage.setItem("nutrilensRequirementInputs", JSON.stringify(data));
}

function loadRequirementInputs() {
  try {
    const raw = localStorage.getItem("nutrilensRequirementInputs");

    if (!raw) {
      return;
    }

    const data = JSON.parse(raw);

    if (data.sex) sexInput.value = data.sex;
    if (data.age) ageInput.value = data.age;
    if (data.height) heightInput.value = data.height;
    if (data.weight) weightInput.value = data.weight;
    if (data.activity) activityInput.value = data.activity;
    if (data.goal) goalInput.value = data.goal;
  } catch (error) {
    return;
  }
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

function cleanWholeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}