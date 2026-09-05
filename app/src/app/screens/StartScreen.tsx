/**
 * Where a shoot begins: drop a folder, or reopen a recent one. Nothing else lives here.
 */

import React, { useRef, useState } from "react";
import { useStore } from "../store";
import { Callout, Overline, swatchColour } from "../components";
import { RecentGame } from "@core/setup/GameLibrary";
import { HandleFolder } from "@platform/fs";
import { useShortcuts } from "../shortcuts";

export function StartScreen() {
  const writable = useStore((s) => s.writableFolders);
  const recents = useStore((s) => s.recents);
  const chooseFolder = useStore((s) => s.chooseFolder);
  const useFolder = useStore((s) => s.useFolder);
  const useFiles = useStore((s) => s.useFiles);
  const openRecent = useStore((s) => s.openRecent);
  const forgetRecent = useStore((s) => s.forgetRecent);
  const panel = useStore((s) => s.panel);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const choose = () => { if (writable) void chooseFolder(true); else input.current?.click(); };
  useShortcuts({ "mod+o": choose }, !panel);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    const item = e.dataTransfer.items?.[0];
    if (item && "getAsFileSystemHandle" in item) {
      const handle = await (item as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle();
      if (handle && handle.kind === "directory") { await useFolder(new HandleFolder(handle as FileSystemDirectoryHandle), true); return; }
    }
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) await useFiles(files, true);
  };

  return (
    <div className="screen scroll">
      <div className="start">
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => void onDrop(e)}>
          <button type="button" className={"drop" + (over ? " over" : "")} onClick={choose}>
            <span className="drop-art" aria-hidden="true"><i /><i /><i /></span>
            <span className="drop-title">Drop a folder of photographs</span>
            <span className="drop-sub">or click to choose one · ⌘O · JPEG, PNG and raw files</span>
          </button>
          <input ref={input} type="file" multiple hidden {...({ webkitdirectory: "" } as object)}
            onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void useFiles(files, true); e.target.value = ""; }} />
        </div>
        {!writable && (
          <Callout kind="warn"><b>This browser can open photographs but cannot write captions into them.</b> Caption and review here; to write into the files, open the same folder in Chrome, Edge or Brave.</Callout>
        )}
        {recents.length > 0 && (
          <div className="recents">
            <Overline>Recent shoots</Overline>
            <div className="recent-grid">
              {recents.map((r) => (
                <div key={r.id} className="recard" role="button" tabIndex={0} onClick={() => void openRecent(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void openRecent(r); } }}>
                  <span className="recard-pair" aria-hidden="true"><i style={{ background: swatchColour(r.homeColor) }} /><i style={{ background: swatchColour(r.awayColor) }} /></span>
                  <span className="recard-title">{RecentGame.title(r)}</span>
                  <span className="recard-row">
                    <span className="recard-sub">{[RecentGame.sportLabel(r), r.photosFolder].filter(Boolean).join(" · ") || "—"}</span>
                    <span className="spacer" />
                    <button type="button" className="linky" onClick={(e) => { e.stopPropagation(); void forgetRecent(r); }}>Forget</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { React };
