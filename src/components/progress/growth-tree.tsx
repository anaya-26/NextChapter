/**
 * The Kadamba tree: an optional visual that grows with the student's level. Kadamba flowers
 * (round, golden-orange) appear as the tree matures. Purely decorative — progress itself is
 * shown in words and numbers elsewhere.
 */
export function GrowthTree({ level, className }: { level: number; className?: string }) {
  const stage = Math.min(6, Math.max(1, Math.ceil(level / 2) + (level >= 2 ? 1 : 0)));
  const trunk = [0, 14, 26, 40, 52, 60, 66][stage];
  const canopy = [0, 0, 14, 24, 32, 38, 44][stage];
  const flowers = level >= 4 ? Math.min(12, (level - 3) * 2) : 0;
  const cx = 80;
  const ground = 150;
  const top = ground - trunk;
  const spots = [
    [-20, -6], [18, -10], [0, -22], [-30, 8], [28, 6], [-10, 10], [12, 14], [-26, -18], [26, -22], [6, -2], [-14, -28], [20, 22],
  ].slice(0, flowers);
  return (
    <svg viewBox="0 0 160 160" className={className} role="img" aria-label={`Your Kadamba tree at level ${level}`}>
      <ellipse cx={cx} cy={ground + 2} rx={44} ry={6} fill="var(--surface-3)" />
      {stage === 1 ? (
        <>
          <path d={`M${cx} ${ground} q 0 -10 0 -14`} stroke="#8a6a3f" strokeWidth={3} strokeLinecap="round" fill="none" />
          <path d={`M${cx} ${ground - 12} q -12 -8 -16 2 q 10 4 16 -2`} fill="var(--primary)" />
          <path d={`M${cx} ${ground - 12} q 12 -8 16 2 q -10 4 -16 -2`} fill="color-mix(in oklab, var(--primary) 70%, var(--surface))" />
        </>
      ) : (
        <>
          <path d={`M${cx - 4} ${ground} C ${cx - 3} ${ground - trunk / 2}, ${cx - 2} ${top + 10}, ${cx} ${top}`} stroke="#8a6a3f" strokeWidth={Math.max(4, stage * 2)} strokeLinecap="round" fill="none" />
          {stage >= 3 ? <path d={`M${cx} ${top + trunk * 0.35} q 14 -6 22 -16`} stroke="#8a6a3f" strokeWidth={3} strokeLinecap="round" fill="none" /> : null}
          {stage >= 4 ? <path d={`M${cx - 1} ${top + trunk * 0.45} q -14 -6 -24 -14`} stroke="#8a6a3f" strokeWidth={3} strokeLinecap="round" fill="none" /> : null}
          <ellipse cx={cx} cy={top} rx={canopy * 1.25} ry={canopy} fill="var(--primary)" />
          <ellipse cx={cx - canopy * 0.55} cy={top + canopy * 0.25} rx={canopy * 0.7} ry={canopy * 0.6} fill="color-mix(in oklab, var(--primary) 80%, black)" opacity={0.35} />
          <ellipse cx={cx + canopy * 0.4} cy={top - canopy * 0.35} rx={canopy * 0.6} ry={canopy * 0.45} fill="color-mix(in oklab, var(--primary) 70%, white)" opacity={0.35} />
          {spots.map(([dx, dy], i) => (
            <g key={i} transform={`translate(${cx + (dx * canopy) / 40} ${top + (dy * canopy) / 40})`}>
              <circle r={4} fill="var(--accent)" />
              <circle r={4} fill="none" stroke="#fff3c4" strokeWidth={1} strokeDasharray="1 1.6" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
