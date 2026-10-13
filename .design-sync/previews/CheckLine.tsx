import { CheckLine } from "fl-manager-ui";

export const Warning = () => <CheckLine check={{ level: "warn", message: "Not a Friday. New music drops worldwide on Fridays" }} />;

export const Missing = () => <CheckLine check={{ level: "missing", message: "Distributors need the songwriters' legal names" }} />;

export const KitLevel = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 520 }}>
    <CheckLine check={{ level: "warn", message: "The project was saved after the latest mixdown. Re-render before exporting" }} />
    <CheckLine check={{ level: "warn", message: "48 kHz master: most distributors want 44.1 kHz. In FL Studio: File → Export → Wave file, 44,100 Hz, 24-bit." }} />
  </div>
);
