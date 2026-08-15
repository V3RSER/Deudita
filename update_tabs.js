const fs = require('fs');

let code = fs.readFileSync('components/GroupDetail.tsx', 'utf8');

code = code.replace(
  "const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members'>('expenses');",
  "const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members' | 'activity'>('expenses');"
);

const newTabCode = `
        <button
          onClick={() => setActiveTab('activity')}
          className={\`flex items-center space-x-2 py-3.5 px-5 font-semibold text-sm border-b-2 whitespace-nowrap transition-all min-h-[44px] \${
            activeTab === 'activity'
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }\`}
        >
          <Activity className="w-4 h-4" />
          <span>Actividad</span>
        </button>
      </div>`;

code = code.replace("      </div>\n\n      {/* TAB CONTENT: Expenses */}", newTabCode + "\n\n      {/* TAB CONTENT: Expenses */}");

fs.writeFileSync('components/GroupDetail.tsx', code);
