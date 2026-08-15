const fs = require('fs');
let code = fs.readFileSync('lib/expense-context.tsx', 'utf8');

// I need to add auditLogs to the context provider value object
code = code.replace(
  "        expenses,\n        drafts,",
  "        expenses,\n        auditLogs,\n        drafts,"
);

fs.writeFileSync('lib/expense-context.tsx', code);
