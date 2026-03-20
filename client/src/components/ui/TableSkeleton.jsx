import React from 'react';

export default function TableSkeleton({ rowCount = 8, colCount = 6 }) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, i) => (
        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fcfdfe' }}>
          {Array.from({ length: colCount }).map((__, j) => (
            <td key={j}>
              <div
                className="skeleton-line"
                style={{
                  height: 14,
                  width: `${Math.max(40, 90 - j * 8)}%`
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

