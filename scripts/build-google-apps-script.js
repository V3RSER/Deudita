/**
 * Genera los archivos JavaScript que se cargan en Google Apps Script a partir
 * de las mismas fuentes TypeScript que usa el frontend.
 *
 * FUENTE ÚNICA DE VERDAD:
 *   lib/email-templates/email-cleaning.ts
 *   lib/email-templates/email-matching.ts
 *
 * Apps Script puede tener varios archivos en el mismo proyecto y todos
 * comparten el mismo scope global. Por eso NO se inyecta el código dentro
 * de cron.js ni se mantiene una segunda implementación.
 *
 * Uso:
 *   node scripts/build-google-apps-script.js
 *
 * Salida:
 *   google-apps-script/email-cleaning.js
 *   google-apps-script/email-matching.js
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.cwd();

const cleaningPath = path.join(
  root,
  'lib',
  'email-templates',
  'email-cleaning.ts'
);

const matchingPath = path.join(
  root,
  'lib',
  'email-templates',
  'email-matching.ts'
);

const gasDir = path.join(root, 'google-apps-script');

if (!fs.existsSync(cleaningPath)) {
  throw new Error(
    `No se encontró: ${path.relative(root, cleaningPath)}`
  );
}

if (!fs.existsSync(matchingPath)) {
  throw new Error(
    `No se encontró: ${path.relative(root, matchingPath)}`
  );
}

fs.mkdirSync(gasDir, { recursive: true });

function stripModuleSyntax(source) {
  return source
    .replace(
      /import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*;?/g,
      ''
    )
    .replace(
      /\bexport\s+(?=(?:interface|type|function|const|let|var|class)\b)/g,
      ''
    );
}

function transpile(filePath) {
  const source = stripModuleSyntax(
    fs.readFileSync(filePath, 'utf8')
  );

  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.None,
      strict: false,
      removeComments: false,
      sourceMap: false,
    },
    fileName: path.basename(filePath),
    reportDiagnostics: true,
  });

  const errors = (result.diagnostics || [])
    .filter(
      diagnostic =>
        diagnostic.category === ts.DiagnosticCategory.Error
    )
    .map(
      diagnostic =>
        ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          '\n'
        )
    );

  if (errors.length) {
    throw new Error(
      `${path.basename(filePath)} no pudo transpilarse:\n${errors.join('\n')}`
    );
  }

  return result.outputText;
}

function getExportFooter(name) {
  if (name === 'email-cleaning.js') {
    return [
      '// Export to global scope (Google Apps Script / Node / Browser)',
      'if (typeof globalThis !== \'undefined\') {',
      '  if (typeof buildEmailContext !== \'undefined\') globalThis.buildEmailContext = buildEmailContext;',
      '  if (typeof sanitizeRegexPattern !== \'undefined\') globalThis.sanitizeRegexPattern = sanitizeRegexPattern;',
      '  if (typeof matchEmailEntityPatterns !== \'undefined\') globalThis.matchEmailEntityPatterns = matchEmailEntityPatterns;',
      '  if (typeof resolveEmailEntity !== \'undefined\') globalThis.resolveEmailEntity = resolveEmailEntity;',
      '}',
      'if (typeof module !== \'undefined\' && module.exports) {',
      '  module.exports = {',
      '    buildEmailContext: typeof buildEmailContext !== \'undefined\' ? buildEmailContext : undefined,',
      '    sanitizeRegexPattern: typeof sanitizeRegexPattern !== \'undefined\' ? sanitizeRegexPattern : undefined,',
      '    matchEmailEntityPatterns: typeof matchEmailEntityPatterns !== \'undefined\' ? matchEmailEntityPatterns : undefined,',
      '    resolveEmailEntity: typeof resolveEmailEntity !== \'undefined\' ? resolveEmailEntity : undefined,',
      '  };',
      '}',
    ].join('\n');
  }

  if (name === 'email-matching.js') {
    return [
      '// Export to global scope (Google Apps Script / Node / Browser)',
      'if (typeof globalThis !== \'undefined\') {',
      '  if (typeof createProductionEmailMatcher !== \'undefined\') globalThis.createProductionEmailMatcher = createProductionEmailMatcher;',
      '  if (typeof matchEmailForProduction !== \'undefined\') globalThis.matchEmailForProduction = matchEmailForProduction;',
      '  if (typeof diagnoseEmailMatching !== \'undefined\') globalThis.diagnoseEmailMatching = diagnoseEmailMatching;',
      '  if (typeof evaluateTemplateAgainstEmail !== \'undefined\') globalThis.evaluateTemplateAgainstEmail = evaluateTemplateAgainstEmail;',
      '}',
      'if (typeof module !== \'undefined\' && module.exports) {',
      '  module.exports = {',
      '    createProductionEmailMatcher: typeof createProductionEmailMatcher !== \'undefined\' ? createProductionEmailMatcher : undefined,',
      '    matchEmailForProduction: typeof matchEmailForProduction !== \'undefined\' ? matchEmailForProduction : undefined,',
      '    diagnoseEmailMatching: typeof diagnoseEmailMatching !== \'undefined\' ? diagnoseEmailMatching : undefined,',
      '    evaluateTemplateAgainstEmail: typeof evaluateTemplateAgainstEmail !== \'undefined\' ? evaluateTemplateAgainstEmail : undefined,',
      '  };',
      '}',
    ].join('\n');
  }

  return '';
}

function writeGenerated(name, sourcePath) {
  const footer = getExportFooter(name);
  const output = [
    '/**',
    ' * GENERATED FILE — DO NOT EDIT MANUALLY.',
    ` * Source: ${path.relative(root, sourcePath)}`,
    ' * Generated by: scripts/build-google-apps-script.js',
    ' *',
    ' * Este archivo se ejecuta en el mismo scope global que los demás archivos',
    ' * del proyecto de Google Apps Script.',
    ' */',
    '',
    transpile(sourcePath).trim(),
    '',
    footer,
    '',
  ].join('\n');

  const outputPath = path.join(gasDir, name);

  fs.writeFileSync(
    outputPath,
    output,
    'utf8'
  );

  return outputPath;
}

const cleaningOutput = writeGenerated('email-cleaning.js', cleaningPath);
const matchingOutput = writeGenerated('email-matching.js', matchingPath);

console.log(`Generado: ${path.relative(root, cleaningOutput)}`);
console.log(`Generado: ${path.relative(root, matchingOutput)}`);