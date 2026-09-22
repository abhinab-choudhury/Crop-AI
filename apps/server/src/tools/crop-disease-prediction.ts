import { ML_SERVER_API } from '../utils/axios.js';

export default async function cropDiseasePrediction(args: { file_url: string }) {
  try {
    const response = await ML_SERVER_API.post('/predict/resnet50', {
      url: args.file_url,
    });

    const result = response.data;
    console.log('Crop Disease Prediction =', result);

    return {
      success: true,
      prediction: result.predicted_class,
      meta: {
        plantName: result.plant_name,
        diseaseStatus: result.disease_status,
        confidence: result.confidence,
        modelUsed: result.model_used,
        inferenceType: result.inference_type,
      },
      message: `The uploaded image shows **${result.plant_name}** with disease status: **${result.disease_status}**. Confidence is ${(result.confidence * 100).toFixed(1)}%.`,
    };
  } catch (error) {
    console.error('Crop disease prediction error:', error);
    return {
      success: false,
      message: 'Failed to fetch crop disease prediction from ML server.',
      error: (error as Error).message,
    };
  }
}
