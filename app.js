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

const topEaten = document.getElementById("topEaten");
const topLeft = document.getElementById("topLeft");
const topBurned = document.getElementById("topBurned");

const breakfastSummary = document.getElementById("breakfastSummary");
const lunchSummary = document.getElementById("lunchSummary");
const dinnerSummary = document.getElementById("dinnerSummary");
const snackSummary = document.getElementById("snackSummary");

const sexInput = document.getElementById("sexInput");
const ageInput = document.getElementById("ageInput");

const heightUnitInput = document.getElementById("heightUnitInput");
const heightCmInput = document.getElementById("heightCmInput");
const heightCmGroup = document.getElementById("heightCmGroup");
const heightFtInGroup = document.getElementById("heightFtInGroup");
const heightFeetInput = document.getElementById("heightFeetInput");
const heightInchesInput = document.getElementById("heightInchesInput");

const weightUnitInput = document.getElementById("weightUnitInput");
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

calculateRequirementButton.addEventListener("click", function () {
  calculateCalorieRequirement(true);
});

heightUnitInput.addEventListener("change", handleHeightUnitChange);
weightUnitInput.addEventListener("change", handleWeightUnitChange);

descriptionInput.addEventListener("keydown", function (event) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    analyzeMeal();
  }
});

loadDailyTracker();
loadRequirementInputs();
handleHeightUnitChange(false);
handleWeightUnitChange(false);
calculateCalorieRequirement(false);
updateTopDashboard();

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
      timestamp: new Date().toISOString(),
      date: getTodayDateKey()
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
    " kilocalories.";
}

function addLatestMealToDay() {
  if (!latestAnalysis) {
    showError("Please analyze a meal first.");
    return;
  }

  const meals = getStoredMeals();

  meals.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    ...latestAnalysis,
    date: getTodayDateKey()
  });

  localStorage.setItem("nutrilensDailyMeals", JSON.stringify(meals));

  renderDailyTracker(meals);
  updateRemainingCalories();
  updateTopDashboard();

  screenReaderSummary.textContent =
    latestAnalysis.mealType + " added to daily tracker.";
}

function clearDailyTracker() {
  const meals = getStoredMeals();
  const today = getTodayDateKey();

  const remainingMeals = meals.filter((meal) => meal.date !== today);

  localStorage.setItem("nutrilensDailyMeals", JSON.stringify(remainingMeals));

  renderDailyTracker(remainingMeals);
  updateRemainingCalories();
  updateTopDashboard();

  screenReaderSummary.textContent = "Today’s tracker cleared.";
}

function loadDailyTracker() {
  const meals = getStoredMeals();
  renderDailyTracker(meals);
}

function getStoredMeals() {
  try {
    const raw = localStorage.getItem("nutrilensDailyMeals");
    const meals = raw ? JSON.parse(raw) : [];

    return meals.map((meal) => ({
      ...meal,
      date: meal.date || getDateKeyFromTimestamp(meal.timestamp) || getTodayDateKey()
    }));
  } catch (error) {
    return [];
  }
}

function getTodayMeals() {
  const today = getTodayDateKey();
  return getStoredMeals().filter((meal) => meal.date === today);
}

function getDailyTotals() {
  const meals = getTodayMeals();

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
  const today = getTodayDateKey();
  const todayMeals = meals.filter((meal) => meal.date === today);

  const totals = todayMeals.reduce(
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

  updateMealSummaries(todayMeals);

  if (todayMeals.length === 0) {
    mealLog.innerHTML = buildDeficitSummaryHtml() + "<p>No meals added today.</p>";
    return;
  }

  const groupedMeals = {
    Breakfast: [],
    Lunch: [],
    Dinner: [],
    Snack: []
  };

  todayMeals.forEach((meal) => {
    const type = groupedMeals[meal.mealType] ? meal.mealType : "Snack";
    groupedMeals[type].push(meal);
  });

  mealLog.innerHTML = buildDeficitSummaryHtml();

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

function updateMealSummaries(todayMeals) {
  const mealTargets = {
    Breakfast: 450,
    Lunch: 616,
    Dinner: 450,
    Snack: 150
  };

  const totals = {
    Breakfast: 0,
    Lunch: 0,
    Dinner: 0,
    Snack: 0
  };

  todayMeals.forEach((meal) => {
    const type = totals[meal.mealType] !== undefined ? meal.mealType : "Snack";
    totals[type] += safeNumber(meal.calories);
  });

  breakfastSummary.textContent =
    cleanWholeNumber(totals.Breakfast) + " / " + mealTargets.Breakfast + " Cal";

  lunchSummary.textContent =
    cleanWholeNumber(totals.Lunch) + " / " + mealTargets.Lunch + " Cal";

  dinnerSummary.textContent =
    cleanWholeNumber(totals.Dinner) + " / " + mealTargets.Dinner + " Cal";

  snackSummary.textContent =
    cleanWholeNumber(totals.Snack) + " / " + mealTargets.Snack + " Cal";
}

function updateTopDashboard() {
  const totals = getDailyTotals();
  const eaten = cleanWholeNumber(totals.calories);
  const burned = 0;

  let target = 0;

  if (latestCalorieTarget && latestCalorieTarget.target) {
    target = latestCalorieTarget.target;
  } else {
    const savedTarget = Number(localStorage.getItem("nutrilensLatestTarget"));
    target = Number.isFinite(savedTarget) ? savedTarget : 0;
  }

  const left = Math.max(cleanWholeNumber(target - eaten), 0);

  if (topEaten) topEaten.textContent = eaten;
  if (topLeft) topLeft.textContent = left;
  if (topBurned) topBurned.textContent = burned;
}

function buildDeficitSummaryHtml() {
  const totals = getDailyTotals();
  const target = latestCalorieTarget ? latestCalorieTarget.target : Number(localStorage.getItem("nutrilensLatestTarget"));
  const tdee = latestCalorieTarget ? latestCalorieTarget.tdee : Number(localStorage.getItem("nutrilensLatestTdee"));

  if (!target || !tdee) {
    return `
      <div class="meal-item">
        <strong>Calorie balance:</strong><br />
        Calculate your calorie requirement first to see remaining calories, deficit, and expected weight loss.
      </div>
    `;
  }

  const remainingToTarget = cleanWholeNumber(target - totals.calories);
  const deficitVsTdee = cleanWholeNumber(tdee - totals.calories);

  const lastWeek = calculateLastSevenDayDeficit();
  const expectedLossLb = lastWeek.deficit / 3500;
  const expectedLossKg = lastWeek.deficit / 7700;

  const remainingText =
    remainingToTarget >= 0
      ? `${remainingToTarget} kcal remaining to target`
      : `${Math.abs(remainingToTarget)} kcal above target`;

  const deficitText =
    deficitVsTdee >= 0
      ? `${deficitVsTdee} kcal deficit today vs estimated TDEE`
      : `${Math.abs(deficitVsTdee)} kcal surplus today vs estimated TDEE`;

  return `
    <div class="meal-item">
      <strong>Today calorie balance:</strong><br />
      ${remainingText}<br />
      ${deficitText}
    </div>

    <div class="meal-item">
      <strong>Last 7 days:</strong><br />
      Total calorie deficit: ${cleanWholeNumber(lastWeek.deficit)} kcal<br />
      Expected weight loss: ${cleanNumber(expectedLossLb)} lb (${cleanNumber(expectedLossKg)} kg)
    </div>
  `;
}

function calculateLastSevenDayDeficit() {
  const savedTdee = Number(localStorage.getItem("nutrilensLatestTdee"));
  const tdee = latestCalorieTarget ? latestCalorieTarget.tdee : savedTdee;

  if (!tdee || !Number.isFinite(tdee)) {
    return {
      deficit: 0
    };
  }

  const meals = getStoredMeals();
  const dates = getLastSevenDateKeys();

  let totalDeficit = 0;

  dates.forEach((dateKey) => {
    const dayCalories = meals
      .filter((meal) => meal.date === dateKey)
      .reduce((sum, meal) => sum + safeNumber(meal.calories), 0);

    totalDeficit += tdee - dayCalories;
  });

  return {
    deficit: totalDeficit
  };
}

function handleHeightUnitChange(announce = true) {
  const useFtIn = heightUnitInput.value === "ftin";

  if (useFtIn) {
    const cm = safeNumber(heightCmInput.value);

    if (cm > 0) {
      const totalInches = cm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches - feet * 12);

      heightFeetInput.value = feet;
      heightInchesInput.value = inches;
    }

    heightCmGroup.classList.add("hidden");
    heightFtInGroup.classList.remove("hidden");
  } else {
    const feet = safeNumber(heightFeetInput.value);
    const inches = safeNumber(heightInchesInput.value);
    const totalInches = feet * 12 + inches;

    if (totalInches > 0) {
      heightCmInput.value = Math.round(totalInches * 2.54);
    }

    heightCmGroup.classList.remove("hidden");
    heightFtInGroup.classList.add("hidden");
  }

  saveRequirementInputs();

  if (announce) {
    screenReaderSummary.textContent =
      useFtIn
        ? "Height unit changed to feet and inches."
        : "Height unit changed to centimeters.";
  }
}

function handleWeightUnitChange(announce = true) {
  const currentWeight = safeNumber(weightInput.value);

  if (weightUnitInput.value === "lb") {
    if (currentWeight > 0 && currentWeight < 300) {
      weightInput.value = Math.round(currentWeight * 2.20462);
    }

    weightInput.setAttribute("aria-label", "Weight in pounds");
  } else {
    if (currentWeight > 0 && currentWeight > 60) {
      weightInput.value = Math.round(currentWeight * 0.453592 * 10) / 10;
    }

    weightInput.setAttribute("aria-label", "Weight in kilograms");
  }

  saveRequirementInputs();

  if (announce) {
    screenReaderSummary.textContent =
      weightUnitInput.value === "lb"
        ? "Weight unit changed to pounds."
        : "Weight unit changed to kilograms.";
  }
}

function calculateCalorieRequirement(announce = true) {
  hideError();

  const sex = sexInput.value;
  const age = safeNumber(ageInput.value);
  const activityFactor = Number(activityInput.value);
  const goal = goalInput.value;

  let heightCm;

  if (heightUnitInput.value === "ftin") {
    const feet = safeNumber(heightFeetInput.value);
    const inches = safeNumber(heightInchesInput.value);
    heightCm = (feet * 12 + inches) * 2.54;
  } else {
    heightCm = safeNumber(heightCmInput.value);
  }

  let weightKg;

  if (weightUnitInput.value === "lb") {
    weightKg = safeNumber(weightInput.value) * 0.453592;
  } else {
    weightKg = safeNumber(weightInput.value);
  }

  if (
    age <= 0 ||
    heightCm <= 0 ||
    weightKg <= 0 ||
    !Number.isFinite(activityFactor)
  ) {
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

  localStorage.setItem("nutrilensLatestTarget", latestCalorieTarget.target);
  localStorage.setItem("nutrilensLatestTdee", latestCalorieTarget.tdee);

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
    "<strong>Explanation:</strong> BMR is estimated using the Mifflin–St Jeor equation. Height and weight are converted internally to cm and kg before calculation. TDEE is BMR multiplied by your selected activity factor.";

  updateRemainingCalories();
  renderDailyTracker(getStoredMeals());
  updateTopDashboard();

  if (announce) {
    screenReaderSummary.textContent =
      "Calorie requirement calculated. Estimated target is " +
      latestCalorieTarget.target +
      " kilocalories per day.";
  }
}

function updateRemainingCalories() {
  const savedTarget = Number(localStorage.getItem("nutrilensLatestTarget"));
  const savedTdee = Number(localStorage.getItem("nutrilensLatestTdee"));

  const target = latestCalorieTarget ? latestCalorieTarget.target : savedTarget;
  const tdee = latestCalorieTarget ? latestCalorieTarget.tdee : savedTdee;

  if (!target || !tdee) {
    remainingResult.innerHTML =
      "<strong>Today remaining:</strong> Calculate requirement first.";
    return;
  }

  const totals = getDailyTotals();
  const remaining = cleanWholeNumber(target - totals.calories);
  const deficit = cleanWholeNumber(tdee - totals.calories);

  const remainingText =
    remaining >= 0
      ? remaining + " kcal remaining to target"
      : Math.abs(remaining) + " kcal above target";

  const deficitText =
    deficit >= 0
      ? deficit + " kcal deficit vs estimated TDEE"
      : Math.abs(deficit) + " kcal surplus vs estimated TDEE";

  remainingResult.innerHTML =
    "<strong>Today remaining:</strong> " + remainingText + " | " + deficitText;
}

function saveRequirementInputs() {
  const data = {
    sex: sexInput.value,
    age: ageInput.value,
    heightUnit: heightUnitInput.value,
    heightCm: heightCmInput.value,
    heightFeet: heightFeetInput.value,
    heightInches: heightInchesInput.value,
    weightUnit: weightUnitInput.value,
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
    if (data.heightUnit) heightUnitInput.value = data.heightUnit;
    if (data.heightCm) heightCmInput.value = data.heightCm;
    if (data.heightFeet) heightFeetInput.value = data.heightFeet;
    if (data.heightInches) heightInchesInput.value = data.heightInches;
    if (data.weightUnit) weightUnitInput.value = data.weightUnit;
    if (data.weight) weightInput.value = data.weight;
    if (data.activity) activityInput.value = data.activity;
    if (data.goal) goalInput.value = data.goal;
  } catch (error) {
    return;
  }
}

function getTodayDateKey() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function getDateKeyFromTimestamp(timestamp) {
  if (!timestamp) return null;

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function getLastSevenDateKeys() {
  const dates = [];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
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

function cleanNumber(value) {
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