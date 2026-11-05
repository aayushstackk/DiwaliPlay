/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { DiwaliWallpaper } from './DiwaliWallpaper';
import { chooseStartBackground } from '../utils/startBackground';
import { resolveAssetUrl } from '../utils/assetUrl';

interface StartBackgroundProps {
  url?: string | null;
  type?: string;
  dim?: number;
}

export const StartBackground: React.FC<StartBackgroundProps> = ({ url, type, dim }) => {
  const choice = chooseStartBackground(url, type, dim);
  const mediaUrl = choice.kind === 'builtin' ? '' : choice.url;
  const kind = choice.kind;

  const [failed, setFailed] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setFailed(false);
    setVideoSrc(null);
    if (kind !== 'video') return;

    const controller = new AbortController();
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await fetch(resolveAssetUrl(mediaUrl), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setVideoSrc(objectUrl);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind, mediaUrl]);

  // Start playback once the blob is attached; a rejected play() falls back to the built-in scene.
  useEffect(() => {
    const el = videoRef.current;
    if (!videoSrc || !el) return;
    el.play().catch(() => setFailed(true));
    return () => {
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [videoSrc]);

  const showMedia = choice.kind !== 'builtin' && !failed;
  const opacity = choice.kind !== 'builtin' ? choice.dim / 100 : 0;

  return (
    <div className="fixed inset-0 bg-[#0A0713]" aria-hidden="true">
      {/* Built-in scene: default, and shown while loading and after any error */}
      <DiwaliWallpaper />
      {showMedia && choice.kind === 'image' && (
        <img
          src={resolveAssetUrl(choice.url)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {showMedia && choice.kind === 'video' && videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          loop
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {showMedia && (
        <div className="absolute inset-0 bg-black" style={{ opacity }} />
      )}
    </div>
  );
};
