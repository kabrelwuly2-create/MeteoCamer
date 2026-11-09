const forecastContainer = document.querySelector("#forecast");
const forecastDetails = document.querySelector("#forecastDetails");

const forecastWeatherDescriptions = {
    0: "Ciel dégagé",
    1: "Principalement dégagé",
    2: "Partiellement nuageux",
    3: "Couvert",
    45: "Brouillard",
    48: "Brouillard givrant",
    51: "Bruine légère",
    53: "Bruine modérée",
    55: "Bruine dense",
    56: "Bruine verglaçante légère",
    57: "Bruine verglaçante dense",
    61: "Pluie faible",
    63: "Pluie modérée",
    65: "Pluie forte",
    66: "Pluie verglaçante faible",
    67: "Pluie verglaçante forte",
    71: "Neige faible",
    73: "Neige modérée",
    75: "Neige forte",
    77: "Grains de neige",
    80: "Averses faibles",
    81: "Averses modérées",
    82: "Averses violentes",
    85: "Averses de neige faibles",
    86: "Averses de neige fortes",
    95: "Orage",
    96: "Orage avec grêle faible",
    99: "Orage avec grêle forte"
};

async function getWeatherForecast(longitude, latitude) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    // Les variables daily fournissent une prévision par jour, avec les températures min/max et le risque de pluie.
    url.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        daily: [
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max"
        ].join(","),
        forecast_days: "5",
        timezone: "auto"
    }).toString();

    // Interrompt la requête si le serveur ne répond pas afin que la page ne reste pas bloquée.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response;

    try {
        response = await fetch(url, { signal: controller.signal });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("Open-Meteo ne répond pas. Réessayez dans quelques instants.");
        }

        throw new Error("Impossible de joindre Open-Meteo. Vérifiez votre connexion Internet.");
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(`Open-Meteo a répondu avec l'erreur HTTP ${response.status}.`);
    }

    const data = await response.json();
    if (
        !Array.isArray(data.daily?.time) ||
        !Array.isArray(data.daily.weather_code) ||
        !Array.isArray(data.daily.temperature_2m_min) ||
        !Array.isArray(data.daily.temperature_2m_max) ||
        !Array.isArray(data.daily.precipitation_probability_max) ||
        !data.daily_units
    ) {
        throw new Error("La réponse des prévisions météo est invalide.");
    }

    return data;
}

function displayForecast(data) {
    const { daily, daily_units: units } = data;
    forecastDetails.replaceChildren();

    daily.time.forEach((date, index) => {
        const card = document.createElement("article");
        card.className = "weather-card";

        const day = document.createElement("h3");
        const condition = document.createElement("p");
        const temperatures = document.createElement("p");
        const rainProbability = document.createElement("p");

        // Le midi UTC permet d'afficher le bon jour sans décalage lié au fuseau horaire du navigateur.
        day.textContent = new Intl.DateTimeFormat("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC"
        }).format(new Date(`${date}T12:00:00Z`));
        condition.textContent = forecastWeatherDescriptions[daily.weather_code[index]]
            ?? "Conditions inconnues";
        temperatures.textContent =
            `${daily.temperature_2m_min[index]}${units.temperature_2m_min} / ` +
            `${daily.temperature_2m_max[index]}${units.temperature_2m_max}`;

        const probability = daily.precipitation_probability_max[index];
        rainProbability.textContent = probability === null || probability === undefined
            ? "Probabilité de pluie indisponible"
            : `Probabilité de pluie : ${probability}${units.precipitation_probability_max}`;

        card.append(day, condition, temperatures, rainProbability);
        forecastDetails.append(card);
    });

    forecastContainer.hidden = false;
}