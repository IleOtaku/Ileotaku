"use client";

import { useEffect, useRef, useState } from "react";
import { usePostDownload } from "@/hooks/usePostDownload";
import { downloadMediaDirect, downloadVideoWithWatermark } from "@/lib/videoDownload";
import { DMImageMessage } from "@/components/messages/DMImageMessage";
import { DMVideoMessage } from "@/components/messages/DMVideoMessage";
import FeedPostCard from "@/components/feed/FeedPostCard";
import { getPost } from "@/lib/creatorFeed";
import type { CreatorPost } from "@/types";

declare global {
  interface Window {
    __srcUrl?: string;
    __srcBytes?: number;
    __downloads?: { download: string; size: number; type: string; url: string }[];
    __progress?: number[];
    __genVideo?: () => Promise<string>;
    __wm?: () => Promise<string>;
    __direct?: () => Promise<string>;
    __analyze?: (idx: number) => Promise<unknown>;
    __imgs?: string[];
  }
}

async function makeVideoWithAudio(): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 240;
  const g = c.getContext("2d")!;
  const ac = new AudioContext();
  const osc = ac.createOscillator();
  osc.frequency.value = 440;
  const dest = ac.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  const stream = new MediaStream([...c.captureStream(15).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(100);
  const t = setInterval(() => {
    g.fillStyle = "hsl(200 90% 60%)"; // bright uniform colour — easy to compare against the dark watermark pill
    g.fillRect(0, 0, 320, 240);
  }, 66);
  await new Promise((r) => setTimeout(r, 6200));
  clearInterval(t);
  rec.stop();
  osc.stop();
  await done;
  await ac.close();
  return new Blob(chunks, { type: "video/webm" });
}

function PostDl({ id, uid, disable, image }: { id: string; uid: string; disable?: boolean; image?: boolean }) {
  const post = {
    id,
    uid,
    handle: "handle" + id,
    content: "My clip title!",
    videoUrl: image ? undefined : window.__srcUrl,
    attachments: image ? [window.__srcUrl ?? ""] : [],
    disableDownloads: disable,
  } as unknown as CreatorPost;
  const { download, downloading, canDownload } = usePostDownload(post);
  return canDownload ? (
    <button id={`dl-${id}`} onClick={() => void download()} disabled={downloading} className="btn-ghost">
      Download {id}
    </button>
  ) : (
    <span id={`dl-${id}-hidden`}>no download for {id}</span>
  );
}

export default function Page() {
  const [ready, setReady] = useState(false);
  const [imgs, setImgs] = useState<string[]>([]);
  const [realPost, setRealPost] = useState<CreatorPost | null>(null);
  const inited = useRef(false);

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    window.__downloads = [];
    window.__progress = [];
    // Capture downloads instead of letting the browser save them.
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        const href = this.href;
        const name = this.download;
        fetch(href)
          .then((r) => r.blob())
          .then((b) => window.__downloads!.push({ download: name, size: b.size, type: b.type, url: URL.createObjectURL(b) }));
        return;
      }
      origClick.call(this);
    };
    (window as unknown as { __loadReal: (id: string) => Promise<string> }).__loadReal = async (id: string) => {
      const p = await getPost(id);
      setRealPost(p);
      return p ? p.videoUrl ?? "no video" : "not found";
    };
    window.__genVideo = async () => {
      const blob = await makeVideoWithAudio();
      window.__srcUrl = URL.createObjectURL(blob);
      window.__srcBytes = blob.size;
      // Some coloured images for the photo-card layout tests.
      const colours = ["#c4622d", "#3d6b4f", "#d4a843", "#9ecfef", "#7a6a58", "#a855f7", "#ef4444"];
      const urls = await Promise.all(
        colours.map(async (col, i) => {
          const c = document.createElement("canvas");
          c.width = 400;
          c.height = i === 0 ? 300 : 400;
          const g = c.getContext("2d")!;
          g.fillStyle = col;
          g.fillRect(0, 0, c.width, c.height);
          const b: Blob = await new Promise((res) => c.toBlob((x) => res(x!), "image/png"));
          return URL.createObjectURL(b);
        })
      );
      window.__imgs = urls;
      setImgs(urls);
      setReady(true);
      return `${blob.size}`;
    };
    window.__wm = async () => {
      try {
        await downloadVideoWithWatermark(window.__srcUrl!, "clip", "zamyilton", (p) => window.__progress!.push(p));
        return "ok";
      } catch (e) {
        return "ERR " + (e as Error).message;
      }
    };
    window.__direct = async () => {
      await downloadMediaDirect(window.__srcUrl!, "plain.webm");
      return "ok";
    };
    window.__analyze = async (idx: number) => {
      const d = window.__downloads![idx];
      const blob = await (await fetch(d.url)).blob();
      const v = document.createElement("video");
      v.muted = true;
      v.src = URL.createObjectURL(blob);
      await new Promise<void>((r) => (v.onloadedmetadata = () => r()));
      if (!Number.isFinite(v.duration)) {
        await new Promise<void>((r) => {
          v.ontimeupdate = () => {
            v.ontimeupdate = null;
            r();
          };
          v.currentTime = 1e9;
        });
      }
      const duration = v.duration;
      v.currentTime = 1;
      await new Promise<void>((r) => (v.onseeked = () => r()));
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const g = c.getContext("2d")!;
      g.drawImage(v, 0, 0);
      const region = (x0: number, y0: number, x1: number, y1: number) => {
        const data = g.getImageData(Math.floor(x0 * c.width), Math.floor(y0 * c.height), Math.floor((x1 - x0) * c.width), Math.floor((y1 - y0) * c.height)).data;
        let lum = 0;
        let gold = 0;
        for (let i = 0; i < data.length; i += 4) {
          lum += 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
          if (data[i] > 170 && data[i + 1] > 130 && data[i + 2] < 120) gold++;
        }
        return { lum: lum / (data.length / 4), gold };
      };
      const corner = region(0.72, 0.71, 0.97, 0.96); // inside where the watermark pill sits
      const opposite = region(0.02, 0.03, 0.4, 0.4);
      let rms = 0;
      let audioSeconds = 0;
      try {
        const ac = new AudioContext();
        const buf = await ac.decodeAudioData(await blob.arrayBuffer());
        const ch = buf.getChannelData(0);
        let s = 0;
        for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
        rms = Math.sqrt(s / ch.length);
        audioSeconds = buf.duration;
        await ac.close();
      } catch {
        rms = -1;
      }
      return { duration, w: v.videoWidth, h: v.videoHeight, corner, opposite, rms, audioSeconds, name: d.download, size: d.size };
    };
  }, []);

  return (
    <div style={{ background: "#0c0a07", minHeight: "100vh", padding: 20, color: "#ddd" }}>
      <p id="ready">{ready ? "video ready" : "no video yet"}</p>
      {realPost && <div id="real-card" style={{ maxWidth: 560 }}><FeedPostCard post={realPost} /></div>}
      {ready && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PostDl id="on" uid="zz-dl-on" />
          <PostDl id="off" uid="zz-dl-off" />
          <PostDl id="blocked" uid="zz-dl-on" disable />
          <PostDl id="img" uid="zz-dl-on" image />
        </div>
      )}
      {ready && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16, maxWidth: 320 }}>
          <div id="dmvideo">
            <DMVideoMessage url={window.__srcUrl!} duration={6} width={320} height={240} caption="clip caption" isOwn={false} />
          </div>
          {[1, 2, 3, 4, 5, 7].map((n) => (
            <div key={n} id={`imgs-${n}`}>
              <DMImageMessage url={imgs[0]} urls={imgs.slice(0, n)} caption={n === 1 ? "single caption" : undefined} isOwn={false} width={n === 1 ? 400 : undefined} height={n === 1 ? 300 : undefined} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
