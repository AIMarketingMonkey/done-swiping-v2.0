// Metro config for pnpm monorepo. Expo SDK 52 + expo-router.
//
// Key concerns:
//   1. Metro must watch the workspace root so it can resolve hoisted deps and
//      cross-workspace imports (e.g. @done-swiping/shared).
//   2. nodeModulesPaths must include both this app's node_modules AND the root
//      node_modules so Metro finds packages hoisted by pnpm.
//   3. disableHierarchicalLookup must be true — without it Metro climbs the
//      directory tree itself, which double-registers modules under pnpm.
//   4. pnpm strict mode: transitive deps live only in virtual store entries
//      (.pnpm/<pkg>/node_modules/). We enumerate those paths so Metro can
//      locate packages like @babel/runtime, expo-modules-core, etc.
//   5. packages/shared uses ESM-style .js extensions in re-exports but the
//      actual source files are .ts. A custom resolveRequest strips the .js
//      extension so Metro finds the TypeScript source.
//   6. @livekit/react-native and @livekit/react-native-webrtc are native-only
//      packages that must not be executed in the web bundle. On the web
//      platform we redirect them to a safe stub module that exports no-ops.
//      (voice.native.tsx uses them but Metro still compiles it for the web
//      bundle; the stub prevents the native initialisation code from running.)

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const pnpmStore = path.resolve(workspaceRoot, 'node_modules/.pnpm');

/**
 * Collect all node_modules directories inside the pnpm virtual store.
 * Each virtual store entry (<pkg>@<version>/node_modules) is a valid
 * lookup path for Metro.
 */
function getPnpmVirtualStoreNodeModulesPaths() {
  if (!fs.existsSync(pnpmStore)) return [];
  const entries = fs.readdirSync(pnpmStore);
  const paths = [];
  for (const entry of entries) {
    const nm = path.join(pnpmStore, entry, 'node_modules');
    if (fs.existsSync(nm)) {
      paths.push(nm);
    }
  }
  return paths;
}

const config = getDefaultConfig(projectRoot);

// 1. Watch the entire monorepo root so Metro sees shared packages.
config.watchFolders = [workspaceRoot];

// 2. Tell Metro where to look for node_modules — include ALL virtual store
//    node_modules directories so transitive deps are found.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  ...getPnpmVirtualStoreNodeModulesPaths(),
];

// 3. Disable Metro's own node_modules traversal so it doesn't fight pnpm.
config.resolver.disableHierarchicalLookup = true;

// 5 + 6. Custom resolveRequest:
//   a) Strip .js extension from relative imports to find .ts source files
//      (packages/shared/src/index.ts uses ESM-style './constants.js' exports).
//   b) On the web platform, redirect @livekit/react-native and
//      @livekit/react-native-webrtc to a safe stub so the native module
//      initialisation code is never executed in the browser.

const nativeOnlyStub = path.resolve(projectRoot, 'lib/livekit-native-stub.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // (b) Stub native-only LiveKit packages on web
  if (
    platform === 'web' &&
    (moduleName === '@livekit/react-native' || moduleName === '@livekit/react-native-webrtc')
  ) {
    return { type: 'sourceFile', filePath: nativeOnlyStub };
  }

  // (a) Strip .js extension from relative imports for ESM-style re-exports
  if ((moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js')) {
    const withoutJs = moduleName.slice(0, -3);
    try {
      return context.resolveRequest(context, withoutJs, platform);
    } catch (_) {
      // fall through to default resolution
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
