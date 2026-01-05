// useFullscreen - Hook for managing fullscreen state
// Pattern: Extracted from SenderDashboard for reusability

import { useCallback, useEffect, useState } from "react";

export interface UseFullscreenReturn {
  isFullscreen: boolean;
  toggleFullscreen: (element: HTMLElement | null) => void;
  enterFullscreen: (element: HTMLElement | null) => void;
  exitFullscreen: () => void;
}

/**
 * Hook that manages fullscreen state and provides methods to toggle it.
 * Automatically tracks fullscreen changes from browser/keyboard shortcuts.
 */
export function useFullscreen(): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen state changes (from any source)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const enterFullscreen = useCallback((element: HTMLElement | null) => {
    if (element && !document.fullscreenElement) {
      element.requestFullscreen().catch((err) => {
        console.warn("Failed to enter fullscreen:", err);
      });
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => {
        console.warn("Failed to exit fullscreen:", err);
      });
    }
  }, []);

  const toggleFullscreen = useCallback(
    (element: HTMLElement | null) => {
      if (document.fullscreenElement) {
        exitFullscreen();
      } else {
        enterFullscreen(element);
      }
    },
    [enterFullscreen, exitFullscreen],
  );

  return {
    isFullscreen,
    toggleFullscreen,
    enterFullscreen,
    exitFullscreen,
  };
}
