import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PaginationControls({ page, totalPages, totalItems, pageSize, onPageChange }) {
  if (totalItems <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-slate-800 bg-slate-900/80 text-sm">
      <div className="text-slate-500">
        显示 {start}-{end} / 共 {totalItems} 条
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-800"
        >
          <ChevronLeft className="w-4 h-4" /> 上一页
        </button>
        <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-800"
        >
          下一页 <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}