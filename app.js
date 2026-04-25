const BACKEND_URL = "/analyze";

const $ = (id) => document.getElementById(id);

const imageInput = $("imageInput");
const descriptionInput = $("descriptionInput");
const portionInput = $("portionInput");
const mealTypeInput = $("mealTypeInput");

const foodSearchInput = $("foodSearchInput");
const foodSearchResults = $("foodSearchResults");

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

const prevDateButton = $("prevDateButton");
const nextDateButton = $("nextDateButton");
const currentDateLabel = $("currentDateLabel");

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
let selectedSearchFood = null;
let searchTimer = null;
let selectedDate = new Date();

if (analyzeButton) analyzeButton.addEventListener("click", analyzeMeal);
if (addToDayButton) addToDayButton.addEventListener("click", addLatestMealToDay);
if (clearDayButton) clearDayButton.addEventListener("click", clearDailyTracker);
if (foodSearchInput) foodSearchInput.addEventListener("input", handleFoodSearchInput);

if (prevDateButton) {
  prevDateButton.addEventListener("click", function () {
    changeSelectedDate(-1);
  });
}

if (nextDateButton) {
  nextDateButton.addEventListener("click", function () {
    changeSelectedDate(1);
  });
}

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

document.addEventListener("click", function (event) {
  if (!foodSearchResults || !foodSearchInput) return;

  if (!foodSearchResults.contains(event.target) && event.target !== foodSearchInput) {
    hideFoodSearchResults();
  }
});

loadRequirementInputs();
handleHeightUnitChange(false);
handleWeightUnitChange(false);
calculateCalorieRequirement(false);
updateDateLabel();
renderDailyTracker(getStoredMeals());
updateTopDashboard();

function changeSelectedDate(days) {
  selectedDate.setDate(selectedDate.getDate() + days);
  latestAddedMealId = null;
  updateDateLabel();
  renderDailyTracker(getStoredMeals());
  updateRemainingCalories();
  updateTopDashboard();
}

function getSelectedDateKey() {
  return selectedDate.toISOString().slice(0, 10);
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function updateDateLabel() {
  if (!currentDateLabel) return;

  const selectedKey = getSelectedDateKey();
  const todayKey = getTodayDateKey();

  if (selectedKey === todayKey) {
    currentDateLabel.textContent = "📅 Today";
    return;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (selectedKey === yesterdayKey) {
    currentDateLabel.textContent = "📅 Yesterday";
    return;
  }

  currentDateLabel.textContent =
    "📅 " +
    selectedDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
}

async function handleFoodSearchInput() {
  selectedSearchFood = null;

  const query = foodSearchInput.value.trim();

  if (query.length < 2) {
    hideFoodSearchResults();
    return;
  }

  clearTimeout(searchTimer);

  searchTimer = setTimeout(async () => {
    try {
      foodSearchResults.innerHTML = `<div class="search-result-item">Searching...</div>`;
      foodSearchResults.classList.remove("hidden");

      const response = await fetch(`/api/search-food?q=${encodeURIComponent(query)}`);
      const foods = await response.json();

      if (!response.ok) {
        throw new Error(foods.error || "Food search failed.");
      }

      if (!Array.isArray(foods) || foods.length === 0) {
        foodSearchResults.innerHTML = `<div class="search-result-item">No foods found.</div>`;
        return;
      }

      foodSearchResults.innerHTML = foods
        .map(
          (food) => `
            <div class="search-result-item" data-food-id="${food.id}">
              <div class="search-result-name">${escapeHtml(food.name)}</div>
              <div class="search-result-meta">
                ${cleanNumber(food.calories)} kcal / 100g
                ${food.protein ? " • P " + cleanNumber(food.protein) + "g" : ""}
                ${food.carbs ? " • C " + cleanNumber(food.carbs) + "g" : ""}
                ${food.fat ? " • F " + cleanNumber(food.fat) + "g" : ""}
                ${food.brand ? " • " + escapeHtml(food.brand) : ""}
              </div>
            </div>
          `
        )
        .join("");

      document.querySelectorAll(".search-result-item").forEach((item) => {
        item.addEventListener("click", () => {
          const selected = foods.find(
            (food) => String(food.id) === String(item.dataset.foodId)
          );

          if (!selected) return;

          selectedSearchFood = selected;
          foodSearchInput.value = selected.name;
          descriptionInput.value = selected.name;
          hideFoodSearchResults();

          latestAnalysis = calculateSelectedFoodNutrition(selected);
          updateResults(latestAnalysis);

          if (addToDayButton) {
            addToDayButton.disabled = false;
            addToDayButton.textContent = "Add to daily tracker";
          }
        });
      });
    } catch (error) {
      console.error("Food search error:", error);
      foodSearchResults.innerHTML = `<div class="search-result-item">Search failed. Check USDA_API_KEY.</div>`;
      foodSearchResults.classList.remove("hidden");
    }
  }, 350);
}

function hideFoodSearchResults() {
  if (!foodSearchResults) return;
  foodSearchResults.innerHTML = "";
  foodSearchResults.classList.add("hidden");
}

function calculateSelectedFoodNutrition(food) {
  const grams = safeNumber(portionInput?.value || 100);
  const multiplier = grams / 100;

  return {
    id: createId(),
    mealType: mealTypeInput?.value || "Snack",
    food: `${food.name} (${grams}g)`,
    calories: cleanNumber(food.calories * multiplier),
    protein: cleanNumber(food.protein * multiplier),
    carbs: cleanNumber(food.carbs * multiplier),
    fat: cleanNumber(food.fat * multiplier),
    explanation: "Estimated from selected USDA FoodData Central search result.",
    timestamp: new Date().toISOString(),
    date: getSelectedDateKey()
  };
}

async function analyzeMeal() {
  hideError();
  hideLoading();

  if (selectedSearchFood) {
    latestAnalysis = calculateSelectedFoodNutrition(selectedSearchFood);
    updateResults(latestAnalysis);

    if (addToDayButton) {
      addToDayButton.disabled = false;
      addToDayButton.textContent = "Add to daily tracker";
    }

    return;
  }

  const imageFile = imageInput?.files?.[0];
  const description = descriptionInput?.value?.trim() || "";
  const portion = portionInput?.value || "100";

  if (!imageFile && !description) {
    showError("Please upload a food image, search food, or type a food description.");
    descriptionInput?.focus();
    return;
  }

  if (Number(portion) <= 0) {
    showError("Please enter a portion size greater than 0 grams.");
    portionInput?.focus();
    return;
  }

  const formData = new FormData();

  if (imageFile) formData.append("image", imageFile);

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

    if (!responseText) throw new Error("Backend returned an empty response.");

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Backend did not return valid JSON.");
    }

    if (!response.ok) throw new Error(data.error || "Meal analysis failed.");

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
      date: getSelectedDateKey()
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
    showError("Please analyze or select a food first, then click Add to daily tracker.");
    return;
  }

  const originalText = addToDayButton.textContent;
  addToDayButton.disabled = true;
  addToDayButton.textContent = "Adding... ⏳";

  const meals = getStoredMeals();

  const newMeal = {
    ...latestAnalysis,
    id: createId(),
    mealType: mealTypeInput?.value || latestAnalysis.mealType || "Snack",
    date: getSelectedDateKey(),
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
  if (foodSearchInput) foodSearchInput.value = "";
  if (imageInput) imageInput.value = "";

  selectedSearchFood = null;
  latestAnalysis = null;

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
  const selectedKey = getSelectedDateKey();
  const remainingMeals = meals.filter((meal) => meal.date !== selectedKey);

  localStorage.setItem("nutrilensDailyMeals", JSON.stringify(remainingMeals));

  renderDailyTracker(remainingMeals);
  updateRemainingCalories();
  updateTopDashboard();

  setTimeout(() => {
    clearDayButton.textContent = "Cleared ✓";
  }, 250);

  setTimeout(() => {
    clearDayButton.textContent = originalText || "Clear selected day";
    clearDayButton.disabled = false;
  }, 1200);

  announce("Selected day tracker cleared.");
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

function getSelectedDayMeals() {
  const selectedKey = getSelectedDateKey();
  return getStoredMeals().filter((meal) => meal.date === selectedKey);
}

function getDailyTotals() {
  return getSelectedDayMeals().reduce(
    (sum, meal) => {
      sum.calories += safeNumber(meal.calories);
      sum.protein += safeNumber(meal.protein);
      sum.carbs += safeNumber(meal.carbs);
      sum.fat += safeNumber(meal.fat);
      return sum;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function renderDailyTracker(meals) {
  const selectedKey = getSelectedDateKey();
  const selectedMeals = meals.filter((meal) => meal.date === selectedKey);

  updateMealSummaries(selectedMeals);

  if (!mealLog) return;

  if (selectedMeals.length === 0) {
    mealLog.innerHTML = buildDeficitSummaryHtml() + "<p>No meals added for this day.</p>";
    return;
  }

  const groupedMeals = {
    Breakfast: [],
    Lunch: [],
    Dinner: [],
    Snack: []
  };

  selectedMeals.forEach((meal) => {
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

function updateMealSummaries(dayMeals) {
  const mealTargets = { Breakfast: 450, Lunch: 616, Dinner: 450, Snack: 150 };
  const totals = { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 };

  dayMeals.forEach((meal) => {
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
      ? `${deficitVsTdee} kcal deficit for selected day vs estimated TDEE`
      : `${Math.abs(deficitVsTdee)} kcal surplus for selected day vs estimated TDEE`;

  return `
    <div class="meal-item">
      <strong>Selected day calorie balance:</strong><br />
      ${remainingText}<br />
      ${deficitText}
    </div>

    <div class="meal-item">
      <strong>Last 7 logged days from selected date:</strong><br />
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
    return { deficit: 0, loggedDays: 0 };
  }

  const meals = getStoredMeals();
  const dates = getLastSevenDateKeysFromSelectedDate();

  let totalDeficit = 0;
  let loggedDays = 0;

  dates.forEach((dateKey) => {
    const mealsForDay = meals.filter((meal) => meal.date === dateKey);
    if (mealsForDay.length === 0) return;

    const dayCalories = mealsForDay.reduce(
      (sum, meal) => sum + safeNumber(meal.calories),
      0
    );

    totalDeficit += tdee - dayCalories;
    loggedDays += 1;
  });

  return { deficit: totalDeficit, loggedDays };
}

function getLastSevenDateKeysFromSelectedDate() {
  const dates = [];
  const baseDate = new Date(selectedDate);

  for (let i = 0; i < 7; i++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - i);
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
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

function getDateKeyFromTimestamp(timestamp) {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
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
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + String(Math.random());
}

function safeText(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
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