document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');

    analyzeBtn.addEventListener('click', async () => {
        const imageFile = document.getElementById('imageInput').files[0];
        if (!imageFile) return alert("Select an image!");

        document.getElementById('resultTitle').innerText = "Analyzing...";

        const toBase64 = f => new Promise((res) => {
            const r = new FileReader();
            r.readAsDataURL(f);
            r.onload = () => res(r.result);
        });

        try {
            const base64Image = await toBase64(imageFile);

            const response = await fetch('http://localhost:3000/api/analyze-food', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: document.getElementById('descBox').value,
                    grams: document.getElementById('gramBox').value,
                    imageData: base64Image
                })
            });

            const data = await response.json();

            // Update the screen
            document.getElementById('mealCalories').innerText = data.calories || 0;
            document.getElementById('mealProtein').innerText = data.protein || 0;
            document.getElementById('mealCarbs').innerText = data.carbs || 0;
            document.getElementById('mealFat').innerText = data.fat || 0;
            document.getElementById('resultTitle').innerText = `Food: ${data.name}`;

        } catch (error) {
            console.error(error);
            document.getElementById('resultTitle').innerText = "⚠️ Error - Check Terminal";
        }
    });
});