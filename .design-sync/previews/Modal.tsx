import { Modal, Input, btnPrimary } from "fl-manager-ui";

// The modal is a fixed full-screen overlay; the transform makes this box its
// containing block so it renders inside the card instead of escaping it.
export const NewSong = () => (
  <div style={{ position: "relative", width: 640, height: 380, transform: "translateZ(0)", overflow: "hidden" }}>
    <ModalBody />
  </div>
);

const ModalBody = () => (
  <Modal title="New song" onClose={() => {}}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input placeholder="Song name" defaultValue="Paper Planes" />
      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Created from your default template in Projects/Paper Planes.</p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className={btnPrimary}>Create and open in FL</button>
      </div>
    </div>
  </Modal>
);
