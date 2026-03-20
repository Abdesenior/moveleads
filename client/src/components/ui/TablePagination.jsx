import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function TablePagination({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20]
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const left = Math.max(1, page - 2);
    const right = Math.min(totalPages, page + 2);
    const nums = [];
    for (let p = left; p <= right; p++) nums.push(p);
    if (left > 1) nums.unshift(1);
    if (right < totalPages) nums.push(totalPages);
    return nums;
  };

  const pageNums = getPageNumbers();

  return (
    <div className="table-pagination">
      <div className="pagination-controls" aria-label="Pagination">
        <button className="pagination-btn" disabled={!canPrev} onClick={() => onPageChange(page - 1)} type="button">
          <ChevronLeft size={16} />
        </button>

        {pageNums.map((p, idx) => {
          const isEllipsis = idx > 0 && p - pageNums[idx - 1] > 1;
          if (isEllipsis) return <span key={`e-${p}-${idx}`} style={{ color: 'var(--text-muted)', padding: '0 6px' }}>…</span>;

          return (
            <button
              key={p}
              className={`pagination-btn ${p === page ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
              type="button"
            >
              {p}
            </button>
          );
        })}

        <button className="pagination-btn" disabled={!canNext} onClick={() => onPageChange(page + 1)} type="button">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="page-size">
        <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 13 }}>Rows</span>
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

