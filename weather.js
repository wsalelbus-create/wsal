// Weather Module for Bus Arrival Predictions (Background Only)
// Uses Open-Meteo API (free, no API key needed)

const ALGIERS_LAT = 36.7538;
const ALGIERS_LON = 3.0588;
const WEATHER_API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${ALGIERS_LAT}&longitude=${ALGIERS_LON}&current_weather=true`;

// Weather delay factors
const WEATHER_DELAY_FACTORS = {
    clear: 1.0,           // Normal conditions
    partlyCloudy: 1.0,    // No impact
    cloudy: 1.0,          // No impact
    fog: 1.2,             // 20% slower
    drizzle: 1.15,        // 15% slower
    rain: 1.3,            // 30% slower
    heavyRain: 1.5,       // 50% slower
    thunderstorm: 1.6,    // 60% slower
    snow: 1.7,            // 70% slower (rare in Algiers)
    strongWind: 1.1       // 10% slower
};

// Current weather data
let currentWeather = {
    condition: 'clear',
    temperature: 20,
    windSpeed: 0,
    delayFactor: 1.0,
    lastUpdate: null
};

// Fetch current weather
async function fetchWeather() {
    try {
        const response = await fetch(WEATHER_API_URL);
        const data = await response.json();
        const weather = data.current_weather;

        // Determine weather condition from WMO code
        const condition = getWeatherCondition(weather.weathercode);

        // Calculate delay factor
        let delayFactor = WEATHER_DELAY_FACTORS[condition] || 1.0;

        // Add wind impact (if wind > 30 km/h)
        if (weather.windspeed > 30) {
            delayFactor *= WEATHER_DELAY_FACTORS.strongWind;
        }

        currentWeather = {
            condition: condition,
            temperature: weather.temperature,
            windSpeed: weather.windspeed,
            delayFactor: delayFactor,
            lastUpdate: new Date()
        };

        console.log('🌤️ Weather updated:', currentWeather);
        return currentWeather;

    } catch (error) {
        console.error('Weather fetch failed:', error);
        return currentWeather;
    }
}

// Convert WMO weather code to condition
function getWeatherCondition(code) {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'partlyCloudy';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code === 51 || code === 53 || code === 55) return 'drizzle';
    if (code === 61 || code === 63) return 'rain';
    if (code === 65 || code === 67) return 'heavyRain';
    if (code >= 80 && code <= 82) return 'rain';
    if (code === 95 || code === 96 || code === 99) return 'thunderstorm';
    if (code >= 71 && code <= 77) return 'snow';
    return 'clear';
}

// Get current weather delay factor
function getWeatherDelayFactor() {
    return currentWeather.delayFactor;
}

// Initialize weather (fetch once daily)
async function initWeather() {
    // Check if we already have today's weather
    const cachedWeather = localStorage.getItem('dailyWeather');
    if (cachedWeather) {
        try {
            const { data, date } = JSON.parse(cachedWeather);
            const today = new Date().toDateString();

            if (date === today) {
                console.log('🌤️ Using cached weather from today');
                currentWeather = data;
                return;
            }
        } catch (e) {
            console.error('Failed to parse cached weather:', e);
        }
    }

    // Fetch fresh weather
    await fetchWeather();

    // Cache for the day
    localStorage.setItem('dailyWeather', JSON.stringify({
        data: currentWeather,
        date: new Date().toDateString()
    }));

    console.log('🌤️ Weather fetched for the day');
}

// Export functions (only for calculations, no display)
window.WeatherModule = {
    init: initWeather,
    getDelayFactor: getWeatherDelayFactor,
    getCurrentWeather: () => currentWeather,
    refresh: fetchWeather
};
