import { GEOLOCATION_API, HISTORIAL_CLIMATE_DATA_API, ISRIC_ORG_API } from '../utils/axios.js';

interface CropRotationArgs {
  N: number;
  P: number;
  K: number;
  pH: number;
  state: string;
  city: string;
}

export default async function getCropRotation({ N, P, K, pH, state, city }: CropRotationArgs) {
  console.log('Crop Rotation');

  const country = 'India';
  const locationData = await getLocation(country, state, city);

  if (!locationData?.latitude || !locationData?.longitude) {
    return {
      success: false,
      message: 'Could not find coordinates for the specified location.',
    };
  }

  const [climateData, soilApiData] = await Promise.all([
    getHistoricalClimateData(locationData.latitude, locationData.longitude),
    getSoilData(locationData.latitude, locationData.longitude),
  ]);

  const safeClimate = climateData || {};
  const safeSoil = soilApiData || {};

  const message = `
You are a world-class agronomist and soil scientist AI. Your task is to create an optimal, sustainable, and profitable 12-month crop rotation schedule based on the provided data.

DATA PROFILE:
- Farm Location: ${city}, ${state}, ${country}
- Farmer Soil Measurement: N=${N}, P=${P}, K=${K}, pH=${pH}
- ISRIC Soil Profile: pH=${safeSoil.ph ?? 'N/A'}, Clay=${safeSoil.clayContent ?? 'N/A'}, OrganicCarbon=${safeSoil.organicCarbon ?? 'N/A'}
- Climate (12-month avg): Temp=${(safeClimate as { avgTemperature?: number }).avgTemperature?.toFixed(2) ?? 'N/A'}°C, Humidity=${(safeClimate as { avgHumidity?: number }).avgHumidity?.toFixed(2) ?? 'N/A'}%, Rainfall=${(safeClimate as { totalPrecipitation?: number }).totalPrecipitation?.toFixed(2) ?? 'N/A'}mm

INSTRUCTIONS:
Return the response in human readable fomrat with proper spacing and bullet points making it easier for the user to understand
  `.trim();

  return {
    message,
    data: {
      climateData: safeClimate,
      soilApiData: safeSoil,
    },
  };
}

const getLocation = async (
  country: string,
  state: string,
  city: string,
): Promise<{ latitude: string; longitude: string }> => {
  try {
    const response = await GEOLOCATION_API.get(
      `/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`,
    );

    const result = response.data;

    console.log('GEO LOCATION API RESPONSE =', result);

    if (!result.results || result.results.length === 0) {
      console.log('No results from API.');
      return { latitude: '', longitude: '' };
    }

    let match = result.results.find(
      (place: { country?: string; admin1?: string; name?: string }) =>
        place.country?.toLowerCase() === country.toLowerCase() &&
        place.admin1?.toLowerCase() === state.toLowerCase() &&
        place.name?.toLowerCase() === city.toLowerCase(),
    );

    if (!match) {
      match = result.results.find(
        (place: { country?: string; admin1?: string }) =>
          place.country?.toLowerCase() === country.toLowerCase() &&
          place.admin1?.toLowerCase() === state.toLowerCase(),
      );
    }

    if (!match) {
      console.log('No precise match found, using first available result.');
      match = result.results[0];
    }

    const { latitude, longitude } = match;

    console.log('Selected location:', latitude, longitude);

    return { latitude, longitude };
  } catch (error) {
    console.error('Error in getLocation:', (error as Error).message);
    return { latitude: '', longitude: '' };
  }
};

const getHistoricalClimateData = async (
  latitude: string,
  longitude: string,
): Promise<{ totalPrecipitation: number; avgTemperature: number; avgHumidity: number }> => {
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);

    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 1);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    const response = await HISTORIAL_CLIMATE_DATA_API.get(
      `/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}&daily=temperature_2m_mean,relative_humidity_2m_mean,precipitation_sum`,
    );
    const result = response.data;
    const daily = result.daily;
    console.log('HISTORIAL CLIMATE API - Daily' + daily);

    if (!daily || !daily.time || daily.time.length === 0) {
      console.log('Historical weather data not found via Open-Meteo.');
      if (result && result.reason) {
        console.error('API Error Reason:', result.reason);
      }
      return { totalPrecipitation: 0, avgTemperature: 0, avgHumidity: 0 };
    }

    const days: number = daily.time.length;

    const totalHumidity = daily.relative_humidity_2m_mean.reduce(
      (sum: number, val: number) => sum + (val || 0),
      0,
    );
    const avgHumidity = totalHumidity / days;

    const totalPrecipitation = daily.precipitation_sum.reduce(
      (sum: number, val: number) => sum + (val || 0),
      0,
    );

    const totalTemp = daily.temperature_2m_mean.reduce(
      (sum: number, val: number) => sum + (val || 0),
      0,
    );
    const avgTemperature = totalTemp / days;

    return { totalPrecipitation, avgTemperature, avgHumidity };
  } catch (error) {
    console.error('Error in getHistoricalClimateData with Open-Meteo:', error);
    return { totalPrecipitation: 0, avgTemperature: 0, avgHumidity: 0 };
  }
};

const getSoilData = async (
  latitude: string,
  longitude: string,
): Promise<{
  ph: string | null;
  nitrogen: unknown;
  clayContent: unknown;
  organicCarbon: unknown;
}> => {
  try {
    const response = await ISRIC_ORG_API.get(
      `/soilgrids/v2.0/properties/query?lat=${latitude}&lon=${longitude}`,
    );
    const layers = response.data?.properties?.layers || [];

    console.log('ISRIC_ORG_API response OK');

    const getLayerValues = (name: string) => {
      const layer = layers.find((l: { name: string }) => l.name === name);
      if (!layer) return null;
      return layer.depths[0]?.values?.mean;
    };

    const phValue = getLayerValues('phh2o');
    const nitrogenValue = getLayerValues('nitrogen');
    const clayContent = getLayerValues('clay');
    const organicCarbon = getLayerValues('soc');

    return {
      ph: phValue ? (phValue / 10).toFixed(2) : null,
      nitrogen: nitrogenValue,
      clayContent: clayContent,
      organicCarbon: organicCarbon,
    };
  } catch (error) {
    console.error('Error in getSoilData:', error);
    return { ph: null, nitrogen: null, clayContent: null, organicCarbon: null };
  }
};
