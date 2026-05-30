const fs = require('fs');
const path = require('path');

/** Check if a directory is a Sero extension/app package. */
function isBuiltinPackageDir(pkgPath) {
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    return (
      pkg.pi?.extensions != null ||
      pkg.piExtension != null ||
      pkg.sero?.app != null ||
      fs.existsSync(path.join(pkgPath, 'extension'))
    );
  } catch {
    return false;
  }
}

module.exports = { isBuiltinPackageDir };
