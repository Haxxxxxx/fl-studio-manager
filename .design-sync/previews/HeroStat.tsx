import { HeroStat } from "fl-manager-ui";

export const ActivityRow = () => (
  <div style={{ display: "flex", gap: 28 }}>
    <HeroStat label="Active days" value={184} />
    <HeroStat label="Current streak" value="6 days" />
    <HeroStat label="Longest streak" value="23 days" />
    <HeroStat label="Last session" value="today" />
  </div>
);
