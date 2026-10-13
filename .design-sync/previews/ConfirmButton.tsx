import { ConfirmButton, btn } from "fl-manager-ui";

export const Default = () => (
  <ConfirmButton label="Move 14 backups to Trash" confirmLabel="Click again to confirm" onConfirm={() => {}} className={btn} />
);

export const Disabled = () => (
  <ConfirmButton label="Clear old backups" confirmLabel="Click again to confirm" onConfirm={() => {}} className={btn} disabled />
);
