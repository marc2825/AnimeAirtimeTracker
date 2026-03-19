interface HeatmapGridProps {
  columns: string[];
  rows: Array<{
    label: string;
    cells: Array<{
      key: string;
      value: number;
      label: string;
    }>;
  }>;
}

function getCellColor(value: number, max: number): string {
  if (value === 0) {
    return "rgba(24, 57, 68, 0.14)";
  }

  const ratio = Math.max(value / Math.max(max, 1), 0.18);
  return `rgba(214, 100, 54, ${Math.min(0.9, ratio)})`;
}

export function HeatmapGrid({ columns, rows }: HeatmapGridProps) {
  const max = Math.max(...rows.flatMap((row) => row.cells.map((cell) => cell.value)), 1);

  return (
    <div className="heatmap">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `120px repeat(${columns.length}, 1fr)` }}>
        <div className="heatmap-corner">時刻帯</div>
        {columns.map((column) => (
          <div key={column} className="heatmap-heading">
            {column}
          </div>
        ))}
        {rows.map((row) => (
          <div key={row.label} className="heatmap-row-group">
            <div className="heatmap-row-label">{row.label}</div>
            {row.cells.map((cell) => (
              <div
                key={cell.key}
                className="heatmap-cell"
                style={{ backgroundColor: getCellColor(cell.value, max) }}
                title={`${cell.label}: ${cell.value}件`}
              >
                <span>{cell.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-legend">
        <span>薄い: 少ない</span>
        <div className="heatmap-legend-bar" />
        <span>濃い: 多い</span>
      </div>
    </div>
  );
}
