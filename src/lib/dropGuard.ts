// The window runs with `dragDropEnabled: false` (tauri.conf.json) so the
// Pipeline's HTML5 drag-and-drop works. The catch: a file dropped from
// Finder / Explorer makes the webview navigate to it, so an mp3 opens as a
// full-window player with no way back. Refuse file drops everywhere; in-app
// drags (songs, columns) carry no "Files" type and are left alone.

/** Whether a drag carries files from the OS (not an in-app drag). */
export function isFileDrag(types: readonly string[] | DOMStringList | null | undefined): boolean {
  return !!types && Array.from(types).includes("Files");
}

/** Installs the guard on `target` (the window); returns the cleanup. */
export function installDropGuard(target: Pick<Window, "addEventListener" | "removeEventListener"> = window): () => void {
  const block = (e: DragEvent) => {
    if (!isFileDrag(e.dataTransfer?.types)) return;
    e.preventDefault();
    if (e.type === "dragover" && e.dataTransfer) e.dataTransfer.dropEffect = "none";
  };
  target.addEventListener("dragover", block);
  target.addEventListener("drop", block);
  return () => {
    target.removeEventListener("dragover", block);
    target.removeEventListener("drop", block);
  };
}
