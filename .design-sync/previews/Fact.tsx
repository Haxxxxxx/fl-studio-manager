import { Fact } from "fl-manager-ui";

export const SongFacts = () => (
  <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, 160px)", gap: 14, fontSize: 12, margin: 0 }}>
    <Fact label="Tempo" value="140 BPM" />
    <Fact label="Key" value="Am" />
    <Fact label="Last saved" value="Today 3:35 AM" />
    <Fact label="FL version" value="25.1" />
    <Fact label="Recordings" value="3 · 21.0 MB" />
    <Fact label="Project file" value="87.9 KB" />
  </dl>
);
