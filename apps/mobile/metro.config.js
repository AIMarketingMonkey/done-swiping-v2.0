// Metro config for pnpm monorepo. Expo SDK 52 + expo-router.
// Key concerns:
//   1. Metro must watch the workspace root so it can resolve hoisted deps and
//      cross-workspace imports (e.g. @done-swiping/shared).
//   2. nodeModulesPaths must include both this app's node_modules AND the root
//      node_modules so Metro finds packages hoisted by pnpm.
//   3. disableHierarchicalLookup must be true — without it Metro climbs the
//      directory tree itself, which double-registers modules under pnpm.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the entire monorepo root so Metro sees shared packages.
config.watchFolders = [workspaceRoot];

// 2. Tell Metro where to look for node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Disable Metro's own node_modules traversal so it doesn't fight pnpm.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
