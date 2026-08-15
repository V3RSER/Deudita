const fs = require('fs');

let code = fs.readFileSync('lib/expense-context.tsx', 'utf8');

// 1. Add export interface ExpenseAuditLog
code = code.replace(
  "Notification,",
  "Notification,\n  ExpenseAuditLog,"
);

// 2. Add auditLogs to ExpenseContextType
code = code.replace(
  "expenses: Expense[];",
  "expenses: Expense[];\n  auditLogs: ExpenseAuditLog[];"
);

// 3. Add state
code = code.replace(
  "const [expenses, setExpenses] = useState<Expense[]>([]);",
  "const [expenses, setExpenses] = useState<Expense[]>([]);\n  const [auditLogs, setAuditLogs] = useState<ExpenseAuditLog[]>([]);"
);

// 4. Update sync data parsing
code = code.replace(
  "setExpenses(data.expenses || []);",
  "setExpenses(data.expenses || []);\n      setAuditLogs(data.auditLogs || []);"
);

// 5. Add to value
code = code.replace(
  "expenses,\n      drafts,",
  "expenses,\n      auditLogs,\n      drafts,"
);

fs.writeFileSync('lib/expense-context.tsx', code);
