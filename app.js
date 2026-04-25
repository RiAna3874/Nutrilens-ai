const BACKEND_URL = "/analyze";

const $ = (id) => document.getElementById(id);

const imageInput = $("imageInput");
const descriptionInput = $("descriptionInput");
const portionInput = $("portionInput");
const mealTypeInput = $("mealTypeInput");

const analyzeButton = $("analyzeButton");
const addToDayButton = $("addToDayButton");
const clearDayButton = $("clearDayButton");

const loadingMessage = $("loadingMessage");
const errorMessage = $("errorMessage");
const screenReaderSummary = $("screenReaderSummary");

const foodName = $("foodName");
const calories = $("calories");
const protein = $("protein");
const carbs = $("carbs");
const fat = $("fat");
const explanation = $("explanation");

const mealLog = $("mealLog");

const topEaten = $("topEaten");
const topLeft = $("topLeft");
const topBurned = $("topBurned");

const breakfastSummary = $("breakfastSummary");
const lunchSummary = $("lunchSummary");
const dinnerSummary = $("dinnerSummary");
const snackSummary = $("snackSummary");

const sexInput = $("sexInput");
const ageInput = $("ageInput");
const heightUnitInput = $("heightUnitInput");
const heightCmInput = $("heightCmInput");
const heightCmGroup = $("heightCmGroup");
const heightFtInGroup = $("heightFtInGroup");
const heightFeetInput = $("heightFeetInput");
const heightInchesInput = $("heightInchesInput");
const weightUnitInput = $("weightUnitInput");
const weightInput = $("weightInput");
const activityInput = $("activityInput");
const goalInput = $("goalInput");
const calculateRequirementButton = $("calculateRequirementButton");

const bmrResult = $("bmrResult");
const tdeeResult = $("tdeeResult");
const targetResult = $("targetResult");
const remainingResult = $("remainingResult");
const requirementExplanation = $("requirementExplanation");

let latestAnalysis = null;
let latestCalorieTarget = null;
let latestAddedMealId = null;

if (analyzeButton) analyzeButton.addEventListener("click", analyzeMeal);
if (addToDayButton) addToDayButton.addEventListener("click", addLatestMealToDay);
if (clearDayButton) clearDayButton.addEventListener("click", clearDailyTracker);

if (calculateRequirementButton) {
  calculateRequirementButton.addEventListener("click", function () {
    calculateCalorieRequirement(true);
  });
}

if (heightUnitInput) heightUnitInput.addEventListener("change", handleHeightUnitChange);
if (weightUnitInput) weightUnitInput.addEventListener("change", handleWeightUnitChange);

if (descriptionInput) {
  descriptionInput.addEventListener("keydown", function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      analyzeMeal();
    }
  });
}

loadRequirementInputs();
handleHeightUnitChange(false);
handleWeightUnitChange(false);
calculateCalorieRequirement(false);
renderDailyTracker(getStoredMeals());
updateTopDashboard();

async function analyzeMeal() {
  hideError();
  hideLoading();

  const imageFile = imageInput?.files?.[0];
  const description = descriptionInput?.value?.trim() || "";
  const portion = portionInput?.value || "100";

  if (!imageFile && !description) {
    showError("Please upload a food image or type a food description.");
    descriptionInput?.focus();
    return;
  }

  if (Number(portion) <= 0) {
    showError("Please enter a portion size greater than 0 grams.");
    portionInput?.focus();
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
    } catch {
      throw new Error("Backend did not return valid JSON.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Meal analysis failed.");
    }

    latestAnalysis = {
      id: createId(),
      mealType: mealTypeInput?.value || "Snack",
      food: safeText(data.food, "Unknown food"),
      calories: safeNumber(data.calories),
      protein: safeNumber(data.protein),
      carbs: safeNumber(data.carbs),
      fat: safeNumber(data.fat),
      explanation: safeText(data.explanation, "Nutrition estimated from available information."),
      timestamp: new Date().toISOString(),
      date: getTodayDateKey()
    };

    updateResults(latestAnalysis);
    addToDayButton.disabled = false;
    addToDayButton.textContent = "Add to daily tracker";
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

function addLatestMealToDay() {
  hideError();

  if (!latestAnalysis) {
    showError("Please analyze a meal first, then click Add to daily tracker.");
    return;
  }

  const originalText = addToDayButton.textContent;
  addToDayButton.disabled = true;
  addToDayButton.textContent = "Adding... ⏳";

  const meals = getStoredMeals();

  const newMeal = {
    ...latestAnalysis,
    id: createId(),
    date: getTodayDateKey(),
    timestamp: new Date().toISOString()
  };

  latestAddedMealId = newMeal.id;

  meals.push(newMeal);
  localStorage.setItem("nutrilensDailyMeals", JSON.stringify(meals));

  renderDailyTracker(meals);
  updateRemainingCalories();
  updateTopDashboard();

  setTimeout(() => {
    addToDayButton.textContent = "Added ✓";
  }, 250);

  setTimeout(() => {
    addToDayButton.textContent = originalText || "Add to daily tracker";
    addToDayButton.disabled = true;
  }, 1400);

  if (descriptionInput) descriptionInput.value = "";
  if (imageInput) imageInput.value = "";

  announce(`${newMeal.food} added to ${newMeal.mealType}.`);
}

function updateResults(data) {
  if (foodName) foodName.innerHTML = "<strong>Food:</strong> " + escapeHtml(data.food);
  if (calories) calories.innerHTML = "<strong>Calories:</strong> " + data.calories + " kcal";
  if (protein) protein.innerHTML = "<strong>Protein:</strong> " + data.protein + " g";
  if (carbs) carbs.innerHTML = "<strong>Carbs:</strong> " + data.carbs + " g";
  if (fat) fat.innerHTML = "<strong>Fat:</strong> " + data.fat + " g";
  if (explanation) explanation.innerHTML = "<strong>Explanation:</strong> " + escapeHtml(data.explanation);

  announce("Analysis complete.");
}

function clearDailyTracker() {
  const originalText = clearDayButton.textContent;
  clearDayButton.disabled = true;
  clearDayButton.textContent = "Clearing...";

  const meals = getStoredMeals();
  const today = getTodayDateKey();
  const remainingMeals = meals.filter((meal) => meal.date !== today);

  localStorage.setItem("nutrilensDailyMeals", JSON.stringify(remainingMeals));

  renderDailyTracker(remainingMeals);
  updateRemainingCalories();
  updateTopDashboard();

  setTimeout(() => {
    clearDayButton.textContent = "Cleared ✓";
  }, 250);

  setTimeout(() => {
    clearDayButton.textContent = originalText || "Clear daily tracker";
    clearDayButton.disabled = false;
  }, 1200);

  announce("Today’s tracker cleared.");
}

function getStoredMeals() {
  try {
    const raw = localStorage.getItem("nutrilensDailyMeals");
    const meals = raw ? JSON.parse(raw) : [];

    return meals.map((meal) => ({
      ...meal,
      date: meal.date || getDateKeyFromTimestamp(meal.timestamp) || getTodayDateKey()
    }));
  } catch {
    return [];
  }
}

function getTodayMeals() {
  const today = getTodayDateKey();
  return getStoredMeals().filter((meal) => meal.date === today);
}

function getDailyTotals() {
  return getTodayMeals().reduce(
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

  updateMealSummaries(todayMeals);

  if (!mealLog) return;

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

    if (group.length === 0) return;

    const section = document.createElement("section");
    section.className = "meal-section";

    const heading = document.createElement("h3");
    heading.textContent = mealType;
    section.appendChild(heading);

    group.forEach((meal) => {
      const item = document.createElement("div");
      item.className = meal.id === latestAddedMealId ? "meal-item new-item" : "meal-item";

      item.innerHTML =
        "<strong>" +
        escapeHtml(meal.food) +
        "</strong><br />" +
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

  if (breakfastSummary) breakfastSummary.textContent = `${cleanWholeNumber(totals.Breakfast)} / ${mealTargets.Breakfast} Cal`;
  if (lunchSummary) lunchSummary.textContent = `${cleanWholeNumber(totals.Lunch)} / ${mealTargets.Lunch} Cal`;
  if (dinnerSummary) dinnerSummary.textContent = `${cleanWholeNumber(totals.Dinner)} / ${mealTargets.Dinner} Cal`;
  if (snackSummary) snackSummary.textContent = `${cleanWholeNumber(totals.Snack)} / ${mealTargets.Snack} Cal`;
}

function updateTopDashboard() {
  const totals = getDailyTotals();
  const eaten = cleanWholeNumber(totals.calories);
  const burned = 0;

  const savedTarget = Number(localStorage.getItem("nutrilensLatestTarget"));
  const target =
    latestCalorieTarget && latestCalorieTarget.target
      ? latestCalorieTarget.target
      : Number.isFinite(savedTarget)
        ? savedTarget
        : 0;

  const left = Math.max(cleanWholeNumber(target - eaten), 0);

  if (topEaten) topEaten.textContent = eaten;
  if (topLeft) topLeft.textContent = left;
  if (topBurned) topBurned.textContent = burned;
}

function buildDeficitSummaryHtml() {
  const totals = getDailyTotals();

  const savedTarget = Number(localStorage.getItem("nutrilensLatestTarget"));
  const savedTdee = Number(localStorage.getItem("nutrilensLatestTdee"));

  const target = latestCalorieTarget?.target || savedTarget;
  const tdee = latestCalorieTarget?.tdee || savedTdee;

  if (!target || !tdee || !Number.isFinite(target) || !Number.isFinite(tdee)) {
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
  const loggedDays = lastWeek.loggedDays || 0;

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
      <strong>Last 7 logged days:</strong><br />
      Logged days counted: ${loggedDays}<br />
      Total calorie deficit from logged days only: ${cleanWholeNumber(lastWeek.deficit)} kcal<br />
      Expected weight change: ${cleanNumber(expectedLossLb)} lb (${cleanNumber(expectedLossKg)} kg)
    </div>
  `;
}

function calculateLastSevenDayDeficit() {
  const savedTdee = Number(localStorage.getItem("nutrilensLatestTdee"));
  const tdee = latestCalorieTarget?.tdee || savedTdee;

  if (!tdee || !Number.isFinite(tdee)) {
    return {
      deficit: 0,
      loggedDays: 0
    };
  }

  const meals = getStoredMeals();
  const dates = getLastSevenDateKeys();

  let totalDeficit = 0;
  let loggedDays = 0;

  dates.forEach((dateKey) => {
    const mealsForDay = meals.filter((meal) => meal.date === dateKey);

    if (mealsForDay.length === 0) {
      return;
    }

    const dayCalories = mealsForDay.reduce(
      (sum, meal) => sum + safeNumber(meal.calories),
      0
    );

    totalDeficit += tdee - dayCalories;
    loggedDays += 1;
  });

  return {
    deficit: totalDeficit,
    loggedDays
  };
}

function handleHeightUnitChange(announceChange = true) {
  if (!heightUnitInput || !heightCmGroup || !heightFtInGroup) return;

  const useFtIn = heightUnitInput.value === "ftin";

  if (useFtIn) {
    const cm = safeNumber(heightCmInput?.value);

    if (cm > 0) {
      const totalInches = cm / 2.54;
      heightFeetInput.value = Math.floor(totalInches / 12);
      heightInchesInput.value = Math.round(totalInches % 12);
    }

    heightCmGroup.classList.add("hidden");
    heightFtInGroup.classList.remove("hidden");
  } else {
    const feet = safeNumber(heightFeetInput?.value);
    const inches = safeNumber(heightInchesInput?.value);
    const totalInches = feet * 12 + inches;

    if (totalInches > 0) {
      heightCmInput.value = Math.round(totalInches * 2.54);
    }

    heightCmGroup.classList.remove("hidden");
    heightFtInGroup.classList.add("hidden");
  }

  saveRequirementInputs();

  if (announceChange) {
    announce(useFtIn ? "Height unit changed to feet and inches." : "Height unit changed to centimeters.");
  }
}

function handleWeightUnitChange(announceChange = true) {
  if (!weightUnitInput || !weightInput) return;

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

  if (announceChange) {
    announce(weightUnitInput.value === "lb" ? "Weight unit changed to pounds." : "Weight unit changed to kilograms.");
  }
}

function calculateCalorieRequirement(announceChange = true) {
  if (!sexInput || !ageInput || !activityInput || !goalInput) return;

  hideError();

  const sex = sexInput.value;
  const age = safeNumber(ageInput.value);
  const activityFactor = Number(activityInput.value);
  const goal = goalInput.value;

  let heightCm;

  if (heightUnitInput?.value === "ftin") {
    const feet = safeNumber(heightFeetInput?.value);
    const inches = safeNumber(heightInchesInput?.value);
    heightCm = (feet * 12 + inches) * 2.54;
  } else {
    heightCm = safeNumber(heightCmInput?.value);
  }

  let weightKg;

  if (weightUnitInput?.value === "lb") {
    weightKg = safeNumber(weightInput?.value) * 0.453592;
  } else {
    weightKg = safeNumber(weightInput?.value);
  }

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

  localStorage.setItem("nutrilensLatestTarget", latestCalorieTarget.target);
  localStorage.setItem("nutrilensLatestTdee", latestCalorieTarget.tdee);

  saveRequirementInputs();

  if (bmrResult) bmrResult.innerHTML = `<strong>BMR:</strong> ${latestCalorieTarget.bmr} kcal/day`;
  if (tdeeResult) tdeeResult.innerHTML = `<strong>Estimated TDEE:</strong> ${latestCalorieTarget.tdee} kcal/day`;
  if (targetResult) targetResult.innerHTML = `<strong>Suggested target:</strong> ${latestCalorieTarget.target} kcal/day for ${escapeHtml(goalText)}`;
  if (requirementExplanation) {
    requirementExplanation.innerHTML =
      "<strong>Explanation:</strong> BMR is estimated using the Mifflin–St Jeor equation. Height and weight are converted internally to cm and kg before calculation.";
  }

  updateRemainingCalories();
  renderDailyTracker(getStoredMeals());
  updateTopDashboard();

  if (announceChange) {
    announce(`Calorie requirement calculated. Estimated target is ${latestCalorieTarget.target} kilocalories per day.`);
  }
}

function updateRemainingCalories() {
  if (!remainingResult) return;

  const savedTarget = Number(localStorage.getItem("nutrilensLatestTarget"));
  const savedTdee = Number(localStorage.getItem("nutrilensLatestTdee"));

  const target = latestCalorieTarget?.target || savedTarget;
  const tdee = latestCalorieTarget?.tdee || savedTdee;

  if (!target || !tdee || !Number.isFinite(target) || !Number.isFinite(tdee)) {
    remainingResult.innerHTML = "<strong>Today remaining:</strong> Calculate requirement first.";
    return;
  }

  const totals = getDailyTotals();
  const remaining = cleanWholeNumber(target - totals.calories);
  const deficit = cleanWholeNumber(tdee - totals.calories);

  const remainingText =
    remaining >= 0
      ? `${remaining} kcal remaining to target`
      : `${Math.abs(remaining)} kcal above target`;

  const deficitText =
    deficit >= 0
      ? `${deficit} kcal deficit vs estimated TDEE`
      : `${Math.abs(deficit)} kcal surplus vs estimated TDEE`;

  remainingResult.innerHTML = `<strong>Today remaining:</strong> ${remainingText} | ${deficitText}`;
}

function saveRequirementInputs() {
  const data = {
    sex: sexInput?.value,
    age: ageInput?.value,
    heightUnit: heightUnitInput?.value,
    heightCm: heightCmInput?.value,
    heightFeet: heightFeetInput?.value,
    heightInches: heightInchesInput?.value,
    weightUnit: weightUnitInput?.value,
    weight: weightInput?.value,
    activity: activityInput?.value,
    goal: goalInput?.value
  };

  localStorage.setItem("nutrilensRequirementInputs", JSON.stringify(data));
}

function loadRequirementInputs() {
  try {
    const raw = localStorage.getItem("nutrilensRequirementInputs");
    if (!raw) return;

    const data = JSON.parse(raw);

    if (data.sex && sexInput) sexInput.value = data.sex;
    if (data.age && ageInput) ageInput.value = data.age;
    if (data.heightUnit && heightUnitInput) heightUnitInput.value = data.heightUnit;
    if (data.heightCm && heightCmInput) heightCmInput.value = data.heightCm;
    if (data.heightFeet && heightFeetInput) heightFeetInput.value = data.heightFeet;
    if (data.heightInches && heightInchesInput) heightInchesInput.value = data.heightInches;
    if (data.weightUnit && weightUnitInput) weightUnitInput.value = data.weightUnit;
    if (data.weight && weightInput) weightInput.value = data.weight;
    if (data.activity && activityInput) activityInput.value = data.activity;
    if (data.goal && goalInput) goalInput.value = data.goal;
  } catch {
    return;
  }
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDateKeyFromTimestamp(timestamp) {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

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
  if (errorMessage) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
  }

  announce("Error: " + message);
}

function hideError() {
  if (errorMessage) {
    errorMessage.textContent = "";
    errorMessage.classList.add("hidden");
  }
}

function showLoading(message) {
  if (loadingMessage) {
    loadingMessage.textContent = message;
    loadingMessage.classList.remove("hidden");
  }

  announce(message);
}

function hideLoading() {
  if (loadingMessage) {
    loadingMessage.textContent = "";
    loadingMessage.classList.add("hidden");
  }
}

function announce(message) {
  if (screenReaderSummary) {
    screenReaderSummary.textContent = message;
  }
}

function createId() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return String(Date.now()) + String(Math.random());
}

function safeText(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}

function safeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 10) / 10;
}

function cleanWholeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

function cleanNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
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