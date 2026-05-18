'use client';

import { Finding, AIJobStatus } from '@/lib/types';
import { useState, useMemo } from 'react';
import { Search, Filter, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { FindingDetailDrawer } from './finding-detail-drawer';

interface FindingsTableProps {
  findings: Finding[];
}

export function FindingsTable({ findings }: FindingsTableProps) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  const filteredFindings = useMemo(() => {
    return findings.filter(f => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (search && !f.title.toLowerCase().includes(search.toLowerCase()) && !f.ruleId.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      const sevMap: Record<string, number> = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1, 'info': 0 };
      return sevMap[b.severity] - sevMap[a.severity];
    });
  }, [findings, search, severityFilter, categoryFilter]);

  const getSeverityColor = (sev: string) => {
    switch(sev) {
      case 'critical': return 'text-danger bg-danger-subtle border-danger shadow-[0_0_8px_rgba(248,81,73,0.3)]';
      case 'high': return 'text-severe bg-severe-subtle border-severe';
      case 'medium': return 'text-warning bg-warning-subtle border-warning';
      case 'low': return 'text-blue-400 bg-blue-900/30 border-blue-400';
      default: return 'text-fg-subtle bg-canvas-inset border-border';
    }
  };

  return (
    <div>
      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 p-4 bg-canvas-subtle border border-border rounded-md">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
          <Filter className="w-4 h-4 text-fg-muted mr-2" />
          {['all', 'critical', 'high', 'medium', 'low'].map(sev => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={clsx(
                "px-3 py-1 rounded-full text-xs font-medium capitalize border whitespace-nowrap transition-colors",
                severityFilter === sev 
                  ? "bg-accent text-white border-accent glow-accent" 
                  : "bg-canvas text-fg-muted border-border hover:bg-canvas-inset hover:text-fg"
              )}
            >
              {sev}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-canvas border border-border text-fg text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-accent w-full md:w-auto"
          >
            <option value="all">All Categories</option>
            <option value="security">Security</option>
            <option value="reliability">Reliability</option>
            <option value="performance">Performance</option>
            <option value="maintainability">Maintainability</option>
          </select>
          
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              placeholder="Search findings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-canvas border border-border rounded-md text-sm text-fg focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-md overflow-hidden bg-canvas">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-canvas-subtle border-b border-border text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium w-24">Severity</th>
                <th className="px-4 py-3 font-medium">Rule</th>
                <th className="px-4 py-3 font-medium w-full">Title</th>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredFindings.map(finding => (
                <tr 
                  key={finding.id} 
                  onClick={() => setSelectedFinding(finding)}
                  className="hover:bg-canvas-subtle cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border transition-colors", getSeverityColor(finding.severity))}>
                      {finding.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted group-hover:text-fg transition-colors">
                    {finding.ruleId}
                  </td>
                  <td className="px-4 py-3 text-fg group-hover:text-accent transition-colors truncate max-w-[300px]">
                    {finding.title}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted truncate max-w-[200px]" title={finding.filePath}>
                    {finding.filePath}{finding.line ? `:${finding.line}` : ''}
                  </td>
                  <td className="px-4 py-3 text-fg-muted text-xs capitalize">
                    {finding.category}
                  </td>
                </tr>
              ))}
              {filteredFindings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-fg-muted">
                    <div className="flex flex-col items-center justify-center">
                      <ShieldCheck className="w-8 h-8 text-border mb-3" />
                      <p>No findings match your filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FindingDetailDrawer 
        finding={selectedFinding} 
        open={!!selectedFinding} 
        onOpenChange={(open) => !open && setSelectedFinding(null)} 
      />
    </div>
  );
}
