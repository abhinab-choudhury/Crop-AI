const { withMainApplication } = require('@expo/config-plugins');

const PACKAGE_IMPORT = 'import ai.onnxruntime.reactnative.OnnxruntimePackage';
const PACKAGE_ADD = 'add(OnnxruntimePackage())';

module.exports = function withOnnxruntimeRegistration(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (config.modResults.language !== 'kt' && config.modResults.language !== 'kotlin') {
      throw new Error('withOnnxruntimeRegistration requires a Kotlin MainApplication');
    }

    if (!contents.includes(PACKAGE_IMPORT)) {
      contents = contents.replace(
        'import expo.modules.ApplicationLifecycleDispatcher',
        `${PACKAGE_IMPORT}\nimport expo.modules.ApplicationLifecycleDispatcher`,
      );
    }

    if (!contents.includes(PACKAGE_ADD)) {
      contents = contents.replace(
        'PackageList(this).packages.apply {',
        `PackageList(this).packages.apply {\n              ${PACKAGE_ADD}`,
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
