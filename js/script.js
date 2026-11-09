const form = document.querySelector("#weatherForm");
const cityInput = document.querySelector("#cityName");
const searchButton = document.querySelector("#searchButton");
const locateButton = document.querySelector("#locateButton");
const statusMessage = document.querySelector("#statusMessage");
const weatherSection = document.querySelector("#weather");
const forecastSection = document.querySelector("#forecast");
const locationName = document.querySelector("#locationName");
const weatherDetails = document.querySelector("#weatherDetails");

const currentVariables = [
    "temperature_2m",
    "relative_humidity_2m",
    "rain",
    "wind_speed_10m"
];// Seules les quatre mesures demandées sont récupérées auprès d'Open-Meteo.

const weatherLabels = {
    temperature_2m: "Température",
    relative_humidity_2m: "Humidité actuelle",
    wind_speed_10m: "Vitesse du vent",
    rain: "Quantité de pluie"
};

async function getCoordinates(city) {
    const url = new URL("https://photon.komoot.io/api/");
    url.search = new URLSearchParams({ q: city, limit: "1" }).toString();

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Le service de recherche de villes est indisponible.");
    }

    const data = await response.json();
    const feature = data.features?.[0];
    const coordinates = feature?.geometry?.coordinates;

    if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
        throw new Error("Ville introuvable. Vérifiez le nom saisi.");
    }

    // Photon fournit les coordonnées dans l'ordre longitude, latitude.
    const [longitude, latitude] = coordinates;
    const properties = feature.properties ?? {};
    const name = properties.name ?? properties.city ?? city;
    const location = [name, properties.state, properties.country].filter(Boolean).join(", ");

    return { longitude, latitude, location };
}

async function getLocationName(longitude, latitude) {
    const url = new URL("https://photon.komoot.io/reverse");
    url.search = new URLSearchParams({
        lon: String(longitude),
        lat: String(latitude),
        limit: "1"
    }).toString();

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Le service de localisation ne répond pas.");
    }

    const data = await response.json();
    const properties = data.features?.[0]?.properties;
    if (!properties) {
        throw new Error("Aucun nom de lieu n'a été trouvé pour cette position.");
    }

    // Utilise d'abord une ville ou une localité, plutôt que le nom d'un bâtiment proche.
    const locality = properties.city
        ?? properties.town
        ?? properties.village
        ?? properties.municipality
        ?? properties.district
        ?? properties.name;

    if (!locality) {
        throw new Error("Aucun nom de ville n'a été trouvé pour cette position.");
    }

    return [locality, properties.state, properties.country]
        .filter((part, index, parts) => part && parts.indexOf(part) === index)
        .join(", ");
}

async function getCurrentWeather(longitude, latitude) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    // La liste explicite des variables indique à Open-Meteo les mesures actuelles à renvoyer.
    url.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: currentVariables.join(","),
        timezone: "auto"
    }).toString();

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Le service météo est momentanément indisponible.");
    }

    const data = await response.json();
    if (!data.current || !data.current_units) {
        throw new Error("La réponse météo ne contient pas les données attendues.");
    }

    return data;
}

function displayWeather(location, data) {
    const { current, current_units: units } = data;
    locationName.textContent = location;
    weatherDetails.replaceChildren();

    for (const [key, label] of Object.entries(weatherLabels)) {
        const value = current[key];
        if (value === undefined || value === null) continue;

        const detail = document.createElement("article");
        detail.className = "weather-card";
        const title = document.createElement("h3");
        const reading = document.createElement("p");
        title.textContent = label;

        reading.textContent = `${value} ${units[key] ?? ""}`.trim();

        detail.append(title, reading);
        weatherDetails.append(detail);
    }

    weatherSection.hidden = false;
}

async function loadWeather(longitude, latitude, location) {
    weatherSection.hidden = true;
    forecastSection.hidden = true;
    statusMessage.textContent = `Chargement de la météo pour ${location}…`;

    // Les données actuelles s'affichent même si le service de prévisions est indisponible.
    const currentWeather = await getCurrentWeather(longitude, latitude);
    displayWeather(location, currentWeather);

    try {
        const forecast = await getWeatherForecast(longitude, latitude);
        displayForecast(forecast);
        statusMessage.textContent = `Météo actuelle et prévisions pour ${location}.`;
    } catch (error) {
        statusMessage.textContent = error instanceof Error
            ? `${error.message} Les données actuelles restent affichées.`
            : "Les prévisions n'ont pas pu être chargées. Les données actuelles restent affichées.";
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const city = cityInput.value.trim();

    if (!city) {
        statusMessage.textContent = "Veuillez saisir le nom d'une ville.";
        cityInput.focus();
        return;
    }

    searchButton.disabled = true;
    locateButton.disabled = true;

    try {
        const place = await getCoordinates(city);
        await loadWeather(place.longitude, place.latitude, place.location);
    } catch (error) {
        weatherSection.hidden = true;
        statusMessage.textContent = error instanceof Error
            ? error.message
            : "Une erreur inattendue est survenue.";
    } finally {
        searchButton.disabled = false;
        locateButton.disabled = false;
    }
});

function loadCurrentPosition() {
    if (!navigator.geolocation) {
        statusMessage.textContent =
            "La géolocalisation n'est pas prise en charge. Recherchez une ville ci-dessous.";
        return false;
    }

    locateButton.disabled = true;
    searchButton.disabled = true;
    statusMessage.textContent = "Recherche de votre position…";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                let location = "Votre position actuelle";
                let locationWarning = "";

                try {
                    location = await getLocationName(longitude, latitude);
                } catch (error) {
                    locationWarning = error instanceof Error
                        ? `${error.message} Affichage de la météo sans nom de ville. `
                        : "Le nom du lieu est indisponible. ";
                }

                await loadWeather(longitude, latitude, location);
                if (locationWarning) {
                    statusMessage.textContent = locationWarning + statusMessage.textContent;
                }
            } catch (error) {
                weatherSection.hidden = true;
                statusMessage.textContent = error instanceof Error
                    ? error.message
                    : "Impossible de récupérer la météo de votre position.";
            } finally {
                locateButton.disabled = false;
                searchButton.disabled = false;
            }
        },
        (error) => {
            const messages = {
                1: "Accès à la position refusé. Vous pouvez rechercher une ville ci-dessous.",
                2: "Position indisponible. Vérifiez les réglages ou recherchez une ville.",
                3: "La recherche de position a expiré. Réessayez ou recherchez une ville."
            };

            statusMessage.textContent =
                messages[error.code] ?? "Impossible d'obtenir votre position. Recherchez une ville.";
            locateButton.disabled = false;
            searchButton.disabled = false;
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
    return true;
}

locateButton.addEventListener("click", loadCurrentPosition);

// L'écran d'accueil tente d'afficher la météo locale dès son ouverture.
loadCurrentPosition();
