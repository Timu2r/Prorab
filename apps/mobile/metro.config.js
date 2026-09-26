const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Без watchFolders Metro не видит правок в packages/core (подключён симлинком) до перезапуска.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules"), path.resolve(monorepoRoot, "node_modules")];
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
