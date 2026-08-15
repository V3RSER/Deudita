const fs = require('fs');
let code = fs.readFileSync('components/GroupDetail.tsx', 'utf8');

const tabContent = `
      {/* TAB CONTENT: Activity */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          {(!auditLogs || auditLogs.filter(a => a.group_id === group.id).length === 0) ? (
            <div className="bg-white rounded-2xl ring-1 ring-zinc-200 p-12 text-center text-zinc-500 shadow-2xs">
              <Activity className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <h3 className="font-semibold text-zinc-900 text-base">Sin actividad</h3>
              <p className="text-xs text-zinc-500 mt-1">Aún no hay registros de modificaciones en este grupo.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl ring-1 ring-zinc-200 divide-y divide-zinc-100 shadow-2xs">
              {auditLogs.filter(a => a.group_id === group.id).map(log => {
                const user = profiles.find(p => p.id === log.user_id);
                const expense = expenses.find(e => e.id === log.expense_id) || (log.changes?.old as any);
                const desc = expense?.description || 'un gasto';
                let actionText = '';
                let bgColor = '';
                
                if (log.action === 'create') {
                  actionText = 'añadió';
                  bgColor = 'bg-emerald-50 text-emerald-700';
                } else if (log.action === 'update') {
                  actionText = 'editó';
                  bgColor = 'bg-amber-50 text-amber-700';
                } else if (log.action === 'delete') {
                  actionText = 'eliminó';
                  bgColor = 'bg-rose-50 text-rose-700';
                }

                return (
                  <div key={log.id} className="p-4 sm:p-5 flex items-start space-x-3 sm:space-x-4 hover:bg-zinc-50 transition-colors">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
                      {user?.avatar_url ? (
                        <Image src={user.avatar_url} alt={user.full_name} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                      ) : (
                        <User className="w-5 h-5 m-2.5 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-800">
                        <strong className="font-bold text-zinc-900">{user?.full_name || 'Alguien'}</strong>{' '}
                        {actionText} el gasto <strong className="font-semibold">{desc}</strong>.
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-zinc-500">
                          {new Date(log.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={\`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm \${bgColor}\`}>
                          {log.action}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
`;

code = code.replace("      {/* Edit Group Modal */}", tabContent + "\n      {/* Edit Group Modal */}");

fs.writeFileSync('components/GroupDetail.tsx', code);
