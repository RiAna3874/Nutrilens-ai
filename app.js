const BACKEND_URL = "/analyze";

const imageInput = document.getElementById("imageInput");
const descriptionInput = document.getElementById("descriptionInput");
const portionInput = document.getElementById("portionInput");
const analyzeButton = document.getElementById("analyzeButton");

const loadingMessage = document.getElementById("loadingMessage");
const errorMessage = document.getElementById("errorMessage");
const screenReaderSummary = document.getElementById("screenReaderSummary");

const foodName = document.getElementById("foodName");
const calories = document.getElementById("calories");
const protein = document.getElementById("protein");
const carbs = document.getElementById("carbs");
const fat = document.getElementById("fat");
const explanation = document.getElementById("explanation");

analyzeButton.addEventListener("click", analyzeMeal);

descriptionInput.addEventListener("keydown", function (event) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    analyzeMeal();
  }
});

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

    updateResults(data);
  } catch (error) {
    showError(error.message || "Failed to fetch");
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze meal";
    hideLoading();
  }
}

function updateResults(data) {
  const food = safeText(data.food, "Unknown food");
  const calorieValue = safeNumber(data.calories);
  const proteinValue = safeNumber(data.protein);
  const carbValue = safeNumber(data.carbs);
  const fatValue = safeNumber(data.fat);
  const explanationText = safeText(
    data.explanation,
    "Nutrition estimated from available information."
  );

  foodName.innerHTML = "<strong>Food:</strong> " + escapeHtml(food);
  calories.innerHTML = "<strong>Calories:</strong> " + calorieValue + " kcal";
  protein.innerHTML = "<strong>Protein:</strong> " + proteinValue + " g";
  carbs.innerHTML = "<strong>Carbs:</strong> " + carbValue + " g";
  fat.innerHTML = "<strong>Fat:</strong> " + fatValue + " g";
  explanation.innerHTML =
    "<strong>Explanation:</strong> " + escapeHtml(explanationText);

  screenReaderSummary.textContent =
    "Analysis complete. Food: " +
    food +
    ". Calories: " +
    calorieValue +
    " kilocalories. Protein: " +
    proteinValue +
    " grams. Carbohydrates: " +
    carbValue +
    " grams. Fat: " +
    fatValue +
    " grams.";
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