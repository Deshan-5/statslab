"use client";

import { useEffect, useState, useRef } from "react";
import * as Y from "yjs";

export function useMultiplayer(roomId: string | null) {
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState(0);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<any>(null);
  const sharedStateRef = useRef<Y.Map<any> | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let mounted = true;
    
    // Dynamically import y-webrtc to avoid SSR crashes, as it relies heavily on the browser window object
    import("y-webrtc").then(({ WebrtcProvider }) => {
      if (!mounted) return;

      const ydoc = new Y.Doc();
      
      // Use public STUN/signaling servers for true zero-backend P2P connection
      const provider = new WebrtcProvider(`statslab-room-${roomId}`, ydoc, {
        signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com']
      });

      const sharedState = ydoc.getMap("workspace-state");

      provider.on("synced", (event: { synced: boolean }) => {
        setConnected(event.synced);
      });

      provider.on("peers", (info: any) => {
        setPeers(info.webrtcPeers.length);
      });

      ydocRef.current = ydoc;
      providerRef.current = provider;
      sharedStateRef.current = sharedState;
    }).catch(err => {
      console.error("Failed to load y-webrtc multiplayer driver", err);
    });

    return () => {
      mounted = false;
      providerRef.current?.destroy();
      ydocRef.current?.destroy();
    };
  }, [roomId]);

  // We return a simple reactive state object
  return { connected, peers, sharedState: sharedStateRef.current, ydoc: ydocRef.current };
}
