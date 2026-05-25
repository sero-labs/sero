import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const releasePackagePaths = [
  'apps/desktop/package.json',
];

const semverPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const rootPackagePath = path.join(repoRoot, 'package.json');
const rootPackage = readJson(rootPackagePath);
const version = process.argv[2] ?? rootPackage.version;

if (!semverPattern.test(version)) {
  throw new Error(`Release version must be SemVer, got: ${version}`);
}

if (rootPackage.version !== version) {
  rootPackage.version = version;
  writeJson(rootPackagePath, rootPackage);
}

for (const packagePath of releasePackagePaths) {
  const absolutePath = path.join(repoRoot, packagePath);
  const packageJson = readJson(absolutePath);
  packageJson.version = version;
  writeJson(absolutePath, packageJson);
  console.log(`${packagePath} version set to ${version}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
