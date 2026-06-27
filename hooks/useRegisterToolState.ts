"use client";

import { useEffect } from "react";
import { eventBus } from "@/lib/eventBus";

declare global {
  interface Window {
    __statslab_tool_states?: Record<string, Record<string, any>>;
  }
}

/**
 * useRegisterToolState hook
 * 
 * - Registers the current state parameter values of a tool in `window.__statslab_tool_states[toolId]`.
 * - Listens for 'statslab:set-tool-state' and 'statslab:set-input' events to restore parameter values.
 */
export function useRegisterToolState(
  toolId: string,
  state: Record<string, any>,
  setters: Record<string, (val: any) => void>
) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__statslab_tool_states = window.__statslab_tool_states || {};
      const oldState = window.__statslab_tool_states[toolId] || {};
      
      // Emit event for changed parameters
      for (const [key, val] of Object.entries(state)) {
        // Only emit if it's a real transition from a previously known value to a new one
        if (oldState[key] !== undefined && oldState[key] !== val) {
          // Avoid triggering on temporary null/empty initializations
          if (oldState[key] !== null || val !== "") {
            eventBus.emit("statslab:param-changed", {
              toolId,
              param: key,
              value: val,
              oldValue: oldState[key],
            });
          }
        }
      }
      
      window.__statslab_tool_states[toolId] = {
        ...window.__statslab_tool_states[toolId],
        ...state,
      };
    }
  }, [toolId, state]);

  useEffect(() => {
    const unsubToolState = eventBus.on("statslab:set-tool-state", ({ targetToolId, param, value }) => {
      // Apply if it targets this tool specifically, or if no target is specified (e.g. from tutor)
      if ((!targetToolId || targetToolId === toolId) && setters[param]) {
        try {
          setters[param](value);
        } catch (err) {
          console.error(`Failed to set parameter ${param} on tool ${toolId}:`, err);
        }
      }
    });

    const unsubInput = eventBus.on("statslab:set-input", ({ param, value }) => {
      if (setters[param]) {
        try {
          setters[param](value);
        } catch (err) {
          console.error(`Failed to set input ${param} on tool ${toolId}:`, err);
        }
      }
    });
    
    return () => {
      unsubToolState();
      unsubInput();
    };
  }, [toolId, setters]);
}
