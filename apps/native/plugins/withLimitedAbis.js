const { withGradleProperties } = require('@expo/config-plugins');

// Which Android ABIs to package into the APK. Release builds ship only the
// ABI of real phones (arm64-v8a) unless APP_ABIS is set at prebuild time.
// Each ABI roughly doubles the native library payload (llama.cpp, onnxruntime,
// Hermes, RN core), which is what balloons universal APKs to hundreds of MB.
const TARGET_ABIS = process.env.APP_ABIS || 'arm64-v8a';

const PROPERTY_KEY = 'reactNativeArchitectures';

module.exports = function withLimitedAbis(config) {
  return withGradleProperties(config, (config) => {
    const existing = config.modResults.find(
      (entry) => entry.type === 'property' && entry.key === PROPERTY_KEY,
    );
    if (existing) {
      existing.value = TARGET_ABIS;
    } else {
      config.modResults.push({ type: 'property', key: PROPERTY_KEY, value: TARGET_ABIS });
    }
    return config;
  });
};
