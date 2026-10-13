import { MixdownBadge } from "fl-manager-ui";

const saved = Date.UTC(2026, 9, 12, 10);
const render = (at: number) => [{ path: "/music/Night Run.wav", sizeBytes: 4e7, modifiedAtMs: at }];

export const Current = () => <MixdownBadge project={{ modifiedAtMs: saved, renders: render(saved + 3600e3) }} />;

export const Outdated = () => <MixdownBadge project={{ modifiedAtMs: saved, renders: render(saved - 86400e3) }} />;

export const None = () => <MixdownBadge project={{ modifiedAtMs: saved, renders: [] }} />;
