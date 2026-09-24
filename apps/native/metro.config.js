// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const config = withTurborepoManagedCache(
  withMonorepoPaths(
    withNativeWind(getDefaultConfig(__dirname), {
      input: './global.css',
      configPath: './tailwind.config.js',
    }),
  ),
);

config.resolver.unstable_enablePackageExports = true;
config.resolver.disableHierarchicalLookup = false;

config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(__dirname, '../../node_modules'),
];

/**
 * Blocklist for Metro file watcher.
 * Excludes generated native build artifacts and large generated directories
 * that cause ENOSPC / file watcher exhaustion, without blocking source files.
 */
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList].filter(Boolean)),
  /\/android\/build\/.*/,
  /\/android\/app\/build\/.*/,
  /\/ios\/build\/.*/,
  /\/\.expo\/.*/,
];

module.exports = config;

/**
 * Add the monorepo paths to the Metro config.
 * This allows Metro to resolve modules from the monorepo.
 */
function withMonorepoPaths(config) {
  const projectRoot = __dirname;
  const workspaceRoot = path.resolve(projectRoot, '../..');

  config.resolver.assetExts.push('onnx');
  config.watchFolders = [workspaceRoot];
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ];

  return config;
}

/**
 * Move the Metro cache to the `.cache/metro` folder.
 */
function withTurborepoManagedCache(config) {
  config.cacheStores = [new FileStore({ root: path.join(__dirname, '.cache/metro') })];
  return config;
}
